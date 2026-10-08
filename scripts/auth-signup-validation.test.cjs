const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function setup(connected = true) {
  const calls = [];
  const supabase = {
    rpc: async (...args) => { calls.push(['rpc', ...args]); return { data: null, error: null }; },
    auth: { signUp: async (payload) => {
      calls.push(['signup', payload]);
      return { data: { user: { id: 'client-a' }, session: null }, error: null };
    } },
    from: () => { throw new Error('An unconfirmed account must not write a profile'); },
  };
  const imports = {
    '@/lib/supabase': { supabase: connected ? supabase : null },
    '@/services/profile': {
      normalizeUsername: (value) => value.trim().toLowerCase(),
      validateUsername: () => null,
    },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/auth.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, setTimeout, clearTimeout, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return { signup: (email) => exports.signUpClientAccount({
    email, username: 'alex', fullName: 'Alex', password: 'test-password',
  }), calls };
}

test('Malformed signup email addresses are rejected before any account or username request', async () => {
  const auth = setup();
  for (const email of ['kifodkf@', 'alex', '@example.com', 'alex@example',
    'alex@@example.com', 'alex @example.com', 'alex@example .com',
    'alex@.com', 'alex@example.', 'alex@example..com']) {
    const result = await auth.signup(email);
    assert.equal(result.message, 'Please enter a valid email address, like name@example.com.', email);
    assert.equal(result.route, undefined, email);
  }
  assert.deepEqual(auth.calls, []);
});

test('Invalid email cannot enter the client prototype when auth is disconnected', async () => {
  const result = await setup(false).signup('kifodkf@');
  assert.match(result.message, /valid email address/);
  assert.equal(result.route, undefined);
});

test('Empty email retains the required-field message', async () => {
  const auth = setup();
  assert.equal((await auth.signup('  ')).message, 'Please complete all required fields.');
  assert.deepEqual(auth.calls, []);
});

test('Valid emails still submit with trimming, case normalization, tags, and subdomains', async () => {
  for (const [email, normalized] of [
    ['  Alex@Example.COM  ', 'alex@example.com'],
    ['alex+photos@studio.example.com', 'alex+photos@studio.example.com'],
  ]) {
    const auth = setup();
    const result = await auth.signup(email);
    assert.equal(auth.calls.length, 2);
    assert.equal(auth.calls[1][0], 'signup');
    assert.equal(auth.calls[1][1].email, normalized);
    assert.equal(result.message, 'Account created. Please confirm your email before logging in.');
  }
});
