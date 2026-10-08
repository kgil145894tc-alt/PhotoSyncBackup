const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function loadModule(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => {
    if (name.startsWith('@/assets/')) return name;
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Promise, Error, Date, Set });
  return exports;
}
const { createNotificationInboxCache } = loadModule('src/services/notification-inbox-cache.ts');
function setup(initialCount = 3) {
  let time = 0;
  const state = { count: initialCount, counts: 0, feeds: 0, fail: false, writes: 0, writeSuccess: true };
  const api = {
    load: async (_filter, _limit, readUnreadCount) => {
      state.feeds++;
      return { items: [], hasMore: false, unreadCount: await readUnreadCount() };
    },
    loadUnreadCount: async () => { state.counts++; if (state.fail) throw new Error('Offline'); return state.count; },
    markAll: async () => { state.writes++; if (state.writeSuccess) state.count = 0; return { success: state.writeSuccess }; },
    markRead: async () => { state.writes++; if (state.writeSuccess) state.count--; return { success: state.writeSuccess }; },
  };
  const cache = createNotificationInboxCache(api, () => time);
  cache.setAccount('account-a');
  return { cache, api, state, setTime: (value) => { time = value; } };
}

test('Dashboard count is cached for 30 seconds, including zero, without downloading inbox messages', async () => {
  for (const count of [0, 3]) {
    const { cache, state, setTime } = setup(count);
    await cache.refreshUnreadCount();
    setTime(29_999);
    await cache.refreshUnreadCount();
    assert.equal(state.counts, 1);
    assert.equal(state.feeds, 0);
    assert.equal(cache.getSnapshot().unreadCount, count);
    setTime(30_000);
    const refresh = cache.refreshUnreadCount();
    assert.equal(cache.getSnapshot().unreadCount, count);
    assert.equal(cache.getSnapshot().isUnreadCountFetching, true);
    await refresh;
    assert.equal(state.counts, 2);
    await cache.refreshUnreadCount({ force: true });
    assert.equal(state.counts, 3);
  }
});

test('Dashboard and both inbox filters share an overlapping count request in either navigation order', async () => {
  for (const countFirst of [true, false]) {
    const { cache, api, state } = setup();
    const response = deferred();
    api.loadUnreadCount = () => { state.counts++; return response.promise; };
    const pending = countFirst ? [cache.refreshUnreadCount(), cache.refresh('all')] : [cache.refresh('all'), cache.refreshUnreadCount()];
    pending.push(cache.refresh('unread'), cache.refreshUnreadCount({ force: true }));
    await flush();
    assert.equal(state.counts, 1);
    response.resolve(7);
    await Promise.all(pending);
    assert.equal(cache.getSnapshot().unreadCount, 7);
    assert.equal(state.feeds, 2);
    await cache.refreshUnreadCount();
    assert.equal(state.counts, 1);
  }
});

test('Opening Notifications after a dashboard read reuses its count, while inbox reads make the dashboard count fresh', async () => {
  const { cache, state } = setup();
  await cache.refreshUnreadCount();
  await cache.refresh('all');
  await cache.refresh('unread');
  assert.equal(state.counts, 1);
  cache.invalidate();
  state.count = 8;
  await cache.refresh('all');
  await cache.refreshUnreadCount();
  assert.equal(state.counts, 2);
  assert.equal(cache.getSnapshot().unreadCount, 8);
});

test('An inbox-owned count query is shared without calling the standalone auth/reminder count API', async () => {
  const { cache, api, state } = setup();
  let authenticatedCounts = 0;
  api.load = async (_filter, _limit, readUnreadCount) => ({ items: [], hasMore: false,
    unreadCount: await readUnreadCount(async () => { authenticatedCounts++; return 7; }) });
  await cache.refresh('all');
  await cache.refreshUnreadCount();
  assert.equal(cache.getSnapshot().unreadCount, 7);
  assert.equal(authenticatedCounts, 1);
  assert.equal(state.counts, 0);
});

test('Count failures retain a known count; initial failures stay unknown and can be retried', async () => {
  const { cache, state } = setup(6);
  state.fail = true;
  await cache.refreshUnreadCount();
  assert.equal(cache.getSnapshot().unreadCount, null);
  assert.match(cache.getSnapshot().unreadCountError, /Couldn’t load/);
  assert.equal(cache.getSnapshot().isUnreadCountFetching, false);
  state.fail = false;
  await cache.refreshUnreadCount();
  state.fail = true;
  await cache.refreshUnreadCount({ force: true });
  assert.equal(cache.getSnapshot().unreadCount, 6);
  assert.match(cache.getSnapshot().unreadCountError, /last known/);
  state.fail = false;
  await cache.refreshUnreadCount({ force: true });
  assert.equal(cache.getSnapshot().unreadCountError, null);
});

test('Push invalidation rereads a pending count and discards both obsolete results and obsolete failures', async () => {
  for (const failOld of [true, false]) {
    const { cache, api, state } = setup();
    const old = deferred();
    api.loadUnreadCount = () => ++state.counts === 1 ? old.promise : Promise.resolve(8);
    const pending = cache.refreshUnreadCount();
    await flush();
    cache.invalidate();
    const concurrent = cache.refreshUnreadCount();
    failOld ? old.reject(new Error('Old connection failed')) : old.resolve(1);
    await Promise.all([pending, concurrent]);
    assert.equal(state.counts, 2);
    assert.equal(cache.getSnapshot().unreadCount, 8);
    assert.equal(cache.getSnapshot().unreadCountError, null);
  }
});

test('A slow inbox page cannot overwrite a newer badge count or extend the old count freshness', async () => {
  const { cache, api, state, setTime } = setup(5);
  const page = deferred();
  api.load = async (_filter, _limit, readUnreadCount) => {
    const unreadCount = await readUnreadCount();
    await page.promise;
    return { unreadCount, items: [], hasMore: false };
  };
  const pending = cache.refresh('all');
  await flush();
  assert.equal(cache.getSnapshot().unreadCountFetchedAt, 0);
  setTime(45_000);
  page.resolve();
  await pending;
  assert.equal(cache.getSnapshot().unreadCountFetchedAt, 0);
  state.count = 1;
  await cache.refreshUnreadCount();
  assert.equal(state.counts, 2);
  assert.equal(cache.getSnapshot().unreadCount, 1);

  const secondPage = deferred();
  api.load = async (_filter, _limit, readUnreadCount) => {
    const unreadCount = await readUnreadCount();
    await secondPage.promise;
    return { unreadCount, items: [], hasMore: false };
  };
  const slow = cache.refresh('unread');
  await flush();
  state.count = 0;
  await cache.refreshUnreadCount({ force: true });
  secondPage.resolve();
  await slow;
  assert.equal(cache.getSnapshot().unreadCount, 0);
});

test('Mark all updates the shared badge only after confirmation, and an older count cannot undo it', async () => {
  const { cache, api } = setup();
  await cache.refreshUnreadCount();
  const oldCount = deferred();
  api.loadUnreadCount = () => oldCount.promise;
  const old = cache.refreshUnreadCount({ force: true });
  await flush();
  const write = deferred();
  api.markAll = () => write.promise;
  const marking = cache.markRead();
  assert.equal(cache.getSnapshot().unreadCount, 3);
  assert.equal(cache.getSnapshot().isUnreadCountFetching, false);
  await cache.refreshUnreadCount();
  write.resolve({ success: true });
  await marking;
  assert.equal(cache.getSnapshot().unreadCount, 0);
  oldCount.resolve(99);
  await old;
  assert.equal(cache.getSnapshot().unreadCount, 0);
  assert.equal(cache.getSnapshot().unreadCountError, null);
});

test('Individual reads update the badge; failed writes preserve it and post-write reconciliation counts new arrivals', async () => {
  const { cache, state } = setup();
  await cache.refreshUnreadCount();
  await cache.markRead({ id: 'n1', userId: 'account-a', isRead: false });
  assert.equal(cache.getSnapshot().unreadCount, 2);
  state.writeSuccess = false;
  assert.ok(await cache.markRead());
  assert.equal(cache.getSnapshot().unreadCount, 2);
  state.writeSuccess = true;
  await cache.markRead();
  assert.equal(cache.getSnapshot().unreadCount, 0);
  state.count = 1;
  await cache.refreshUnreadCount();
  assert.equal(cache.getSnapshot().unreadCount, 1);
});

test('Logout and account changes clear the badge and discard old requests without disrupting a new one', async () => {
  for (const nextAccount of ['account-a', 'account-b']) {
    const { cache, api } = setup();
    await cache.refreshUnreadCount();
    const old = deferred();
    const current = deferred();
    let calls = 0;
    api.loadUnreadCount = () => ++calls === 1 ? old.promise : current.promise;
    const outdated = cache.refreshUnreadCount({ force: true });
    await flush();
    cache.setAccount(null);
    assert.equal(cache.getSnapshot().unreadCount, null);
    assert.equal(cache.getSnapshot().unreadCountError, null);
    await cache.refreshUnreadCount();
    cache.setAccount(nextAccount);
    const active = cache.refreshUnreadCount();
    await flush();
    old.resolve(99);
    await outdated;
    assert.equal(cache.getSnapshot().unreadCount, null);
    assert.equal(cache.getSnapshot().isUnreadCountFetching, true);
    current.resolve(2);
    await active;
    assert.equal(cache.getSnapshot().unreadCount, 2);
  }
});

test('Unrestored sessions and logout before queued work prevent count queries; late inbox callbacks cannot query another account', async () => {
  const { api, state } = setup();
  const cache = createNotificationInboxCache(api);
  await cache.refreshUnreadCount();
  assert.equal(state.counts, 0);
  cache.setAccount('account-a');
  const count = cache.refreshUnreadCount();
  cache.setAccount(null);
  await count;
  assert.equal(state.counts, 0);

  cache.setAccount('account-a');
  const authRead = deferred();
  api.load = async (_filter, _limit, readUnreadCount) => {
    await authRead.promise;
    return { items: [], hasMore: false, unreadCount: await readUnreadCount() };
  };
  const inbox = cache.refresh('all');
  await flush();
  cache.setAccount('account-b');
  authRead.resolve();
  await inbox;
  assert.equal(state.counts, 0);
  assert.equal(cache.getSnapshot().unreadCount, null);
});

function hookHarness(cache) {
  let focus;
  const bookings = new Set();
  const notifications = new Set();
  const appStates = new Set();
  let removed = 0;
  const { useNotificationUnreadCount } = loadModule('src/hooks/use-notification-unread-count.ts', {
    react: { useCallback: (callback) => callback, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_event, callback) => {
      appStates.add(callback); return { remove: () => { appStates.delete(callback); removed++; } };
    } } },
    '@/services/notification-inbox-store': { notificationInboxStore: cache },
    '@/services/booking-events': { subscribeToBookingsChanged: (callback) => {
      bookings.add(callback); return () => { bookings.delete(callback); removed++; };
    } },
    '@/services/notification-events': { subscribeToNotificationsChanged: (callback) => {
      notifications.add(callback); return () => { notifications.delete(callback); removed++; };
    } },
  });
  return { render: useNotificationUnreadCount, focus: () => focus(), removed: () => removed,
    appChange: (state) => appStates.forEach((callback) => callback(state)),
    bookingChange: () => { cache.invalidate(); bookings.forEach((callback) => callback()); },
    notificationChange: () => { cache.invalidate(); notifications.forEach((callback) => callback()); } };
}

test('Badge hook reads cache during render, refreshes on focused events and resume, and removes listeners on blur', async () => {
  const { cache, state, setTime } = setup();
  const hook = hookHarness(cache);
  assert.equal(hook.render().unreadCount, null);
  assert.equal(state.counts, 0);
  let leave = hook.focus();
  await flush();
  assert.equal(hook.render().unreadCount, 3);
  leave();
  leave = hook.focus();
  hook.appChange('active');
  await flush();
  assert.equal(state.counts, 1);
  setTime(30_000);
  hook.appChange('background');
  await flush();
  assert.equal(state.counts, 1);
  hook.appChange('active');
  await flush();
  assert.equal(state.counts, 2);
  state.count = 4;
  hook.notificationChange();
  hook.appChange('active');
  await flush();
  assert.equal(state.counts, 3);
  assert.equal(hook.render().unreadCount, 4);
  hook.bookingChange();
  await flush();
  assert.equal(state.counts, 4);
  await hook.render().refresh();
  assert.equal(state.counts, 5);
  leave();
  assert.equal(hook.removed(), 6);
  hook.notificationChange();
  hook.appChange('active');
  await flush();
  assert.equal(state.counts, 5);
});

test('A dashboard retained during a notification write sees the confirmed badge immediately and clears it on logout', async () => {
  const { cache } = setup();
  await cache.refresh('all');
  const hook = hookHarness(cache);
  assert.equal(hook.render().unreadCount, 3);
  let renders = 0;
  const unsubscribe = cache.subscribe(() => { renders++; });
  await cache.markRead();
  assert.ok(renders > 0);
  assert.equal(hook.render().unreadCount, 0);
  cache.setAccount(null);
  assert.equal(hook.render().unreadCount, null);
  assert.equal(hook.focus(), undefined);
  unsubscribe();
});

test('Badge focus waits for an outstanding read action, then reconciles notifications arriving after mark all', async () => {
  const { cache, api, state } = setup();
  await cache.refreshUnreadCount();
  const write = deferred();
  api.markAll = () => write.promise;
  const pending = cache.markRead();
  const hook = hookHarness(cache);
  assert.equal(hook.render().unreadCount, 3);
  assert.equal(hook.focus(), undefined);
  await hook.render().refresh();
  assert.equal(state.counts, 1);
  state.count = 1;
  write.resolve({ success: true });
  await pending;
  assert.equal(hook.render().unreadCount, 0);
  const leave = hook.focus();
  await flush();
  assert.equal(state.counts, 2);
  assert.equal(hook.render().unreadCount, 1);
  leave();
});

function dashboard(cache, state = {}) {
  const jsx = (type, props) => ({ type, props });
  const badge = hookHarness(cache);
  let bookingRefreshes = 0;
  const { default: Dashboard } = loadModule('src/app/photographer/index.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useMemo: (callback) => callback(), useCallback: (callback) => callback },
    'expo-router': { router: {} },
    'expo-image': { Image: 'Image' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
      RefreshControl: 'RefreshControl', useWindowDimensions: () => ({ width: 375, fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'react-native-svg': {}, '@/components/admin-brand-header': {},
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-paged-admin-bookings': { usePagedAdminBookings: () => ({ requests: [], counts: { pending: 0, today: 0, upcoming: 0 }, error: null,
      isLoading: false, isRefreshing: false, refresh: async () => { bookingRefreshes++; }, ...state }) },
    '@/hooks/use-notification-unread-count': { useNotificationUnreadCount: badge.render },
    '@/services/admin-bookings': { formatBookingTimeRange: () => '', formatShortBookingDate: (date) => date },
    '@/styles/photographer.styles': { photographerStyles: {} },
  });
  return { bookingRefreshes: () => bookingRefreshes, render: () => {
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node);
      visit(node.props?.children);
    }
    visit(Dashboard());
    return nodes;
  } };
}

test('Dashboard bell and stat use the shared count, disappear after mark all, and cap the badge at 99+', async () => {
  const { cache } = setup(153);
  await cache.refreshUnreadCount();
  const screen = dashboard(cache);
  let nodes = screen.render();
  assert.ok(nodes.some((node) => node.type === 'Text' && node.props.children === '99+'));
  assert.ok(nodes.some((node) => node.type === 'Text' && node.props.children === '153'));
  await cache.markRead();
  nodes = screen.render();
  assert.equal(nodes.some((node) => node.type === 'Text' && node.props.children === '99+'), false);
  assert.ok(nodes.some((node) => node.type === 'Text' && node.props.children === '0'));
});

test('Dashboard pull refreshes bookings and the count and keeps its spinner active while only the count is pending', async () => {
  const { cache, api } = setup();
  await cache.refreshUnreadCount();
  const response = deferred();
  api.loadUnreadCount = () => response.promise;
  const screen = dashboard(cache);
  const scroll = screen.render().find((node) => node.type === 'ScrollView');
  scroll.props.refreshControl.props.onRefresh();
  assert.equal(screen.bookingRefreshes(), 1);
  const pendingScroll = screen.render().find((node) => node.type === 'ScrollView');
  assert.equal(pendingScroll.props.refreshControl.props.refreshing, true);
  response.resolve(7);
  await flush();
  const complete = screen.render().find((node) => node.type === 'ScrollView');
  assert.equal(complete.props.refreshControl.props.refreshing, false);
  assert.equal(cache.getSnapshot().unreadCount, 7);
});

test('Dashboard shows an unknown initial count rather than a false zero, and exposes refresh errors while retaining a known badge', async () => {
  const { cache, state } = setup(6);
  const screen = dashboard(cache);
  assert.ok(screen.render().some((node) => node.type === 'Text' && node.props.children === '—'));
  await cache.refreshUnreadCount();
  state.fail = true;
  await cache.refreshUnreadCount({ force: true });
  const nodes = screen.render();
  assert.ok(nodes.some((node) => node.type === 'Text' && node.props.children === '6'));
  assert.ok(nodes.some((node) => node.props.accessibilityRole === 'alert' && /last known/.test(node.props.children)));
});

function clientHome(cache) {
  const jsx = (type, props) => ({ type, props });
  const badge = hookHarness(cache);
  const navigation = [];
  let focusHighlights;
  let highlightReads = 0;
  const { createClientHomeHighlightsCache } = loadModule('src/services/client-home-highlights-cache.ts');
  const highlightsCache = createClientHomeHighlightsCache(async () => { highlightReads++; return []; });
  highlightsCache.setAccount('account-a');
  const { useClientHomeHighlights } = loadModule('src/hooks/use-client-home-highlights.ts', {
    react: { useCallback: (callback) => callback, useSyncExternalStore: (_subscribe, get) => get() },
    'expo-router': { useFocusEffect: (callback) => { focusHighlights = callback; } },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '@/services/catalog-events': { subscribeToCatalogChanged: () => () => {} },
    '@/services/client-home-highlights-store': { clientHomeHighlightsStore: highlightsCache },
  });
  const { default: Home } = loadModule('src/app/(client)/home.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { router: { push: (url) => navigation.push(url) } },
    'expo-image': { Image: 'Image' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'react-native-svg': {}, '@/components/home-highlights': { HomeHighlights: 'HomeHighlights' },
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-notification-unread-count': { useNotificationUnreadCount: badge.render },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-client-home-highlights': { useClientHomeHighlights },
    '@/styles/responsive.styles': { responsiveStyles: {} },
  });
  const render = () => {
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node); visit(node.props?.children);
    }
    visit(Home());
    return nodes;
  };
  const bell = () => render().find((node) => node.props.accessibilityLabel?.startsWith('Open notifications'));
  return { render, bell, navigation, badge, highlightReads: () => highlightReads,
    focus: () => {
      const leaveBadge = badge.focus(), leaveHighlights = focusHighlights();
      return () => { leaveBadge?.(); leaveHighlights?.(); };
    },
    retry: () => render().find((node) => node.props.accessibilityLabel === 'Retry notification count'),
    badgeText: () => bell().props.children[1]?.props.children?.props.children ?? '' };
}

test('Client Home uses the shared inbox count on fresh visits and reads only the count after 30 seconds', async () => {
  const { cache, state, setTime } = setup(5);
  await cache.refresh('all');
  const home = clientHome(cache);
  assert.equal(home.badgeText(), '5');
  assert.equal(state.counts, 1);
  let leave = home.focus(); await flush(); leave();
  home.render(); leave = home.focus(); await flush();
  assert.equal(state.counts, 1);
  assert.equal(state.feeds, 1);
  leave(); setTime(30_000);
  home.render(); leave = home.focus(); await flush();
  assert.equal(state.counts, 2);
  assert.equal(state.feeds, 1, 'Home does not download notification messages');
  await cache.refresh('unread');
  assert.equal(state.counts, 2, 'Opening the inbox also reuses Home’s count');
  leave();
});

test('Client Home announces the actual unread count, caps the badge at 99+, and preserves notification navigation', async () => {
  const { cache } = setup(153);
  const home = clientHome(cache);
  assert.equal(home.badgeText(), '');
  assert.equal(home.bell().props.accessibilityLabel, 'Open notifications', 'Unknown does not claim zero');
  await cache.refreshUnreadCount();
  assert.equal(home.badgeText(), '99+');
  assert.equal(home.bell().props.accessibilityLabel, 'Open notifications, 153 unread');
  home.bell().props.onPress();
  assert.deepEqual(home.navigation, ['/notifications']);
  await cache.markRead();
  assert.equal(home.badgeText(), '');
  assert.equal(home.bell().props.accessibilityLabel, 'Open notifications, 0 unread');
});

test('Client Home follows individual and bulk read acceptance immediately, while refused writes preserve its badge', async () => {
  const { cache, state } = setup();
  await cache.refresh('all');
  const home = clientHome(cache);
  assert.equal(home.badgeText(), '3');
  await cache.markRead({ id: 'n1', userId: 'account-a', isRead: false });
  assert.equal(home.badgeText(), '2');
  state.writeSuccess = false;
  await cache.markRead();
  assert.equal(home.badgeText(), '2');
  state.writeSuccess = true;
  await cache.markRead();
  assert.equal(home.badgeText(), '');
  assert.equal(state.counts, 1, 'Accepted writes update the shared badge without another count read');
});

test('Client Home retains a known badge on count failure and its error-only retry recovers without reloading highlights or inbox pages', async () => {
  const { cache, state } = setup(6);
  await cache.refreshUnreadCount();
  const home = clientHome(cache);
  assert.equal(home.retry(), undefined);
  state.fail = true;
  await cache.refreshUnreadCount({ force: true });
  assert.equal(home.badgeText(), '6');
  assert.ok(home.render().some((node) => node.props.accessibilityRole === 'alert' && /last known count/.test(node.props.children)));
  assert.ok(home.retry());
  state.fail = false; state.count = 7;
  home.retry().props.onPress();
  await flush();
  assert.equal(home.badgeText(), '7');
  assert.equal(home.retry(), undefined);
  assert.equal(home.highlightReads(), 0);
  assert.equal(state.feeds, 0);
  cache.setAccount(null); cache.setAccount('account-a');
  state.fail = true;
  await cache.refreshUnreadCount();
  assert.equal(home.badgeText(), '');
  assert.equal(home.bell().props.accessibilityLabel, 'Open notifications');
  assert.ok(home.render().some((node) => node.props.accessibilityRole === 'alert' && /Tap to try again/.test(node.props.children)));
});

test('Focused client Home updates on push, booking events and stale resume, then stops refreshing after blur', async () => {
  const { cache, state, setTime } = setup();
  const home = clientHome(cache);
  home.render(); const leave = home.focus(); await flush();
  assert.equal(home.badgeText(), '3');
  state.count = 4; home.badge.notificationChange(); await flush();
  assert.equal(home.badgeText(), '4');
  state.count = 5; home.badge.bookingChange(); await flush();
  assert.equal(home.badgeText(), '5');
  setTime(30_000); state.count = 6;
  home.badge.appChange('background'); await flush();
  assert.equal(state.counts, 3);
  home.badge.appChange('active'); await flush();
  assert.equal(home.badgeText(), '6');
  assert.equal(state.counts, 4);
  leave();
  home.badge.notificationChange(); home.badge.appChange('active'); await flush();
  assert.equal(state.counts, 4);
  assert.equal(home.badge.removed(), 3);
});

test('Client Home clears on logout and an old pending count cannot appear for the next account', async () => {
  const { cache, api } = setup(6);
  await cache.refreshUnreadCount();
  const home = clientHome(cache);
  assert.equal(home.badgeText(), '6');
  const old = deferred(), recent = deferred();
  let calls = 0;
  api.loadUnreadCount = () => ++calls === 1 ? old.promise : recent.promise;
  const outdated = cache.refreshUnreadCount({ force: true }); await flush();
  cache.setAccount(null);
  assert.equal(home.badgeText(), '');
  assert.equal(home.bell().props.accessibilityLabel, 'Open notifications');
  cache.setAccount('account-b');
  const active = cache.refreshUnreadCount(); await flush();
  old.resolve(99); await outdated;
  assert.equal(home.badgeText(), '');
  recent.resolve(2); await active;
  assert.equal(home.badgeText(), '2');
  assert.equal(home.bell().props.accessibilityLabel, 'Open notifications, 2 unread');
});
