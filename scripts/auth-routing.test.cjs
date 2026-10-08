const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { StackRouter } = require('../node_modules/expo-router/build/react-navigation/routers');

function loadModule(file, imports) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, setTimeout, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

function setupHook({ connected = true } = {}) {
  let state, effect, onAuth;
  const reads = [];
  let unsubscribed = 0;
  const { useAuthRoutingState } = loadModule('src/hooks/use-auth-routing.ts', {
    react: {
      useState: (initial) => {
        state ??= initial;
        return [state, (value) => { state = typeof value === 'function' ? value(state) : value; }];
      },
      useEffect: (callback) => { effect = callback; },
    },
    '@/lib/supabase': { supabase: connected ? { auth: { onAuthStateChange: (callback) => {
      onAuth = callback;
      return { data: { subscription: { unsubscribe: () => unsubscribed++ } } };
    } } } : null },
    '@/services/auth': { getSignedInUserRole: () => new Promise((resolve, reject) => { reads.push({ resolve, reject }); }) },
  });
  assert.equal(useAuthRoutingState().isLoading, connected);
  const cleanup = effect();
  return { read: () => state, auth: (event, id) => onAuth(event, id ? { user: { id } } : null),
    reads, cleanup, unsubscribed: () => unsubscribed };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const role of ['client', 'admin']) {
  test(`Restoring ${role} hides routes until its role is known`, async () => {
    const h = setupHook();
    h.auth('INITIAL_SESSION', 'account-a');
    assert.equal(h.read().isLoading, true);
    assert.equal(h.read().role, null);
    await flush();
    h.reads[0].resolve(role);
    await flush();
    assert.deepEqual(plain(h.read()), { isLoading: false, role });
    h.cleanup();
  });

  test(`${role} login, logout, login rechecks authorization without remounting root loading`, async () => {
    const h = setupHook();
    h.auth('INITIAL_SESSION', null);
    h.auth('SIGNED_IN', 'account-a');
    await flush();
    h.reads[0].resolve(role);
    await flush();
    assert.equal(h.read().role, role);
    h.auth('SIGNED_OUT', null);
    assert.deepEqual(plain(h.read()), { isLoading: false, role: null });
    h.auth('SIGNED_IN', 'account-a');
    assert.equal(h.read().isLoading, false);
    await flush();
    h.reads[1].resolve(role);
    await flush();
    assert.equal(h.read().role, role);
    assert.equal(h.reads.length, 2);
    h.cleanup();
  });
}

test('Guests and a disconnected Supabase client release startup loading', () => {
  const guest = setupHook();
  guest.auth('INITIAL_SESSION', null);
  assert.deepEqual(plain(guest.read()), { isLoading: false, role: null });
  assert.deepEqual(plain(setupHook({ connected: false }).read()), { isLoading: false, role: null });
  guest.cleanup();
});

test('Failed role reads release loading with no protected access and permit a same-account login retry', async () => {
  const h = setupHook();
  h.auth('INITIAL_SESSION', 'account-a');
  await flush();
  h.reads[0].reject(new Error('Offline'));
  await flush();
  assert.deepEqual(plain(h.read()), { isLoading: false, role: null });
  h.auth('SIGNED_IN', 'account-a');
  await flush();
  h.reads[1].resolve('client');
  await flush();
  assert.equal(h.read().role, 'client');
  h.cleanup();
});

test('Sign-out cancels an outstanding role check; old account results cannot authorize a new login', async () => {
  const h = setupHook();
  h.auth('INITIAL_SESSION', 'account-a');
  await flush();
  h.auth('SIGNED_OUT', null);
  h.auth('SIGNED_IN', 'account-b');
  await flush();
  h.reads[1].resolve('client');
  await flush();
  h.reads[0].resolve('admin');
  await flush();
  assert.equal(h.read().role, 'client');
  h.cleanup();
});

test('Account switches revoke access before resolving the new role', async () => {
  const h = setupHook();
  h.auth('INITIAL_SESSION', 'account-a');
  await flush();
  h.reads[0].resolve('admin');
  await flush();
  h.auth('SIGNED_IN', 'account-b');
  assert.deepEqual(plain(h.read()), { isLoading: false, role: null });
  await flush();
  h.reads[1].resolve('client');
  await flush();
  assert.equal(h.read().role, 'client');
  h.cleanup();
});

test('Same-account sign-in, recovery, and token events preserve the mounted navigator and avoid role reads', async () => {
  const h = setupHook();
  h.auth('INITIAL_SESSION', 'account-a');
  await flush();
  h.reads[0].resolve('client');
  await flush();
  const state = h.read();
  for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'PASSWORD_RECOVERY', 'USER_UPDATED']) h.auth(event, 'account-a');
  await flush();
  assert.equal(h.reads.length, 1);
  assert.equal(h.read(), state);
  h.cleanup();
});

test('Queued reads and late results cannot run or update state after logout/unmount', async () => {
  for (const cancel of ['logout', 'unmount']) {
    const h = setupHook();
    h.auth('INITIAL_SESSION', 'account-a');
    if (cancel === 'logout') h.auth('SIGNED_OUT', null); else h.cleanup();
    const before = h.read();
    await flush();
    assert.equal(h.reads.length, 0);
    assert.equal(h.read(), before);
    if (cancel === 'logout') h.cleanup();
    assert.equal(h.unsubscribed(), 1);
  }
  const h = setupHook();
  h.auth('INITIAL_SESSION', 'account-a');
  await flush();
  h.cleanup();
  const before = h.read();
  h.reads[0].resolve('admin');
  h.auth('SIGNED_OUT', null);
  await flush();
  assert.equal(h.read(), before);
});

const jsx = (type, props) => ({ type, props });
function rootHarness() {
  let auth = { isLoading: true, role: null };
  const Stack = Object.assign(() => {}, { Protected: 'Protected', Screen: 'Screen' });
  const root = loadModule('src/app/_layout.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, react: { useEffect: () => {} },
    'expo-font': { useFonts: () => [true, null] },
    'expo-splash-screen': { preventAutoHideAsync: async () => {}, hideAsync: async () => {} },
    'expo-router': { Stack }, '@/styles/fonts': { appFonts: {} },
    '@/components/app-alert': { AppAlertProvider: 'Alerts' },
    '@/components/auth-loading-screen': { AuthLoadingScreen: 'Loading' },
    '@/hooks/use-auth-routing': { useAuthRoutingState: () => auth },
  });
  function available(tree) {
    if (!tree || typeof tree !== 'object' || tree.type === 'Protected' && !tree.props.guard) return [];
    if (tree.type === 'Screen') return [tree.props.name];
    return [tree.props?.children].flat(Infinity).flatMap(available);
  }
  return { root, render: () => root.default(), routes: (role) => {
    auth = { isLoading: false, role }; return available(root.default());
  } };
}

test('Root gates client/admin access and keeps password recovery available for all sessions', () => {
  const h = rootHarness();
  assert.equal(h.render().type, 'Loading');
  assert.deepEqual(h.routes(null), ['login', 'index', 'create-account', 'reset-password']);
  assert.deepEqual(h.routes('client'), ['(client)', 'reset-password']);
  assert.deepEqual(h.routes('admin'), ['photographer', 'reset-password']);
});

for (const [role, group] of [['client', '(client)'], ['admin', 'photographer']]) {
  test(`Real stack router removes ${role} history on logout and opens a fresh navigator on re-login`, () => {
    const h = rootHarness();
    const router = StackRouter({ initialRouteName: h.root.unstable_settings.initialRouteName });
    const options = (role) => ({ routeNames: h.routes(role), routeParamList: {}, routeGetIdList: {}, routeKeyChanges: [] });
    let state = router.getInitialState(options(null));
    assert.equal(state.routes[state.index].name, 'login');
    state = router.getStateForRouteNamesChange(state, options(role));
    const oldKey = state.routes[state.index].key;
    assert.equal(state.routes[state.index].name, group);
    state = router.getStateForRouteNamesChange(state, options(null));
    assert.equal(state.routes[state.index].name, 'login');
    assert.ok(state.routes.every((route) => route.name !== group));
    assert.equal(router.getStateForAction(state, { type: 'GO_BACK' }, options(null)), null);
    state = router.getStateForRouteNamesChange(state, options(role));
    assert.equal(state.routes[state.index].name, group);
    assert.notEqual(state.routes[state.index].key, oldKey);
  });
}
