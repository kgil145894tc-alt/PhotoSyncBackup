const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => {
    if (name.startsWith('@/assets/')) return name;
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Date, Promise, Map, Set, Error });
  return exports;
}
const { createClientServiceCatalogCache: createCache } = loadModule('src/services/client-service-catalog-cache.ts');
const catalog = () => ({ services: [{ id: 's1', slug: 'portrait', name: 'Portrait', cardTitle: 'Portrait',
  description: 'Portrait sessions', image: 'service-image', isActive: true, packageCount: 1 },
  { id: 's2', slug: 'events', name: 'Events', isActive: true, packageCount: 1 }],
  packages: [{ id: 'p1', serviceId: 's1', name: 'Portrait Package', price: '₱2,500', priceAmount: 2500,
    image: 'package-image', inclusions: ['10 photos'], isActive: true },
  { id: 'p2', serviceId: 's2', name: 'Event Package', price: '₱5,000', priceAmount: 5000,
    image: 'event-image', inclusions: [], isActive: true }] });
const empty = () => ({ services: [], packages: [] });
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(load = async () => catalog(), now) {
  const cache = createCache(load, now);
  cache.setAccount('client-a');
  return cache;
}

test('Services and every package route reuse one catalog for 60 seconds, including an empty catalog', async () => {
  for (const data of [catalog(), empty()]) {
    let time = 0, reads = 0;
    const cache = setup(async () => { reads++; return data; }, () => time);
    await cache.refresh();
    time = 59_999;
    await cache.refresh();
    assert.equal(reads, 1);
    assert.equal(cache.getSnapshot().data, data);
    time = 60_000;
    await cache.refresh();
    await cache.refresh(true);
    assert.equal(reads, 3);
  }
});

test('Concurrent list, deep link, resume and pull requests share a read while retaining cards', async () => {
  const read = deferred();
  let reads = 0;
  const cache = setup(() => ++reads === 1 ? Promise.resolve(catalog()) : read.promise);
  await cache.refresh();
  const pending = cache.refresh(true);
  assert.equal(cache.refresh(), pending);
  assert.equal(cache.refresh(true), pending);
  assert.equal(cache.getSnapshot().data.packages.length, 2);
  assert.equal(cache.getSnapshot().isFetching, true);
  read.resolve(empty());
  await pending;
  assert.equal(reads, 2);
  assert.equal(cache.getSnapshot().data.services.length, 0);
  assert.equal(cache.getSnapshot().isFetching, false);
});

test('Read failures preserve both lists; initial errors remain unknown and retryable', async () => {
  let fail = false;
  const cache = setup(async () => { if (fail) throw new Error('Offline'); return catalog(); });
  await cache.refresh();
  const original = cache.getSnapshot().data;
  fail = true;
  await cache.refresh(true);
  assert.equal(cache.getSnapshot().data, original);
  assert.match(cache.getSnapshot().error, /previously loaded/);
  cache.setAccount('client-b');
  await cache.refresh();
  assert.equal(cache.getSnapshot().data, null);
  assert.match(cache.getSnapshot().error, /Could not load/);
  fail = false;
  await cache.refresh();
  assert.equal(cache.getSnapshot().error, null);
});

test('Catalog changes invalidate closed screens and outdated successes or failures are reread', async () => {
  for (const fails of [false, true]) {
    const read = deferred();
    let reads = 0;
    const cache = setup(() => ++reads === 1 ? read.promise : Promise.resolve(empty()));
    const pending = cache.refresh();
    await flush();
    cache.invalidate();
    if (fails) read.reject(new Error('Obsolete failure')); else read.resolve(catalog());
    await pending;
    assert.equal(reads, 2);
    assert.equal(cache.getSnapshot().data.services.length, 0);
    assert.equal(cache.getSnapshot().error, null);
    cache.invalidate();
    await cache.refresh();
    assert.equal(reads, 3);
  }
});

test('Confirmed package/service deactivation removes cards and counts immediately, even if reconciliation fails', async () => {
  for (const entity of ['package', 'service']) {
    let fail = false;
    const cache = setup(async () => { if (fail) throw new Error('Offline'); return catalog(); });
    await cache.refresh();
    assert.notEqual(cache.getPackage('p1', 's1'), null);
    cache.invalidate({ entity, id: entity === 'package' ? 'p1' : 's1', isActive: false });
    assert.equal(cache.getPackage('p1', 's1'), null);
    assert.equal(cache.getSnapshot().data.packages.length, 1);
    if (entity === 'package') assert.equal(cache.getSnapshot().data.services[0].packageCount, 0);
    else assert.equal(cache.getSnapshot().data.services.length, 1);
    fail = true;
    await cache.refresh();
    assert.equal(cache.getPackage('p1', 's1'), null);
  }
});

test('Activation invalidates without inventing a row; package selection must match its current service', async () => {
  const cache = setup();
  await cache.refresh();
  cache.invalidate({ entity: 'package', id: 'new-package', isActive: true });
  assert.equal(cache.getPackage('new-package', 's1'), null);
  assert.equal(cache.getPackage('p1', 's2'), null);
  assert.equal(cache.getPackage('p1', 's1').name, 'Portrait Package');
});

test('No reads start in render or before session restoration; logout cancels queued reads', async () => {
  let reads = 0;
  const cache = createCache(async () => { reads++; return catalog(); });
  cache.getSnapshot();
  await cache.refresh();
  assert.equal(reads, 0);
  cache.setAccount('client-a');
  const pending = cache.refresh();
  cache.setAccount(null);
  await pending;
  assert.equal(reads, 0);
  assert.equal(cache.getSnapshot().data, null);
  assert.equal(cache.getServerSnapshot().data, null);
});

test('Account switches and same-account relogin discard older reads without disturbing new ones', async () => {
  for (const nextAccount of ['client-a', 'client-b']) {
    const oldRead = deferred(), newRead = deferred();
    let reads = 0;
    const cache = setup(() => ++reads === 1 ? oldRead.promise : newRead.promise);
    const oldKey = cache.getSnapshot().sessionKey;
    const old = cache.refresh();
    await flush();
    cache.setAccount(null);
    cache.setAccount(nextAccount);
    assert.notEqual(cache.getSnapshot().sessionKey, oldKey);
    const next = cache.refresh();
    await flush();
    oldRead.resolve(catalog());
    await old;
    assert.equal(cache.getSnapshot().data, null);
    assert.equal(cache.getSnapshot().isFetching, true);
    newRead.resolve(empty());
    await next;
    const snapshot = cache.getSnapshot();
    cache.setAccount(nextAccount);
    assert.equal(cache.getSnapshot(), snapshot);
  }
});

const serviceRow = { id: 's1', slug: 'portrait', name: 'Portrait', description: 'Real description',
  price: 1500, duration_minutes: 90, buffer_minutes: 15, minimum_notice_days: 3,
  image_url: 'https://example.com/service.png', is_active: true };
const packageRow = { id: 'p1', service_id: 's1', name: 'Real package', price: 2500, badge: null,
  inclusions: ['10 photos'], image_url: 'https://example.com/package.png', is_active: true };
function serviceSetup(options = {}) {
  const state = { services: [serviceRow], packages: [packageRow], failTable: null,
    selected: { ...packageRow, services: { ...serviceRow } }, calls: [], ...options };
  const supabase = { from: (table) => {
    const operations = [];
    state.calls.push({ table, operations });
    const query = {};
    for (const method of ['select', 'eq', 'is', 'order', 'maybeSingle', 'range']) {
      query[method] = (...args) => { operations.push([method, ...args]); return query; };
    }
    query.then = (yes, no) => {
      const range = operations.find(([method]) => method === 'range');
      const rows = table === 'services' ? state.services : state.packages;
      return Promise.resolve({
      data: operations.some(([method]) => method === 'maybeSingle') ? state.selected : range ? rows.slice(range[1], range[2]+1) : rows,
      error: table === state.failTable ? new Error('Offline') : null,
    }).then(yes, no); };
    return query;
  } };
  const api = loadModule('src/services/service-catalog.ts', {
    '@/lib/supabase': { supabase: state.disconnected ? null : supabase },
    '@/data/service-catalog': { fallbackServices: [{ id: 'sample-service', image: 'placeholder-service', description: 'Sample', basePrice: 999,
      durationMinutes: 60, bufferMinutes: 10, minimumNoticeDays: 1 }],
      fallbackPortraitPackages: [{ id: 'sample-package', image: 'placeholder-package', badge: 'Sample badge', durationMinutes: 60 }],
      getFallbackServiceBySlug: () => null },
    '@/services/audit-log': {}, '@/services/catalog-events': {},
  });
  return { state, api };
}

test('Client catalog pages remain complete past the API cap without losing package counts or loading inactive or orphan records', async () => {
  const services = Array.from({ length: 1005 }, (_, i) => ({ ...serviceRow, id: `s${i}` }));
  const packages = Array.from({ length: 1005 }, (_, i) => ({ ...packageRow, id: `p${i}`, service_id: `s${i}` }));
  packages.push({ ...packageRow, id: 'orphan', service_id: 'missing' }, { ...packageRow, id: 'inactive', is_active: false });
  const { api, state } = serviceSetup({ services, packages });
  const catalog = await api.getClientServiceCatalog();
  assert.equal(catalog.services.length, 1005); assert.equal(catalog.packages.length, 1005);
  assert.equal(catalog.services[1004].packageCount, 1);
  assert.equal(catalog.packages.some(p => ['orphan','inactive'].includes(p.id)), false);
  assert.equal(state.calls.length, 12);
});

test('Strict client catalog uses two active queries and maps published rows, rules, prices and counts', async () => {
  const { state, api } = serviceSetup({ services: [serviceRow, { ...serviceRow, id: 'inactive', is_active: false },
    { ...serviceRow, id: 'no-slug', slug: null }], packages: [packageRow,
    { ...packageRow, id: 'inactive-package', is_active: false }, { ...packageRow, service_id: 'inactive' },
    { ...packageRow, service_id: 'missing' }] });
  const result = await api.getClientServiceCatalog();
  assert.equal(state.calls.length, 2);
  assert.equal(state.calls.every((call) => call.operations.some(([method, field, value]) => method === 'eq' && field === 'is_active' && value)), true);
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].packageCount, 1);
  assert.equal(result.services[0].basePrice, 1500);
  assert.equal(result.packages.length, 1);
  assert.equal(result.packages[0].id, 'p1');
  assert.equal(result.packages[0].price, '₱2,500');
  assert.equal(result.packages[0].durationMinutes, 90);
  assert.equal(result.packages[0].bufferMinutes, 15);
  assert.equal(result.packages[0].minimumNoticeDays, 3);
  assert.equal(result.packages[0].image.uri, packageRow.image_url);
  assert.equal(result.packages[0].badge, undefined, 'A real row does not inherit a sample badge');
});

test('Empty catalogs stay empty, null rules remain null, and either query failure rejects the snapshot', async () => {
  const emptyRead = serviceSetup({ services: [], packages: [] });
  const data = await emptyRead.api.getClientServiceCatalog();
  assert.equal(data.services.length, 0);
  assert.equal(data.packages.length, 0);
  const nullable = serviceSetup({ services: [{ ...serviceRow, duration_minutes: null, buffer_minutes: null, minimum_notice_days: null }] });
  assert.equal((await nullable.api.getClientServiceCatalog()).packages[0].durationMinutes, null);
  for (const failTable of ['services', 'packages']) {
    await assert.rejects(serviceSetup({ failTable }).api.getClientServiceCatalog(), /Offline/);
  }
  await assert.rejects(serviceSetup({ disconnected: true }).api.getClientServiceCatalog(), /not connected/);
});

test('Strict reads check session identity before and after queries', async () => {
  const { api, state } = serviceSetup();
  await assert.rejects(api.getClientServiceCatalog({ isSessionCurrent: () => false }), /session changed/);
  assert.equal(state.calls.length, 0);
  let current = true;
  const pending = api.getClientServiceCatalog({ isSessionCurrent: () => current });
  current = false;
  await assert.rejects(pending, /session changed/);
});

test('Bookable package checks always read the server with both IDs and parent activation', async () => {
  const { state, api } = serviceSetup();
  await api.getClientServiceCatalog();
  const before = state.calls.length;
  assert.equal((await api.getBookablePackage('p1', 's1')).priceAmount, 2500);
  state.selected = { ...state.selected, price: 2800, services: { ...serviceRow, duration_minutes: 120 } };
  const changed = await api.getBookablePackage('p1', 's1');
  assert.equal(changed.priceAmount, 2800);
  assert.equal(changed.durationMinutes, 120);
  assert.equal(state.calls.length, before + 2);
  const query = state.calls.at(-1);
  assert.ok(query.operations.some(([method, field, value]) => method === 'eq' && field === 'id' && value === 'p1'));
  assert.ok(query.operations.some(([method, field, value]) => method === 'eq' && field === 'service_id' && value === 's1'));
  assert.match(query.operations.find(([method]) => method === 'select')[1], /services:service_id\(is_active/);
});

test('Confirmation lookup rejects absent, inactive, mismatched and invalid-price packages without samples', async () => {
  for (const selected of [null, { ...packageRow, is_active: false, services: serviceRow },
    { ...packageRow, archived_at: '2026-10-07T12:30:00Z', services: serviceRow },
    { ...packageRow, services: { ...serviceRow, archived_at: '2026-10-07T12:30:00Z' } },
    { ...packageRow, services: { ...serviceRow, is_active: false } }, { ...packageRow, services: null },
    { ...packageRow, service_id: 'other', services: serviceRow }]) {
    assert.equal(await serviceSetup({ selected }).api.getBookablePackage('p1', 's1'), null);
  }
  for (const price of [null, -1, 'invalid']) {
    await assert.rejects(serviceSetup({ selected: { ...packageRow, price, services: serviceRow } }).api.getBookablePackage('p1', 's1'), /price could not/);
  }
  await assert.rejects(serviceSetup({ failTable: 'packages' }).api.getBookablePackage('p1', 's1'), /Offline/);
});

test('The store clears auth changes and invalidates closed client screens after catalog events', async () => {
  let authChange, event, reads = 0;
  const { clientServiceCatalogStore: store } = loadModule('src/services/client-service-catalog-store.ts', {
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => { authChange = callback; } } } },
    '@/services/catalog-events': { subscribeToCatalogChanged: (callback) => { event = callback; } },
    '@/services/client-service-catalog-cache': { createClientServiceCatalogCache: createCache },
    '@/services/service-catalog': { getClientServiceCatalog: async ({ isSessionCurrent }) => {
      assert.equal(isSessionCurrent(), true); reads++; return catalog();
    } },
  });
  authChange('INITIAL_SESSION', { user: { id: 'client-a' } });
  assert.equal(reads, 0);
  await store.refresh();
  const original = store.getSnapshot();
  authChange('TOKEN_REFRESHED', { user: { id: 'client-a' } });
  assert.equal(store.getSnapshot(), original);
  event({ entity: 'package', id: 'p1', isActive: false });
  assert.equal(store.getPackage('p1', 's1'), null);
  await store.refresh();
  assert.equal(reads, 2);
  authChange('SIGNED_OUT', null);
  assert.equal(store.getSnapshot().data, null);
});

test('The hook reuses focused cache, refreshes stale resume/events, and detaches blurred or old-session handlers', async () => {
  let time = 0, reads = 0, focus, appChange, event;
  const cache = setup(async () => { reads++; return catalog(); }, () => time);
  const { useClientServiceCatalog } = loadModule('src/hooks/use-client-service-catalog.ts', {
    react: { useCallback: (callback) => callback, useSyncExternalStore: (_subscribe, get) => get() },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_name, callback) => { appChange = callback;
      return { remove: () => { appChange = undefined; } }; } } },
    '@/services/catalog-events': { subscribeToCatalogChanged: (callback) => { event = callback; return () => { event = undefined; }; } },
    '@/services/client-service-catalog-store': { clientServiceCatalogStore: cache },
  });
  assert.equal(useClientServiceCatalog().isLoading, true);
  assert.equal(reads, 0);
  const cleanup = focus();
  await flush();
  const state = useClientServiceCatalog();
  assert.equal(state.hasLoaded, true);
  appChange('active');
  await flush();
  assert.equal(reads, 1);
  time = 60_000;
  appChange('background');
  await flush();
  assert.equal(reads, 1);
  appChange('active');
  await flush();
  assert.equal(reads, 2);
  cache.invalidate(); event();
  await flush();
  assert.equal(reads, 3);
  await state.refresh();
  assert.equal(reads, 4);
  cleanup();
  assert.equal(event, undefined);
  assert.equal(appChange, undefined);
  cache.setAccount('client-b');
  await state.refresh();
  assert.equal(state.getPackage('p1', 's1'), null);
  assert.equal(reads, 4);
});

const jsx = (type, props, key) => ({ type, props, key });
function nodesIn(tree) {
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    if (node.type === 'FlatList') {
      visit(node.props.ListHeaderComponent);
      const rows = node.props.data ?? [];
      if (!rows.length) visit(node.props.ListEmptyComponent);
      rows.slice(0, node.props.initialNumToRender ?? 8).forEach((item, index) => visit(node.props.renderItem({ item, index })));
    }
    visit(node.props?.children);
  }
  visit(tree);
  return nodes;
}
function screenHarness(file, initial = {}) {
  let state = { accountId: 'client-a', sessionKey: 1, ...catalog(), error: null, isLoading: false,
    isRefreshing: false, hasLoaded: true, refresh: async () => {}, ...initial };
  let slug = 'portrait';
  const routes = [], alerts = [], selections = [];
  const { default: Screen } = loadModule(file, {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-image': { Image: 'Image' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-router': { useLocalSearchParams: () => ({ slug }), router: { push: (route) => routes.push(route), back: () => routes.push('back') } },
    'react-native': { Pressable: 'Pressable', RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', FlatList: 'FlatList', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 10 }) },
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-client-service-catalog': { useClientServiceCatalog: () => { const key = state.sessionKey; return {
      ...state, isCurrentSession: () => state.sessionKey === key,
      getPackage: (id, serviceId) => state.packages.find((item) => item.id === id && item.serviceId === serviceId) ?? null,
    }; } },
    '@/components/client-catalog-notice': { ClientCatalogNotice: 'ClientCatalogNotice' },
    '@/components/motion-pressable': { MotionPressable: 'Pressable' },
    '@/components/app-alert': { showAppAlert: (...args) => alerts.push(args) },
    '@/services/booking-draft': { setSelectedPackage: (value) => selections.push(value) },
    '@/styles/responsive.styles': { responsiveStyles: {} },
  });
  return { render: () => nodesIn(Screen()), setState: (next) => { state = { ...state, ...next }; },
    setSlug: (value) => { slug = value; }, routes, alerts, selections };
}
const textIn = (nodes) => nodes.filter((node) => node.type === 'Text').map((node) => node.props.children).join(' ');
const selectButton = (nodes) => nodes.find((node) => node.props?.accessibilityLabel?.startsWith('Select '));

test('Services keeps cached cards during background failures and distinguishes initial errors from genuine empty results', () => {
  const harness = screenHarness('src/app/(client)/services.tsx');
  let nodes = harness.render();
  assert.doesNotMatch(textIn(nodes), /Loading services/);
  harness.setState({ isRefreshing: true, error: 'Offline' });
  nodes = harness.render();
  assert.match(textIn(nodes), /Portrait/);
  assert.equal(nodes.find((node) => node.type === 'FlatList').props.refreshControl.props.refreshing, true);
  assert.equal(nodes.find((node) => node.type === 'ClientCatalogNotice').props.error, 'Offline');
  harness.setState({ ...empty(), hasLoaded: false, isLoading: false, error: 'Offline' });
  assert.doesNotMatch(textIn(harness.render()), /No services|Loading services/);
  harness.setState({ hasLoaded: true, error: null });
  assert.match(textIn(harness.render()), /No services available/);
});

test('Package routes immediately use their own cached service, including route changes and deep links', () => {
  const harness = screenHarness('src/app/(client)/services/[slug].tsx');
  assert.match(textIn(harness.render()), /Portrait Package/);
  harness.setSlug(['events']);
  let nodes = harness.render();
  assert.match(textIn(nodes), /Event Package/);
  assert.doesNotMatch(textIn(nodes), /Portrait Package|Loading packages/);
  harness.setSlug('missing');
  nodes = harness.render();
  assert.match(textIn(nodes), /Service unavailable/);
  assert.equal(selectButton(nodes), undefined);
});

test('Package errors never claim an empty service; cached packages stay selectable during refresh', () => {
  const harness = screenHarness('src/app/(client)/services/[slug].tsx', { ...empty(), hasLoaded: false, error: 'Offline' });
  assert.doesNotMatch(textIn(harness.render()), /No packages|Service unavailable/);
  harness.setState({ ...catalog(), hasLoaded: true, error: 'Offline', isRefreshing: true });
  assert.match(textIn(harness.render()), /Portrait Package/);
  assert.notEqual(selectButton(harness.render()), undefined);
  harness.setState({ packages: [], error: null });
  assert.match(textIn(harness.render()), /No packages yet/);
});

test('Selection uses the newest cached row, rejects a removed card, and ignores old-account taps', () => {
  const harness = screenHarness('src/app/(client)/services/[slug].tsx');
  const button = selectButton(harness.render());
  harness.setState({ packages: [{ ...catalog().packages[0], priceAmount: 2800, price: '₱2,800' }] });
  button.props.onPress();
  assert.equal(harness.selections[0].priceAmount, 2800);
  assert.deepEqual(harness.routes, ['/book/selected']);
  harness.setState({ packages: [] });
  button.props.onPress();
  assert.equal(harness.selections.length, 1);
  assert.equal(harness.alerts[0][0], 'Package unavailable');
  harness.setState({ sessionKey: 3 });
  button.props.onPress();
  assert.equal(harness.alerts.length, 1);
  assert.equal(harness.selections.length, 1);
});

test('Services navigation and both pull/retry handlers remain available without permanent refresh buttons', async () => {
  for (const file of ['src/app/(client)/services.tsx', 'src/app/(client)/services/[slug].tsx']) {
    let reads = 0;
    const harness = screenHarness(file, { refresh: async () => reads++ });
    let nodes = harness.render();
    assert.equal(nodes.find((node) => node.type === 'ClientCatalogNotice'), undefined);
    nodes.find((node) => node.type === 'FlatList').props.refreshControl.props.onRefresh();
    harness.setState({ error: 'Offline' });
    nodes = harness.render();
    nodes.find((node) => node.type === 'ClientCatalogNotice').props.onRetry();
    await flush();
    assert.equal(reads, 2);
    assert.doesNotMatch(textIn(nodes), /Refresh services|Refresh packages/);
    if (file.endsWith('services.tsx')) {
      nodes.find((node) => node.props?.accessibilityLabel === 'Portrait').props.onPress();
      assert.equal(harness.routes[0].pathname, '/services/[slug]');
      assert.equal(harness.routes[0].params.slug, 'portrait');
    }
  }
});

test('Large client catalogs use one virtualized scrolling surface while preserving every selectable record', () => {
  const services = Array.from({ length: 150 }, (_, i) => ({ ...catalog().services[0], id: `s${i}`, slug: `slug${i}` }));
  const categories = screenHarness('src/app/(client)/services.tsx', { services });
  const nodes = categories.render(); const list = nodes.find(n => n.type === 'FlatList');
  assert.equal(list.props.data.length, 150); assert.equal(list.props.keyExtractor(services[149]), 's149');
  assert.equal(nodes.some(n => n.type === 'ScrollView'), false);
  assert.equal(nodes.filter(n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === 'Portrait').length, 8);
  const packages = Array.from({ length: 150 }, (_, i) => ({ ...catalog().packages[0], id: `p${i}` }));
  const detail = screenHarness('src/app/(client)/services/[slug].tsx', { packages });
  const packageList = detail.render().find(n => n.type === 'FlatList');
  assert.equal(packageList.props.data.length, 150);
  const offscreen = nodesIn(packageList.props.renderItem({ item: packages[149] }));
  selectButton(offscreen).props.onPress();
  assert.equal(detail.selections[0].id, 'p149');
});
