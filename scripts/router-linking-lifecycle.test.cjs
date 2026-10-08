const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Exercise the installed native hook containing the reported stack frame.
function setup(getInitialURL) {
  const effects = [];
  const calls = [];
  let mounted = false;
  let updatesBeforeMount = 0;
  let liveListener;
  const navigationActions = [];
  const exports = {};
  const imports = {
    react: { useRef: (value) => ({ current: value }), useCallback: (callback) => callback,
      useEffect: (callback) => { effects.push(callback); } },
    'expo-linking': {},
    'react-native': { Linking: {} },
    './extractPathFromURL': { extractExpoPathFromURL: (_prefixes, url) => url },
    '../react-navigation/native': {
      useNavigationIndependentTree: () => false,
      getStateFromPath: (url) => ({ routes: [{ name: 'root', path: url }] }),
      getActionFromState: (state) => ({ type: 'NAVIGATE', state }),
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../node_modules/expo-router/build/fork/useLinking.native.js'), 'utf8'), {
    exports, require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    process: { env: { NODE_ENV: 'production' } }, Promise, console,
  });
  const navigation = {
    getRootState: () => ({ routeNames: ['root'] }),
    dispatch: (action) => navigationActions.push(action),
    resetRoot: (state) => navigationActions.push(state),
  };
  const hook = exports.useLinking({ current: navigation }, {
    prefixes: [], getInitialURL,
    subscribe: (callback) => { liveListener = callback; return () => { liveListener = null; }; },
  }, (url) => {
    if (!mounted) updatesBeforeMount++;
    calls.push(url);
  });
  return {
    hook, calls, navigationActions,
    updatesBeforeMount: () => updatesBeforeMount,
    commit() {
      mounted = true;
      const cleanups = effects.map((callback) => callback()).filter(Boolean);
      return () => { mounted = false; cleanups.forEach((cleanup) => cleanup()); };
    },
    liveURL: (url) => liveListener(url),
  };
}

test('Android launch URL resolving before mount waits until commit to update linking state', async () => {
  const url = deferred();
  const scenario = setup(() => url.promise);
  const state = scenario.hook.getInitialState();
  url.resolve('/photographer/notifications');
  assert.equal((await state).routes[0].path, '/photographer/notifications');
  assert.equal(scenario.updatesBeforeMount(), 0);
  assert.equal(scenario.calls.length, 0);
  const cleanup = scenario.commit();
  assert.deepEqual(scenario.calls, ['/photographer/notifications']);
  cleanup();
});

test('A launch URL resolving after mount reports the original deep link', async () => {
  const url = deferred();
  const scenario = setup(() => url.promise);
  const state = scenario.hook.getInitialState();
  const cleanup = scenario.commit();
  url.resolve('/reset-password?code=example');
  assert.equal((await state).routes[0].path, '/reset-password?code=example');
  assert.deepEqual(scenario.calls, ['/reset-password?code=example']);
  assert.equal(scenario.updatesBeforeMount(), 0);
  cleanup();
});

test('A pending launch URL resolving after teardown does not update React state', async () => {
  const url = deferred();
  const scenario = setup(() => url.promise);
  const state = scenario.hook.getInitialState();
  const cleanup = scenario.commit();
  cleanup();
  url.resolve('/home');
  await state;
  assert.equal(scenario.calls.length, 0);
  assert.equal(scenario.updatesBeforeMount(), 0);
});

test('Synchronous launch URLs defer the linking setter until mount too', async () => {
  const scenario = setup(() => '/home');
  const state = scenario.hook.getInitialState();
  assert.equal((await state).routes[0].path, '/home');
  assert.equal(scenario.updatesBeforeMount(), 0);
  assert.equal(scenario.calls.length, 0);
  const cleanup = scenario.commit();
  assert.deepEqual(scenario.calls, ['/home']);
  cleanup();
});

test('Deep links received after mount still dispatch navigation', () => {
  const scenario = setup(() => null);
  scenario.hook.getInitialState();
  const cleanup = scenario.commit();
  scenario.liveURL('/photographer/requests/booking-1');
  assert.deepEqual(scenario.calls, ['/photographer/requests/booking-1']);
  assert.equal(scenario.navigationActions[0].type, 'NAVIGATE');
  cleanup();
});
