const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const { test } = require('node:test');

function setup({ response, nativeError, authError, connected = true, missingNative = false, nativeResult } = {}) {
  const calls = [];
  let sequence = 0;
  const google = {
    GoogleOneTapSignIn: {
      configure: (params) => calls.push(['configure', params]),
      checkPlayServices: async () => { calls.push(['play']); if (nativeError) throw nativeError; },
      presentExplicitSignIn: async () => {
        calls.push(['choose']);
        return nativeResult ? nativeResult : response ?? { type: 'success', data: { idToken: 'test-google-token' } };
      },
    },
    isCancelledResponse: (value) => value.type === 'cancelled',
    isSuccessResponse: (value) => value.type === 'success' && value.data != null,
    isErrorWithCode: (value) => Boolean(value?.code),
    statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE', IN_PROGRESS: 'IN_PROGRESS' },
  };
  const imports = {
    'expo-crypto': { getRandomBytesAsync: async () => new Uint8Array(32).fill(++sequence),
      CryptoDigestAlgorithm: { SHA256: 'sha256' },
      digestStringAsync: async (algorithm, value) => crypto.createHash(algorithm).update(value).digest('hex') },
    '@/lib/supabase': { supabase: connected ? { auth: { signInWithIdToken: async (params) => {
      calls.push(['supabase', params]);
      return { data: { user: { id: 'client-a' }, session: { user: { id: 'client-a' } } }, error: authError };
    } } } : null },
    '@/services/google-config': { GOOGLE_WEB_CLIENT_ID: 'test-web.apps.googleusercontent.com' },
    'react-native-nitro-google-signin': google,
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src/services/google-auth.android.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    if (missingNative && name === 'react-native-nitro-google-signin') throw new Error('Missing native binary');
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return { signIn: exports.signInWithGoogle, calls };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('Google exchanges its ID token through Supabase with a fresh matching SHA-256 nonce', async () => {
  const h = setup();
  assert.deepEqual(plain(await h.signIn()), {});
  const configuration = h.calls.find(([name]) => name === 'configure')[1];
  const credentials = h.calls.find(([name]) => name === 'supabase')[1];
  assert.equal(configuration.webClientId, 'test-web.apps.googleusercontent.com');
  assert.equal(configuration.nonce, crypto.createHash('sha256').update(credentials.nonce).digest('hex'));
  assert.equal(credentials.provider, 'google');
  assert.equal(credentials.token, 'test-google-token');
  assert.equal(credentials.nonce.length, 64);
  await h.signIn();
  assert.notEqual(h.calls.filter(([name]) => name === 'supabase')[1][1].nonce, credentials.nonce);
});

test('Concurrent taps share one native prompt and one Supabase exchange', async () => {
  let finish;
  const result = new Promise((resolve) => { finish = resolve; });
  const h = setup({ nativeResult: result });
  const first = h.signIn();
  assert.equal(h.signIn(), first);
  finish({ type: 'success', data: { idToken: 'test-token' } });
  await first;
  assert.equal(h.calls.filter(([name]) => name === 'choose').length, 1);
  assert.equal(h.calls.filter(([name]) => name === 'supabase').length, 1);
});

test('Cancellation never creates a Supabase session and releases the attempt for retry', async () => {
  for (const config of [{ response: { type: 'cancelled', data: null } }, { nativeError: { code: 'SIGN_IN_CANCELLED' } }]) {
    const h = setup(config);
    assert.deepEqual(plain(await h.signIn()), {});
    await h.signIn();
    assert.equal(h.calls.filter(([name]) => name === 'supabase').length, 0);
    assert.equal(h.calls.filter(([name]) => name === 'configure').length, 2);
  }
});

test('Missing native binaries, disconnected auth, and unavailable Play services return actionable errors', async () => {
  for (const [config, expected] of [
    [{ missingNative: true }, /latest Android build/],
    [{ connected: false }, /unavailable/],
    [{ nativeError: { code: 'PLAY_SERVICES_NOT_AVAILABLE' } }, /Update Google Play services/],
  ]) {
    const h = setup(config);
    assert.match((await h.signIn()).message, expected);
    assert.equal(h.calls.filter(([name]) => name === 'supabase').length, 0);
  }
});

test('Invalid credentials and provider failures never report successful Google login or leak token details', async () => {
  for (const config of [
    { response: { type: 'noSavedCredentialFound', data: null } },
    { response: { type: 'success', data: { idToken: '' } } },
    { nativeError: new Error('Sensitive native error') },
    { authError: { message: 'Sensitive provider error' } },
  ]) {
    const message = (await setup(config).signIn()).message;
    assert.ok(message);
    assert.doesNotMatch(message, /Sensitive|test-google-token/);
  }
});
