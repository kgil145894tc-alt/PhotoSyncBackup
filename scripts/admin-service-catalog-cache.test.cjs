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
  }).outputText, {
    exports, require: (name) => {
      if (name.endsWith('.png')) return name;
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    }, Date, Intl, Promise, Map, Set, Error,
  });
  return exports;
}
const { createAdminServiceCatalogCache } = loadModule('src/services/admin-service-catalog-cache.ts');
const empty = () => ({ services: [], packages: [] });
const catalog = () => ({
  services: [{ id: 's1', isActive: true, name: 'Portrait', packageCount: 2 }, { id: 's2', isActive: true, name: 'Event', packageCount: 0 }],
  packages: [{ id: 'p1', serviceId: 's1', isActive: true }, { id: 'p2', serviceId: 's1', isActive: true }],
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('Services and packages share a 60-second snapshot, including an empty database; pull bypasses freshness', async () => {
  let time = 0;
  let calls = 0;
  const cache = createAdminServiceCatalogCache(async () => { calls++; return empty(); }, () => time);
  cache.setAccount('admin-a');
  await cache.refresh();
  const original = cache.getSnapshot().data;
  await cache.refresh();
  time = 59_999;
  await cache.refresh();
  assert.equal(calls, 1);
  assert.equal(cache.getSnapshot().data, original);
  time = 60_000;
  await cache.refresh();
  await cache.refresh(true);
  assert.equal(calls, 3);
});

test('Focus, resume, mutation reconciliation and manual pulls share one pending fetch', async () => {
  const read = deferred();
  let calls = 0;
  const cache = createAdminServiceCatalogCache(() => { calls++; return read.promise; });
  cache.setAccount('admin-a');
  const request = cache.refresh();
  assert.equal(cache.refresh(true), request);
  assert.equal(cache.refresh(), request);
  await flush();
  assert.equal(calls, 1);
  read.resolve(catalog());
  await request;
  assert.equal(cache.getSnapshot().isFetching, false);
});

test('Save events while the screen is closed invalidate the next visit', async () => {
  let calls = 0;
  const cache = createAdminServiceCatalogCache(async () => { calls++; return catalog(); });
  cache.setAccount('admin-a');
  await cache.refresh();
  cache.invalidate();
  await cache.refresh();
  assert.equal(calls, 2);
});

test('A save during a pending read discards both old lists and rereads the catalog', async () => {
  const read = deferred();
  let calls = 0;
  const cache = createAdminServiceCatalogCache(() => ++calls === 1 ? read.promise : Promise.resolve(empty()));
  cache.setAccount('admin-a');
  const request = cache.refresh();
  await flush();
  cache.invalidate();
  read.resolve(catalog());
  await request;
  assert.equal(calls, 2);
  assert.equal(cache.getSnapshot().data.services.length, 0);
  assert.equal(cache.getSnapshot().data.packages.length, 0);
});

test('Read failures preserve both lists and allow retry; initial failures stay errors rather than samples', async () => {
  let fail = false;
  const cache = createAdminServiceCatalogCache(async () => { if (fail) throw new Error('Offline'); return catalog(); });
  cache.setAccount('admin-a');
  await cache.refresh();
  const original = cache.getSnapshot().data;
  fail = true;
  await cache.refresh(true);
  assert.equal(cache.getSnapshot().data, original);
  assert.match(cache.getSnapshot().error, /previously loaded/);
  cache.setAccount('admin-b');
  await cache.refresh();
  assert.equal(cache.getSnapshot().data, null);
  assert.match(cache.getSnapshot().error, /Could not load/);
  fail = false;
  await cache.refresh();
  assert.equal(cache.getSnapshot().error, null);
});

test('Confirmed deletions update cached visibility and package counts even if reconciliation fails', async () => {
  let fail = false;
  const cache = createAdminServiceCatalogCache(async () => { if (fail) throw new Error('Offline'); return catalog(); });
  cache.setAccount('admin-a');
  await cache.refresh();
  cache.invalidate({ entity: 'package', id: 'p1', isActive: false });
  assert.equal(cache.getSnapshot().data.packages[0].isActive, false);
  assert.equal(cache.getSnapshot().data.services[0].packageCount, 1);
  cache.invalidate({ entity: 'service', id: 's1', isActive: false });
  assert.equal(cache.getSnapshot().data.services[0].isActive, false);
  fail = true;
  await cache.refresh();
  assert.equal(cache.getSnapshot().data.services[0].isActive, false);
  assert.equal(cache.getSnapshot().data.packages[0].isActive, false);
});

test('Logout and account switching reject old results without stopping the new account request', async () => {
  const oldRead = deferred();
  const newRead = deferred();
  let calls = 0;
  const cache = createAdminServiceCatalogCache(() => ++calls === 1 ? oldRead.promise : newRead.promise);
  cache.setAccount('admin-a');
  const oldRequest = cache.refresh();
  await flush();
  cache.setAccount(null);
  assert.equal(cache.getSnapshot().data, null);
  cache.setAccount('admin-b');
  const newRequest = cache.refresh();
  await flush();
  oldRead.resolve(catalog());
  await oldRequest;
  assert.equal(cache.getSnapshot().data, null);
  assert.equal(cache.getSnapshot().isFetching, true);
  newRead.resolve(empty());
  await newRequest;
  assert.equal(cache.getSnapshot().accountId, 'admin-b');
  const original = cache.getSnapshot();
  cache.setAccount('admin-b');
  assert.equal(cache.getSnapshot(), original);
});

test('Render and an unresolved session do not fetch; logout cancels queued work', async () => {
  let calls = 0;
  const cache = createAdminServiceCatalogCache(async () => { calls++; return empty(); });
  cache.getSnapshot();
  await cache.refresh();
  assert.equal(calls, 0);
  cache.setAccount('admin-a');
  const queued = cache.refresh();
  cache.setAccount(null);
  await queued;
  assert.equal(calls, 0);
  assert.equal(cache.getServerSnapshot().data, null);
});

test('Singleton listens to edits while screens are absent and clears the catalog on auth changes', async () => {
  let auth;
  let changed;
  let calls = 0;
  const { adminServiceCatalogStore: store } = loadModule('src/services/admin-service-catalog-store.ts', {
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => { auth = callback; } } } },
    '@/services/admin-service-catalog-cache': { createAdminServiceCatalogCache },
    '@/services/catalog-events': { subscribeToCatalogChanged: (callback) => { changed = callback; } },
    '@/services/service-catalog': { getAdminServiceCatalog: async () => { calls++; return catalog(); } },
  });
  auth('INITIAL_SESSION', { user: { id: 'admin-a' } });
  await store.refresh();
  changed({ entity: 'package', id: 'p1', isActive: false });
  assert.equal(store.getSnapshot().data.services[0].packageCount, 1);
  await store.refresh();
  auth('TOKEN_REFRESHED', { user: { id: 'admin-a' } });
  await store.refresh();
  assert.equal(calls, 2);
  auth('SIGNED_OUT', null);
  assert.equal(store.getSnapshot().data, null);
});

test('Hook reuses cached lists immediately; refresh work starts on focus and listeners clean up on blur', async () => {
  let focus;
  let changed;
  let appChange;
  let removed = 0;
  const calls = [];
  const { useAdminServiceCatalog } = loadModule('src/hooks/use-admin-service-catalog.ts', {
    react: { useCallback: (callback) => callback, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_event, callback) => { appChange = callback; return { remove: () => removed++ }; } } },
    '@/services/catalog-events': { subscribeToCatalogChanged: (callback) => { changed = callback; return () => removed++; } },
    '@/services/admin-service-catalog-store': { adminServiceCatalogStore: {
      getSnapshot: () => ({ accountId: 'admin-a', isSessionReady: true, data: catalog(), error: null, isFetching: false }),
      refresh: async (force = false) => { calls.push(force); },
    } },
  });
  const result = useAdminServiceCatalog();
  assert.equal(result.isLoading, false);
  assert.equal(result.services[0].name, 'Portrait');
  assert.equal(calls.length, 0);
  const cleanup = focus();
  changed();
  appChange('background');
  appChange('active');
  await result.refresh();
  await result.reconcile();
  assert.deepEqual(calls, [false, false, false, true, false]);
  cleanup();
  assert.equal(removed, 2);
});

test('Mounted ref becomes active only after commit and cancels late async UI completions', () => {
  let effect;
  const { useMountedRef } = loadModule('src/hooks/use-mounted-ref.ts', {
    react: { useRef: (current) => ({ current }), useEffect: (callback) => { effect = callback; } },
  });
  const mounted = useMountedRef();
  assert.equal(mounted.current, false);
  const cleanup = effect();
  assert.equal(mounted.current, true);
  cleanup();
  assert.equal(mounted.current, false);
});

test('Confirmed archives remove admin records immediately and a failed reconciliation cannot restore them', async () => {
  for (const entity of ['service', 'package']) {
    let offline = false;
    const cache = createAdminServiceCatalogCache(async () => {
      if (offline) throw new Error('Offline');
      return catalog();
    });
    cache.setAccount('admin-a'); await cache.refresh();
    const id = entity === 'service' ? 's1' : 'p1';
    cache.invalidate({ entity, id, isActive: false, isArchived: true });
    const snapshot = cache.getSnapshot().data;
    if (entity === 'service') {
      assert.equal(snapshot.services.some(item => item.id === id), false);
      assert.equal(snapshot.packages.some(item => item.serviceId === id), false);
    } else {
      assert.equal(snapshot.packages.some(item => item.id === id), false);
      assert.equal(snapshot.services[0].packageCount, 1);
    }
    offline = true; await cache.refresh();
    assert.equal(cache.getSnapshot().data, snapshot);
    assert.ok(cache.getSnapshot().error);
  }
});

test('Delete confirmation uses the archive API for inactive services as well as active ones', async () => {
  let archived; let reconciled = 0;
  const harness = screenHarness({ ...ready(), services: [{ ...catalog().services[0], isActive: false }],
    reconcile: async () => reconciled++ }, { archiveService: async id => { archived = id; return { success: true }; } });
  let { nodes } = harness.render();
  nodes.find(node => node.props?.service && node.props.onDelete).props.onDelete();
  nodes = harness.render().nodes;
  const modal = nodes.find(node => node.type?.name === 'DeleteServiceModal');
  assert.match(text(cardNodes(modal)), /Delete service/);
  assert.match(text(cardNodes(modal)), /Active switch in Edit/);
  await modal.props.onDelete();
  assert.equal(archived, 's1'); assert.equal(reconciled, 1);
  assert.equal(harness.render().nodes.find(node => node.type?.name === 'DeleteServiceModal').props.service, null);
});

function screenHarness(initialCatalog, mutations = {}) {
  let currentCatalog = initialCatalog;
  let states = [];
  let index = 0;
  let key;
  const effects = [];
  const alerts = [];
  const mounted = { current: true };
  let updates = 0;
  const jsx = (type, props, key) => ({ type, props, key });
  const { default: Screen } = loadModule('src/app/photographer/services.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useEffect: (effect) => effects.push(effect), useState: (initial) => {
      const stateIndex = index++;
      if (!(stateIndex in states)) states[stateIndex] = typeof initial === 'function' ? initial() : initial;
      return [states[stateIndex], (value) => { updates++; states[stateIndex] = typeof value === 'function' ? value(states[stateIndex]) : value; }];
    } },
    'expo-image': { Image: 'Image' }, 'expo-image-picker': {}, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', FlatList: 'FlatList', RefreshControl: 'RefreshControl' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }, 'react-native-svg': {},
    '@/components/app-alert': { showAppAlert: (...args) => alerts.push(args) }, '@/components/admin-brand-header': {},
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-mounted-ref': { useMountedRef: () => mounted },
    '@/hooks/use-admin-service-catalog': { useAdminServiceCatalog: () => currentCatalog },
    '@/services/service-catalog': mutations,
    '@/styles/admin-theme': { adminColors: { surface: '#FFFFFF', muted: '#65758B' } },
    '@/styles/photographer.styles': { photographerStyles: {} }, '@/styles/service-form.styles': { serviceFormStyles: {} },
  });
  function render() {
    const wrapper = Screen();
    if (key !== wrapper.key) { states = []; key = wrapper.key; }
    index = 0;
    effects.length = 0;
    const tree = wrapper.type(wrapper.props);
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node);
      if (node.type === 'FlatList') {
        visit(node.props.ListHeaderComponent);
        const rows = node.props.data ?? [];
        if (!rows.length) visit(node.props.ListEmptyComponent);
        rows.slice(0, node.props.initialNumToRender ?? 8).forEach(item => visit(node.props.renderItem({ item })));
      }
      visit(node.props?.children);
    }
    visit(tree);
    effects.forEach((effect) => effect());
    return { nodes, wrapper };
  }
  return { render, setCatalog: (value) => { currentCatalog = value; }, mounted, alerts, updateCount: () => updates };
}
const ready = () => ({ ...catalog(), accountId: 'admin-a', isLoading: false, isRefreshing: false, error: null,
  refresh: async () => {}, reconcile: async () => {} });
const text = (nodes) => nodes.filter((node) => node.type === 'Text').map((node) => node.props.children).join(' ');

function cardNodes(card) {
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(card.type(card.props));
  return nodes;
}

test('An inactive-only catalog remains visible to admins with an edit path to reactivation', () => {
  const service = { ...catalog().services[0], isActive: false };
  const harness = screenHarness({ ...ready(), services: [service] });
  let { nodes } = harness.render();
  assert.doesNotMatch(text(nodes), /No services yet/);
  const card = nodes.find(node => node.props?.service?.id === 's1' && node.props.onOpen);
  assert.ok(card, 'A disabled service must not disappear from admin management');
  const renderedCard = cardNodes(card);
  assert.match(text(renderedCard), /Inactive.*Edit to enable/);
  assert.ok(renderedCard.some(node => node.props?.accessibilityLabel === 'Delete Portrait'));
  renderedCard.find(node => node.props?.accessibilityLabel === 'Edit Portrait').props.onPress();
  nodes = harness.render().nodes;
  const form = nodes.find(node => node.type?.name === 'ServiceFormModal');
  assert.equal(form.props.visible, true);
  assert.equal(form.props.service.id, 's1');
  assert.equal(form.props.service.isActive, false);
});

test('Deactivation keeps the selected service and inactive packages accessible after catalog reconciliation', () => {
  const initial = ready();
  const harness = screenHarness(initial);
  let { nodes } = harness.render();
  nodes.find(node => node.props?.service?.id === 's1' && node.props.onOpen).props.onOpen();
  harness.setCatalog({ ...initial,
    services: initial.services.map(service => ({ ...service, isActive: false })),
    packages: initial.packages.map(item => ({ ...item, isActive: false, name: 'Portrait package', inclusions: [] })),
  });
  nodes = harness.render().nodes;
  assert.match(text(nodes), /Portrait/);
  assert.match(text(nodes), /2 packages/);
  assert.match(text(nodes), /Service inactive.*Hidden from clients/);
  const packages = nodes.filter(node => node.props?.item && node.props.onEdit);
  assert.equal(packages.length, 2);
  const card = cardNodes(packages[0]);
  assert.match(text(card), /Inactive.*Edit to enable/);
  assert.equal(card.some(node => node.props?.accessibilityLabel === 'Activate package'), false);
  card.find(node => node.props?.accessibilityLabel === 'Edit package').props.onPress();
  const form = harness.render().nodes.find(node => node.type?.name === 'PackageFormModal');
  assert.equal(form.props.visible, true);
  assert.equal(form.props.item.id, 'p1');
  assert.equal(form.props.item.isActive, false);
  assert.equal(form.props.lockedServiceId, 's1');
  assert.ok(form.props.services.some(service => service.id === 's1'), 'Editing preserves an inactive parent category');
});

test('Category and package views retain cached cards during updates, and switching views makes no direct fetch', () => {
  const harness = screenHarness({ ...ready(), isRefreshing: true });
  let { nodes } = harness.render();
  assert.doesNotMatch(text(nodes), /Loading services/);
  const service = nodes.find((node) => node.props?.service?.id === 's1' && node.props.onOpen);
  service.props.onOpen();
  ({ nodes } = harness.render());
  assert.ok(nodes.some((node) => node.props?.item?.id === 'p1'));
  assert.ok(nodes.some((node) => node.props?.item?.id === 'p2'));
  assert.doesNotMatch(text(nodes), /Loading services/);
});

test('Large admin catalogs virtualize categories and packages while retaining counts and offscreen edit/delete actions', () => {
  const services = Array.from({ length: 150 }, (_, i) => ({ ...catalog().services[0], id: `s${i}` }));
  const packages = Array.from({ length: 150 }, (_, i) => ({ ...catalog().packages[0], id: `p${i}`, serviceId: 's149' }));
  const harness = screenHarness({ ...ready(), services, packages });
  let { nodes } = harness.render(); let list = nodes.find(n => n.type === 'FlatList');
  assert.equal(list.props.data.length, 150);
  assert.equal(nodes.filter(n => n.props.service && n.props.onOpen).length, 8);
  const offscreenService = list.props.renderItem({ item: services[149] }).props.children;
  offscreenService.props.onOpen();
  nodes = harness.render().nodes; list = nodes.find(n => n.type === 'FlatList');
  assert.equal(list.props.data.length, 150); assert.equal(list.props.keyExtractor(packages[149]), 'p149');
  const offscreenPackage = list.props.renderItem({ item: packages[149] });
  offscreenPackage.props.onEdit();
  nodes = harness.render().nodes;
  assert.ok(nodes.some(n => n.props.item?.id === 'p149' && n.props.visible));
});

test('Initial errors do not invent empty/sample catalogs; a successful empty catalog shows the add-category state', () => {
  const failed = screenHarness({ ...ready(), ...empty(), error: 'Could not load services. Pull down to try again.' }).render().nodes;
  assert.match(text(failed), /Could not load services/);
  assert.doesNotMatch(text(failed), /No services yet/);
  assert.equal(failed.find((node) => node.props?.accessibilityLabel === 'Add service category').props.disabled, true);
  const successful = screenHarness({ ...ready(), ...empty() }).render().nodes;
  assert.match(text(successful), /No services yet/);
});

test('Account scope resets open forms and service selection through the content key', () => {
  const harness = screenHarness(ready());
  let { nodes, wrapper } = harness.render();
  nodes.find((node) => node.props?.accessibilityLabel === 'Add service category').props.onPress();
  ({ nodes } = harness.render());
  assert.ok(nodes.find((node) => node.type?.name === 'ServiceFormModal').props.visible);
  harness.setCatalog({ ...ready(), accountId: 'admin-b' });
  const next = harness.render();
  assert.notEqual(next.wrapper.key, wrapper.key);
  assert.equal(next.nodes.find((node) => node.type?.name === 'ServiceFormModal').props.visible, false);
});

test('Delete completion after navigation makes no local state updates or alerts', async () => {
  const pending = deferred();
  const harness = screenHarness(ready(), { archiveService: () => pending.promise });
  let { nodes } = harness.render();
  nodes.find((node) => node.props?.service?.id === 's1' && node.props.onOpen).props.onDelete();
  ({ nodes } = harness.render());
  const request = nodes.find((node) => node.type?.name === 'DeleteServiceModal').props.onDelete();
  const updateCount = harness.updateCount();
  harness.mounted.current = false;
  pending.resolve({ success: false, message: 'Offline' });
  await request;
  assert.equal(harness.updateCount(), updateCount);
  assert.equal(harness.alerts.length, 0);
});
