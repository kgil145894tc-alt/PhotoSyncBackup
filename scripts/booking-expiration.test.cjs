const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, Date, Promise, Error, Number, Map, Set, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, ...globals });
  return exports;
}
const { createBookingExpirationCoordinator } = loadModule('src/services/booking-expiration-coordinator.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  let time = 0;
  const state = { calls: [], events: 0, load: async () => 0 };
  const check = createBookingExpirationCoordinator(async (owner, isCurrent) => {
    state.calls.push(owner); assert.equal(isCurrent(), true); return state.load();
  }, () => time, () => { state.events++; });
  check.setAccount('account-a');
  return { check, state, setTime: value => { time = value; } };
}

test('List/detail callers share one pending check and reuse success, including zero expired rows, for 30 seconds', async () => {
  const f = setup(), response = deferred(); f.state.load = () => response.promise;
  const first = f.check.run(), second = f.check.run(); await flush();
  assert.deepEqual(f.state.calls, ['account-a']);
  response.resolve(0); assert.equal((await first).success, true); assert.equal((await second).success, true);
  f.setTime(29_999); await f.check.run(); assert.equal(f.state.calls.length, 1);
  f.setTime(30_000); await f.check.run(); assert.equal(f.state.calls.length, 2);
});

test('Actions bypass recent success and pending presentation work, and a completed action check can satisfy later reads', async () => {
  const f = setup(); await f.check.run(); await f.check.run({ force: true });
  assert.equal(f.state.calls.length, 2);
  f.check.invalidate(); const old = deferred(); let reads = 0;
  f.state.load = () => ++reads === 1 ? old.promise : 0;
  const slow = f.check.run(); await flush();
  await f.check.run({ force: true });
  const read = f.check.run(); assert.equal((await read).success, true);
  assert.equal(reads, 2, 'A successful force check avoids waiting for an older check');
  old.resolve(0); await slow;
});

test('An old response cannot extend freshness after a newer action check, and slow reads use their start time', async () => {
  const f = setup(), old = deferred(); let reads = 0;
  f.state.load = () => ++reads === 1 ? old.promise : 0;
  const first = f.check.run(); await flush(); f.setTime(10_000);
  await f.check.run({ force: true }); f.setTime(35_000); old.resolve(0); await first;
  f.setTime(40_000); await f.check.run(); assert.equal(reads, 3);
  const slow = deferred(); f.check.invalidate(); f.state.load = () => slow.promise;
  f.setTime(50_000); const request = f.check.run(); await flush();
  f.setTime(81_000); slow.resolve(0); await request;
  const before = f.state.calls.length; await f.check.run(); assert.equal(f.state.calls.length, before + 1);
});

test('Failed checks and invalid server responses are never cached as a successful verification', async () => {
  for (const value of [null, undefined, '0', -1, 0.5]) {
    const f = setup(); f.state.load = async () => value;
    assert.equal((await f.check.run()).success, false);
    f.state.load = async () => 0; assert.equal((await f.check.run()).success, true);
    assert.equal(f.state.calls.length, 2);
  }
  const f = setup(); f.state.load = async () => { throw new Error('Offline'); };
  assert.equal((await f.check.run()).message, 'Offline');
  assert.equal((await f.check.run()).success, false); assert.equal(f.state.calls.length, 2);
});

test('Booking changes invalidate freshness and an invalidated in-flight response cannot make the check fresh', async () => {
  const f = setup(); await f.check.run(); f.check.invalidate(); await f.check.run();
  assert.equal(f.state.calls.length, 2);
  const read = deferred(); f.check.invalidate(); f.state.load = () => read.promise;
  const pending = f.check.run(); await flush(); f.check.invalidate(); read.resolve(0); await pending;
  const before = f.state.calls.length; await f.check.run(); assert.equal(f.state.calls.length, before + 1);
});

test('Logout/account switches cancel queued checks, discard old responses, and never reuse another account’s freshness', async () => {
  const f = setup(); const queued = f.check.run(); f.check.setAccount(null);
  assert.equal((await queued).success, false); assert.equal(f.state.calls.length, 0);
  f.check.setAccount('account-a'); const read = deferred(); f.state.load = () => read.promise;
  const first = f.check.run(); await flush(); f.check.setAccount('account-b'); read.resolve(3);
  assert.equal((await first).success, false); assert.equal(f.state.events, 0);
  f.state.load = async () => 0; await f.check.run();
  assert.deepEqual(f.state.calls, ['account-a', 'account-b']);
  f.check.setAccount('account-a'); await f.check.run(); assert.equal(f.state.calls.length, 3);
});

test('Same-account token updates preserve freshness; changed account guards and callers refuse stale sessions', async () => {
  const f = setup(); await f.check.run(); f.check.setAccount('account-a'); await f.check.run();
  assert.equal(f.state.calls.length, 1);
  assert.equal((await f.check.run({ expectedAccountId: 'account-b' })).success, false);
  assert.equal((await f.check.run({ isSessionCurrent: () => false })).success, false);
  let active = true; const fresh = f.check.run({ isSessionCurrent: () => active }); active = false;
  assert.equal((await fresh).success, false);
});

test('Cancelling one list caller does not cancel a shared check for another current caller', async () => {
  const f = setup(), read = deferred(); f.state.load = () => read.promise;
  let active = true;
  const first = f.check.run({ isSessionCurrent: () => active }), other = f.check.run();
  await flush(); active = false; read.resolve(2);
  assert.equal((await first).success, false); assert.equal((await other).success, true);
  assert.equal(f.state.events, 1); assert.equal(f.state.calls.length, 1);
});

test('Clock rollback causes a new check rather than treating an old success as fresh indefinitely', async () => {
  const f = setup(); f.setTime(10_000); await f.check.run(); f.setTime(5_000); await f.check.run();
  assert.equal(f.state.calls.length, 2);
});

function wrapper(overrides = {}) {
  let authCallback, bookingListener;
  let time = 0;
  const state = { calls: [], events: 0, sessions: 0, session: { user: { id: 'account-a' } },
    rpc: async () => ({ data: 0, error: null }), ...overrides };
  class TestDate extends Date { static now() { return time; } }
  const supabase = {
    auth: {
      onAuthStateChange: callback => { authCallback = callback; },
      getSession: async () => { state.sessions++; return state.getSession ? state.getSession() : { data: { session: state.session }, error: null }; },
    },
    rpc: async name => { state.calls.push(name); return state.rpc(); },
    from: () => { throw new Error('Expiration must not make client-side update or history requests'); },
  };
  const service = loadModule('src/services/booking-expiration.ts', {
    '@/lib/supabase': { supabase: overrides.disconnected ? null : supabase },
    '@/services/booking-expiration-coordinator': { createBookingExpirationCoordinator },
    '@/services/booking-events': {
      subscribeToBookingsChanged: listener => { bookingListener = listener; },
      emitBookingsChanged: () => { state.events++; bookingListener(); },
    },
  }, { Date: TestDate });
  return { ...service, state, setTime: value => { time = value; },
    auth: (event, session) => authCallback(event, session), changed: () => bookingListener() };
}

test('The integration performs one atomic RPC, caches the auth scope, and emits one event for a real expiration', async () => {
  const f = wrapper({ rpc: async () => ({ data: 3, error: null }) });
  await Promise.all([f.expirePastPendingBookings(), f.expirePastPendingBookings()]);
  assert.deepEqual(f.state.calls, ['expire_past_pending_bookings']);
  assert.equal(f.state.sessions, 1); assert.equal(f.state.events, 1);
  await f.expirePastPendingBookings(); assert.equal(f.state.calls.length, 1, 'Own event does not invalidate the successful check');
  f.changed(); await f.expirePastPendingBookings(); assert.equal(f.state.calls.length, 2);
});

test('Initial auth events avoid a session read; token refresh preserves checks and logout/sign-in clears them', async () => {
  const f = wrapper(); f.auth('INITIAL_SESSION', { user: { id: 'account-a' } });
  await f.expirePastPendingBookings(); assert.equal(f.state.sessions, 0);
  f.auth('TOKEN_REFRESHED', { user: { id: 'account-a' } }); await f.expirePastPendingBookings();
  assert.equal(f.state.calls.length, 1);
  f.auth('SIGNED_OUT', null); assert.equal((await f.expirePastPendingBookings({ force: true })).success, false);
  f.auth('SIGNED_IN', { user: { id: 'account-a' } }); await f.expirePastPendingBookings();
  assert.equal(f.state.calls.length, 2);
});

test('A late initial session snapshot cannot overwrite a newer authenticated account', async () => {
  const session = deferred(); const f = wrapper({ getSession: () => session.promise });
  const stale = f.expirePastPendingBookings({ expectedAccountId: 'account-a' }); await flush();
  f.auth('SIGNED_IN', { user: { id: 'account-b' } });
  session.resolve({ data: { session: { user: { id: 'account-a' } } }, error: null });
  assert.equal((await stale).success, false); assert.equal(f.state.calls.length, 0);
  assert.equal((await f.expirePastPendingBookings({ expectedAccountId: 'account-b' })).success, true);
});

test('Session initialization errors can retry, and RPC/network failures never authorize an action', async () => {
  const f = wrapper({ getSession: async () => ({ data: {}, error: new Error('Offline') }) });
  assert.equal((await f.expirePastPendingBookings()).success, false);
  f.state.getSession = null;
  assert.equal((await f.expirePastPendingBookings()).success, true); assert.equal(f.state.sessions, 2);
  for (const rpc of [async () => ({ data: null, error: { code: 'PGRST202', message: 'Missing' } }),
    async () => { throw new Error('Offline'); }]) {
    f.state.rpc = rpc;
    assert.equal((await f.expirePastPendingBookings({ force: true })).success, false);
  }
});

test('Disconnected and cancelled sessions do no database work', async () => {
  const f = wrapper({ disconnected: true }); assert.equal((await f.expirePastPendingBookings()).success, false);
  const connected = wrapper(); assert.equal((await connected.expirePastPendingBookings({ isSessionCurrent: () => false })).success, false);
  assert.equal(connected.state.sessions + connected.state.calls.length, 0);
});
