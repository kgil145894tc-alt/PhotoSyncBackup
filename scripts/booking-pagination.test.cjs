const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => {
    if (name.startsWith('@/assets/')) return name;
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Date, Promise, Set, Map, Error, setTimeout, clearTimeout });
  return exports;
}
const types = load('src/types/booking-pages.ts');
const { createBookingPagesCache } = load('src/services/booking-pages-cache.ts', { '@/types/booking-pages': types });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const plain = (value) => JSON.parse(JSON.stringify(value));
const booking = (id, extra = {}) => ({ id, clientId: 'a', status: 'pending', ...extra });
const cursor = (id) => ({ id, createdAt: '2026-10-07T00:00:00.000001+00:00' });
const page = (items, hasMore = false, counts = { all: 2001, pending: 1500 }) => ({ items, hasMore, counts, nextCursor: hasMore ? cursor(items.at(-1).id) : null });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  let time = 0;
  const calls = [];
  const api = { ownBookingsOnly: true, load: async (query, boundary, owner) => {
    calls.push([plain(query), boundary && plain(boundary), owner]);
    const start = boundary ? Number(boundary.id) + 1 : 0;
    return page(Array.from({ length: 30 }, (_, i) => booking(String(i + start), { clientId: owner })), true, boundary ? null : { all: 2001, pending: 1500 });
  }, cancel: async () => ({ success: true }) };
  const cache = createBookingPagesCache(api, () => time);
  cache.setAccount('a');
  return { api, cache, calls, setTime: (value) => { time = value; } };
}
test('Booking pages append only the next 30 records, retain exact counts, and share repeated taps', async () => {
  const { cache, calls } = setup();
  const query = { status: 'pending' };
  await cache.refresh(query);
  const more = cache.refresh(query, { loadMore: true });
  assert.equal(cache.refresh(query, { loadMore: true }), more);
  assert.equal(cache.getEntry(query).isLoadingMore, true);
  await more;
  await cache.refresh(query, { loadMore: true });
  assert.equal(cache.getEntry(query).data.items.length, 90);
  assert.equal(cache.getEntry(query).data.counts.all, 2001);
  assert.deepEqual(calls.map((call) => call[1]?.id ?? null), [null, '29', '59']);
  await cache.refresh(query);
  assert.equal(calls.length, 3);
  await cache.refresh(query, { force: true });
  assert.equal(cache.getEntry(query).data.items.length, 30);
  assert.equal(calls.at(-1)[1], null);
});
test('Filters have independent cached pages and empty filtered results remain cached', async () => {
  const { api, cache, calls } = setup();
  await cache.refresh({ status: 'pending' });
  api.load = async (query) => { calls.push([plain(query)]); return page([]); };
  await cache.refresh({ status: 'completed' });
  await cache.refresh({ status: 'completed' });
  assert.equal(calls.length, 2);
  assert.equal(cache.getEntry({ status: 'pending' }).data.items.length, 30);
  assert.equal(cache.getEntry({ status: 'completed' }).data.items.length, 0);
});
test('Loading more cannot renew old head rows or their exact count timestamp', async () => {
  const { cache, calls, setTime } = setup();
  await cache.refresh({});
  setTime(29_000); await cache.refresh({}, { loadMore: true });
  assert.equal(cache.getEntry({}).fetchedAt, 0);
  setTime(30_000); await cache.refresh({});
  assert.equal(calls.length, 3);
  assert.equal(calls.at(-1)[1], null);
  assert.equal(cache.getEntry({}).data.items.length, 30);
});
test('A next-page failure preserves cards, totals and cursor; retry fetches the same boundary', async () => {
  const { api, cache, calls } = setup();
  await cache.refresh({});
  const before = cache.getEntry({}).data;
  const realLoad = api.load;
  api.load = async (_query, boundary) => { calls.push([{}, plain(boundary)]); throw new Error('offline'); };
  await cache.refresh({}, { loadMore: true });
  assert.equal(cache.getEntry({}).data, before);
  assert.ok(cache.getEntry({}).error);
  api.load = realLoad;
  await cache.refresh({}, { loadMore: true });
  assert.equal(calls.at(-1)[1].id, '29');
  assert.equal(cache.getEntry({}).data.items.length, 60);
});
test('Overlapping rows are deduplicated and a cursor that fails to advance is refused', async () => {
  const { api, cache } = setup();
  await cache.refresh({});
  api.load = async () => ({ ...page([booking('29'), booking('30')], true, null), nextCursor: cursor('30') });
  await cache.refresh({}, { loadMore: true });
  assert.equal(cache.getEntry({}).data.items.length, 31);
  const before = cache.getEntry({}).data;
  await cache.refresh({}, { loadMore: true });
  assert.equal(cache.getEntry({}).data, before);
  assert.ok(cache.getEntry({}).error);
});
test('Invalidation during pagination discards stale success and restarts the first page', async () => {
  const { api, cache } = setup();
  await cache.refresh({});
  const old = deferred(); const boundaries = [];
  api.load = async (_query, boundary) => {
    boundaries.push(boundary?.id ?? null);
    return boundaries.length === 1 ? old.promise : page([booking('new')]);
  };
  const task = cache.refresh({}, { loadMore: true });
  await flush(); cache.invalidate();
  old.resolve(page([booking('obsolete')], false, null));
  await task;
  assert.deepEqual(boundaries, ['29', null]);
  assert.deepEqual(plain(cache.getEntry({}).data.items.map((item) => item.id)), ['new']);
});
test('Invalidation also retries a stale failure; stale loaded pages restart at the head', async () => {
  const { api, cache } = setup();
  await cache.refresh({});
  const old = deferred(); let reads = 0;
  api.load = async (_query, boundary) => {
    reads++;
    if (reads === 1) return old.promise;
    assert.equal(boundary, null); return page([]);
  };
  const task = cache.refresh({}, { loadMore: true });
  await flush(); cache.invalidate(); old.reject(new Error('obsolete'));
  await task;
  assert.equal(reads, 2); assert.equal(cache.getEntry({}).error, null);
});
test('Logout and same-account relogin drop old pages and old forced follow-ups', async () => {
  const { api, cache } = setup();
  const old = deferred(); let reads = 0;
  api.load = () => { reads++; return reads === 1 ? old.promise : Promise.resolve(page([booking('new')])); };
  const task = cache.refresh({});
  const pull = cache.refresh({}, { force: true });
  await flush(); cache.setAccount(null); cache.setAccount('a');
  await cache.refresh({});
  old.resolve(page([booking('old')]));
  await Promise.all([task, pull]);
  assert.equal(reads, 2);
  assert.equal(cache.getEntry({}).data.items[0].id, 'new');
});
test('Queued requests are cancelled on logout and foreign-account rows are rejected', async () => {
  const { api, cache, calls } = setup();
  const task = cache.refresh({}); cache.setAccount(null); await task;
  assert.equal(calls.length, 0);
  cache.setAccount('a'); api.load = async () => page([booking('foreign', { clientId: 'b' })]);
  await cache.refresh({}); assert.equal(cache.getEntry({}).data, null); assert.ok(cache.getEntry({}).error);
});
test('Details reuse a fresh paged row; IDs beyond loaded pages fetch directly and never claim the list is complete', async () => {
  const { api, cache, calls, setTime } = setup();
  await cache.refresh({});
  await cache.refresh({ bookingId: '20' });
  assert.equal(calls.length, 1);
  assert.equal(cache.getEntry({ bookingId: '20' }).data.items[0].id, '20');
  api.load = async (query) => { calls.push([plain(query)]); return page([booking(query.bookingId)]); };
  await cache.refresh({ bookingId: '2000' });
  assert.equal(calls.at(-1)[0].bookingId, '2000');
  assert.equal(cache.getEntry({}).data.items.length, 30);
  setTime(30_000); await cache.refresh({ bookingId: '20' });
  assert.equal(calls.length, 3);
});
test('Query retention is bounded while pending queries remain available', async () => {
  const { cache } = setup();
  for (let i = 0; i < 25; i++) await cache.refresh({ search: String(i) });
  assert.equal(Object.keys(cache.getSnapshot().entries).length, 12);
  assert.ok(cache.getEntry({ search: '24' }).data);
});
test('Cancellation waits for acceptance, prevents duplicates and reconciles counts through a fresh read', async () => {
  const { api, cache } = setup();
  await cache.refresh({ bookingId: '0' });
  const response = deferred(); let writes = 0;
  api.cancel = () => { writes++; return response.promise; };
  const task = cache.cancel('0'); await flush();
  assert.equal(await cache.cancel('0'), null);
  assert.equal(cache.getEntry({ bookingId: '0' }).data.items[0].status, 'pending');
  response.resolve({ success: true }); await task;
  assert.equal(writes, 1);
  assert.equal(cache.getEntry({ bookingId: '0' }).data.items[0].status, 'cancelled');
  assert.equal(cache.getEntry({ bookingId: '0' }).fetchedAt, null);
});
test('Old cancellation results cannot patch or reconcile a new session', async () => {
  const { api, cache } = setup();
  const response = deferred(); api.cancel = () => response.promise;
  const task = cache.cancel('0'); await flush();
  cache.setAccount('b'); await cache.refresh({});
  response.resolve({ success: true }); assert.equal(await task, null);
  assert.equal(cache.getEntry({}).data.items[0].clientId, 'b');
  assert.equal(cache.getEntry({}).data.items[0].status, 'pending');
});
test('Page service uses a bounded RPC with stable cursors and verifies session before and after reads', async () => {
  const operations = []; let current = true;
  const { getBookingPage } = load('src/services/booking-pages.ts', {
    '@/lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: { id: 'a' } }, error: null }) },
      rpc: async (name, args) => { operations.push([name, plain(args)]); return { data: { items: [{ id: 'one' }], counts: null, hasMore: false, nextCursor: null }, error: null }; } } },
    '@/services/admin-bookings': { mapBookingRow: (row) => booking(row.id) },
    '@/services/booking-expiration': { expirePastPendingBookings: async (options) => { assert.equal(options.expectedAccountId, 'a'); } },
  });
  await getBookingPage('client', { status: 'approved', search: ' Portrait ' }, cursor('id'), 'a', () => current);
  assert.equal(operations[0][0], 'get_booking_page');
  assert.equal(operations[0][1].p_limit, 30);
  assert.equal(operations[0][1].p_search, 'Portrait');
  assert.equal(operations[0][1].p_cursor_created_at, cursor('id').createdAt);
  current = false;
  await assert.rejects(getBookingPage('client', {}, null, 'a', () => current), /session changed/);
  current = true;
  await assert.rejects(getBookingPage('client', {}, null, 'b', () => current), /sign in/);
  assert.equal(operations.length, 1);
});
test('Page service surfaces RPC errors and drops a response after a session change', async () => {
  let current = true, fail = true;
  const { getBookingPage } = load('src/services/booking-pages.ts', {
    '@/lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: { id: 'a' } }, error: null }) },
      rpc: async () => { if (fail) return { data: null, error: new Error('offline') }; current = false; return { data: null, error: null }; } } },
    '@/services/admin-bookings': { mapBookingRow: (row) => row },
    '@/services/booking-expiration': { expirePastPendingBookings: async () => {} },
  });
  await assert.rejects(getBookingPage('admin', {}, null, 'a', () => current), /offline/);
  fail = false;
  await assert.rejects(getBookingPage('admin', {}, null, 'a', () => current), /session changed/);
});
test('Paged hook starts no reads during render, refreshes only its query on focus/events/resume, and cleans up', async () => {
  const { cache, calls, setTime } = setup();
  let focus;
  const callbacks = { booking: new Set(), notification: new Set(), app: new Set() };
  const subscribe = (kind, callback) => { callbacks[kind].add(callback); return () => callbacks[kind].delete(callback); };
  const { useBookingPage } = load('src/hooks/use-booking-page.ts', {
    react: { useMemo: (callback) => callback(), useCallback: (callback) => callback,
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_event, callback) => ({ remove: subscribe('app', callback) }) } },
    '@/services/booking-pages-cache': load('src/services/booking-pages-cache.ts', { '@/types/booking-pages': types }),
    '@/services/booking-events': { subscribeToBookingsChanged: (callback) => subscribe('booking', callback) },
    '@/services/notification-events': { subscribeToNotificationsChanged: (callback) => subscribe('notification', callback) },
    '@/types/booking-pages': types,
  });
  const render = () => useBookingPage(cache, { status: 'confirmed', search: 'Portrait' });
  assert.equal(render().isLoading, true); assert.equal(calls.length, 0);
  const leave = focus(); await flush(); assert.equal(calls.length, 1);
  assert.equal(calls[0][0].status, 'confirmed'); assert.equal(calls[0][0].search, 'Portrait');
  callbacks.app.forEach((callback) => callback('active')); await flush(); assert.equal(calls.length, 1);
  setTime(30_000); callbacks.app.forEach((callback) => callback('active')); await flush(); assert.equal(calls.length, 2);
  cache.invalidate(); callbacks.notification.forEach((callback) => callback()); await flush(); assert.equal(calls.length, 3);
  const previous = render(); await previous.refresh(); assert.equal(calls.length, 4);
  leave(); assert.ok(Object.values(callbacks).every((set) => set.size === 0));
  cache.setAccount(null); cache.setAccount('b');
  await previous.refresh(); await previous.loadMore(); assert.equal(await previous.cancel('0'), null);
  assert.equal(calls.length, 4);
});
test('Paged store scopes both roles on auth and invalidates closed screens on booking and push events', async () => {
  const callbacks = {}; const scopes = [];
  const cacheModule = load('src/services/booking-pages-cache.ts', { '@/types/booking-pages': types });
  const stores = load('src/services/booking-pages-store.ts', {
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => { callbacks.auth = callback; } } } },
    '@/services/booking-pages-cache': cacheModule,
    '@/services/booking-pages': { getBookingPage: async (scope, _query, _cursor, owner) => {
      scopes.push(scope); return page([booking('one', { clientId: owner })]); } },
    '@/services/client-bookings': { cancelClientBooking: async () => ({ success: true }) },
    '@/services/booking-events': { subscribeToBookingsChanged: (callback) => { (callbacks.booking ??= []).push(callback); } },
    '@/services/notification-events': { subscribeToNotificationsChanged: (callback) => { (callbacks.notification ??= []).push(callback); } },
  });
  callbacks.auth('INITIAL_SESSION', { user: { id: 'a' } });
  await stores.adminBookingPagesStore.refresh({}); await stores.clientBookingPagesStore.refresh({});
  assert.deepEqual(scopes, ['admin','client']);
  callbacks.booking.forEach((callback) => callback());
  assert.equal(stores.adminBookingPagesStore.getEntry({}).fetchedAt, null);
  await stores.clientBookingPagesStore.refresh({}); callbacks.notification.forEach((callback) => callback());
  assert.equal(stores.clientBookingPagesStore.getEntry({}).fetchedAt, null);
  callbacks.auth('SIGNED_OUT', null);
  assert.equal(stores.adminBookingPagesStore.getEntry({}).data, null);
  assert.equal(stores.clientBookingPagesStore.getEntry({}).data, null);
});
test('Admin Requests sends status/date/search to the paged hook and renders cards through FlatList', () => {
  const jsx = (type, props) => ({ type, props }); let query;
  const { default: Screen } = load('src/app/photographer/requests.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: (initial) => [initial, () => {}], useEffect: () => {} },
    'expo-router': { router: {} }, 'expo-image': { Image: 'Image' }, 'expo-status-bar': {},
    'react-native': Object.fromEntries(['FlatList','Pressable','ScrollView','Text','TextInput','View'].map((name) => [name,name])),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }, 'react-native-svg': {},
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-paged-admin-bookings': { usePagedAdminBookings: (options) => {
      query = options; return { requests: [booking('one')], counts: { all: 2001, pending: 1500 },
        isLoading: false, isRefreshing: false, hasMore: true, refresh: () => {}, loadMore: () => {} }; } },
    '@/components/admin-brand-header': {}, '@/services/admin-bookings': { formatShortBookingDate: () => '' },
    '@/styles/photographer.styles': { photographerStyles: {} },
  });
  const nodes = [];
  const visit = (node) => { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== 'object') return;
    nodes.push(node); visit(node.props?.children); visit(node.props?.ListHeaderComponent); };
  visit(Screen());
  assert.equal(query.status, 'pending'); assert.equal(query.dateFilter, 'all');
  const list = nodes.find((node) => node.type === 'FlatList');
  assert.equal(list.props.data.length, 1); assert.equal(list.props.keyExtractor(booking('one')), 'one');
  assert.ok(nodes.filter((node) => node.type === 'ScrollView').every((node) => node.props.horizontal));
  const count = nodes.find((node) => node.type === 'Text' && Array.isArray(node.props.children) && node.props.children.includes(1500));
  assert.ok(count, 'Badges use server totals rather than loaded row counts');
});
test('Client collection virtualizes rows, shows global filter totals and owns pull refresh without a parent ScrollView', () => {
  const jsx = (type, props) => ({ type, props });
  const { BookingCollection } = load('src/components/client-bookings-view.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-image': {}, 'expo-router': {},
    'react-native': { FlatList: 'FlatList', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
    'react-native-svg': {}, '@/data/service-catalog': {}, '@/services/admin-bookings': {},
    '@/styles/client-bookings.styles': { clientBookingsStyles: {} }, '@/styles/responsive.styles': { responsiveStyles: {} },
  });
  let pulls = 0, pages = 0, selected;
  const list = BookingCollection({ bookings: [booking('one')], counts: { all: 2001, pending: 1500, approved: 300, closed: 201 },
    activeFilter: 'pending', isLoading: false, hasMore: true, onSelect: (item) => { selected = item; },
    onFilterChange: () => {}, onRefresh: () => { pulls++; }, onLoadMore: () => { pages++; } });
  assert.equal(list.type, 'FlatList'); assert.equal(list.props.data.length, 1);
  list.props.onRefresh(); list.props.ListFooterComponent.props.onPress();
  assert.equal(pulls, 1); assert.equal(pages, 1);
  list.props.renderItem({ item: booking('one') }).props.onPress(); assert.equal(selected.id, 'one');
  const nodes = [];
  const visit = (node) => { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== 'object') return;
    nodes.push(node); visit(node.props?.children); };
  visit(list.props.ListHeaderComponent);
  assert.ok(nodes.some((node) => node.type === 'Text' && node.props.children === 2001));
  assert.ok(nodes.some((node) => node.props?.accessibilityLabel === 'Pending bookings, 1500'));
});
