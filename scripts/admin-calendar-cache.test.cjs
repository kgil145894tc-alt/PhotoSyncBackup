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
  vm.runInNewContext(code, {
    exports, require: (name) => {
      if (name.endsWith('.png')) return name;
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    }, Date, Promise, Map, Set, Error, Intl,
  });
  return exports;
}
const { createAdminCalendarCache } = loadModule('src/services/admin-calendar-cache.ts');
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('Returning to a month or day reuses its independent data, including empty results', async () => {
  let time = 0;
  const calls = [];
  const cache = createAdminCalendarCache(async (key) => { calls.push(key); return key === 'empty' ? [] : [{ id: key }]; }, () => time);
  cache.setAccount('admin-a');
  await cache.refresh('oct');
  await cache.refresh('nov');
  await cache.refresh('empty');
  const original = cache.getSnapshot().entries.oct.data;
  await cache.refresh('oct');
  await cache.refresh('empty');
  assert.equal(cache.getSnapshot().entries.oct.data, original);
  assert.deepEqual(calls, ['oct', 'nov', 'empty']);
  time = 30_000;
  await cache.refresh('oct');
  assert.equal(calls.length, 4);
  await cache.refresh('oct', true);
  assert.equal(calls.length, 5);
});

test('Focus, pull and event refreshes share one request per key; different months do not block each other', async () => {
  const october = deferred();
  const november = deferred();
  const calls = [];
  const cache = createAdminCalendarCache((key) => { calls.push(key); return key === 'oct' ? october.promise : november.promise; });
  cache.setAccount('admin-a');
  const first = cache.refresh('oct');
  assert.equal(cache.refresh('oct', true), first);
  const second = cache.refresh('nov');
  await flush();
  assert.deepEqual(calls, ['oct', 'nov']);
  november.resolve([{ id: 'newer-month' }]);
  await second;
  october.resolve([{ id: 'earlier-month' }]);
  await first;
  assert.equal(cache.getSnapshot().entries.nov.data[0].id, 'newer-month');
  assert.equal(cache.getSnapshot().entries.oct.data[0].id, 'earlier-month');
});

test('An availability edit invalidates only its key, even while no screen is subscribed', async () => {
  const calls = [];
  const cache = createAdminCalendarCache(async (key) => { calls.push(key); return []; });
  cache.setAccount('admin-a');
  await cache.refresh('oct');
  await cache.refresh('nov');
  cache.invalidate('oct');
  await cache.refresh('nov');
  await cache.refresh('oct');
  assert.deepEqual(calls, ['oct', 'nov', 'oct']);
  cache.invalidate();
  await cache.refresh('nov');
  assert.equal(calls.length, 4);
});

test('A booking or availability change during a fetch discards the old response and reads again', async () => {
  const read = deferred();
  let calls = 0;
  const cache = createAdminCalendarCache(async () => ++calls === 1 ? read.promise : [{ id: 'current' }]);
  cache.setAccount('admin-a');
  const request = cache.refresh('oct');
  await flush();
  cache.invalidate('oct');
  read.resolve([{ id: 'before-edit' }]);
  await request;
  assert.equal(calls, 2);
  assert.equal(cache.getSnapshot().entries.oct.data[0].id, 'current');
});

test('An obsolete failure after invalidation also retries instead of blocking current schedule data', async () => {
  const read = deferred();
  let calls = 0;
  const cache = createAdminCalendarCache(async () => ++calls === 1 ? read.promise : []);
  cache.setAccount('admin-a');
  const request = cache.refresh('oct');
  await flush();
  cache.invalidate();
  read.reject(new Error('Obsolete error'));
  await request;
  assert.equal(calls, 2);
  assert.equal(cache.getSnapshot().entries.oct.error, null);
});

test('Failures keep cached appointments and availability; initial errors are never cached as an empty schedule', async () => {
  let fail = false;
  const cache = createAdminCalendarCache(async () => {
    if (fail) throw new Error('Offline');
    return [{ status: 'booked' }];
  });
  cache.setAccount('admin-a');
  await cache.refresh('oct');
  fail = true;
  await cache.refresh('oct', true);
  assert.equal(cache.getSnapshot().entries.oct.data[0].status, 'booked');
  assert.match(cache.getSnapshot().entries.oct.error, /previously loaded/);
  await cache.refresh('nov');
  assert.equal(cache.getSnapshot().entries.nov.data, null);
  assert.match(cache.getSnapshot().entries.nov.error, /Could not load/);
  fail = false;
  await cache.refresh('nov');
  assert.equal(cache.getSnapshot().entries.nov.error, null);
});

test('Logout or account switching clears all keys and ignores old requests, including the same key', async () => {
  const oldRead = deferred();
  const newRead = deferred();
  let calls = 0;
  const cache = createAdminCalendarCache(() => ++calls === 1 ? oldRead.promise : newRead.promise);
  cache.setAccount('admin-a');
  const oldRequest = cache.refresh('oct');
  await flush();
  cache.setAccount(null);
  assert.equal(Object.keys(cache.getSnapshot().entries).length, 0);
  cache.setAccount('admin-b');
  const newRequest = cache.refresh('oct');
  await flush();
  oldRead.resolve([{ id: 'private-a' }]);
  await oldRequest;
  assert.equal(cache.getSnapshot().entries.oct.data, null);
  assert.equal(cache.getSnapshot().entries.oct.isFetching, true);
  newRead.resolve([{ id: 'private-b' }]);
  await newRequest;
  assert.equal(cache.getSnapshot().entries.oct.data[0].id, 'private-b');
  const unchanged = cache.getSnapshot();
  cache.setAccount('admin-b');
  assert.equal(cache.getSnapshot(), unchanged);
});

test('No reads start during render, before session restoration, or after logout cancels queued work', async () => {
  let calls = 0;
  const cache = createAdminCalendarCache(async () => { calls++; return []; });
  await cache.refresh('oct');
  cache.getSnapshot();
  cache.getServerSnapshot();
  assert.equal(calls, 0);
  cache.setAccount('admin-a');
  const request = cache.refresh('oct');
  cache.setAccount(null);
  await request;
  assert.equal(calls, 0);
  assert.equal(Object.keys(cache.getServerSnapshot().entries).length, 0);
});

test('Cache retention is bounded and the recently revisited month survives eviction', async () => {
  const calls = [];
  const cache = createAdminCalendarCache(async (key) => { calls.push(key); return []; }, Date.now, 2);
  cache.setAccount('admin-a');
  await cache.refresh('oct');
  await cache.refresh('nov');
  await cache.refresh('oct');
  await cache.refresh('dec');
  assert.equal(Object.keys(cache.getSnapshot().entries).length, 2);
  assert.ok(cache.getSnapshot().entries.oct);
  assert.equal(cache.getSnapshot().entries.nov, undefined);
  await cache.refresh('nov');
  assert.equal(calls.length, 4);
});

test('Persistent store events invalidate matching day/month, all bookings and hours; auth scopes both caches', async () => {
  let auth;
  let bookingChange;
  let calendarChange;
  let notificationChange;
  const calls = [];
  const { adminCalendarMonthStore: months, adminCalendarDayStore: days } = loadModule('src/services/admin-calendar-store.ts', {
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => { auth = callback; } } } },
    '@/services/admin-calendar-cache': { createAdminCalendarCache },
    '@/services/calendar': {
      getCalendarDaySummaries: async (key, options) => { assert.equal(options.throwOnError, true); calls.push(`month:${key}`); return []; },
      getCalendarSlotsForDate: async (key, options) => { assert.equal(options.throwOnError, true); calls.push(`day:${key}`); return []; },
    },
    '@/services/booking-events': { subscribeToBookingsChanged: (callback) => { bookingChange = callback; } },
    '@/services/calendar-events': { subscribeToCalendarChanged: (callback) => { calendarChange = callback; } },
    '@/services/notification-events': { subscribeToNotificationsChanged: (callback) => { notificationChange = callback; } },
  });
  auth('INITIAL_SESSION', { user: { id: 'admin-a' } });
  for (const key of ['2026-10', '2026-11']) await months.refresh(key);
  for (const key of ['2026-10-07', '2026-10-08']) await days.refresh(key);
  calendarChange('2026-10-07');
  await months.refresh('2026-10');
  await months.refresh('2026-11');
  await days.refresh('2026-10-07');
  await days.refresh('2026-10-08');
  assert.equal(calls.length, 6);
  auth('TOKEN_REFRESHED', { user: { id: 'admin-a' } });
  await months.refresh('2026-10');
  assert.equal(calls.length, 6);
  for (const event of [bookingChange, notificationChange, () => calendarChange()]) {
    event();
    await months.refresh('2026-11');
    await days.refresh('2026-10-08');
  }
  assert.equal(calls.length, 12);
  auth('SIGNED_OUT', null);
  assert.equal(Object.keys(months.getSnapshot().entries).length, 0);
  assert.equal(Object.keys(days.getSnapshot().entries).length, 0);
});

test('Focused hook loads only its key, filters date events, supports manual pull and removes listeners on blur', async () => {
  let focus;
  let calendarChange;
  let bookingChange;
  let notificationChange;
  let appChange;
  let removed = 0;
  const calls = [];
  const store = {
    getSnapshot: () => ({ accountId: 'admin-a', isSessionReady: true, entries: { '2026-10': { data: [], isFetching: false, error: null } } }),
    refresh: async (...args) => { calls.push(args); },
  };
  const { useAdminCalendarMonth } = loadModule('src/hooks/use-admin-calendar.ts', {
    react: { useCallback: (callback) => callback, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_event, callback) => { appChange = callback; return { remove: () => removed++ }; } } },
    '@/services/admin-calendar-store': { adminCalendarMonthStore: store, adminCalendarDayStore: store },
    '@/services/calendar-events': { subscribeToCalendarChanged: (callback) => { calendarChange = callback; return () => removed++; } },
    '@/services/booking-events': { subscribeToBookingsChanged: (callback) => { bookingChange = callback; return () => removed++; } },
    '@/services/notification-events': { subscribeToNotificationsChanged: (callback) => { notificationChange = callback; return () => removed++; } },
  });
  const result = useAdminCalendarMonth('2026-10');
  assert.equal(result.isLoading, false);
  assert.equal(calls.length, 0, 'Render must not start async work');
  const cleanup = focus();
  calendarChange('2026-11-07');
  assert.equal(calls.length, 1);
  calendarChange('2026-10-08');
  calendarChange();
  bookingChange();
  notificationChange();
  appChange('background');
  appChange('active');
  await result.refresh();
  await result.reconcile();
  assert.equal(calls.length, 8);
  assert.equal(calls[6][1], true);
  assert.equal(calls[7].length, 1, 'Post-write reconciliation shares the event refresh');
  cleanup();
  assert.equal(removed, 4);
});

test('Older requests finishing last cannot evict the most recently visited month', async () => {
  const older = deferred();
  const cache = createAdminCalendarCache((key) => key === 'oct' ? older.promise : Promise.resolve([]), Date.now, 1);
  cache.setAccount('admin-a');
  const first = cache.refresh('oct');
  await cache.refresh('nov');
  older.resolve([]);
  await first;
  assert.equal(Object.keys(cache.getSnapshot().entries).length, 1);
  assert.ok(cache.getSnapshot().entries.nov);
});

function screenHarness(file, snapshot, dataByMonth = {}) {
  const jsx = (type, props) => ({ type, props });
  const selection = [];
  const observedMonths = [];
  const pushedRoutes = [];
  let stateIndex = 0;
  const calendarDateGuards = loadModule('src/services/calendar-date-guards.ts');
  const services = loadModule('src/services/calendar.ts', {
    '@/lib/supabase': { supabase: null }, '@/services/booking-availability': {}, '@/services/audit-log': {},
    '@/services/admin-bookings': {}, '@/services/calendar-events': {}, '@/services/studio-settings': {},
    '@/services/calendar-date-guards': calendarDateGuards,
  });
  const { default: Screen } = loadModule(file, {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      useMemo: (callback) => callback(),
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in selection)) selection[index] = typeof initial === 'function' ? initial() : initial;
        return [selection[index], (value) => { selection[index] = typeof value === 'function' ? value(selection[index]) : value; }];
      },
    },
    'expo-router': { router: { push: (route) => pushedRoutes.push(route), back: () => {} }, useLocalSearchParams: () => ({ date: '2026-10-07' }) },
    'expo-image': { Image: 'Image' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Modal: 'Modal', TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' }, useWindowDimensions: () => ({ width: 375, fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'react-native-svg': {}, '@/components/admin-brand-header': {}, '@/components/app-alert': {},
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-studio-calendar-clock': { useStudioCalendarClock: () => new Date('2026-10-31T00:00:00Z') },
    '@/services/calendar-date-guards': { ...calendarDateGuards,
      getStudioDateTime: () => ({ date: '2026-10-31', time: '08:00:00' }) },
    '@/hooks/use-admin-calendar': {
      useAdminCalendarMonth: (month) => { observedMonths.push(month); return { ...snapshot, items: dataByMonth[month] ?? snapshot.items }; },
      useAdminCalendarDay: () => snapshot,
    },
    '@/services/calendar': { ...services, getCurrentDateString: () => '2026-10-31',
      getCalendarDaySummaries: () => { throw new Error('Screen must not fetch directly'); } },
    '@/styles/photographer.styles': { photographerStyles: {} },
    '@/styles/admin-calendar-slots.styles': { adminCalendarSlotsStyles: {} },
    '@/styles/admin-theme': { adminColors: {} },
  });
  function render() {
    stateIndex = 0;
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (node.type === 'Modal' && !node.props.visible) return;
      nodes.push(node);
      visit(node.props?.children);
    }
    visit(Screen());
    return nodes;
  }
  return { render, observedMonths, pushedRoutes, selection };
}
const visibleText = (nodes) => nodes.filter((node) => node.type === 'Text').map((node) => node.props.children).join(' ');
const readyScreen = { items: [], error: null, isLoading: false, isRefreshing: false, refresh: async () => {}, reconcile: async () => {} };

test('Month and year menus select dates, clamp February and close after selection or a second tap', () => {
  const harness = screenHarness('src/app/photographer/calendar.tsx', readyScreen);
  const button = (label) => harness.render().find((node) => node.props?.accessibilityLabel === label);
  const option = (label) => harness.render().find((node) => node.type === 'Pressable' && node.props.children?.props?.children === label);
  button('Select month').props.onPress();
  assert.equal(button('Select month').props.accessibilityState.expanded, true);
  option('February').props.onPress();
  harness.render();
  assert.equal(harness.observedMonths.at(-1), '2026-02');
  assert.equal(harness.selection[0].selectedDate, '2026-02-28');
  assert.equal(button('Select month').props.accessibilityState.expanded, false);
  button('Select year').props.onPress();
  option('2028').props.onPress();
  harness.render();
  assert.equal(harness.observedMonths.at(-1), '2028-02');
  assert.equal(harness.selection[0].selectedDate, '2028-02-28');
  assert.equal(button('Select year').props.accessibilityState.expanded, false);
  button('Select year').props.onPress();
  button('Select year').props.onPress();
  assert.equal(button('Select year').props.accessibilityState.expanded, false);
  button('View time slots').props.onPress();
  assert.equal(harness.pushedRoutes[0], '/photographer/calendar-slots?date=2028-02-28');
});

test('Month arrows switch immediately, clamp the selected date and display cached month data without a second fetch', () => {
  const harness = screenHarness('src/app/photographer/calendar.tsx', readyScreen);
  let nodes = harness.render();
  const next = nodes.find((node) => node.props?.accessibilityLabel === 'Next month');
  assert.equal(next.props.onPress(), undefined);
  next.props.onPress(); // Rapid taps must advance twice rather than race old requests.
  nodes = harness.render();
  assert.equal(harness.observedMonths.at(-1), '2026-12');
  assert.equal(harness.selection[0].selectedDate, '2026-12-30');
  assert.doesNotMatch(visibleText(nodes), /Loading/);
  const viewSlots = nodes.find((node) => node.props?.accessibilityLabel === 'View time slots');
  viewSlots.props.onPress();
  assert.equal(harness.pushedRoutes[0], '/photographer/calendar-slots?date=2026-12-30');
});

test('Calendar retains its grid during background refresh and exposes pull-to-refresh with errors', () => {
  let pulls = 0;
  const harness = screenHarness('src/app/photographer/calendar.tsx', {
    ...readyScreen, isRefreshing: true, error: 'Could not update the schedule. Showing previously loaded data.',
    refresh: async () => { pulls++; },
  });
  const nodes = harness.render();
  assert.doesNotMatch(visibleText(nodes), /Loading schedule/);
  assert.match(visibleText(nodes), /previously loaded/);
  const scroll = nodes.find((node) => node.type === 'ScrollView');
  assert.equal(scroll.props.refreshControl.props.refreshing, true);
  scroll.props.refreshControl.props.onRefresh();
  assert.equal(pulls, 1);
  assert.ok(nodes.some((node) => node.props?.accessibilityLabel === 'Next month'));
});

test('Time-slot failures never claim the schedule is empty, and cached bookings remain visible while updating', () => {
  const failed = screenHarness('src/app/photographer/calendar-slots.tsx', {
    ...readyScreen, error: 'Could not load the schedule. Pull down to try again.',
  }).render();
  assert.match(visibleText(failed), /Could not load/);
  assert.doesNotMatch(visibleText(failed), /No time slots/);
  const cached = screenHarness('src/app/photographer/calendar-slots.tsx', {
    ...readyScreen, isRefreshing: true,
    items: [{ id: 'booking-b1', bookingId: 'b1', clientName: 'Client A', status: 'booked', startTime: '10:00:00', endTime: '11:00:00' }],
  }).render();
  assert.match(visibleText(cached), /Client A/);
  assert.doesNotMatch(visibleText(cached), /Loading time slots/);
});
