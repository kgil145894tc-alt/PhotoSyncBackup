const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, Promise, Error, Set, require: (name) => {
    if (name.startsWith('@/assets/')) return name;
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

const { createAdminBookingDetailCache, selectAdminBooking } = loadModule('src/services/admin-booking-detail-cache.ts');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const booking = (changes = {}) => ({ id: 'b1', status: 'pending', clientName: 'Client', packageName: 'Portrait',
  packagePrice: 1500, packageInclusions: [], bookingDate: '2099-01-01', startTime: '10:00:00', endTime: '11:00:00',
  clientId: 'client-1', clientEmail: 'client@example.test', clientPhone: '09123456789', rejectionReason: null, ...changes });
function setup() {
  let time = 0;
  const calls = { detail: [], write: [] };
  const api = {
    load: async (id) => { calls.detail.push(id); return booking({ id }); },
    update: async (...args) => { calls.write.push(args); return { success: true, booking: booking({ status: args[1] }) }; },
  };
  const cache = createAdminBookingDetailCache(api, () => time);
  cache.setAccount('admin-a');
  return { cache, api, calls, setTime: (value) => { time = value; }, read: (id = 'b1') => selectAdminBooking(cache.getSnapshot(), id) };
}

test('Opening a fresh Request reuses all its fields without a detail query; stale details refresh in place', async () => {
  const { cache, api, calls, setTime, read } = setup();
  cache.seedBooking(booking(), 0);
  const cached = read().data;
  setTime(29_999);
  await cache.refreshBooking('b1');
  assert.equal(read().data, cached);
  assert.equal(calls.detail.length, 0);
  setTime(30_000);
  const response = deferred();
  api.load = (id) => { calls.detail.push(id); return response.promise; };
  const pending = cache.refreshBooking('b1');
  assert.equal(read().data, cached);
  assert.equal(read().isFetching, true);
  response.resolve(booking({ clientName: 'Updated client' }));
  await pending;
  assert.equal(read().data.clientName, 'Updated client');
});

test('A notification link loads only its booking and reuses it; it never turns a partial result into a full list', async () => {
  const { cache, calls, read } = setup();
  await cache.refreshBooking('b1');
  await cache.refreshBooking('b1');
  assert.deepEqual(calls.detail, ['b1']);
  assert.equal(read().data.id, 'b1');
  cache.seedBooking(booking(), 0);
});

test('Pull, focus and resume share a pending detail read, while different bookings load independently', async () => {
  const { cache, api, calls, read } = setup();
  const responses = { b1: deferred(), b2: deferred() };
  api.load = (id) => { calls.detail.push(id); return responses[id].promise; };
  const first = cache.refreshBooking('b1');
  assert.equal(cache.refreshBooking('b1', true), first);
  const second = cache.refreshBooking('b2');
  await flush();
  assert.deepEqual(calls.detail, ['b1', 'b2']);
  responses.b1.resolve(booking());
  await first;
  assert.equal(read('b2').isFetching, true);
  responses.b2.resolve(booking({ id: 'b2' }));
  await second;
  await cache.refreshBooking('b1', true);
  assert.equal(calls.detail.length, 3, 'Pull bypasses a fresh result');
});

test('Missing bookings are cached separately from initial errors, and cached details survive a failed refresh', async () => {
  const { cache, api, read } = setup();
  api.load = async () => { throw new Error('offline'); };
  await cache.refreshBooking('b1');
  assert.equal(read().hasLoaded, false);
  assert.match(read().error, /Could not load/);
  api.load = async () => null;
  await cache.refreshBooking('b1');
  assert.equal(read().hasLoaded, true);
  assert.equal(read().data, null);
  assert.equal(read().error, null);
  api.load = async () => booking();
  await cache.refreshBooking('b1', true);
  const previous = read().data;
  api.load = async () => { throw new Error('offline'); };
  await cache.refreshBooking('b1', true);
  assert.equal(read().data, previous);
  assert.match(read().error, /previously loaded/);
  assert.equal(read().isFetching, false);
});

test('Booking or push invalidation during a read discards obsolete success and failure and retries', async () => {
  for (const fail of [false, true]) {
    const { cache, api, read } = setup();
    const old = deferred();
    let reads = 0;
    api.load = () => ++reads === 1 ? old.promise : Promise.resolve(booking({ status: 'cancelled' }));
    const pending = cache.refreshBooking('b1');
    await flush();
    cache.invalidate();
    assert.equal(cache.refreshBooking('b1'), pending);
    fail ? old.reject(new Error('obsolete failure')) : old.resolve(booking());
    await pending;
    assert.equal(reads, 2);
    assert.equal(read().data.status, 'cancelled');
    assert.equal(read().error, null);
  }
});

test('Logout, account changes and same-account relogin discard old detail responses without disrupting new reads', async () => {
  for (const account of ['admin-a', 'admin-b']) {
    const { cache, api, read } = setup();
    const old = deferred(), recent = deferred();
    let calls = 0;
    api.load = () => ++calls === 1 ? old.promise : recent.promise;
    const pending = cache.refreshBooking('b1');
    await flush();
    const version = cache.getSnapshot().accountVersion;
    cache.setAccount(null);
    assert.equal(read().data, null);
    await cache.refreshBooking('b1');
    cache.setAccount(account);
    assert.notEqual(cache.getSnapshot().accountVersion, version);
    const active = cache.refreshBooking('b1');
    await flush();
    old.resolve(booking({ clientName: 'Old account' }));
    await pending;
    assert.equal(read().data, null);
    assert.equal(read().isFetching, true);
    recent.resolve(booking({ clientName: 'Current account' }));
    await active;
    assert.equal(read().data.clientName, 'Current account');
  }
});

test('Logout before queued reads or writes start prevents their API calls', async () => {
  const { cache, calls } = setup();
  const read = cache.refreshBooking('b1');
  const write = cache.updateBookingStatus('b1', 'confirmed');
  cache.setAccount(null);
  await Promise.all([read, write]);
  assert.equal(calls.detail.length, 0);
  assert.equal(calls.write.length, 0);
  assert.equal(cache.getSnapshot().details.b1, undefined);
});

test('Status writes stay pending until server acceptance, block duplicate actions, and cache the confirmed row', async () => {
  for (const status of ['confirmed', 'rejected', 'completed']) {
    const { cache, api, calls, read } = setup();
    const before = booking({ status: status === 'completed' ? 'confirmed' : 'pending' });
    api.load = async () => before;
    cache.seedBooking(booking(), 0);
    await cache.refreshBooking('b1', true);
    const response = deferred();
    api.update = (...args) => { calls.write.push(args); return response.promise; };
    const write = cache.updateBookingStatus('b1', status, status === 'rejected' ? 'Unavailable' : null);
    assert.equal(read().data.status, before.status, 'No optimistic approval');
    assert.equal(read().isUpdating, true);
    assert.equal(await cache.updateBookingStatus('b1', status), null);
    await cache.refreshBooking('b1', true);
    assert.equal(calls.write.length, 1);
    const accepted = booking({ status, rejectionReason: status === 'rejected' ? 'Unavailable' : null });
    response.resolve({ success: true, booking: accepted });
    assert.equal((await write).success, true);
    assert.equal(read().data, accepted);
    assert.equal(read().isUpdating, false);
    assert.equal(read().fetchedAt, 0);
  }
});

test('Blank rejection reasons do not write, and refused or thrown writes reconcile the server status', async () => {
  for (const throws of [false, true]) {
    const { cache, api, calls, read } = setup();
    cache.seedBooking(booking(), 0);
    assert.equal((await cache.updateBookingStatus('b1', 'rejected', ' ')).success, false);
    assert.equal(calls.write.length, 0);
    api.update = async () => {
      if (throws) throw new Error('offline');
      return { success: false, message: 'Already cancelled' };
    };
    api.load = async () => booking({ status: 'cancelled' });
    assert.equal((await cache.updateBookingStatus('b1', 'confirmed')).success, false);
    assert.equal(read().data.status, 'pending');
    await flush();
    assert.equal(read().data.status, 'cancelled');
    assert.equal(read().isUpdating, false);
  }
});

test('A successful write whose follow-up row is unavailable remains stale and reconciles without claiming a fresh copy', async () => {
  const { cache, api, read } = setup();
  cache.seedBooking(booking(), 0);
  const response = deferred();
  api.update = async () => ({ success: true, booking: null });
  api.load = () => response.promise;
  await cache.updateBookingStatus('b1', 'confirmed');
  assert.equal(read().data.status, 'confirmed');
  assert.equal(read().fetchedAt, null);
  response.resolve(booking({ status: 'cancelled' }));
  await flush();
  assert.equal(read().data.status, 'cancelled');
});

test('A pre-write detail response cannot undo a server-accepted status or clear a newer fetch', async () => {
  const { cache, api, read } = setup();
  cache.seedBooking(booking(), 0);
  const old = deferred();
  api.load = () => old.promise;
  const oldRead = cache.refreshBooking('b1', true);
  await flush();
  await cache.updateBookingStatus('b1', 'confirmed');
  old.resolve(booking());
  await oldRead;
  assert.equal(read().data.status, 'confirmed');
  assert.equal(read().error, null);
});

test('Late write results from an old session cannot patch the new account or reconcile under its credentials', async () => {
  for (const fails of [false, true]) {
    const { cache, api, calls, read } = setup();
    cache.seedBooking(booking(), 0);
    const response = deferred();
    api.update = () => response.promise;
    const write = cache.updateBookingStatus('b1', 'confirmed');
    await flush();
    cache.setAccount(null);
    cache.setAccount('admin-b');
    fails ? response.reject(new Error('old failure')) : response.resolve({ success: true, booking: booking({ status: 'confirmed' }) });
    assert.equal(await write, null);
    assert.equal(read().data, null);
    assert.equal(read().isUpdating, false);
    assert.equal(calls.detail.length, 0);
  }
});

test('Detail retention is bounded, keeps recent visits, and never lets an evicted obsolete response return', async () => {
  const { cache, api } = setup();
  for (let i = 0; i < 28; i++) cache.seedBooking(booking({ id: `b${i}` }), 0);
  assert.equal(Object.keys(cache.getSnapshot().details).length, 24);
  assert.equal(cache.getSnapshot().details.b0, undefined);
  await cache.refreshBooking('b4');
  cache.seedBooking(booking({ id: 'b28' }), 0);
  assert.ok(cache.getSnapshot().details.b4); assert.equal(cache.getSnapshot().details.b5, undefined);
  const old = deferred(); api.load = () => old.promise;
  const pending = cache.refreshBooking('b1', true); await flush();
  await cache.updateBookingStatus('b1', 'confirmed');
  for (let i = 30; i < 56; i++) cache.seedBooking(booking({ id: `b${i}` }), 0);
  assert.equal(cache.getSnapshot().details.b1, undefined);
  old.resolve(booking()); await pending;
  assert.equal(cache.getSnapshot().details.b1, undefined);
});

test('Detail store wiring uses only single-booking reads and clears session data without fetching in auth callbacks', async () => {
  let auth, bookingEvent, notificationEvent; let reads = 0;
  const { adminBookingDetailStore: store } = loadModule('src/services/admin-booking-detail-store.ts', {
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange(fn) { auth = fn; } } } },
    '@/services/admin-booking-detail-cache': { createAdminBookingDetailCache },
    '@/services/admin-bookings': { getAdminBookingRequest: async (id, options) => {
      assert.equal(options.throwOnError, true); reads++; return booking({ id });
    }, updateAdminBookingStatus: async () => ({ success: false }) },
    '@/services/booking-events': { subscribeToBookingsChanged(fn) { bookingEvent = fn; } },
    '@/services/notification-events': { subscribeToNotificationsChanged(fn) { notificationEvent = fn; } },
  });
  assert.equal(store.getSnapshot().isSessionReady, false);
  auth('INITIAL_SESSION', { user: { id: 'admin' } }); assert.equal(reads, 0);
  await store.refreshBooking('b1'); auth('TOKEN_REFRESHED', { user: { id: 'admin' } });
  await store.refreshBooking('b1'); assert.equal(reads, 1);
  bookingEvent(); await store.refreshBooking('b1'); notificationEvent(); await store.refreshBooking('b1');
  assert.equal(reads, 3); auth('SIGNED_OUT', null); assert.equal(selectAdminBooking(store.getSnapshot(), 'b1').data, null);
});

function hookHarness(cache) {
  let focus;
  const callbacks = { booking: new Set(), notification: new Set(), app: new Set() };
  let removed = 0;
  const subscribe = (kind, callback) => {
    callbacks[kind].add(callback);
    return () => { callbacks[kind].delete(callback); removed++; };
  };
  const { useAdminBookingDetail } = loadModule('src/hooks/use-admin-booking-detail.ts', {
    react: { useCallback: (callback) => callback, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_event, callback) => ({ remove: subscribe('app', callback) }) } },
    '@/services/admin-booking-detail-cache': { selectAdminBooking },
    '@/services/admin-booking-detail-store': { adminBookingDetailStore: cache },
    '@/services/booking-pages-store': { adminBookingPagesStore: { getSnapshot: () => ({ accountId: null, entries: {} }) } },
    '@/services/booking-events': { subscribeToBookingsChanged: (callback) => subscribe('booking', callback) },
    '@/services/notification-events': { subscribeToNotificationsChanged: (callback) => subscribe('notification', callback) },
  });
  return { render: (id = 'b1') => useAdminBookingDetail(id), focus: () => focus(), removed: () => removed,
    event: (kind, value) => {
      if (kind !== 'app') cache.invalidate();
      callbacks[kind].forEach((callback) => callback(value));
    } };
}

test('Detail render has no fetch side effect; focus, push, booking changes and stale resume refresh, then clean up on blur', async () => {
  const { cache, calls, setTime } = setup();
  const hook = hookHarness(cache);
  assert.equal(hook.render().isLoading, true);
  assert.equal(calls.detail.length, 0);
  const leave = hook.focus();
  await flush();
  assert.equal(hook.render().booking.id, 'b1');
  hook.event('app', 'active');
  assert.equal(calls.detail.length, 1);
  setTime(30_000);
  hook.event('app', 'background');
  assert.equal(calls.detail.length, 1);
  hook.event('app', 'active');
  await flush();
  assert.equal(calls.detail.length, 2);
  hook.event('notification');
  await flush();
  hook.event('booking');
  await flush();
  await hook.render().refresh();
  assert.equal(calls.detail.length, 5);
  leave();
  assert.equal(hook.removed(), 3);
  hook.event('notification');
  hook.event('app', 'active');
  await flush();
  assert.equal(calls.detail.length, 5);
});

test('Detail hook keeps first errors, missing IDs, signed-out state and confirmed missing rows distinct from loading', async () => {
  const { cache, api } = setup();
  const hook = hookHarness(cache);
  api.load = async () => { throw new Error('offline'); };
  await cache.refreshBooking('b1');
  assert.equal(hook.render().isLoading, false);
  assert.match(hook.render().error, /Could not load/);
  api.load = async () => null;
  await cache.refreshBooking('b1');
  assert.equal(hook.render().isLoading, false);
  assert.equal(hook.render().error, null);
  assert.equal(hook.render('').isLoading, false);
  assert.match(hook.render('').error, /missing a booking ID/);
  cache.setAccount(null);
  assert.equal(hook.render().isLoading, false);
  assert.match(hook.render().error, /sign in again/);
  assert.equal(hook.focus(), undefined);
});

test('Old focus listeners and action callbacks cannot start reads or writes for a newly signed-in session', async () => {
  const { cache, calls } = setup();
  const hook = hookHarness(cache);
  const previous = hook.render();
  const leave = hook.focus();
  await flush();
  cache.setAccount(null);
  cache.setAccount('admin-a');
  hook.event('app', 'active');
  await previous.refresh();
  assert.equal(await previous.updateStatus('confirmed'), null);
  assert.equal(calls.detail.length, 1);
  assert.equal(calls.write.length, 0);
  leave();
  hook.render();
  const currentLeave = hook.focus();
  await flush();
  assert.equal(calls.detail.length, 2);
  currentLeave();
});

function screenHarness(detail = {}, mounted = { current: true }, params = { id: 'b1' }) {
  const jsx = (type, props, key) => ({ type, props, key });
  const alerts = [], states = [], refs = [], writes = [];
  let cursor = 0, refCursor = 0;
  const value = { accountId: 'admin-a', accountVersion: 1, booking: booking(), error: null, isLoading: false,
    isRefreshing: false, isUpdating: false, refresh: async () => {}, updateStatus: async () => ({ success: true }), ...detail };
  const { default: Screen } = loadModule('src/app/photographer/requests/[id].tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    react: { useRef: (initial) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }),
      useState: (initial) => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (next) => { states[index] = next; writes.push(next); }];
      } },
    'expo-router': { router: {}, useLocalSearchParams: () => params },
    'expo-image': { Image: 'Image' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { ...Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'RefreshControl', 'Modal', 'TextInput', 'KeyboardAvoidingView'].map((name) => [name, name])),
      Platform: { OS: 'android' }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'react-native-svg': {}, '@/components/admin-brand-header': {},
    '@/components/app-alert': { showAppAlert: (...args) => alerts.push(args) },
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-mounted-ref': { useMountedRef: () => mounted },
    '@/hooks/use-admin-booking-detail': { useAdminBookingDetail: (id) => { assert.equal(id, typeof params.id === 'string' ? params.id : params.id?.[0] ?? ''); return value; } },
    '@/features/photographer/booking-detail/display': { formatStatusLabel: (status) => status, getBookingInclusions: () => [],
      hasSessionDetails: () => false, ...Object.fromEntries(['getBookingDateLabel', 'getBookingDurationLabel', 'getBookingTimeLabel',
        'getBookingWeekday', 'getAdditionalNotes', 'getResolvedStatusMessage', 'getResolvedStatusTitle'].map((name) => [name, () => name])) },
    '@/styles/photographer.styles': { photographerStyles: {} },
    '@/styles/admin-booking-detail.styles': { adminBookingDetailStyles: {} },
    '@/styles/admin-theme': { adminColors: {} },
  });
  function render() {
    cursor = 0; refCursor = 0;
    const wrapper = Screen();
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node);
      visit(node.props?.children);
    }
    visit(wrapper.type(wrapper.props));
    return nodes;
  }
  const text = (node) => !node ? '' : typeof node.props?.children === 'string' ? node.props.children
    : Array.isArray(node.props?.children) ? node.props.children.map(text).join('') : text(node.props?.children);
  return { value, alerts, writes, wrapper: Screen, render,
    button: (label) => render().find((node) => node.type === 'Pressable' && text(node) === label),
    texts: () => render().filter((node) => node.type === 'Text').map((node) => node.props.children) };
}

test('Detail screen keeps cached content during refresh and failures, supports native pull, and stops loading on missing rows', () => {
  let pulls = 0;
  const screen = screenHarness({ isRefreshing: true, error: 'Showing previously loaded data.', refresh: async () => { pulls++; } });
  assert.ok(screen.texts().includes('Client'));
  assert.ok(!screen.texts().includes('Loading booking request...'));
  const scroll = screen.render().find((node) => node.type === 'ScrollView');
  assert.equal(scroll.props.refreshControl.props.refreshing, true);
  scroll.props.refreshControl.props.onRefresh();
  assert.equal(pulls, 1);
  screen.value.booking = null;
  screen.value.error = null;
  screen.value.isRefreshing = false;
  assert.ok(screen.texts().includes('This booking was not found or is no longer available.'));
  screen.value.error = 'Could not load booking details.';
  assert.ok(!screen.texts().includes('This booking was not found or is no longer available.'));
});

test('Screen blocks duplicate clicks, shows server refusal without success, and suppresses late UI updates after leaving', async () => {
  for (const leave of [false, true]) {
    const response = deferred();
    let calls = 0;
    const mounted = { current: true };
    const screen = screenHarness({ updateStatus: () => { calls++; return response.promise; } }, mounted);
    const click = screen.button('Confirm Request').props.onPress;
    const first = click();
    await click();
    assert.equal(calls, 1);
    if (leave) mounted.current = false;
    response.resolve({ success: false, message: 'The server reports a conflict.' });
    await first;
    assert.equal(screen.writes.length, 0);
    assert.equal(screen.alerts.length, leave ? 0 : 1);
    if (!leave) assert.match(screen.alerts[0][1], /server reports a conflict/);
  }
});

test('Successful status actions show success only after acceptance; pending updates disable every decision control', async () => {
  const response = deferred();
  const screen = screenHarness({ updateStatus: () => response.promise });
  const pending = screen.button('Confirm Request').props.onPress();
  assert.equal(screen.writes.length, 0);
  screen.value.isUpdating = true;
  const nodes = screen.render();
  assert.ok(nodes.filter((node) => node.type === 'Pressable' && typeof node.props.disabled === 'boolean').every((node) => node.props.disabled));
  assert.equal(nodes.find((node) => node.type === 'TextInput').props.editable, false);
  response.resolve({ success: true });
  await pending;
  assert.deepEqual(screen.writes, [false, '', 'confirmed']);
});

test('Detail identity clears decision state across booking, account and same-account relogin changes', () => {
  const params = { id: ['b1', 'ignored'] };
  const screen = screenHarness({}, undefined, params);
  const first = screen.wrapper().key;
  screen.value.accountVersion++;
  assert.notEqual(screen.wrapper().key, first);
  const second = screen.wrapper().key;
  screen.value.accountId = 'admin-b';
  assert.notEqual(screen.wrapper().key, second);
  const third = screen.wrapper().key;
  params.id = 'b2';
  assert.notEqual(screen.wrapper().key, third);
});

function serviceHarness(overrides = {}) {
  const operations = [], effects = [];
  const row = { id: 'b1', booking_date: '2099-01-01', start_time: '10:00:00', end_time: '11:00:00', status: 'confirmed',
    client_id: 'client-1', notes: null, packages: { name: 'Portrait', price: 1500 }, profiles: { full_name: 'Server client' },
    services: { duration_minutes: 60, buffer_minutes: 15, minimum_notice_days: 1 } };
  const result = (query) => {
    if (query.payload) return overrides.write ?? { data: { id: 'b1' }, error: null };
    if (query.table === 'time_slots') return query.filters.some(([key, val]) => key === 'status' && val === 'unavailable')
      ? overrides.unavailable ?? { data: [], error: null } : overrides.available ?? { data: [], error: null };
    if (query.fields === 'id, start_time, end_time') return overrides.conflicts ?? { data: [], error: null };
    if (query.fields.includes('duration_minutes')) return overrides.confirmation ?? { data: row, error: null };
    return overrides.detail ?? { data: row, error: null };
  };
  const supabase = { from: (table) => {
    const query = { table, filters: [], select: (fields) => { query.fields = fields; return query; },
      update: (payload) => { query.payload = payload; return query; },
      eq: (key, value) => { query.filters.push([key, value]); return query; },
      in: (key, value) => { query.filters.push([key, value]); return query; },
      neq: (key, value) => { query.filters.push([`not:${key}`, value]); return query; },
      limit: () => query,
      maybeSingle: async () => { operations.push(query); return result(query); },
      then: (resolve, reject) => { operations.push(query); return Promise.resolve(result(query)).then(resolve, reject); } };
    return query;
  } };
  const service = loadModule('src/services/admin-bookings.ts', {
    '@/lib/supabase': { supabase: overrides.disconnected ? null : supabase },
    '@/services/booking-expiration': { expirePastPendingBookings: async (options) => {
      effects.push('expire'); overrides.expirationOptions?.push(options);
      return overrides.expiration ?? { success: true, expiredCount: 0 };
    } },
    '@/services/audit-log': { createAuditLog: async () => { effects.push('audit'); } },
    '@/services/booking-events': { emitBookingsChanged: () => { effects.push('change'); } },
    '@/services/booking-status-history': { createBookingStatusHistory: async () => { effects.push('history'); } },
    '@/services/notifications': { createClientBookingStatusNotification: async () => { effects.push('notify'); } },
    '@/services/studio-settings': { getDefaultWorkingHoursWindow: async (options) => {
      overrides.workingOptions?.push(options);
      if (overrides.workingError) throw new Error('Settings offline');
      return { startTime: '08:00:00', endTime: '17:00:00' };
    } },
  });
  return { service, operations, effects, row };
}

test('Strict detail reads distinguish server errors and missing rows while keeping previous callers compatible', async () => {
  const failure = new Error('Network failed');
  const { service } = serviceHarness({ detail: { data: null, error: failure } });
  await assert.rejects(service.getAdminBookingRequest('b1', { throwOnError: true }), failure);
  assert.equal(await service.getAdminBookingRequest('b1'), null);
  const missing = serviceHarness({ detail: { data: null, error: null } }).service;
  assert.equal(await missing.getAdminBookingRequest('b1', { throwOnError: true }), null);
  const disconnected = serviceHarness({ disconnected: true }).service;
  await assert.rejects(disconnected.getAdminBookingRequest('b1', { throwOnError: true }), /not connected/);
  assert.equal(await disconnected.getAdminBookingRequest('b1'), null);
});

test('All status actions keep conditional database writes and return the already-read server booking', async () => {
  for (const status of ['confirmed', 'rejected', 'completed']) {
    const { service, operations, effects } = serviceHarness();
    const result = await service.updateAdminBookingStatus('b1', status, '  Unavailable  ');
    assert.equal(result.success, true);
    assert.equal(result.booking.clientName, 'Server client');
    const write = operations.find((query) => query.payload);
    assert.equal(write.filters.find(([key]) => key === 'id')[1], 'b1');
    assert.equal(write.filters.find(([key]) => key === 'status')[1], status === 'completed' ? 'confirmed' : 'pending');
    assert.equal(write.payload.rejection_reason, status === 'rejected' ? 'Unavailable' : null);
    assert.equal(operations.filter((query) => query.fields.includes('profiles:client_id')).length, 1);
    assert.deepEqual(effects.slice(-4), ['history', 'audit', 'notify', 'change']);
    if (status === 'confirmed') {
      assert.ok(operations.some((query) => query.fields.includes('duration_minutes') && query.filters.some(([key, val]) => key === 'status' && val === 'pending')));
      assert.equal(operations.filter((query) => query.table === 'time_slots').length, 2);
      assert.ok(operations.some((query) => query.filters.some(([key]) => key === 'not:id')));
    }
  }
});

test('Admin actions force a fresh expiration check and stop before writes, history or notifications if it fails', async () => {
  for (const status of ['confirmed', 'rejected', 'completed']) {
    const expirationOptions = [];
    const f = serviceHarness({ expirationOptions, expiration: { success: false, message: 'Status could not be checked.' } });
    const result = await f.service.updateAdminBookingStatus('b1', status);
    assert.equal(result.success, false);
    assert.equal(expirationOptions[0].force, true);
    assert.equal(f.operations.length, 0);
    assert.deepEqual(f.effects, ['expire']);
  }
});

test('No approval is reported after a conditional write misses, the database refuses overlap, or an update fails', async () => {
  for (const write of [{ data: null, error: null }, { data: null, error: { code: '23P01', message: 'overlap' } },
    { data: null, error: { message: 'Access denied' } }]) {
    const { service, operations, effects } = serviceHarness({ write });
    assert.equal((await service.updateAdminBookingStatus('b1', 'completed')).success, false);
    assert.ok(!operations.some((query) => query.fields.includes('profiles:client_id')));
    assert.ok(!effects.includes('change'));
    assert.ok(!effects.includes('notify'));
  }
});

test('Confirmation still refuses server-side conflicts, unavailable times, closed hours and verification failures before writing', async () => {
  const conflict = { data: [{ id: 'other', start_time: '09:50:00', end_time: '10:00:00' }], error: null };
  for (const overrides of [{ conflicts: conflict }, { unavailable: conflict },
    { available: { data: [{ start_time: '12:00:00', end_time: '17:00:00' }], error: null } },
    { confirmation: { data: null, error: null } }, { conflicts: { data: null, error: { message: 'offline' } } }]) {
    const { service, operations } = serviceHarness(overrides);
    assert.equal((await service.updateAdminBookingStatus('b1', 'confirmed')).success, false);
    assert.ok(!operations.some((query) => query.payload));
  }
});

test('Admin confirmation forces current working hours and a failed check prevents the status write', async () => {
  for (const workingError of [false, true]) {
    const workingOptions = [];
    const { service, operations } = serviceHarness({ workingOptions, workingError });
    assert.equal((await service.updateAdminBookingStatus('b1', 'confirmed')).success, !workingError);
    assert.equal(workingOptions[0].force, true); assert.equal(workingOptions[0].throwOnError, true);
    assert.equal(operations.some(q => q.payload), !workingError);
  }
});

test('Confirmation still uses the server service duration and minimum notice instead of cached display fields', async () => {
  for (const changes of [{ services: { duration_minutes: 120 } }, { booking_date: '2000-01-01' }]) {
    const base = serviceHarness().row;
    const { service, operations } = serviceHarness({ confirmation: { data: { ...base, ...changes }, error: null } });
    assert.equal((await service.updateAdminBookingStatus('b1', 'confirmed')).success, false);
    assert.ok(!operations.some((query) => query.payload));
  }
});
