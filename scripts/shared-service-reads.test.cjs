const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, sharedReadImports } = require('./session-read-test-support.cjs');
const { createSessionReadCache } = loadSource('src/services/session-read-cache.ts');
const { createAuthSessionScope } = loadSource('src/services/auth-session-scope.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const state = { time: 0, key: 'day-one', calls: 0, load: async () => 'server' };
  const cache = createSessionReadCache(async () => { state.calls++; return state.load(); }, {
    freshnessMs: 30_000, now: () => state.time, cacheKey: () => state.key,
  });
  cache.setAccount('a');
  return { state, cache };
}

test('Shared reads coalesce pending calls, reuse successful values and expire from request start', async () => {
  const { state, cache } = fixture(); const response = deferred();
  state.load = () => response.promise;
  const requests = [cache.read(), cache.read(), cache.read()];
  await flush(); assert.equal(state.calls, 1);
  state.time = 25_000; response.resolve('server');
  assert.deepEqual(await Promise.all(requests), ['server', 'server', 'server']);
  state.time = 29_999; await cache.read(); assert.equal(state.calls, 1);
  state.time = 30_000; await cache.read(); assert.equal(state.calls, 2);
});

test('Forced validation bypasses a pending browsing read and the newer result wins', async () => {
  const { state, cache } = fixture(); const old = deferred();
  state.load = () => state.calls === 1 ? old.promise : Promise.resolve('fresh validation');
  const browsing = cache.read(); await flush();
  assert.equal(await cache.read({ force: true }), 'fresh validation');
  old.resolve('old browsing'); assert.equal(await browsing, 'fresh validation');
  assert.equal(await cache.read(), 'fresh validation'); assert.equal(state.calls, 2);
});

test('Failed checks are never cached and invalidation retries obsolete errors as well as responses', async () => {
  const { state, cache } = fixture(); state.load = async () => { throw new Error('offline'); };
  await assert.rejects(cache.read(), /offline/); await assert.rejects(cache.read(), /offline/);
  assert.equal(state.calls, 2);
  for (const failed of [false, true]) {
    const old = deferred(); let calls = 0;
    state.load = () => ++calls === 1 ? old.promise : Promise.resolve('changed');
    const pending = cache.read(); await flush(); cache.invalidate();
    failed ? old.reject(new Error('obsolete')) : old.resolve('obsolete');
    assert.equal(await pending, 'changed'); assert.equal(calls, 2); cache.invalidate();
  }
});

test('A confirmed save supersedes an older read without a redundant query', async () => {
  for (const failed of [false, true]) {
    const { state, cache } = fixture(); const old = deferred(); state.load = () => old.promise;
    const pending = cache.read(); await flush(); cache.invalidate(); cache.accept('saved');
    failed ? old.reject(new Error('obsolete')) : old.resolve('obsolete');
    assert.equal(await pending, 'saved'); assert.equal(await cache.read(), 'saved'); assert.equal(state.calls, 1);
  }
});

test('Logout and same-account relogin discard old reads and invalidate captured write scopes', async () => {
  const { state, cache } = fixture(); const old = deferred(); state.load = () => old.promise;
  const pending = cache.read(); const rejection = assert.rejects(pending, /session changed/); await flush();
  const current = cache.captureSession(); cache.setAccount(null); cache.setAccount('a');
  assert.equal(current(), false); old.resolve('old account'); await rejection;
  state.load = async () => 'new session'; assert.equal(await cache.read(), 'new session'); assert.equal(state.calls, 2);
});

test('A repeated auth event preserves data; account mismatch and canceled callers never start reads', async () => {
  const { state, cache } = fixture(); await cache.read(); cache.setAccount('a'); await cache.read();
  assert.equal(state.calls, 1);
  await assert.rejects(cache.read({ expectedAccountId: 'b' }), /session changed/);
  await assert.rejects(cache.read({ isSessionCurrent: () => false }), /session changed/);
  cache.invalidate(); const request = cache.read(); cache.setAccount(null);
  await assert.rejects(request, /session changed/); assert.equal(state.calls, 1);
});

test('A studio date change expires a recent check even when its TTL is still fresh', async () => {
  const { state, cache } = fixture(); await cache.read(); state.key = 'day-two'; await cache.read();
  assert.equal(state.calls, 2);
});

test('Leaving one screen cannot cancel a shared read still needed by another caller', async () => {
  const { state, cache } = fixture(); let active = true;
  const first = cache.read({ isSessionCurrent: () => active });
  const rejected = assert.rejects(first, /session changed/);
  const second = cache.read(); active = false;
  assert.equal(await second, 'server'); await rejected; assert.equal(state.calls, 1);
});

test('Auth restoration is shared and cannot overwrite a newer synchronous auth event', async () => {
  let callback, calls = 0; const accounts = [], response = deferred();
  const ensure = createAuthSessionScope({ onAuthStateChange(fn) { callback = fn; },
    async getSession() { calls++; return response.promise; } }, id => accounts.push(id));
  const first = ensure(), second = ensure(); await flush(); assert.equal(calls, 1);
  assert.equal(callback('SIGNED_OUT', null), undefined);
  response.resolve({ data: { session: { user: { id: 'old' } } }, error: null });
  await Promise.all([first, second]); assert.deepEqual(accounts, [null]); await ensure(); assert.equal(calls, 1);
});

function remindersFixture() {
  let authEvent, bookingEvent;
  const state = { time: '2026-10-07T02:00:00Z', calls: 0, rpc: async () => ({ error: null }) };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.time])); } static now() { return new Date(state.time).getTime(); } }
  const connection = { auth: { onAuthStateChange(fn) { authEvent = fn; },
    async getSession() { return { data: { session: { user: { id: 'a' } } }, error: null }; } },
    async rpc(name) { assert.equal(name, 'ensure_booking_reminder_notifications'); state.calls++; return state.rpc(); } };
  const imports = sharedReadImports(connection);
  imports['@/services/session-read-cache'] = loadSource('src/services/session-read-cache.ts', {}, { Date: Clock });
  const api = loadSource('src/services/booking-reminders.ts', { ...imports, '@/lib/supabase': { supabase: connection },
    '@/services/booking-events': { subscribeToBookingsChanged(fn) { bookingEvent = fn; } } }, { Date: Clock });
  return { state, check: api.ensureBookingReminderNotifications, bookingChanged: () => bookingEvent(),
    account: id => authEvent('SIGNED_IN', id ? { user: { id } } : null) };
}

test('Inbox, unread and badge reminder checks share one RPC and booking changes invalidate it', async () => {
  const f = remindersFixture(), response = deferred(); f.state.rpc = () => response.promise;
  const checks = [f.check(), f.check(), f.check()]; await flush(); assert.equal(f.state.calls, 1);
  response.resolve({ error: null }); assert.deepEqual(await Promise.all(checks), [true, true, true]);
  await f.check(); assert.equal(f.state.calls, 1);
  f.bookingChanged(); await f.check(); assert.equal(f.state.calls, 2);
});

test('Failed reminder maintenance permits retry and signed-out or mismatched callers cannot generate reminders', async () => {
  const f = remindersFixture(); f.state.rpc = async () => ({ error: new Error('offline') });
  assert.equal(await f.check(), false); assert.equal(await f.check(), false); assert.equal(f.state.calls, 2);
  f.state.rpc = async () => ({ error: null }); assert.equal(await f.check(), true);
  assert.equal(await f.check({ expectedAccountId: 'b' }), false);
  f.account(null); assert.equal(await f.check(), false); assert.equal(f.state.calls, 3);
});

test('Reminder checks expire at 30 seconds and recheck at Manila midnight', async () => {
  const f = remindersFixture(); await f.check();
  f.state.time = '2026-10-07T02:00:29Z'; await f.check(); assert.equal(f.state.calls, 1);
  f.state.time = '2026-10-07T02:00:30Z'; await f.check(); assert.equal(f.state.calls, 2);
  f.state.time = '2026-10-07T15:59:59Z'; await f.check(); assert.equal(f.state.calls, 3);
  f.state.time = '2026-10-07T16:00:00Z'; await f.check(); assert.equal(f.state.calls, 4);
});

test('A late reminder result after logout never warms the new session', async () => {
  const f = remindersFixture(), old = deferred(); f.state.rpc = () => old.promise;
  const pending = f.check(); await flush(); f.account(null); f.account('a');
  old.resolve({ error: null }); assert.equal(await pending, false);
  await f.check(); assert.equal(f.state.calls, 2);
});

const studioRow = { id: true, studio_name: 'Studio', business_hours: 'Mon-Sat, 9:00 AM - 6:00 PM' };
const values = { studioName: 'Updated', studioAddress: '', contactEmail: '', contactPhone: '', defaultShootLocation: '',
  workingStartTime: '10:00:00', workingEndTime: '19:00:00' };
function studioFixture() {
  let authEvent, calendarEvent;
  const state = { time: 0, reads: 0, writes: 0, read: async () => ({ data: studioRow, error: null }),
    write: async () => ({ data: { ...studioRow, studio_name: 'Saved' }, error: null }) };
  class Clock extends Date { static now() { return state.time; } }
  const connection = { auth: { onAuthStateChange(fn) { authEvent = fn; },
    async getSession() { return { data: { session: { user: { id: 'admin' } } }, error: null }; } },
    from(table) { assert.equal(table, 'studio_settings'); const query = {
      select: () => query, eq: () => query, upsert: () => query,
      async maybeSingle() { state.reads++; return state.read(); }, async single() { state.writes++; return state.write(); },
    }; return query; } };
  const imports = sharedReadImports(connection);
  imports['@/services/session-read-cache'] = loadSource('src/services/session-read-cache.ts', {}, { Date: Clock });
  const api = loadSource('src/services/studio-settings.ts', { ...imports, '@/lib/supabase': { supabase: connection },
    '@/services/calendar-events': { subscribeToCalendarChanged(fn) { calendarEvent = fn; }, emitCalendarChanged: () => calendarEvent() } });
  return { state, api, calendarChanged: date => calendarEvent(date), account: id => authEvent('SIGNED_IN', id ? { user: { id } } : null) };
}

test('Studio information and availability share a 60-second singleton read; date-only slot edits preserve it', async () => {
  const f = studioFixture(); const response = deferred(); f.state.read = () => response.promise;
  const pending = [f.api.getStudioSettings(), f.api.getDefaultWorkingHoursWindow(), f.api.getStudioSettings()];
  await flush(); assert.equal(f.state.reads, 1); response.resolve({ data: studioRow, error: null }); await Promise.all(pending);
  f.calendarChanged('2026-10-07'); f.state.time = 59_999; await f.api.getStudioSettings(); assert.equal(f.state.reads, 1);
  f.state.time = 60_000; await f.api.getStudioSettings(); assert.equal(f.state.reads, 2);
  f.calendarChanged(); await f.api.getStudioSettings(); assert.equal(f.state.reads, 3);
});

test('Settings validation bypasses cached hours and failed display fallbacks never become cached successes', async () => {
  const f = studioFixture(); await f.api.getStudioSettings();
  f.state.read = async () => ({ data: { ...studioRow, business_hours: 'Mon-Sat, 10:00 AM - 7:00 PM' }, error: null });
  assert.equal((await f.api.getDefaultWorkingHoursWindow({ force: true, throwOnError: true })).startTime, '10:00:00');
  f.calendarChanged(); f.state.read = async () => ({ data: null, error: new Error('offline') });
  assert.equal((await f.api.getStudioSettings()).studioName, 'PhotoSync Studio');
  await assert.rejects(f.api.getDefaultWorkingHoursWindow({ force: true, throwOnError: true }), /offline/);
  f.state.read = async () => ({ data: studioRow, error: null });
  assert.equal((await f.api.getStudioSettings()).studioName, 'Studio'); assert.equal(f.state.reads, 5);
});

test('Confirmed studio saves immediately serve other screens and supersede an older pending read', async () => {
  const f = studioFixture(), old = deferred(); f.state.read = () => old.promise;
  const read = f.api.getStudioSettings({ throwOnError: true }); await flush();
  assert.equal((await f.api.saveStudioSettings(values)).success, true);
  old.resolve({ data: studioRow, error: null }); assert.equal((await read).studioName, 'Saved');
  assert.equal((await f.api.getStudioSettings()).studioName, 'Saved'); assert.equal(f.state.reads, 1);
});

test('Logout discards a pending settings write without publishing it into the next login', async () => {
  const f = studioFixture(), old = deferred(); f.state.write = () => old.promise;
  const write = f.api.saveStudioSettings(values); await flush(); f.account(null); f.account('admin');
  old.resolve({ data: { ...studioRow, studio_name: 'Old session' }, error: null });
  assert.equal((await write).success, false); assert.equal((await f.api.getStudioSettings()).studioName, 'Studio');
});

test('Saving settings before any browsing read warms the shared value from the confirmed row', async () => {
  const f = studioFixture(); assert.equal((await f.api.saveStudioSettings(values)).success, true);
  assert.equal((await f.api.getStudioSettings()).studioName, 'Saved'); assert.equal(f.state.reads, 0);
});
