const { sharedReadImports } = require('./session-read-test-support.cjs');
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
    if (name.endsWith('.png')) return name;
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Date, Promise, Map, Set, Error });
  return exports;
}
const { createAdminStudioSettingsCache: createCache } = loadModule('src/services/admin-studio-settings-cache.ts');
const settings = (studioName = 'Studio') => ({ studioName, studioAddress: 'Address', contactEmail: 'admin@example.com',
  contactPhone: '09123456789', defaultShootLocation: 'Studio', businessHours: 'Mon-Sat, 8:00 AM - 5:00 PM',
  workingStartTime: '08:00:00', workingEndTime: '17:00:00' });
const accepted = async (values) => ({ success: true, settings: values });
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('Profile revisits share saved settings for 60 seconds; pulling bypasses freshness', async () => {
  let time = 0;
  let calls = 0;
  const cache = createCache(async () => { calls++; return settings(); }, accepted, () => time);
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

test('Focus, resume and repeated pulls share one fetch and keep cached settings visible', async () => {
  const read = deferred();
  let calls = 0;
  const cache = createCache(() => ++calls === 1 ? Promise.resolve(settings()) : read.promise, accepted);
  cache.setAccount('admin-a');
  await cache.refresh();
  const request = cache.refresh(true);
  assert.equal(cache.refresh(true), request);
  assert.equal(cache.refresh(), request);
  assert.equal(cache.getSnapshot().data.studioName, 'Studio');
  await flush();
  assert.equal(calls, 2);
  read.resolve(settings('Updated'));
  await request;
  assert.equal(cache.getSnapshot().isFetching, false);
});

test('Failed reads retain saved settings; initial failure stays an error and can retry', async () => {
  let fail = false;
  const cache = createCache(async () => { if (fail) throw new Error('Offline'); return settings(); }, accepted);
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

test('Confirmed saves update the cache after navigation without a follow-up fetch', async () => {
  let calls = 0;
  const write = deferred();
  const cache = createCache(async () => { calls++; return settings(); }, () => write.promise);
  cache.setAccount('admin-a');
  await cache.refresh();
  const request = cache.save(settings('Draft'));
  assert.equal(cache.getSnapshot().isSaving, true);
  write.resolve({ success: true, settings: settings('Confirmed') });
  await request;
  assert.equal(cache.getSnapshot().data.studioName, 'Confirmed');
  assert.equal(cache.getSnapshot().isSaving, false);
  await cache.refresh();
  assert.equal(calls, 1);
});

test('Reads that finish after a confirmed save cannot undo it or introduce an obsolete error', async () => {
  for (const failure of [false, true]) {
    const read = deferred();
    let calls = 0;
    const cache = createCache(() => ++calls === 1 ? Promise.resolve(settings()) : read.promise, accepted);
    cache.setAccount('admin-a');
    await cache.refresh();
    const request = cache.refresh(true);
    await flush();
    await cache.save(settings('Saved'));
    if (failure) read.reject(new Error('Old read failed')); else read.resolve(settings('Obsolete'));
    await request;
    assert.equal(cache.getSnapshot().data.studioName, 'Saved');
    assert.equal(cache.getSnapshot().error, null);
    assert.equal(cache.getSnapshot().isFetching, false);
    await cache.refresh();
    assert.equal(calls, 2);
  }
});

test('Failed or throwing saves preserve the cache, stop the saving state, and allow retry', async () => {
  for (const throws of [false, true]) {
    let fail = true;
    const cache = createCache(async () => settings(), async (values) => {
      if (!fail) return accepted(values);
      if (throws) throw new Error('Offline');
      return { success: false, message: 'Permission denied' };
    });
    cache.setAccount('admin-a');
    await cache.refresh();
    assert.equal((await cache.save(settings('Draft'))).success, false);
    assert.equal(cache.getSnapshot().data.studioName, 'Studio');
    assert.equal(cache.getSnapshot().isSaving, false);
    fail = false;
    assert.equal((await cache.save(settings('Saved'))).success, true);
  }
});

test('Saves require a loaded session and reject concurrent writes', async () => {
  let calls = 0;
  const write = deferred();
  const cache = createCache(async () => settings(), () => { calls++; return write.promise; });
  assert.equal((await cache.save(settings())).success, false);
  cache.setAccount('admin-a');
  assert.equal((await cache.save(settings())).success, false);
  await cache.refresh();
  const request = cache.save(settings('First'));
  assert.equal((await cache.save(settings('Second'))).success, false);
  assert.equal(calls, 1);
  write.resolve({ success: true, settings: settings('First') });
  await request;
});

test('Render never starts work and logout cancels queued reads and writes', async () => {
  let reads = 0;
  let writes = 0;
  const cache = createCache(async () => { reads++; return settings(); }, async (values) => { writes++; return accepted(values); });
  cache.getSnapshot();
  await cache.refresh();
  assert.equal(reads, 0);
  cache.setAccount('admin-a');
  const request = cache.refresh();
  cache.setAccount(null);
  await request;
  assert.equal(reads, 0);
  cache.setAccount('admin-a');
  await cache.refresh();
  const write = cache.save(settings());
  cache.setAccount(null);
  assert.equal((await write).success, false);
  assert.equal(writes, 0);
  assert.equal(cache.getSnapshot().data, null);
  assert.equal(cache.getServerSnapshot().data, null);
});

test('Old reads and saves cannot enter a new session or stop its pending work', async () => {
  const oldRead = deferred();
  const newRead = deferred();
  const oldWrite = deferred();
  const newWrite = deferred();
  let reads = 0;
  let writes = 0;
  const cache = createCache(() => ++reads === 1 ? Promise.resolve(settings()) : reads === 2 ? oldRead.promise : newRead.promise,
    () => ++writes === 1 ? oldWrite.promise : newWrite.promise);
  cache.setAccount('admin-a');
  await cache.refresh();
  const firstKey = cache.getSnapshot().sessionKey;
  const oldRequest = cache.refresh(true);
  const oldSave = cache.save(settings('Old save'));
  await flush();
  cache.setAccount(null);
  cache.setAccount('admin-a');
  assert.notEqual(cache.getSnapshot().sessionKey, firstKey, 'Same-account re-login also resets drafts');
  const newRequest = cache.refresh();
  await flush();
  oldRead.resolve(settings('Old read'));
  await oldRequest;
  assert.equal(cache.getSnapshot().data, null);
  assert.equal(cache.getSnapshot().isFetching, true);
  newRead.resolve(settings('New session'));
  await newRequest;
  const newSave = cache.save(settings('New save'));
  await flush();
  oldWrite.resolve({ success: true, settings: settings('Old save') });
  assert.equal((await oldSave).success, false);
  assert.equal(cache.getSnapshot().data.studioName, 'New session');
  assert.equal(cache.getSnapshot().isSaving, true);
  newWrite.resolve({ success: true, settings: settings('New save') });
  await newSave;
  assert.equal(cache.getSnapshot().data.studioName, 'New save');
});

test('The singleton uses strict reads, retains data on token refresh, and clears it on sign-out', async () => {
  let auth;
  let reads = 0;
  const { adminStudioSettingsStore: store } = loadModule('src/services/admin-studio-settings-store.ts', {
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => { auth = callback; } } } },
    '@/services/admin-studio-settings-cache': { createAdminStudioSettingsCache: createCache },
    '@/services/studio-settings': { getStudioSettings: async (options) => {
      assert.equal(options.throwOnError, true); assert.equal(options.force, true); reads++; return settings();
    }, saveStudioSettings: accepted },
  });
  auth('INITIAL_SESSION', { user: { id: 'admin-a' } });
  await store.refresh();
  const snapshot = store.getSnapshot();
  auth('TOKEN_REFRESHED', { user: { id: 'admin-a' } });
  assert.equal(store.getSnapshot(), snapshot);
  await store.refresh();
  assert.equal(reads, 1);
  await store.save(settings('Saved while screen absent'));
  assert.equal(store.getSnapshot().data.studioName, 'Saved while screen absent');
  auth('SIGNED_OUT', null);
  assert.equal(store.getSnapshot().data, null);
});

test('The hook displays cached settings immediately and fetches only from focus, active resume or pull', async () => {
  let focus;
  let appChange;
  let removed = 0;
  const calls = [];
  const { useAdminStudioSettings } = loadModule('src/hooks/use-admin-studio-settings.ts', {
    react: { useCallback: (callback) => callback, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_event, callback) => {
      appChange = callback; return { remove: () => removed++ };
    } } },
    '@/services/admin-studio-settings-store': { adminStudioSettingsStore: {
      getSnapshot: () => ({ accountId: 'admin-a', sessionKey: 1, isSessionReady: true, data: settings(), error: null, isFetching: false, isSaving: false }),
      refresh: async (force = false) => { calls.push(force); }, save: accepted,
    } },
  });
  const result = useAdminStudioSettings();
  assert.equal(result.isLoading, false);
  assert.equal(result.settings.studioName, 'Studio');
  assert.equal(calls.length, 0);
  const cleanup = focus();
  appChange('background');
  appChange('active');
  await result.refresh();
  assert.deepEqual(calls, [false, false, true]);
  cleanup();
  assert.equal(removed, 1);
});

function screenHarness(initialStudio, auth = {}) {
  let studio = initialStudio;
  let states = [];
  let index = 0;
  let key;
  let updates = 0;
  const routes = [];
  const mounted = { current: true };
  const jsx = (type, props, key) => ({ type, props, key });
  const settingsApi = loadModule('src/services/studio-settings.ts', {
    ...sharedReadImports(null), '@/lib/supabase': { supabase: null }, '@/services/calendar-events': { subscribeToCalendarChanged: () => () => {} },
  });
  const { default: Screen } = loadModule('src/app/photographer/profile.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: (initial) => {
      const stateIndex = index++;
      if (!(stateIndex in states)) states[stateIndex] = typeof initial === 'function' ? initial() : initial;
      return [states[stateIndex], (value) => { updates++; states[stateIndex] = typeof value === 'function' ? value(states[stateIndex]) : value; }];
    } },
    'expo-image': { Image: 'Image' }, 'expo-router': { router: { replace: (route) => routes.push(route) } }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Modal: 'Modal', Pressable: 'Pressable',
      ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', useWindowDimensions: () => ({ width: 390 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }, 'react-native-svg': {},
    '@/components/logout-confirmation-modal': { LogoutConfirmationModal: 'LogoutConfirmationModal' },
    '@/components/admin-brand-header': {}, '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-mounted-ref': { useMountedRef: () => mounted },
    '@/hooks/use-admin-studio-settings': { useAdminStudioSettings: () => studio },
    '@/services/auth': { signOutPhotoSync: async () => {}, ...auth },
    '@/services/studio-settings': settingsApi, '@/styles/photographer.styles': { photographerStyles: {} },
  });
  function render() {
    const wrapper = Screen();
    if (key !== wrapper.key) { states = []; key = wrapper.key; }
    index = 0;
    const tree = wrapper.type(wrapper.props);
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node);
      visit(node.props?.children);
    }
    visit(tree);
    return { nodes, wrapper };
  }
  return { render, setStudio: (value) => { studio = value; }, mounted, routes, updateCount: () => updates };
}
const ready = () => ({ accountId: 'admin-a', sessionKey: 1, settings: settings(), error: null,
  isLoading: false, isRefreshing: false, isSaving: false, refresh: async () => {}, save: accepted });
const field = (nodes, label) => nodes.find((node) => node.props?.label === label);
const saveButton = (nodes) => nodes.find((node) => node.props?.accessibilityLabel === 'Save studio settings');
const text = (nodes) => nodes.filter((node) => node.type === 'Text').map((node) => node.props.children).join(' ');

test('Background updates and pulls keep typed fields while unedited fields receive newer data', async () => {
  let pulls = 0;
  const studio = { ...ready(), refresh: async () => pulls++ };
  const harness = screenHarness(studio);
  let { nodes } = harness.render();
  field(nodes, 'Studio Name').props.onChangeText('Unsaved name');
  harness.setStudio({ ...studio, settings: { ...settings('Server name'), contactPhone: 'New number' }, isRefreshing: true });
  ({ nodes } = harness.render());
  assert.equal(field(nodes, 'Studio Name').props.value, 'Unsaved name');
  assert.equal(field(nodes, 'Contact Number').props.value, 'New number');
  assert.doesNotMatch(text(nodes), /Loading studio/);
  const scroll = nodes.find((node) => node.type === 'ScrollView');
  assert.equal(scroll.props.refreshControl.props.refreshing, true);
  scroll.props.refreshControl.props.onRefresh();
  await flush();
  assert.equal(pulls, 1);
  assert.equal(field(harness.render().nodes, 'Studio Name').props.value, 'Unsaved name');
});

test('Initial loading/errors cannot save placeholder settings and still allow logout', async () => {
  let writes = 0;
  for (const error of [null, 'Could not load studio information. Pull down to try again.']) {
    const harness = screenHarness({ ...ready(), settings: null, error, isLoading: !error, save: async () => { writes++; } });
    const { nodes } = harness.render();
    assert.equal(field(nodes, 'Studio Name'), undefined);
    assert.equal(saveButton(nodes).props.disabled, true);
    await saveButton(nodes).props.onPress();
    assert.equal(nodes.find((node) => node.props?.accessibilityLabel === 'Log out').props.disabled, false);
    assert.match(text(nodes), error ? /Could not load/ : /Loading studio/);
  }
  assert.equal(writes, 0);
});

test('Unchanged values and invalid working hours avoid writes', async () => {
  let writes = 0;
  const harness = screenHarness({ ...ready(), save: async () => { writes++; } });
  let { nodes } = harness.render();
  field(nodes, 'Studio Name').props.onChangeText(' Studio ');
  ({ nodes } = harness.render());
  await saveButton(nodes).props.onPress();
  assert.match(text(harness.render().nodes), /No changes to save/);
  nodes.find((node) => node.type?.name === 'BusinessHoursInput').props.onChangeEndTime('7:00 AM');
  await saveButton(harness.render().nodes).props.onPress();
  assert.match(text(harness.render().nodes), /End time must be later/);
  assert.equal(writes, 0);
});

test('Failed saves preserve the draft and a successful retry displays the confirmed database values', async () => {
  let fail = true;
  const studio = ready();
  const harness = screenHarness({ ...studio, save: async (values) => {
    if (fail) return { success: false, message: 'Offline' };
    const confirmed = { ...values, studioName: 'Database name' };
    harness.setStudio({ ...studio, settings: confirmed });
    return { success: true, settings: confirmed };
  } });
  field(harness.render().nodes, 'Studio Name').props.onChangeText('Draft');
  await saveButton(harness.render().nodes).props.onPress();
  let { nodes } = harness.render();
  assert.equal(field(nodes, 'Studio Name').props.value, 'Draft');
  assert.match(text(nodes), /Studio settings not saved/);
  fail = false;
  await saveButton(nodes).props.onPress();
  ({ nodes } = harness.render());
  assert.equal(field(nodes, 'Studio Name').props.value, 'Database name');
  assert.match(text(nodes), /Studio settings saved/);
});

test('Pending saves disable the form; session changes reset draft fields and open notices', async () => {
  const studio = ready();
  const harness = screenHarness(studio);
  field(harness.render().nodes, 'Studio Name').props.onChangeText('Draft');
  harness.setStudio({ ...studio, isSaving: true });
  let { nodes, wrapper } = harness.render();
  assert.equal(field(nodes, 'Studio Name').props.editable, false);
  assert.equal(saveButton(nodes).props.disabled, true);
  field(nodes, 'Studio Name').props.onChangeText('Must not replace draft');
  assert.equal(field(harness.render().nodes, 'Studio Name').props.value, 'Draft');
  harness.setStudio({ ...studio, sessionKey: 3, settings: settings('New session') });
  const next = harness.render();
  assert.notEqual(next.wrapper.key, wrapper.key);
  assert.equal(field(next.nodes, 'Studio Name').props.value, 'New session');
  assert.equal(next.nodes.find((node) => node.type === 'Modal').props.visible, false);
});

test('Save and logout completions after navigation do not update unmounted UI', async () => {
  for (const action of ['save', 'logout']) {
    const pending = deferred();
    const harness = screenHarness({ ...ready(), save: () => pending.promise }, { signOutPhotoSync: () => pending.promise });
    field(harness.render().nodes, 'Studio Name').props.onChangeText('Draft');
    const { nodes } = harness.render();
    const request = action === 'save' ? saveButton(nodes).props.onPress()
      : nodes.find((node) => node.type === 'LogoutConfirmationModal').props.onConfirm();
    const before = harness.updateCount();
    harness.mounted.current = false;
    pending.resolve({ success: true, settings: settings('Saved') });
    await request;
    assert.equal(harness.updateCount(), before);
    assert.deepEqual(harness.routes, []);
  }
});

test('Admin logout leaves navigation to the root guard; failures allow retry', async () => {
  let fail = true;
  const harness = screenHarness(ready(), { signOutPhotoSync: async () => {
    if (fail) throw new Error('Network error');
  } });
  const confirm = () => harness.render().nodes.find((node) => node.type === 'LogoutConfirmationModal').props.onConfirm();
  await confirm();
  assert.deepEqual(harness.routes, []);
  assert.match(text(harness.render().nodes), /Could not sign out/);
  assert.equal(harness.render().nodes.find((node) => node.type === 'LogoutConfirmationModal').props.isLoading, false);
  fail = false;
  await confirm();
  assert.deepEqual(harness.routes, []);
});
