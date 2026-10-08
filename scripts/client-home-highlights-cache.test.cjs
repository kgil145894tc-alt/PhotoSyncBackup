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
const { createClientHomeHighlightsCache: createCache } = loadModule('src/services/client-home-highlights-cache.ts');
const photo = { id: 's1', name: 'Portrait', slug: 'portrait', imageUrl: 'https://example.com/portrait.jpg' };
const photos = () => [photo, { ...photo, id: 's2', name: 'Events', slug: 'events', imageUrl: 'https://example.com/events.jpg' }];
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(load = async () => photos(), now) {
  const cache = createCache(load, now);
  cache.setAccount('client-a');
  return cache;
}

test('Home renders an unknown snapshot without reads before session restoration or while signed out', async () => {
  let reads = 0;
  const cache = createCache(async () => { reads++; return photos(); });
  const snapshot = cache.getSnapshot();
  assert.equal(snapshot.data, null);
  assert.equal(cache.getSnapshot(), snapshot);
  await cache.refresh();
  cache.setAccount(null);
  await cache.refresh(true);
  assert.equal(reads, 0);
  assert.equal(cache.getSnapshot().data, null);
  assert.equal(cache.getServerSnapshot(), snapshot);
});

test('Published photos and successful empty lists stay fresh for 60 seconds exactly', async () => {
  for (const data of [photos(), []]) {
    let time = 0, reads = 0;
    const cache = setup(async () => { reads++; return data; }, () => time);
    await cache.refresh();
    const loaded = cache.getSnapshot();
    assert.equal(loaded.data, data);
    time = 59_999;
    await cache.refresh();
    assert.equal(reads, 1);
    assert.equal(cache.getSnapshot(), loaded);
    time = 60_000;
    await cache.refresh();
    assert.equal(reads, 2);
    await cache.refresh(true);
    assert.equal(reads, 3, 'An explicit retry bypasses freshness');
  }
});

test('Concurrent focus, resume, retry and synchronous subscriber requests share one read', async () => {
  let reads = 0;
  const slow = deferred();
  const cache = setup(() => { reads++; return slow.promise; });
  let subscriberRequest;
  const unsubscribe = cache.subscribe(() => {
    if (cache.getSnapshot().isFetching) subscriberRequest = cache.refresh(true);
  });
  const first = cache.refresh();
  assert.equal(first, subscriberRequest);
  assert.equal(first, cache.refresh());
  assert.equal(first, cache.refresh(true));
  await flush();
  assert.equal(reads, 1);
  slow.resolve(photos());
  await first;
  assert.equal(cache.getSnapshot().isFetching, false);
  unsubscribe();
});

test('Freshness starts when a read finishes rather than when a slow read starts', async () => {
  let time = 0, reads = 0;
  const slow = deferred();
  const cache = setup(() => { reads++; return slow.promise; }, () => time);
  const pending = cache.refresh();
  await flush();
  time = 100_000;
  slow.resolve(photos());
  await pending;
  time = 159_999;
  await cache.refresh();
  assert.equal(reads, 1);
});

test('Background refresh keeps accepted photos through failure and can replace them with a real empty result', async () => {
  let result = photos();
  const cache = setup(async () => result);
  await cache.refresh();
  const loaded = cache.getSnapshot().data;
  const failed = deferred();
  result = failed.promise;
  const pending = cache.refresh(true);
  assert.equal(cache.getSnapshot().data, loaded);
  assert.equal(cache.getSnapshot().isFetching, true);
  await flush();
  failed.reject(new Error('Offline'));
  await pending;
  assert.equal(cache.getSnapshot().data, loaded);
  assert.match(cache.getSnapshot().error, /previously loaded photos/);
  assert.equal(cache.getSnapshot().isFetching, false);
  result = [];
  await cache.refresh();
  assert.equal(cache.getSnapshot().data.length, 0);
  assert.equal(cache.getSnapshot().error, null);
});

test('An initial failure stays unknown rather than claiming a successful empty result', async () => {
  let fail = true, reads = 0;
  const cache = setup(async () => { reads++; if (fail) throw new Error('Offline'); return []; });
  await cache.refresh();
  assert.equal(cache.getSnapshot().data, null);
  assert.match(cache.getSnapshot().error, /Could not load highlights/);
  fail = false;
  await cache.refresh();
  assert.equal(reads, 2);
  assert.equal(cache.getSnapshot().data.length, 0);
  assert.equal(cache.getSnapshot().error, null);
});

test('Catalog saves during pending reads discard obsolete successes and failures before reading again', async () => {
  for (const outcome of ['success', 'failure']) {
    const slow = deferred(), updated = deferred();
    let reads = 0;
    const cache = setup(() => ++reads === 1 ? slow.promise : updated.promise);
    const seen = [];
    cache.subscribe(() => seen.push(cache.getSnapshot()));
    const pending = cache.refresh();
    await flush();
    cache.invalidate();
    assert.equal(cache.refresh(), pending);
    if (outcome === 'success') slow.resolve(photos());
    else slow.reject(new Error('Old error'));
    await flush();
    assert.equal(reads, 2);
    assert.equal(cache.getSnapshot().data, null);
    assert.equal(seen.some((snapshot) => snapshot.error || snapshot.data), false);
    const current = [{ ...photo, imageUrl: 'https://example.com/updated.jpg' }];
    updated.resolve(current);
    await pending;
    assert.equal(cache.getSnapshot().data, current);
  }
});

test('Confirmed service removal disappears immediately and cannot return from an outdated read', async () => {
  let result = photos();
  const cache = setup(async () => result);
  await cache.refresh();
  const slow = deferred();
  result = slow.promise;
  const pending = cache.refresh(true);
  await flush();
  cache.invalidate({ entity: 'service', id: 's1', isActive: false });
  assert.equal(cache.getHighlight('s1'), null);
  assert.equal(cache.getHighlight('s2').name, 'Events');
  result = Promise.reject(new Error('Offline'));
  // Keep this rejection handled until the next loop iteration consumes it.
  result.catch(() => {});
  slow.resolve(photos());
  await pending;
  assert.equal(cache.getHighlight('s1'), null);
  assert.equal(cache.getSnapshot().data.length, 1);
  assert.match(cache.getSnapshot().error, /previously loaded/);
});

test('Service activation waits for the server; package status alone preserves highlights freshness', async () => {
  let reads = 0;
  const cache = setup(async () => { reads++; return photos(); });
  await cache.refresh();
  for (const isActive of [true, false]) {
    cache.invalidate({ entity: 'package', id: 'p1', isActive });
    await cache.refresh();
  }
  assert.equal(reads, 1);
  cache.invalidate({ entity: 'service', id: 'new-service', isActive: true });
  assert.equal(cache.getHighlight('new-service'), null);
  await cache.refresh();
  assert.equal(reads, 2);
});

test('Logout cancels a queued read even when triggered synchronously by a subscriber', async () => {
  let reads = 0;
  const cache = setup(async () => { reads++; return photos(); });
  cache.subscribe(() => { if (cache.getSnapshot().isFetching) cache.setAccount(null); });
  const pending = cache.refresh();
  assert.equal(typeof pending.then, 'function');
  await pending;
  assert.equal(reads, 0);
  assert.equal(cache.getSnapshot().data, null);
  assert.equal(cache.getSnapshot().isFetching, false);
});

test('Logout, account switches and same-account relogin reject old results without clearing a new request', async () => {
  for (const nextAccount of ['client-a', 'client-b']) {
    for (const outcome of ['success', 'failure']) {
      const oldRead = deferred(), nextRead = deferred();
      let reads = 0;
      const cache = setup(() => ++reads === 1 ? oldRead.promise : nextRead.promise);
      const oldKey = cache.getSnapshot().sessionKey;
      const old = cache.refresh();
      await flush();
      cache.setAccount(null);
      cache.setAccount(nextAccount);
      assert.notEqual(cache.getSnapshot().sessionKey, oldKey);
      const next = cache.refresh();
      await flush();
      if (outcome === 'success') oldRead.resolve(photos());
      else oldRead.reject(new Error('Old error'));
      await old;
      assert.equal(cache.getSnapshot().data, null);
      assert.equal(cache.getSnapshot().error, null);
      assert.equal(cache.getSnapshot().isFetching, true);
      nextRead.resolve([]);
      await next;
      assert.equal(cache.getSnapshot().data.length, 0);
      assert.equal(cache.getSnapshot().isFetching, false);
    }
  }
});

test('Same-account token updates preserve loaded data and freshness; new accounts clear them', async () => {
  let reads = 0;
  const cache = setup(async () => { reads++; return photos(); });
  await cache.refresh();
  const original = cache.getSnapshot();
  cache.setAccount('client-a');
  assert.equal(cache.getSnapshot(), original);
  await cache.refresh();
  assert.equal(reads, 1);
  cache.setAccount('client-b');
  assert.equal(cache.getSnapshot().data, null);
  assert.equal(cache.getHighlight('s1'), null);
  await cache.refresh();
  assert.equal(reads, 2);
});

test('Store auth callbacks never fetch; closed Home invalidation and logout still take effect', async () => {
  let authChange, event, reads = 0;
  const { clientHomeHighlightsStore: store } = loadModule('src/services/client-home-highlights-store.ts', {
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => { authChange = callback; } } } },
    '@/services/catalog-events': { subscribeToCatalogChanged: (callback) => { event = callback; } },
    '@/services/client-home-highlights-cache': { createClientHomeHighlightsCache: createCache },
    '@/services/service-catalog': { getServiceHighlights: async () => { reads++; return photos(); } },
  });
  authChange('INITIAL_SESSION', { user: { id: 'client-a' } });
  assert.equal(reads, 0);
  await store.refresh();
  const loaded = store.getSnapshot();
  authChange('TOKEN_REFRESHED', { user: { id: 'client-a' } });
  assert.equal(store.getSnapshot(), loaded);
  event({ entity: 'service', id: 's1', isActive: false });
  assert.equal(store.getHighlight('s1'), null);
  assert.equal(reads, 1);
  await store.refresh();
  assert.equal(reads, 2);
  authChange('SIGNED_OUT', null);
  assert.equal(store.getSnapshot().data, null);
  const disconnected = loadModule('src/services/client-home-highlights-store.ts', {
    '@/lib/supabase': { supabase: null },
    '@/services/catalog-events': { subscribeToCatalogChanged: () => {} },
    '@/services/client-home-highlights-cache': { createClientHomeHighlightsCache: createCache },
    '@/services/service-catalog': { getServiceHighlights: async () => { throw new Error('Not connected'); } },
  }).clientHomeHighlightsStore;
  assert.equal(disconnected.getSnapshot().isSessionReady, true);
  await disconnected.refresh();
  assert.equal(disconnected.getSnapshot().data, null);
});

function hookHarness(cache) {
  let focus;
  const events = new Set(), appStates = new Set();
  const { useClientHomeHighlights } = loadModule('src/hooks/use-client-home-highlights.ts', {
    react: { useCallback: (callback) => callback, useSyncExternalStore: (_subscribe, get) => get() },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_name, callback) => {
      appStates.add(callback); return { remove: () => appStates.delete(callback) };
    } } },
    '@/services/catalog-events': { subscribeToCatalogChanged: (callback) => {
      events.add(callback); return () => events.delete(callback);
    } },
    '@/services/client-home-highlights-store': { clientHomeHighlightsStore: cache },
  });
  return { render: useClientHomeHighlights, focus: () => focus(), getFocus: () => focus,
    appChange: (state) => appStates.forEach((callback) => callback(state)),
    getAppChange: () => [...appStates][0],
    event: (change) => { cache.invalidate(change); events.forEach((callback) => callback(change)); },
    listeners: () => events.size + appStates.size };
}

test('The hook reads without render side effects, reuses fresh focus, and refreshes only stale active resume', async () => {
  let time = 0, reads = 0;
  const cache = setup(async () => { reads++; return photos(); }, () => time);
  const hook = hookHarness(cache);
  assert.equal(hook.render().isLoading, true);
  assert.equal(reads, 0);
  let leave = hook.focus();
  await flush();
  assert.equal(hook.render().highlights.length, 2);
  leave();
  hook.render(); leave = hook.focus();
  hook.appChange('active');
  await flush();
  assert.equal(reads, 1);
  time = 60_000;
  hook.appChange('background');
  await flush();
  assert.equal(reads, 1);
  hook.appChange('active');
  await flush();
  assert.equal(reads, 2);
  const queuedResume = hook.getAppChange();
  leave();
  assert.equal(hook.listeners(), 0);
  time = 120_000;
  queuedResume('active');
  hook.appChange('active');
  await flush();
  assert.equal(reads, 2);
});

test('Focused Home reloads on service/image events, skips package status, and closed events wait for focus', async () => {
  let reads = 0;
  const cache = setup(async () => { reads++; return photos(); });
  const hook = hookHarness(cache);
  hook.render(); const leave = hook.focus();
  await flush();
  hook.event({ entity: 'package', id: 'p1', isActive: false });
  await flush();
  assert.equal(reads, 1);
  hook.event();
  await flush();
  assert.equal(reads, 2);
  hook.event({ entity: 'service', id: 's1', isActive: true });
  await flush();
  assert.equal(reads, 3);
  leave();
  hook.event();
  await flush();
  assert.equal(reads, 3);
  hook.render(); const leaveAgain = hook.focus();
  await flush();
  assert.equal(reads, 4);
  leaveAgain();
});

test('Retained retry, card, focus and resume handlers cannot act in a later account session', async () => {
  let reads = 0;
  const cache = setup(async () => { reads++; return photos(); });
  const hook = hookHarness(cache);
  hook.render(); const oldFocus = hook.getFocus(), leave = hook.focus();
  await flush();
  const old = hook.render(), oldResume = hook.getAppChange();
  assert.equal(old.getHighlight('s1').slug, 'portrait');
  cache.setAccount(null);
  assert.equal(hook.render().highlights.length, 0);
  assert.equal(hook.render().isLoading, false);
  assert.match(hook.render().error, /sign in/);
  assert.equal(hook.focus(), undefined);
  cache.setAccount('client-a');
  await old.refresh();
  oldResume('active');
  const staleCleanup = oldFocus();
  await flush();
  assert.equal(reads, 1);
  assert.equal(old.getHighlight('s1'), null);
  assert.equal(staleCleanup, undefined);
  leave();
  hook.render(); const recentCleanup = hook.focus();
  await flush();
  assert.equal(reads, 2);
  recentCleanup();
});

function serviceHarness({ rows = [], fail = false, disconnected = false } = {}) {
  const calls = [];
  const supabase = { from: (table) => {
    const operations = [];
    calls.push({ table, operations });
    const query = {};
    for (const method of ['select', 'eq', 'is', 'not', 'neq', 'order', 'range']) {
      query[method] = (...args) => { operations.push([method, ...args]); return query; };
    }
    query.then = (yes, no) => { const range = operations.find(([method]) => method === 'range'); return Promise.resolve({ data: range ? rows.slice(range[1], range[2]+1) : rows, error: fail ? new Error('Offline') : null }).then(yes, no); };
    return query;
  } };
  return { calls, api: loadModule('src/services/service-catalog.ts', {
    '@/lib/supabase': { supabase: disconnected ? null : supabase },
    '@/data/service-catalog': { fallbackServices: [{ id: 'sample', imageUrl: 'sample-photo' }], fallbackPortraitPackages: [] },
    '@/services/audit-log': {}, '@/services/catalog-events': {},
  }) };
}

test('Highlights retain the single narrow published-image query, valid filtering, order and three-card maximum', async () => {
  const { api, calls } = serviceHarness({ rows: [
    { id: 'no-image', name: 'Missing', slug: 'missing', image_url: null },
    { id: 'blank-image', name: 'Blank', slug: 'blank', image_url: '  ' },
    { id: 'blank-name', name: '  ', slug: 'blank', image_url: 'url' },
    { id: 'blank-slug', name: 'Blank', slug: '  ', image_url: 'url' },
    ...['first', 'second', 'third', 'fourth'].map((id) => ({ id, name: id, slug: id, image_url: ` https://example.com/${id}.jpg ` })),
  ] });
  const data = await api.getServiceHighlights();
  assert.deepEqual(Array.from(data, (item) => item.id), ['first', 'second', 'third']);
  assert.equal(data[0].imageUrl, 'https://example.com/first.jpg');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'services');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].operations)), [
    ['select', 'id, name, slug, image_url'], ['eq', 'is_active', true], ['is', 'archived_at', null],
    ['not', 'image_url', 'is', null], ['not', 'slug', 'is', null], ['neq', 'image_url', ''],
    ['order', 'created_at', { ascending: true }], ['order', 'id', { ascending: true }], ['range', 0, 11],
  ]);
});

test('Highlights empty reads stay empty and server failures never use catalog sample photos', async () => {
  assert.equal((await serviceHarness().api.getServiceHighlights()).length, 0);
  await assert.rejects(serviceHarness({ fail: true }).api.getServiceHighlights(), /Offline/);
  await assert.rejects(serviceHarness({ disconnected: true }).api.getServiceHighlights(), /not connected/);
});

test('Highlight reads skip invalid rows across pages and stop once three published photos are found', async () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `invalid${i}`, image_url: ' ', name: 'Invalid', slug: 'invalid' }));
  rows.push(...Array.from({ length: 30 }, (_, i) => ({ id: `valid${i}`, image_url: `url${i}`, name: 'Valid', slug: `valid${i}` })));
  const { api, calls } = serviceHarness({ rows });
  assert.deepEqual(Array.from(await api.getServiceHighlights(), row => row.id), ['valid0','valid1','valid2']);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(q => q.operations.find(([method]) => method === 'range').slice(1)), [[0,11],[12,23]]);
});

const jsx = (type, props, key) => ({ type, props, key });
function nodesIn(tree) {
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    if (typeof node.type === 'function') visit(node.type(node.props));
    else visit(node.props?.children);
  }
  visit(tree);
  return nodes;
}
const textIn = (nodes) => nodes.filter((node) => node.type === 'Text').map((node) => node.props.children).join(' ');
function homeHarness(cache) {
  const hook = hookHarness(cache), navigation = [];
  let notificationRetries = 0;
  const { HomeHighlights } = loadModule('src/components/home-highlights.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'expo-image': { Image: 'Image' },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' },
    '@/styles/responsive.styles': { responsiveStyles: {} },
  });
  const { default: Home } = loadModule('src/app/(client)/home.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-image': { Image: 'Image' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-router': { router: { push: (route) => navigation.push(route) } },
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 10 }) },
    'react-native-svg': { default: 'Svg', Path: 'Path' },
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-client-home-highlights': { useClientHomeHighlights: hook.render },
    '@/hooks/use-notification-unread-count': { useNotificationUnreadCount: () => ({ unreadCount: 2,
      error: 'Offline count', isRefreshing: false, refresh: async () => { notificationRetries++; } }) },
    '@/components/home-highlights': { HomeHighlights }, '@/styles/responsive.styles': { responsiveStyles: {} },
  });
  return { hook, render: () => nodesIn(Home()), navigation, notificationRetries: () => notificationRetries };
}
const highlightCards = (nodes) => nodes.filter((node) => node.type === 'Pressable' && node.props.accessibilityHint === 'Opens this service.');
const highlightRetry = (nodes) => nodes.find((node) => node.props.accessibilityLabel === 'Retry loading highlights');

test('Home shows initial placeholders once, then keeps cards through stale navigation and background refresh', async () => {
  let time = 0, reads = 0, result = photos();
  const cache = setup(async () => { reads++; return result; }, () => time);
  const home = homeHarness(cache);
  assert.ok(home.render().some((node) => node.props.accessibilityLabel === 'Loading highlights'));
  assert.equal(reads, 0);
  let leave = home.hook.focus();
  await flush();
  assert.equal(highlightCards(home.render()).length, 2);
  assert.equal(highlightRetry(home.render()), undefined);
  leave();
  home.render(); leave = home.hook.focus();
  await flush();
  assert.equal(reads, 1);
  leave(); time = 60_000;
  const slow = deferred(); result = slow.promise;
  home.render(); leave = home.hook.focus();
  await flush();
  assert.equal(reads, 2);
  assert.equal(highlightCards(home.render()).length, 2);
  assert.equal(home.render().some((node) => node.props.accessibilityLabel === 'Loading highlights'), false);
  slow.resolve([{ ...photo, imageUrl: 'https://example.com/changed.jpg' }]);
  await flush();
  assert.equal(highlightCards(home.render()).length, 1);
  assert.equal(home.render().find((node) => node.type === 'Image' && node.props.source?.uri).props.source.uri,
    'https://example.com/changed.jpg');
  leave();
});

test('Home separates initial errors from empty results, retains photos on failure, and retries highlights independently', async () => {
  let fail = true, result = [], reads = 0;
  const cache = setup(async () => { reads++; if (fail) throw new Error('Offline'); return result; });
  const home = homeHarness(cache);
  home.render(); const leave = home.hook.focus();
  await flush();
  assert.match(textIn(home.render()), /Could not load highlights/);
  assert.doesNotMatch(textIn(home.render()), /Studio highlights will appear/);
  assert.ok(highlightRetry(home.render()));
  fail = false;
  highlightRetry(home.render()).props.onPress();
  await flush();
  assert.match(textIn(home.render()), /Studio highlights will appear/);
  assert.equal(highlightRetry(home.render()), undefined);
  result = photos(); await cache.refresh(true);
  fail = true; await cache.refresh(true);
  assert.equal(highlightCards(home.render()).length, 2);
  assert.match(textIn(home.render()), /previously loaded photos/);
  const before = reads;
  home.render().find((node) => node.props.accessibilityLabel === 'Retry notification count').props.onPress();
  await flush();
  assert.equal(reads, before);
  assert.equal(home.notificationRetries(), 1);
  fail = false;
  highlightRetry(home.render()).props.onPress();
  await flush();
  assert.equal(reads, before + 1);
  assert.equal(home.notificationRetries(), 1);
  assert.equal(highlightRetry(home.render()), undefined);
  assert.doesNotMatch(textIn(home.render()), /Refresh highlights/);
  leave();
});

test('Home resolves current card slugs, preserves booking/bell navigation, and ignores removed or old-session cards', async () => {
  let result = photos();
  const cache = setup(async () => result);
  await cache.refresh();
  const home = homeHarness(cache);
  const oldCard = highlightCards(home.render())[0];
  result = [{ ...photo, slug: 'updated-portrait' }];
  await cache.refresh(true);
  oldCard.props.onPress();
  assert.equal(home.navigation[0].pathname, '/services/[slug]');
  assert.equal(home.navigation[0].params.slug, 'updated-portrait');
  cache.invalidate({ entity: 'service', id: 's1', isActive: false });
  oldCard.props.onPress();
  assert.equal(home.navigation.length, 1);
  result = photos(); await cache.refresh();
  const previousSessionCard = highlightCards(home.render())[0];
  cache.setAccount(null); cache.setAccount('client-a');
  await cache.refresh();
  previousSessionCard.props.onPress();
  assert.equal(home.navigation.length, 1);
  home.render().find((node) => node.type === 'Pressable' && textIn(nodesIn(node)).includes('Book a session')).props.onPress();
  home.render().find((node) => node.props.accessibilityLabel === 'Open notifications, 2 unread').props.onPress();
  assert.deepEqual(home.navigation.slice(1), ['/services', '/notifications']);
  cache.setAccount(null);
  assert.equal(highlightCards(home.render()).length, 0);
});

test('The highlights retry is disabled while a retry is pending, with retained images still visible', () => {
  const { HomeHighlights } = loadModule('src/components/home-highlights.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'expo-image': { Image: 'Image' },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' },
    '@/styles/responsive.styles': { responsiveStyles: {} },
  });
  const nodes = nodesIn(HomeHighlights({ items: photos(), isLoading: false, isRefreshing: true,
    error: 'Offline', onRetry() {}, onSelect() {} }));
  assert.equal(highlightRetry(nodes).props.disabled, true);
  assert.equal(highlightCards(nodes).length, 2);
  assert.ok(nodes.some((node) => node.props.accessibilityRole === 'alert'));
});
