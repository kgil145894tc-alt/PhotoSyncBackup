const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => {
    if (name.endsWith('.png')) return name;
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Date, Promise, Set, Error, ...globals });
  return exports;
}
const { createClientProfileCache: createCache } = loadModule('src/services/client-profile-cache.ts');
const profile = (fullName = 'Client', changes = {}) => ({ avatarUrl: 'https://example.com/avatar.png',
  email: 'client@example.com', fullName, phone: '09123456789', role: 'client', username: 'client', ...changes });
const form = (fullName = 'Draft') => ({ avatarUrl: null, fullName, phone: '09123456789', username: 'client' });
const accepted = async (values) => ({ success: true, profile: profile(values.fullName) });
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(load = async () => profile(), persist = accepted, now) {
  const cache = createCache({ load, persist }, now);
  cache.setAccount('client-a');
  return cache;
}

test('Profile and Edit Profile reuse one snapshot for 60 seconds; pulls force a read', async () => {
  let time = 0, reads = 0;
  const cache = setup(async () => { reads++; return profile(); }, accepted, () => time);
  await cache.refresh();
  const original = cache.getSnapshot().data;
  time = 59_999;
  await cache.refresh();
  assert.equal(reads, 1);
  assert.equal(cache.getSnapshot().data, original);
  time = 60_000;
  await cache.refresh();
  await cache.refresh(true);
  assert.equal(reads, 3);
});

test('Concurrent focus, resume and pulls share a read and keep known details visible', async () => {
  const read = deferred();
  let reads = 0;
  const cache = setup(() => ++reads === 1 ? Promise.resolve(profile()) : read.promise);
  await cache.refresh();
  const pending = cache.refresh(true);
  assert.equal(cache.refresh(), pending);
  assert.equal(cache.refresh(true), pending);
  assert.equal(cache.getSnapshot().data.fullName, 'Client');
  assert.equal(cache.getSnapshot().isFetching, true);
  read.resolve(profile('Updated'));
  await pending;
  assert.equal(reads, 2);
  assert.equal(cache.getSnapshot().isFetching, false);
});

test('Failed reads retain known details; an initial failure or null result stays retryable', async () => {
  let fail = false;
  const cache = setup(async () => { if (fail) throw new Error('Offline'); return profile(); });
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
  const empty = setup(async () => null);
  await empty.refresh();
  assert.match(empty.getSnapshot().error, /Could not load/);
  assert.equal(empty.getSnapshot().isFetching, false);
});

test('Saves cache the returned database row and do not issue a follow-up read', async () => {
  let reads = 0;
  const write = deferred();
  const cache = setup(async () => { reads++; return profile(); }, () => write.promise);
  await cache.refresh();
  const pending = cache.save(form());
  assert.equal(cache.getSnapshot().isSaving, true);
  write.resolve({ success: true, profile: profile('Database name') });
  await pending;
  assert.equal(cache.getSnapshot().data.fullName, 'Database name');
  assert.equal(cache.getSnapshot().isSaving, false);
  await cache.refresh();
  assert.equal(reads, 1);
});

test('Reads started before a save cannot undo its confirmed row or publish an obsolete error', async () => {
  for (const fail of [false, true]) {
    const read = deferred();
    let reads = 0;
    const cache = setup(() => ++reads === 1 ? Promise.resolve(profile()) : read.promise);
    await cache.refresh();
    const pending = cache.refresh(true);
    await flush();
    await cache.save(form('Saved'));
    if (fail) read.reject(new Error('Old read failed')); else read.resolve(profile('Obsolete'));
    await pending;
    assert.equal(cache.getSnapshot().data.fullName, 'Saved');
    assert.equal(cache.getSnapshot().error, null);
    await cache.refresh();
    assert.equal(reads, 2);
  }
});

test('Failed saves preserve details; confirmed database writes survive later metadata failures', async () => {
  for (const throws of [false, true]) {
    let fail = true;
    const cache = setup(async () => profile(), async (values) => {
      if (!fail) return accepted(values);
      if (throws) throw new Error('Offline');
      return { success: false, message: 'Username taken' };
    });
    await cache.refresh();
    assert.equal((await cache.save(form())).success, false);
    assert.equal(cache.getSnapshot().data.fullName, 'Client');
    assert.equal(cache.getSnapshot().isSaving, false);
    fail = false;
    assert.equal((await cache.save(form('Saved'))).success, true);
  }
  const partial = setup(async () => profile(), async () => ({ success: false, profile: profile('Saved'), message: 'Metadata failed' }));
  await partial.refresh();
  assert.equal((await partial.save(form())).success, false);
  assert.equal(partial.getSnapshot().data.fullName, 'Saved');
});

test('No work starts during render; logout cancels queued work before API calls', async () => {
  let reads = 0, writes = 0;
  const cache = createCache({ load: async () => { reads++; return profile(); },
    persist: async (values) => { writes++; return accepted(values); } });
  cache.getSnapshot();
  await cache.refresh();
  assert.equal(reads, 0);
  cache.setAccount('client-a');
  const read = cache.refresh();
  cache.setAccount(null);
  await read;
  assert.equal(reads, 0);
  cache.setAccount('client-a');
  await cache.refresh();
  const write = cache.save(form());
  cache.setAccount(null);
  assert.equal((await write).success, false);
  assert.equal(writes, 0);
  assert.equal(cache.getSnapshot().data, null);
  assert.equal(cache.getServerSnapshot().data, null);
});

test('Old reads and writes cannot enter a new session or stop its pending request', async () => {
  const oldRead = deferred(), oldWrite = deferred(), newRead = deferred();
  let reads = 0;
  const cache = setup(() => ++reads === 1 ? Promise.resolve(profile()) : reads === 2 ? oldRead.promise : newRead.promise,
    () => oldWrite.promise);
  await cache.refresh();
  const firstKey = cache.getSnapshot().sessionKey;
  const read = cache.refresh(true);
  await flush();
  const write = cache.save(form());
  await flush();
  cache.setAccount(null);
  cache.setAccount('client-a');
  assert.notEqual(cache.getSnapshot().sessionKey, firstKey);
  const next = cache.refresh();
  await flush();
  oldRead.resolve(profile('Old read'));
  oldWrite.resolve({ success: true, profile: profile('Old write') });
  await Promise.all([read, write]);
  assert.equal(cache.getSnapshot().data, null);
  assert.equal(cache.getSnapshot().isFetching, true);
  newRead.resolve(profile('New session'));
  await next;
  assert.equal(cache.getSnapshot().data.fullName, 'New session');
  const snapshot = cache.getSnapshot();
  cache.setAccount('client-a');
  assert.equal(cache.getSnapshot(), snapshot, 'Same-account token refresh preserves the cache');
});

test('Saves require a loaded account and reject duplicates; reads pause during a save', async () => {
  const write = deferred();
  let reads = 0, writes = 0;
  const cache = setup(async () => { reads++; return profile(); }, () => { writes++; return write.promise; });
  assert.equal((await cache.save(form())).success, false);
  await cache.refresh();
  const pending = cache.save(form());
  assert.equal((await cache.save(form())).success, false);
  await cache.refresh(true);
  await flush();
  assert.equal(reads, 1);
  assert.equal(writes, 1);
  write.resolve({ success: true, profile: profile('Saved') });
  await pending;
});

test('A refresh queued immediately before a save finishes its loading state and permits later reads', async () => {
  const write = deferred();
  let reads = 0;
  const cache = setup(async () => { reads++; return profile(); }, () => write.promise);
  await cache.refresh();
  const queuedRead = cache.refresh(true);
  const pendingWrite = cache.save(form());
  await queuedRead;
  assert.equal(reads, 1, 'The queued read waits for the write instead of racing it');
  assert.equal(cache.getSnapshot().isFetching, false);
  write.resolve({ success: true, profile: profile('Saved') });
  await pendingWrite;
  await cache.refresh(true);
  assert.equal(reads, 2, 'A skipped request must not stay cached as pending');
  assert.equal(cache.getSnapshot().isFetching, false);
});

function serviceSetup(overrides = {}) {
  const state = { user: { id: 'client-a', email: 'client@example.com', user_metadata: { full_name: 'Metadata name', username: 'metadata' } },
    userError: null, readError: null, roleError: null, writeError: null, metadataError: null,
    row: { avatar_url: 'avatar', email: 'client@example.com', full_name: 'Database name', phone: '0987', role: 'admin', username: 'database' },
    role: 'admin', calls: [], ...overrides };
  const supabase = { auth: {
    getUser: async () => { state.calls.push(['user']); return state.getUser ? state.getUser() : { data: { user: state.user }, error: state.userError }; },
    updateUser: async (values) => { state.calls.push(['metadata', values]);
      if (state.updateUser) return state.updateUser(values);
      return { error: state.metadataError }; },
  }, from: (table) => {
    let columns, write = false;
    const query = {
      select: (value) => { columns = value; return query; },
      eq: (field, value) => { state.calls.push(['eq', field, value]); return query; },
      maybeSingle: async () => {
        state.calls.push(['read', columns]);
        if (columns === 'role') return state.readRole ? state.readRole() : { data: { role: state.role }, error: state.roleError };
        return state.read ? state.read() : { data: state.row, error: state.readError };
      },
      upsert: (values) => { write = true; state.calls.push(['write', table, values]); return query; },
      single: async () => {
        assert.equal(write, true);
        state.calls.push(['returned', columns]);
        return state.persist ? state.persist() : { data: state.row, error: state.writeError };
      },
    };
    return query;
  }, storage: { from: () => ({
    upload: async (key) => { state.calls.push(['upload', key]); return state.upload ? state.upload() : { error: null }; },
    getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/uploaded.png' } }),
  }) } };
  const api = loadModule('src/services/profile.ts', { '@/lib/supabase': { supabase } }, {
    fetch: async () => ({ blob: state.blob ?? (async () => 'image-bytes') }),
  });
  return { state, api, supabase };
}

test('Strict cache reads report database/auth errors instead of editable fallback details', async () => {
  const { state, api } = serviceSetup({ readError: { message: 'Offline' } });
  await assert.rejects(api.getMyProfile({ throwOnError: true }), /Offline/);
  assert.equal((await api.getMyProfile()).fullName, 'Metadata name', 'Booking information keeps its existing fallback');
  state.readError = null;
  state.userError = { message: 'Session check failed' };
  await assert.rejects(api.getMyProfile({ throwOnError: true }), /Session check failed/);
  state.userError = null;
  state.user = null;
  await assert.rejects(api.getMyProfile({ throwOnError: true }), /sign in again/);
  const offline = loadModule('src/services/profile.ts', { '@/lib/supabase': { supabase: null } });
  await assert.rejects(offline.getMyProfile({ throwOnError: true }), /not connected/);
});

test('A genuinely missing profile retains account-based setup defaults', async () => {
  const { api } = serviceSetup({ row: null });
  const result = await api.getMyProfile({ throwOnError: true });
  assert.equal(result.fullName, 'Metadata name');
  assert.equal(result.phone, '');
});

test('Saving returns the authoritative row, preserves role, and syncs confirmed metadata', async () => {
  const { state, api } = serviceSetup();
  const result = await api.updateMyProfile({ ...form(' Draft '), username: ' CLIENT ', phone: ' 0123 ' });
  assert.equal(result.success, true);
  assert.equal(result.profile.fullName, 'Database name');
  assert.equal(result.profile.phone, '0987');
  const write = state.calls.find((call) => call[0] === 'write')[2];
  assert.equal(write.role, 'admin');
  assert.equal(write.full_name, 'Draft');
  assert.equal(write.username, 'client');
  assert.equal(write.phone, '0123');
  assert.equal(state.calls.filter((call) => call[0] === 'read').length, 1);
  assert.match(state.calls.find((call) => call[0] === 'returned')[1], /avatar_url.*username/);
  assert.equal(state.calls.find((call) => call[0] === 'metadata')[1].data.full_name, 'Database name');
});

test('A failed role check cannot downgrade the account or write a profile', async () => {
  const { state, api } = serviceSetup({ roleError: { message: 'Offline' } });
  assert.equal((await api.updateMyProfile(form())).success, false);
  assert.equal(state.calls.filter((call) => call[0] === 'write').length, 0);
});

test('Write failures retain existing data; metadata failure keeps the confirmed row and explains partial success', async () => {
  const { state, api } = serviceSetup({ writeError: { code: '23505', message: 'Duplicate username' } });
  const refused = await api.updateMyProfile(form());
  assert.equal(refused.success, false);
  assert.equal(refused.profile, undefined);
  assert.match(refused.message, /already taken/);
  assert.equal(state.calls.filter((call) => call[0] === 'metadata').length, 0);
  state.writeError = null;
  state.metadataError = { message: 'Offline' };
  const partial = await api.updateMyProfile(form());
  assert.equal(partial.success, false);
  assert.equal(partial.profile.fullName, 'Database name');
  assert.match(partial.message, /profile was saved.*could not be synced/);
  state.updateUser = async () => { throw new Error('Offline'); };
  assert.equal((await api.updateMyProfile(form())).profile.fullName, 'Database name');
});

test('Expected-account and session guards stop reads/writes after awaited authentication or role checks', async () => {
  for (const stage of ['user', 'role', 'write']) {
    let current = true;
    const waiting = deferred();
    const { state, api } = serviceSetup(stage === 'user' ? { getUser: () => waiting.promise }
      : stage === 'role' ? { readRole: () => waiting.promise } : { persist: () => waiting.promise });
    const request = api.updateMyProfile(form(), { expectedAccountId: 'client-a', isSessionCurrent: () => current });
    await flush();
    current = false;
    waiting.resolve(stage === 'user' ? { data: { user: state.user }, error: null }
      : { data: stage === 'role' ? { role: 'admin' } : state.row, error: null });
    assert.equal((await request).success, false);
    assert.equal(state.calls.filter((call) => call[0] === 'write').length, stage === 'write' ? 1 : 0);
    assert.equal(state.calls.filter((call) => call[0] === 'metadata').length, 0);
  }
  const { state, api } = serviceSetup();
  const options = { expectedAccountId: 'client-b', isSessionCurrent: () => true, throwOnError: true };
  await assert.rejects(api.getMyProfile(options), /session changed/);
  assert.equal((await api.updateMyProfile(form(), options)).success, false);
  assert.equal(state.calls.filter((call) => call[0] === 'read').length, 0);
});

test('Avatar and password operations cannot start a later write in a changed session', async () => {
  let current = true;
  const blob = deferred();
  const { state, api } = serviceSetup({ blob: () => blob.promise });
  const options = { expectedAccountId: 'client-a', isSessionCurrent: () => current };
  const pending = api.uploadProfileAvatar({ uri: 'local-image', fileName: 'photo.png' }, options);
  await flush();
  current = false;
  blob.resolve('image');
  assert.equal((await pending).success, false);
  assert.equal(state.calls.filter((call) => call[0] === 'upload').length, 0);
  assert.equal((await api.updateMyPassword('password', options)).success, false);
  current = true;
  const uploaded = await api.uploadProfileAvatar({ uri: 'image', fileName: 'photo.png' }, options);
  assert.equal(uploaded.success, true);
  assert.match(state.calls.find((call) => call[0] === 'upload')[1], /^client-a\/.*\.png$/);
  state.user.id = 'client-b';
  assert.equal((await api.updateMyPassword('password', options)).success, false);
  assert.equal(state.calls.filter((call) => call[0] === 'metadata').length, 0);
});

test('The store initializes from auth events, keeps token refreshes, and clears account changes', async () => {
  let authChange, loads = 0;
  const { clientProfileStore: store } = loadModule('src/services/client-profile-store.ts', {
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => { authChange = callback; } } } },
    '@/services/client-profile-cache': { createClientProfileCache: createCache },
    '@/services/profile': { getMyProfile: async (options) => {
      assert.equal(options.throwOnError, true); assert.equal(options.expectedAccountId, 'client-a');
      assert.equal(options.isSessionCurrent(), true); loads++; return profile();
    }, updateMyProfile: accepted },
  });
  authChange('INITIAL_SESSION', { user: { id: 'client-a' } });
  assert.equal(loads, 0, 'Auth callbacks never fetch');
  await store.refresh();
  const snapshot = store.getSnapshot();
  authChange('TOKEN_REFRESHED', { user: { id: 'client-a' } });
  assert.equal(store.getSnapshot(), snapshot);
  authChange('SIGNED_OUT', null);
  assert.equal(store.getSnapshot().data, null);
  authChange('SIGNED_IN', { user: { id: 'client-b' } });
  assert.equal(store.getSnapshot().data, null);
});

test('The hook fetches only after focus and stale resume; blurred and old-session handlers do nothing', async () => {
  let time = 0, reads = 0, focus, appChange;
  const cache = setup(async () => { reads++; return profile(); }, accepted, () => time);
  const { useClientProfile } = loadModule('src/hooks/use-client-profile.ts', {
    'react': { useCallback: (callback) => callback, useSyncExternalStore: (_subscribe, get) => get() },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_event, callback) => { appChange = callback;
      return { remove: () => { appChange = undefined; } }; } } },
    '@/services/client-profile-store': { clientProfileStore: cache },
  });
  const initial = useClientProfile();
  assert.equal(initial.isLoading, true);
  assert.equal(reads, 0);
  const cleanup = focus();
  await flush();
  const readyState = useClientProfile();
  assert.equal(readyState.isLoading, false);
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
  await readyState.refresh();
  assert.equal(reads, 3);
  cleanup();
  assert.equal(appChange, undefined);
  cache.setAccount('client-b');
  await readyState.refresh();
  assert.equal((await readyState.save(form())).success, false);
  assert.equal(reads, 3);
});

const jsx = (type, props, key) => ({ type, props, key });
function nodesIn(tree) {
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node); visit(node.props?.children);
  }
  visit(tree);
  return nodes;
}
function editorHarness(options = {}) {
  let state = { accountId: 'client-a', sessionKey: 1, profile: profile(), error: null,
    isLoading: false, isRefreshing: false, isSaving: false,
    refresh: async () => {}, save: accepted, ...options.state };
  let states = [], index = 0, key, updates = 0, mounted = { current: true };
  const alerts = [], routes = [], calls = [];
  const { default: Screen } = loadModule('src/app/(client)/profile/edit.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: (initial) => {
      const at = index++;
      if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial;
      return [states[at], (value) => { updates++; states[at] = typeof value === 'function' ? value(states[at]) : value; }];
    }, useRef: (initial) => { const at = index++; return states[at] ?? (states[at] = { current: initial }); } },
    'expo-router': { router: { back: () => routes.push('back') } },
    'react-native': { RefreshControl: 'RefreshControl' },
    'expo-image-picker': {
      requestMediaLibraryPermissionsAsync: options.permission ?? (async () => ({ granted: true })),
      launchImageLibraryAsync: options.picker ?? (async () => ({ canceled: false, assets: [{ uri: 'picked-image', fileName: 'photo.png' }] })),
    },
    '@/hooks/use-client-profile': { useClientProfile: () => { const sessionKey = state.sessionKey;
      return { ...state, isCurrentSession: () => state.sessionKey === sessionKey }; } },
    '@/hooks/use-mounted-ref': { useMountedRef: () => mounted },
    '@/components/app-alert': { showAppAlert: (...args) => alerts.push(args) },
    '@/components/client-profile-view': { ProfileEditor: 'ProfileEditor', ProfileLoadNotice: 'ProfileLoadNotice', ProfilePage: 'ProfilePage' },
    '@/services/profile': { updateMyPassword: options.password ?? (async () => ({ success: true })),
      uploadProfileAvatar: options.upload ?? (async (...args) => { calls.push(args); return { success: true, publicUrl: 'uploaded-image' }; }) },
  });
  function render() {
    const wrapper = Screen();
    if (key !== wrapper.key) { mounted.current = false; mounted = { current: true }; states = []; key = wrapper.key; }
    index = 0;
    const tree = wrapper.type(wrapper.props);
    return { tree, wrapper, editor: tree.props.children.find((node) => node.type === 'ProfileEditor').props,
      notice: tree.props.children.find((node) => node.type === 'ProfileLoadNotice').props };
  }
  return { render, setState: (next) => { state = { ...state, ...next }; }, alerts, routes, calls,
    unmount: () => { mounted.current = false; }, updates: () => updates };
}

test('Background reads and pulls update untouched fields without replacing edits, passwords or a chosen photo', async () => {
  let pulls = 0;
  const harness = editorHarness({ state: { refresh: async () => pulls++ } });
  let view = harness.render();
  view.editor.onChange('fullName', 'Unsaved name');
  view.editor.onChange('newPassword', 'secret-password');
  await view.editor.onPickAvatar();
  harness.setState({ profile: profile('Server name', { phone: 'New number', email: 'new@example.com' }), isRefreshing: true });
  view = harness.render();
  assert.equal(view.editor.values.fullName, 'Unsaved name');
  assert.equal(view.editor.values.phone, 'New number');
  assert.equal(view.editor.values.email, 'new@example.com');
  assert.equal(view.editor.values.newPassword, 'secret-password');
  assert.equal(view.editor.avatarSource.uri, 'picked-image');
  assert.equal(view.editor.isLoading, false);
  assert.equal(view.tree.props.refreshControl.props.refreshing, true);
  view.tree.props.refreshControl.props.onRefresh();
  await flush();
  assert.equal(pulls, 1);
  assert.equal(harness.render().editor.values.fullName, 'Unsaved name');
});

test('Initial loading and errors cannot save placeholders; retry and cancel remain available', async () => {
  let writes = 0, retries = 0;
  for (const error of [null, 'Could not load your profile.']) {
    const harness = editorHarness({ state: { profile: null, error, isLoading: !error,
      save: async () => { writes++; }, refresh: async () => retries++ } });
    const view = harness.render();
    assert.equal(view.editor.isUnavailable, true);
    view.editor.onChange('fullName', 'Must not save');
    await view.editor.onSave();
    view.notice.onRetry();
    view.editor.onCancel();
    assert.deepEqual(harness.routes, ['back']);
    assert.equal(harness.render().editor.values.fullName, '');
  }
  assert.equal(writes, 0);
  assert.equal(retries, 2);
});

test('Pending saves reject repeated taps and disable editing, back and pulls', async () => {
  const write = deferred();
  let writes = 0, pulls = 0;
  const harness = editorHarness({ state: { save: () => { writes++; return write.promise; }, refresh: async () => pulls++ } });
  harness.render().editor.onChange('fullName', 'Draft');
  const before = harness.render();
  const pending = before.editor.onSave();
  await before.editor.onSave();
  const during = harness.render();
  assert.equal(during.editor.isSaving, true);
  during.editor.onChange('fullName', 'Cannot replace draft');
  during.editor.onCancel();
  during.tree.props.refreshControl.props.onRefresh();
  assert.equal(writes, 1);
  assert.equal(pulls, 0);
  assert.deepEqual(harness.routes, []);
  assert.equal(harness.render().editor.values.fullName, 'Draft');
  write.resolve({ success: true, profile: profile('Saved') });
  await pending;
  assert.deepEqual(harness.routes, ['back']);
  assert.equal(harness.render().editor.isSaving, false);
});

test('Failed writes retain the draft and reuse an accepted photo upload on retry', async () => {
  let fail = true;
  const harness = editorHarness({ state: { save: async (values) => fail
    ? { success: false, message: 'Offline' } : accepted(values) } });
  let view = harness.render();
  view.editor.onChange('fullName', 'Draft');
  await view.editor.onPickAvatar();
  await harness.render().editor.onSave();
  view = harness.render();
  assert.equal(view.editor.values.fullName, 'Draft');
  assert.equal(view.editor.avatarSource.uri, 'uploaded-image');
  assert.equal(view.editor.isSaving, false);
  assert.equal(harness.alerts[0][0], 'Profile not saved');
  fail = false;
  await view.editor.onSave();
  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.routes, ['back']);
});

test('Partial metadata or password failures keep edits and report what was already saved', async () => {
  for (const metadataFail of [false, true]) {
    const harness = editorHarness({ state: { save: async () => metadataFail
      ? { success: false, profile: profile('Saved'), message: 'Your profile was saved, but metadata failed.' }
      : { success: true, profile: profile('Saved') } }, password: async () => ({ success: false, message: 'Offline' }) });
    let view = harness.render();
    view.editor.onChange('fullName', 'Draft');
    view.editor.onChange('newPassword', 'new-password');
    view.editor.onChange('confirmPassword', 'new-password');
    await harness.render().editor.onSave();
    view = harness.render();
    assert.equal(view.editor.values.fullName, 'Draft');
    assert.equal(view.editor.values.newPassword, 'new-password');
    assert.equal(view.editor.isSaving, false);
    assert.match(harness.alerts[0][1], /profile was saved/);
    assert.deepEqual(harness.routes, []);
  }
});

test('Logout/account changes reset the editor, including password and photo drafts', async () => {
  const harness = editorHarness();
  const original = harness.render();
  original.editor.onChange('fullName', 'Draft');
  original.editor.onChange('newPassword', 'secret-password');
  await original.editor.onPickAvatar();
  harness.setState({ sessionKey: 3, accountId: 'client-b', profile: profile('Other client') });
  const next = harness.render();
  assert.notEqual(next.wrapper.key, original.wrapper.key);
  assert.equal(next.editor.values.fullName, 'Other client');
  assert.equal(next.editor.values.newPassword, '');
  assert.notEqual(next.editor.avatarSource.uri, 'picked-image');
  await original.editor.onSave();
  assert.equal(harness.alerts.length, 0);
  assert.deepEqual(harness.routes, []);
});

test('Late save and picker completions do not update unmounted UI or a new account', async () => {
  for (const action of ['save', 'permission', 'picker']) {
    for (const switched of [false, true]) {
      const pending = deferred();
      const harness = editorHarness(action === 'save' ? { state: { save: () => pending.promise } }
        : action === 'permission' ? { permission: () => pending.promise } : { picker: () => pending.promise });
      const view = harness.render();
      const request = action === 'save' ? view.editor.onSave() : view.editor.onPickAvatar();
      await flush();
      if (switched) { harness.setState({ sessionKey: 3, profile: profile('New account') }); harness.render(); }
      else harness.unmount();
      const before = harness.updates();
      pending.resolve(action === 'save' ? { success: true, profile: profile('Old save') }
        : action === 'permission' ? { granted: true } : { canceled: false, assets: [{ uri: 'old-image' }] });
      await request;
      assert.equal(harness.updates(), before);
      assert.equal(harness.alerts.length, 0);
      assert.deepEqual(harness.routes, []);
    }
  }
});

test('Logout during a photo upload stops the profile/password write stages', async () => {
  const upload = deferred();
  let writes = 0, passwords = 0;
  const harness = editorHarness({ upload: () => upload.promise, password: async () => { passwords++; },
    state: { save: async () => { writes++; } } });
  await harness.render().editor.onPickAvatar();
  const request = harness.render().editor.onSave();
  harness.setState({ sessionKey: 3, accountId: 'client-b', profile: profile('Other client') });
  harness.render();
  upload.resolve({ success: true, publicUrl: 'old-upload' });
  await request;
  assert.equal(writes, 0);
  assert.equal(passwords, 0);
  assert.equal(harness.render().editor.avatarSource.uri, 'https://example.com/avatar.png');
});

test('Profile view supports pulls, exposes retry only on errors and disables unavailable edits', () => {
  const ui = loadModule('src/components/client-profile-view.tsx', {
    '@/components/keyboard-form-scroll-view': { KeyboardFormScrollView: 'ScrollView' },
    'react/jsx-runtime': { jsx, jsxs: jsx }, react: { useState: (value) => [value, () => {}] },
    'expo-image': { Image: 'Image' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' },
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 10 }) },
    'react-native-svg': {}, '@/styles/client-profile.styles': { clientProfileStyles: {} },
  });
  const control = { refreshing: true };
  const page = nodesIn(ui.ProfilePage({ title: 'My Profile', refreshControl: control }));
  const scroll = page.find((node) => node.type === 'ScrollView');
  assert.equal(scroll.props.refreshControl, control);
  assert.equal(scroll.props.bounces, true);
  assert.equal(scroll.props.alwaysBounceVertical, true);
  assert.equal(ui.ProfileLoadNotice({ error: null }), null);
  const notice = nodesIn(ui.ProfileLoadNotice({ error: 'Offline', isRefreshing: true }));
  assert.equal(notice.find((node) => node.type === 'Text').props.accessibilityRole, 'alert');
  assert.equal(notice.find((node) => node.type === 'Pressable').props.disabled, true);
  const overview = nodesIn(ui.ProfileOverview({ profile: null, isLoading: false }));
  assert.equal(overview.find((node) => node.props?.accessibilityLabel === 'Edit profile').props.disabled, true);
  assert.equal(overview.find((node) => node.props?.accessibilityLabel === 'Log out').props.disabled, undefined);
  const editor = nodesIn(ui.ProfileEditor({ values: {}, isLoading: false, isSaving: false, isUnavailable: true }));
  assert.equal(editor.find((node) => node.props?.accessibilityLabel === 'Save profile').props.disabled, true);
});
