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
function loadModule(file, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Promise, Error, ...globals });
  return exports;
}
const session = (id = 'account-a') => ({ user: { id }, access_token: `credential-${id}` });
const notification = (userId = 'account-a', url = '/notifications') => ({ request: { content: { data: { userId, url } } } });
function setup({ platform = 'android', disconnected = false, tokenRead, sessionRead, rpcRead, nativeDismissError = false } = {}) {
  let currentSession = session();
  let authCallback;
  let behavior;
  let received;
  let response;
  const state = { queries: [], nativeCalls: [], routes: [], warnings: [], changes: 0, removed: 0, lastResponse: null };
  const api = loadModule('src/services/push-notifications.ts', {
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'test-project' } } } } },
    'expo-notifications': {
      AndroidImportance: { HIGH: 4 }, IosAuthorizationStatus: {},
      setNotificationHandler: (handler) => { behavior = handler.handleNotification; },
      setNotificationChannelAsync: async () => { state.nativeCalls.push('channel'); },
      getPermissionsAsync: async () => { state.nativeCalls.push('permission'); return { status: 'granted' }; },
      requestPermissionsAsync: async () => { throw new Error('Unexpected permission prompt'); },
      getExpoPushTokenAsync: async () => { state.nativeCalls.push('token'); return tokenRead ? tokenRead() : { data: 'ExpoPushToken[test]' }; },
      clearLastNotificationResponse: () => { state.nativeCalls.push('clear-response'); state.lastResponse = null; },
      dismissAllNotificationsAsync: async () => { state.nativeCalls.push('dismiss'); if (nativeDismissError) throw new Error('Native failure'); },
      getLastNotificationResponse: () => state.lastResponse,
      addNotificationResponseReceivedListener: (callback) => { response = callback; return { remove: () => state.removed++ }; },
      addNotificationReceivedListener: (callback) => { received = callback; return { remove: () => state.removed++ }; },
    },
    'expo-router': { router: { push: (route) => state.routes.push(route) } },
    'react-native': { Platform: { OS: platform } },
    '@/lib/supabase': { supabase: disconnected ? null : { auth: {
      onAuthStateChange: (callback) => { authCallback = callback; callback('INITIAL_SESSION', currentSession); },
      getSession: () => sessionRead ? sessionRead() : Promise.resolve({ data: { session: currentSession }, error: null }),
    }, rpc: (name, args) => {
      const query = { name, args, header: null, signal: null };
      state.queries.push(query);
      const builder = { setHeader: (name, value) => { query.header = [name, value]; return builder; },
        abortSignal: (signal) => { query.signal = signal; return builder; },
        then: (resolve, reject) => Promise.resolve(rpcRead ? rpcRead(query) : { data: 0, error: null }).then(resolve, reject),
      };
      return builder;
    } } },
    '@/services/notification-events': { emitNotificationsChanged: () => state.changes++ },
  }, { console: { warn: (message) => state.warnings.push(message) } });
  return { api, state, behavior: (value) => behavior(value), received: (value) => received(value),
    response: (value) => response({ notification: value }),
    auth: (event, value) => { currentSession = value; authCallback(event, value); } };
}

test('Cleanup uses the captured session and cancellation signal, without querying Expo or prompting for permission', async () => {
  const { api, state } = setup();
  const controller = new AbortController();
  await api.removeCurrentPushNotificationToken({ signal: controller.signal });
  assert.equal(state.nativeCalls.length, 0);
  assert.equal(state.queries.length, 1);
  assert.equal(state.queries[0].name, 'unregister_my_push_session');
  assert.deepEqual(state.queries[0].header, ['Authorization', 'Bearer credential-account-a']);
  assert.equal(state.queries[0].signal, controller.signal);
});

test('Cleanup aborting while session retrieval is pending never starts a late server request', async () => {
  const read = deferred();
  const { api, state } = setup({ sessionRead: () => read.promise });
  const controller = new AbortController();
  const request = api.removeCurrentPushNotificationToken({ signal: controller.signal });
  controller.abort();
  read.resolve({ data: { session: session('account-b') }, error: null });
  await request;
  assert.equal(state.queries.length, 0);
});

test('Cleanup skips web, unconfigured and signed-out sessions; actual RPC errors can be logged by logout', async () => {
  for (const options of [{ platform: 'web' }, { disconnected: true }]) {
    const { api, state } = setup(options);
    await api.removeCurrentPushNotificationToken();
    assert.equal(state.queries.length, 0);
  }
  const signedOut = setup({ sessionRead: async () => ({ data: { session: null }, error: null }) });
  await signedOut.api.removeCurrentPushNotificationToken();
  assert.equal(signedOut.state.queries.length, 0);
  const failed = setup({ rpcRead: () => ({ error: { message: 'Offline' } }) });
  await assert.rejects(failed.api.removeCurrentPushNotificationToken(), /Offline/);
});

test('Registration binds the existing access token and never changes identity while awaiting a device token', async () => {
  const read = deferred();
  const harness = setup({ tokenRead: () => read.promise });
  const request = harness.api.syncPushNotificationToken();
  await flush();
  harness.auth('SIGNED_OUT', null);
  harness.auth('SIGNED_IN', session('account-b'));
  read.resolve({ data: 'ExpoPushToken[test]' });
  assert.equal((await request).status, 'skipped');
  assert.equal(harness.state.queries.length, 0);
  assert.equal(harness.state.nativeCalls.filter((item) => item === 'clear-response').length, 1);
});

test('Registration pins the authenticated session; results after logout do not become setup errors', async () => {
  const accepted = setup();
  assert.equal((await accepted.api.syncPushNotificationToken()).status, 'saved');
  assert.equal(accepted.state.queries[0].name, 'register_my_push_token');
  assert.equal(accepted.state.queries[0].args.p_platform, 'android');
  assert.deepEqual(accepted.state.queries[0].header, ['Authorization', 'Bearer credential-account-a']);
  const read = deferred();
  const late = setup({ rpcRead: () => read.promise });
  const request = late.api.syncPushNotificationToken();
  await flush();
  late.auth('SIGNED_OUT', null);
  read.resolve({ error: { message: 'Session ended' } });
  assert.equal((await request).status, 'skipped');
  assert.equal(late.state.warnings.length, 0);
});

test('Foreground notifications and taps require the current account, including saved responses from older logins', async () => {
  const harness = setup();
  harness.state.lastResponse = { notification: notification('account-b') };
  const cleanup = harness.api.observePushNotificationResponses();
  assert.equal(harness.state.routes.length, 0);
  assert.equal((await harness.behavior(notification())).shouldShowBanner, true);
  for (const value of [notification('account-b'), notification(null), { request: { content: { data: { url: '/notifications' } } } }]) {
    assert.equal((await harness.behavior(value)).shouldShowBanner, false);
    harness.received(value);
    harness.response(value);
  }
  assert.equal(harness.state.changes, 0);
  harness.received(notification());
  harness.response(notification());
  assert.equal(harness.state.changes, 2);
  assert.deepEqual(harness.state.routes, ['/notifications']);
  harness.auth('SIGNED_OUT', null);
  assert.equal((await harness.behavior(notification())).shouldShowBanner, false);
  harness.response(notification());
  assert.equal(harness.state.routes.length, 1);
  harness.auth('SIGNED_IN', session('account-b'));
  harness.response(notification());
  harness.response(notification('account-b'));
  assert.equal(harness.state.routes.length, 2);
  cleanup();
  assert.equal(harness.state.removed, 2);
});

test('Native notification dismissal failures do not break the auth sign-out callback', async () => {
  const harness = setup({ nativeDismissError: true });
  assert.doesNotThrow(() => harness.auth('SIGNED_OUT', null));
  await flush();
  assert.equal(harness.state.warnings.length, 1);
  assert.equal((await harness.behavior(notification())).shouldShowList, false);
});

test('Push setup finishing after its component closes does not show a development alert', async () => {
  let effect;
  let timeout;
  const pending = deferred();
  const alerts = [];
  const { PushNotificationBootstrap } = loadModule('src/components/push-notification-bootstrap.tsx', {
    react: { useEffect: (callback) => { effect = callback; } },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
    '@/services/push-notifications': { observePushNotificationResponses: () => () => {}, syncPushNotificationToken: () => pending.promise },
  }, { __DEV__: true, setTimeout: (callback) => { timeout = callback; return 1; }, clearTimeout: () => {}, console: { warn: () => {} } });
  PushNotificationBootstrap();
  const cleanup = effect();
  timeout();
  await flush();
  cleanup();
  pending.resolve({ status: 'failed', message: 'Old session ended' });
  await flush();
  assert.equal(alerts.length, 0);
});
