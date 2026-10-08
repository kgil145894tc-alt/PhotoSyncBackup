const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function loadModule(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Date, Promise, Error, Map, Set, require: (name) => {
    if (name.startsWith('@/assets/')) return name;
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const booking = (changes = {}) => ({ id: 'b1', clientId: 'client-a', status: 'pending', packageName: 'Portrait',
  clientName: 'Client', packagePrice: 1500, bookingDate: '2099-01-01', startTime: '10:00:00', endTime: '11:00:00', ...changes });

function screenHarness(overrides = {}, params = {}, mounted = { current: true }) {
  const jsx = (type, props, key) => ({ type, props, key });
  const refs = [], states = [], alerts = [], navigation = [], changes = [], packageSelections = [];
  const session = { current: true };
  let cursor = 0, refCursor = 0, focusCallbacks = [], cleanups = [];
  const state = { accountId: 'client-a', accountVersion: 1, bookings: [booking()], isLoading: false,
    isRefreshing: false, error: null, hasLoaded: true, isFresh: true, cancellingId: null,
    refresh: async () => {}, cancel: async () => ({ success: true }), isCurrentSession: () => session.current, ...overrides };
  const services = { reschedule: async () => ({ success: true, packageItem: { id: 'server-package' } }) };
  const { default: Screen } = loadModule('src/app/(client)/book.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useCallback: (callback) => callback, useRef: (initial) => {
      const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial });
    }, useState: (initial) => {
      const index = cursor++; if (!(index in states)) states[index] = initial;
      return [states[index], (next) => { states[index] = next; changes.push(next); }];
    } },
    'expo-router': { useLocalSearchParams: () => params, useFocusEffect: (callback) => focusCallbacks.push(callback),
      router: { push: (url) => navigation.push(url), setParams: (value) => { navigation.push(value); Object.assign(params, value); } } },
    'react-native': Object.fromEntries(['Modal', 'Pressable', 'ScrollView', 'Text', 'View', 'RefreshControl'].map((name) => [name, name])),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }, 'react-native-svg': {},
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-mounted-ref': { useMountedRef: () => mounted },
    '@/hooks/use-paged-client-bookings': { usePagedClientBookings: () => state },
    '@/components/app-alert': { showAppAlert: (...args) => alerts.push(args) },
    '@/services/booking-draft': { setSelectedPackage: (value) => packageSelections.push(value) },
    '@/services/client-bookings': { getClientReschedulePackage: (...args) => services.reschedule(...args) },
    '@/styles/booking-empty.styles': { bookingEmptyStyles: {} },
    '@/styles/client-bookings.styles': { clientBookingsStyles: {} },
    '@/components/mobile-page': { MobilePage: 'MobilePage' },
    '@/components/client-bookings-view': { BookingCollection: 'Collection', BookingDetailView: 'Detail' },
  });
  const render = () => {
    cursor = 0; refCursor = 0; focusCallbacks = [];
    const wrapper = Screen(), nodes = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node); visit(node.props?.children);
    };
    visit(wrapper.type(wrapper.props));
    return nodes;
  };
  return { render, state, services, alerts, navigation, packageSelections, changes, mounted, session, wrapper: Screen,
    focus: () => { cleanups = focusCallbacks.map((callback) => callback()).filter(Boolean); },
    blur: () => { cleanups.forEach((callback) => callback()); },
    node: (type) => render().find((node) => node.type === type),
    drawer: () => render().find((node) => typeof node.type === 'function' && 'isCancelling' in node.props) };
}

test('My Bookings preserves visible cards and filter state during refresh/error, and native pull forces a refresh', () => {
  let pulls = 0;
  const screen = screenHarness({ isRefreshing: true, error: 'Showing previously loaded data.', refresh: async () => { pulls++; } });
  screen.node('Collection').props.onFilterChange('approved');
  const collection = screen.node('Collection');
  assert.equal(collection.props.isLoading, false);
  assert.equal(collection.props.bookings[0].id, 'b1');
  assert.equal(collection.props.activeFilter, 'approved');
  assert.equal(collection.props.isRefreshing, true); collection.props.onRefresh();
  assert.equal(pulls, 1);
  assert.equal(collection.props.error, 'Showing previously loaded data.');
  assert.equal(screen.node('MobilePage').props.scrollable, false);
});

test('Initial client read failure and sign-out show an error without claiming there are no bookings', () => {
  for (const error of ['Could not load your bookings.', 'Please sign in again to see your bookings.']) {
    const screen = screenHarness({ bookings: [], hasLoaded: false, isLoading: false, error });
    assert.equal(screen.node('Collection').props.error, error);
  }
  const empty = screenHarness({ bookings: [] });
  assert.equal(empty.node('Collection').props.isLoading, false);
});

test('Selected client details and cancellation drawer follow updated cache rows instead of keeping stale objects', () => {
  const screen = screenHarness();
  screen.node('Collection').props.onSelect(booking());
  screen.node('Detail').props.onCancel();
  assert.equal(screen.drawer().props.booking.id, 'b1');
  screen.state.bookings = [booking({ status: 'confirmed', packageName: 'Updated package' })];
  assert.equal(screen.node('Detail').props.booking.packageName, 'Updated package');
  assert.equal(screen.drawer().props.booking, null);
  screen.state.bookings = [];
  screen.render(); screen.focus();
  assert.equal(screen.node('Detail'), undefined);
  screen.state.bookings = [booking()];
  assert.equal(screen.node('Detail'), undefined, 'Removed selection was cleared');
});

test('A notification link is preserved on failed or stale reads; only a verified successful result clears a missing booking', () => {
  for (const state of [{ hasLoaded: false, isLoading: true }, { error: 'Offline' }, { isFresh: false }, { isRefreshing: true }]) {
    const screen = screenHarness({ bookings: [], ...state }, { bookingId: 'missing' });
    screen.render(); screen.focus();
    assert.equal(screen.alerts.length, 0);
    assert.equal(screen.navigation.length, 0);
  }
  const screen = screenHarness({ bookings: [] }, { bookingId: 'missing' });
  screen.render(); screen.focus();
  screen.render(); screen.focus();
  assert.equal(screen.alerts.length, 1);
  assert.equal(screen.navigation.length, 1);
});

test('Cancellation prevents duplicate clicks, reports refusal, and suppresses alerts/state changes after blur or logout', async () => {
  for (const leave of ['none', 'blur', 'logout', 'unmount']) {
    const response = deferred(); let calls = 0;
    const screen = screenHarness({ cancel: () => { calls++; return response.promise; } });
    screen.node('Collection').props.onSelect(booking());
    screen.node('Detail').props.onCancel();
    screen.render(); screen.focus();
    const click = screen.drawer().props.onCancel;
    const pending = click(); await click();
    assert.equal(calls, 1);
    if (leave === 'blur') screen.blur();
    if (leave === 'logout') screen.session.current = false;
    if (leave === 'unmount') screen.mounted.current = false;
    const changes = screen.changes.length;
    response.resolve({ success: false, message: 'Only pending bookings can be cancelled.' });
    await pending;
    assert.equal(screen.alerts.length, leave === 'none' ? 1 : 0);
    assert.equal(screen.changes.length, changes);
  }
});

test('Reschedule still loads its package from the server, blocks duplicates, and never navigates after leaving or a session change', async () => {
  for (const leave of ['none', 'blur', 'logout']) {
    const response = deferred(); let calls = 0;
    const screen = screenHarness({}, { bookingId: ['b1'] });
    screen.services.reschedule = (id, options) => {
      calls++; assert.equal(id, 'b1'); assert.equal(options.expectedAccountId, 'client-a');
      assert.equal(options.isSessionCurrent(), true); return response.promise;
    };
    screen.render(); screen.focus();
    const click = screen.node('Detail').props.onReschedule;
    const pending = click(); await click();
    assert.equal(calls, 1);
    if (leave === 'blur') screen.blur();
    if (leave === 'logout') screen.session.current = false;
    response.resolve({ success: true, packageItem: { id: 'server-package' } });
    await pending;
    assert.equal(screen.packageSelections.length, leave === 'none' ? 1 : 0);
    assert.equal(screen.navigation.length, leave === 'none' ? 1 : 0);
  }
});

test('Decision state resets for another account and same-account relogin', () => {
  const screen = screenHarness();
  const before = screen.wrapper().key;
  screen.state.accountVersion++;
  assert.notEqual(screen.wrapper().key, before);
  const current = screen.wrapper().key;
  screen.state.accountId = 'client-b';
  assert.notEqual(screen.wrapper().key, current);
});

test('MobilePage passes an optional native refresh control to its existing scroll view', () => {
  const jsx = (type, props) => ({ type, props });
  const refreshControl = { type: 'RefreshControl', props: { refreshing: true } };
  const { MobilePage } = loadModule('src/components/mobile-page.tsx', {
    '@/components/keyboard-form-scroll-view': { KeyboardFormScrollView: 'ScrollView' },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-router': { router: {} }, 'expo-status-bar': {},
    'react-native': { ScrollView: 'ScrollView', Platform: { OS: 'android' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/styles/responsive.styles': { responsiveStyles: {} },
  });
  const scroll = MobilePage({ title: 'My Bookings', children: null, refreshControl }).props.children.find((node) => node.type === 'ScrollView');
  assert.equal(scroll.props.refreshControl, refreshControl);
  const original = MobilePage({ title: 'Booking flow', children: null }).props.children.find((node) => node.type === 'ScrollView');
  assert.equal(original.props.refreshControl, undefined);
});

function serviceHarness(overrides = {}) {
  const operations = [], effects = [];
  const row = { id: 'b1', client_id: 'client-a', status: 'pending', booking_date: '2099-01-01', start_time: '10:00:00', end_time: '11:00:00',
    packages: { name: 'Server package', price: 2500, inclusions: ['Server inclusion'] },
    services: { name: 'Portrait', duration_minutes: 60, buffer_minutes: 15, minimum_notice_days: 1 },
    package_id: 'package-id', service_id: 'service-id', notes: null };
  const supabase = { auth: { getUser: async () => overrides.auth ?? { data: { user: { id: 'client-a' } }, error: null } }, from: (table) => {
    const query = { table, filters: [], select: (fields) => { query.fields = fields; return query; },
      update: (payload) => { query.payload = payload; return query; },
      eq: (key, value) => { query.filters.push([key, value]); return query; },
      in: (key, value) => { query.filters.push([key, value]); return query; }, limit: () => query,
      order: async () => { operations.push(query); return overrides.list ?? { data: [row], error: null }; },
      maybeSingle: async () => { operations.push(query); return query.payload ? overrides.write ?? { data: row, error: null } : overrides.detail ?? { data: row, error: null }; },
      then: (resolve, reject) => { operations.push(query); return Promise.resolve({ data: [], error: null }).then(resolve, reject); } };
    return query;
  } };
  const service = loadModule('src/services/client-bookings.ts', {
    '@/lib/supabase': { supabase: overrides.disconnected ? null : supabase },
    '@/data/service-catalog': { fallbackPortraitPackages: [{ inclusions: ['Fallback'], priceAmount: 1500 }] },
    '@/services/booking-availability': { getActiveBookingSlotsForDate: async () => overrides.conflicts ?? { slots: [], success: true } },
    '@/services/booking-expiration': { expirePastPendingBookings: async (options) => {
      effects.push('expire'); overrides.expirationOptions?.push(options); await overrides.expire?.();
      return overrides.expiration ?? { success: true, expiredCount: 0 };
    } },
    '@/services/booking-events': { emitBookingsChanged: () => { effects.push('change'); } },
    '@/services/booking-status-history': { createBookingStatusHistory: async () => { effects.push('history'); } },
    '@/services/notifications': { createAdminBookingCancelledNotifications: async () => { effects.push('notify'); },
      createAdminBookingRescheduledNotifications: async () => { effects.push('notify'); } },
    '@/services/studio-settings': { getDefaultWorkingHoursWindow: async (options) => {
      overrides.workingOptions?.push(options);
      if (overrides.workingError) throw new Error('Settings offline');
      return { startTime: '08:00:00', endTime: '17:00:00' };
    } },
  });
  return { service, operations, effects, row };
}

test('Cancel and reschedule-package requests stop before database work if the captured session changes during expiration', async () => {
  for (const method of ['cancelClientBooking', 'getClientReschedulePackage']) {
    let current = true;
    const { service, operations } = serviceHarness({ expire: () => { current = false; } });
    const options = { throwOnError: true, expectedAccountId: 'client-a', isSessionCurrent: () => current };
    assert.equal((await service[method]('b1', options)).success, false);
    assert.equal(operations.length, 0);
  }
});

test('The authenticated account must match the cache scope before cancellation or reschedule preparation', async () => {
  const { service, operations } = serviceHarness({ auth: { data: { user: { id: 'client-b' } }, error: null } });
  const options = { throwOnError: true, expectedAccountId: 'client-a' };
  assert.equal((await service.cancelClientBooking('b1', options)).success, false);
  assert.equal((await service.getClientReschedulePackage('b1', options)).success, false);
  assert.equal(operations.length, 0);
});

test('Client booking actions force account-scoped expiration and stop if verification fails', async () => {
  for (const method of ['cancelClientBooking', 'getClientReschedulePackage', 'rescheduleClientBooking']) {
    const expirationOptions = [];
    const f = serviceHarness({ expirationOptions, expiration: { success: false, message: 'Status could not be checked.' } });
    const result = await f.service[method]('b1', method === 'rescheduleClientBooking'
      ? { bookingDate: '2099-01-01', startTime: '10:00:00', endTime: '11:00:00' } : {});
    assert.equal(result.success, false);
    assert.equal(expirationOptions[0].force, true);
    assert.equal(expirationOptions[0].expectedAccountId, 'client-a');
    assert.equal(f.operations.length, 0);
    assert.deepEqual(f.effects, ['expire']);
  }
});

test('Cancellation keeps the ID, authenticated owner and pending-status database conditions and only emits changes after acceptance', async () => {
  for (const write of [{ data: { id: 'b1' }, error: null }, { data: null, error: null }, { data: null, error: { message: 'Access denied' } }]) {
    const { service, operations, effects } = serviceHarness({ write });
    const result = await service.cancelClientBooking('b1');
    const query = operations[0];
    assert.ok(query.filters.some(([key, val]) => key === 'id' && val === 'b1'));
    assert.ok(query.filters.some(([key, val]) => key === 'client_id' && val === 'client-a'));
    assert.ok(query.filters.some(([key, val]) => key === 'status' && val === 'pending'));
    assert.equal(query.payload.status, 'cancelled');
    assert.equal(result.success, Boolean(write.data));
    assert.equal(effects.includes('change'), Boolean(write.data));
    assert.equal(effects.includes('notify'), Boolean(write.data));
  }
});

test('Rescheduling still reads live service rules and package values and enforces owner/status conditions on reads and writes', async () => {
  const { service, operations } = serviceHarness();
  const prepared = await service.getClientReschedulePackage('b1');
  assert.equal(prepared.packageItem.priceAmount, 2500);
  assert.equal(prepared.packageItem.durationMinutes, 60);
  assert.equal(prepared.packageItem.name, 'Server package');
  const result = await service.rescheduleClientBooking('b1', { bookingDate: '2099-01-01', startTime: '10:00:00', endTime: '11:00:00' });
  assert.equal(result.success, true);
  for (const query of operations.filter((operation) => operation.table === 'bookings')) {
    assert.ok(query.filters.some(([key, val]) => key === 'client_id' && val === 'client-a'));
    assert.ok(query.filters.some(([key, val]) => key === 'status' && val.includes('pending') && val.includes('confirmed')));
  }
  assert.equal(operations.find((query) => query.payload).payload.status, 'pending');
});

test('Rescheduling still refuses server duration, notice, availability conflicts, and silently skipped writes', async () => {
  const base = serviceHarness().row;
  for (const overrides of [{ detail: { data: { ...base, services: { duration_minutes: 120 } }, error: null } },
    { conflicts: { slots: [{ start_time: '09:50:00', end_time: '10:00:00' }], success: true } },
    { conflicts: { slots: [], success: false, message: 'offline' } }, { write: { data: null, error: null } }]) {
    const { service } = serviceHarness(overrides);
    assert.equal((await service.rescheduleClientBooking('b1', { bookingDate: '2099-01-01', startTime: '10:00:00', endTime: '11:00:00' })).success, false);
  }
  const { service, operations } = serviceHarness();
  assert.equal((await service.rescheduleClientBooking('b1', { bookingDate: '2000-01-01', startTime: '10:00:00', endTime: '11:00:00' })).success, false);
  assert.ok(!operations.some((query) => query.payload));
});

test('Rescheduling verifies working hours independently of browsing and refuses a failed settings check', async () => {
  for (const workingError of [false, true]) {
    const workingOptions = [], f = serviceHarness({ workingOptions, workingError });
    const result = await f.service.rescheduleClientBooking('b1', { bookingDate: '2099-01-01', startTime: '10:00:00', endTime: '11:00:00' });
    assert.equal(result.success, !workingError); assert.equal(workingOptions[0].force, true);
    assert.equal(workingOptions[0].throwOnError, true); assert.equal(f.operations.some(q => q.payload), !workingError);
  }
});
