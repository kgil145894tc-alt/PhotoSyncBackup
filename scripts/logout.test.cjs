const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(file, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Error, Promise, AbortController, setTimeout, clearTimeout, ...globals });
  return exports;
}

function authSetup({ error = null, throwCleanup = false, disconnected = false, cleanup, globals } = {}) {
  const order = [];
  const warnings = [];
  const { signOutPhotoSync } = loadModule('src/services/auth.ts', {
    '@/lib/supabase': { supabase: disconnected ? null : { auth: { signOut: async () => {
      order.push('sign-out'); return { error };
    } } } },
    '@/services/profile': {},
    '@/services/push-notifications': { removeCurrentPushNotificationToken: async (options) => {
      order.push('cleanup'); if (throwCleanup) throw new Error('Cleanup failed');
      if (cleanup) return cleanup(options);
    } },
  }, { console: { warn: (message) => warnings.push(message) }, ...globals });
  return { signOutPhotoSync, order, warnings };
}

test('Logout cleans up the current push token before ending the session', async () => {
  const { signOutPhotoSync, order } = authSetup();
  await signOutPhotoSync();
  assert.deepEqual(order, ['cleanup', 'sign-out']);
});

test('Supabase sign-out errors stay failures, even if notification cleanup also failed', async () => {
  for (const throwCleanup of [false, true]) {
    const { signOutPhotoSync, order } = authSetup({ throwCleanup, error: { message: 'Sign-out failed' } });
    await assert.rejects(signOutPhotoSync(), /Sign-out failed/);
    assert.deepEqual(order, ['cleanup', 'sign-out']);
  }
  const disconnected = authSetup({ disconnected: true });
  await disconnected.signOutPhotoSync();
  assert.equal(disconnected.order.length, 0);
});

test('Notification cleanup failures are recorded and do not block successful logout', async () => {
  const { signOutPhotoSync, order, warnings } = authSetup({ throwCleanup: true });
  await signOutPhotoSync();
  assert.deepEqual(order, ['cleanup', 'sign-out']);
  assert.equal(warnings.length, 1);
});

test('Hanging cleanup times out after 2.5 seconds, aborts, and permits logout without an unhandled late rejection', async () => {
  let timeout;
  let timeoutMs;
  let aborted = false;
  let rejectCleanup;
  const cleanup = new Promise((_resolve, reject) => { rejectCleanup = reject; });
  const { signOutPhotoSync, order, warnings } = authSetup({ cleanup: ({ signal }) => {
    signal.addEventListener('abort', () => { aborted = true; }); return cleanup;
  }, globals: { setTimeout: (callback, ms) => { timeout = callback; timeoutMs = ms; return 1; }, clearTimeout: () => {} } });
  const request = signOutPhotoSync();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timeoutMs, 2500);
  assert.deepEqual(order, ['cleanup']);
  timeout();
  await request;
  assert.equal(aborted, true);
  assert.deepEqual(order, ['cleanup', 'sign-out']);
  assert.equal(warnings.length, 1);
  rejectCleanup(new Error('Late cleanup failed'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(order.length, 2);
});

function clientHarness(signOutPhotoSync) {
  const states = [];
  let index = 0;
  let updates = 0;
  const routes = [];
  const alerts = [];
  const mounted = { current: true };
  const jsx = (type, props) => ({ type, props });
  const { default: Screen } = loadModule('src/app/(client)/profile.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: (initial) => {
      const stateIndex = index++;
      if (!(stateIndex in states)) states[stateIndex] = initial;
      return [states[stateIndex], (value) => { updates++; states[stateIndex] = value; }];
    }, useCallback: (callback) => callback },
    'expo-router': { router: { replace: (route) => routes.push(route) }, useFocusEffect: () => {} },
    'react-native': { RefreshControl: 'RefreshControl' },
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-mounted-ref': { useMountedRef: () => mounted },
    '@/hooks/use-client-profile': { useClientProfile: () => ({ sessionKey: 1, accountId: 'client-a',
      profile: null, isLoading: false, isRefreshing: false, error: null,
      refresh: async () => {}, isCurrentSession: () => true }) },
    '@/components/logout-confirmation-modal': { LogoutConfirmationModal: 'LogoutConfirmationModal' },
    '@/components/app-alert': { showAppAlert: (...args) => alerts.push(args) },
    '@/components/client-profile-view': { ProfileLoadNotice: 'ProfileLoadNotice', ProfileOverview: 'ProfileOverview', ProfilePage: 'ProfilePage' },
    '@/services/profile': {}, '@/services/auth': { signOutPhotoSync },
  });
  function render() { index = 0; const wrapper = Screen(); return wrapper.type(wrapper.props).props.children; }
  return { modal: () => render().find((node) => node.type === 'LogoutConfirmationModal').props,
    routes, alerts, mounted, updateCount: () => updates };
}

test('Client logout leaves navigation to the root guard after success', async () => {
  const harness = clientHarness(async () => {});
  await harness.modal().onConfirm();
  assert.deepEqual(harness.routes, []);
  assert.equal(harness.alerts.length, 0);
  assert.equal(harness.modal().isLoading, false);
});

test('Client sign-out failures remain on the profile, show an error, and release the button for retry', async () => {
  let fail = true;
  const harness = clientHarness(async () => { if (fail) throw new Error('Offline'); });
  await harness.modal().onConfirm();
  assert.deepEqual(harness.routes, []);
  assert.equal(harness.alerts[0][0], 'Could not sign out');
  assert.equal(harness.modal().isLoading, false);
  fail = false;
  await harness.modal().onConfirm();
  assert.deepEqual(harness.routes, []);
});

test('Client logout closes its modal before sign-out and never navigates or updates UI after unmount', async () => {
  for (const fail of [false, true]) {
    let complete;
    const pending = new Promise((resolve, reject) => { complete = () => fail ? reject(new Error('Offline')) : resolve(); });
    const harness = clientHarness(() => pending);
    const request = harness.modal().onConfirm();
    assert.equal(harness.modal().visible, false);
    const before = harness.updateCount();
    harness.mounted.current = false;
    complete();
    await request;
    assert.equal(harness.updateCount(), before);
    assert.equal(harness.alerts.length, 0);
    assert.deepEqual(harness.routes, []);
  }
});
