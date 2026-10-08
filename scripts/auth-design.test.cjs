const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function harness(file, services = {}) {
  const state = []; let cursor = 0;
  const refs = []; let refCursor = 0;
  const mounted = { current: true };
  let updates = 0;
  const routes = [];
  const jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { updates++; state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    }, useRef(initial) { const index = refCursor++; refs[index] ??= { current: initial }; return refs[index]; } },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput',
      ScrollView: 'ScrollView', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'android' }, StyleSheet: { absoluteFill: {} } },
    'expo-router': { router: { replace: (route) => routes.push(['replace', route]), push: (route) => routes.push(['push', route]) } },
    'expo-linking': { createURL: () => 'photosync://reset-password' },
    'expo-image': {}, 'expo-status-bar': {}, 'react-native-svg': {},
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) },
    '@/components/auth-brand': { AuthBrand: 'AuthBrand' },
    '@/components/auth-text-field': { AuthTextField: 'AuthTextField' },
    '@/hooks/use-mounted-ref': { useMountedRef: () => mounted },
    '@/styles/auth-route.styles': { authRouteStyles: {} },
    '@/styles/intro.styles': { introStyles: {} }, '@/styles/auth-theme': { authColors: {} },
    '@/services/auth': services,
    '@/services/google-auth': { signInWithGoogle: services.signInWithGoogle },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => name.startsWith('@/assets/') ? {} : imports[name] });
  return { routes, mounted, updateCount: () => updates, render(name, props) { cursor = 0; refCursor = 0; return exports[name](props); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const text = (tree) => typeof tree === 'string' ? tree : !tree || typeof tree !== 'object' ? ''
  : [tree.props?.children].flat(Infinity).map(text).join('');
const button = (tree, label) => nodes(tree).find((node) => node.type === 'Pressable'
  && (node.props.accessibilityLabel === label || text(node) === label));
const field = (tree, label) => nodes(tree).find((node) => node.type === 'AuthTextField' && node.props.label === label);
const modal = (tree) => nodes(tree).find((node) => node.type?.name === 'ForgotPasswordModal');
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const route of ['/home', '/photographer']) {
  test(`Login preserves entered values and pending controls, leaving ${route} navigation to the root`, async () => {
    const calls = []; let finish;
    const h = harness('src/components/auth-route-screen.tsx', { signInWithPhotoSync: (...args) => {
      calls.push(args); return new Promise((resolve) => { finish = resolve; });
    } });
    const render = () => h.render('AuthRouteScreen', { variant: 'login' });
    field(render(), 'Email or Username').props.onChangeText('alex');
    field(render(), 'Password').props.onChangeText('private-test-value');
    const pending = button(render(), 'Login').props.onPress();
    assert.deepEqual(calls, [['alex', 'private-test-value']]);
    assert.equal(button(render(), 'Please wait...').props.disabled, true);
    assert.equal(field(render(), 'Password').props.disabled, true);
    await button(render(), 'Please wait...').props.onPress();
    assert.equal(calls.length, 1);
    finish({ route }); await pending;
    assert.deepEqual(h.routes, []);
    assert.equal(button(render(), 'Login').props.disabled, false);
  });
}

test('Login completions cannot navigate or update a form removed by the root auth guard', async () => {
  for (const fail of [false, true]) {
    let complete;
    const h = harness('src/components/auth-route-screen.tsx', { signInWithPhotoSync: () => new Promise((resolve, reject) => {
      complete = () => fail ? reject(new Error('Late failure')) : resolve({ route: '/home' });
    }) });
    const render = () => h.render('AuthRouteScreen', { variant: 'login' });
    const pending = button(render(), 'Login').props.onPress();
    const before = h.updateCount();
    h.mounted.current = false;
    complete();
    await pending;
    assert.equal(h.updateCount(), before);
    assert.deepEqual(h.routes, []);
  }
});

test('Password-reset email completions cannot update an unmounted login form', async () => {
  let finish;
  const h = harness('src/components/auth-route-screen.tsx', { sendPasswordResetEmail: () => new Promise((resolve) => { finish = resolve; }) });
  const render = () => h.render('AuthRouteScreen', { variant: 'login' });
  button(render(), 'Forgot password?').props.onPress();
  const pending = modal(render()).props.onSubmit();
  const before = h.updateCount();
  h.mounted.current = false;
  finish({ message: 'Password reset email sent. Please check your inbox.' });
  await pending;
  assert.equal(h.updateCount(), before);
});

test('Registration still requires consent and matching passwords, then forwards the original account payload', async () => {
  const calls = [];
  const h = harness('src/components/auth-route-screen.tsx', { signUpClientAccount: async (value) => {
    calls.push(plain(value)); return { message: 'Account created. Please confirm your email before logging in.' };
  } });
  const render = () => h.render('AuthRouteScreen', { variant: 'create' });
  await button(render(), 'Create Account').props.onPress();
  assert.match(text(render()), /Please agree/);
  assert.equal(calls.length, 0);
  nodes(render()).find((node) => node.props?.accessibilityRole === 'checkbox').props.onPress();
  for (const [label, value] of [['Username', 'alex'], ['Email', 'alex@example.test'], ['Password', 'secret-test'], ['Confirm Password', 'different']]) {
    field(render(), label).props.onChangeText(value);
  }
  await button(render(), 'Create Account').props.onPress();
  assert.match(text(render()), /Passwords do not match/);
  assert.equal(calls.length, 0);
  field(render(), 'Confirm Password').props.onChangeText('secret-test');
  assert.doesNotMatch(text(render()), /Passwords do not match/);
  await button(render(), 'Create Account').props.onPress();
  assert.deepEqual(calls, [{ email: 'alex@example.test', fullName: 'alex', username: 'alex', password: 'secret-test' }]);
  assert.match(text(render()), /Please confirm your email/);
  assert.deepEqual(h.routes, []);
});

test('Google signup requires consent and shares the pending lock with password login', async () => {
  let finish; let calls = 0;
  const h = harness('src/components/auth-route-screen.tsx', { signInWithGoogle: () => {
    calls++; return new Promise((resolve) => { finish = resolve; });
  } });
  const render = () => h.render('AuthRouteScreen', { variant: 'create' });
  await button(render(), 'Sign in with Google').props.onPress();
  assert.equal(calls, 0);
  assert.match(text(render()), /Please agree/);
  nodes(render()).find((node) => node.props?.accessibilityRole === 'checkbox').props.onPress();
  const googleHandler = button(render(), 'Sign in with Google').props.onPress;
  const passwordHandler = button(render(), 'Create Account').props.onPress;
  const pending = googleHandler();
  await googleHandler(); await passwordHandler();
  assert.equal(calls, 1);
  assert.equal(button(render(), 'Sign in with Google').props.disabled, true);
  finish({}); await pending;
  assert.equal(button(render(), 'Sign in with Google').props.disabled, false);
  assert.deepEqual(h.routes, []);
});

test('Google login errors appear on the form and late completions ignore an unmounted screen', async () => {
  let finish;
  const h = harness('src/components/auth-route-screen.tsx', { signInWithGoogle: () => new Promise((resolve) => { finish = resolve; }) });
  const render = () => h.render('AuthRouteScreen', { variant: 'login' });
  let pending = button(render(), 'Sign in with Google').props.onPress();
  finish({ message: 'Update Google Play services, then try again.' }); await pending;
  assert.match(text(render()), /Update Google Play services/);
  pending = button(render(), 'Sign in with Google').props.onPress();
  const before = h.updateCount(); h.mounted.current = false;
  finish({ message: 'Late error' }); await pending;
  assert.equal(h.updateCount(), before);
  assert.deepEqual(h.routes, []);
});

test('Password reset keeps email prefill, exposes failures in the dialog, and closes after confirmed sending', async () => {
  let response = { message: 'Please enter a valid email address.' }; const calls = [];
  const h = harness('src/components/auth-route-screen.tsx', { sendPasswordResetEmail: async (...args) => { calls.push(args); return response; } });
  const render = () => h.render('AuthRouteScreen', { variant: 'login' });
  field(render(), 'Email or Username').props.onChangeText('alex');
  button(render(), 'Forgot password?').props.onPress();
  assert.equal(modal(render()).props.email, '');
  modal(render()).props.onClose();
  field(render(), 'Email or Username').props.onChangeText('alex@example.test');
  button(render(), 'Forgot password?').props.onPress();
  assert.equal(modal(render()).props.email, 'alex@example.test');
  await modal(render()).props.onSubmit();
  assert.equal(modal(render()).props.visible, true);
  const dialog = modal(render());
  assert.match(text(dialog.type(dialog.props)), /valid email/);
  response = { message: 'Password reset email sent. Please check your inbox.' };
  await modal(render()).props.onSubmit();
  assert.equal(modal(render()).props.visible, false);
  assert.deepEqual(calls.at(-1), ['alex@example.test', 'photosync://reset-password']);
});

for (const creating of [false, true]) {
  test(`${creating ? 'New' : 'Login'} password stays masked by default, uses matching autofill and toggles without changing the value`, () => {
    const h = harness('src/components/auth-text-field.tsx'); const edits = [];
    const props = { label: 'Password', value: 'local-test', onChangeText: (value) => edits.push(value), creating, disabled: false };
    const render = () => h.render('AuthTextField', props);
    const input = () => nodes(render()).find((node) => node.type === 'TextInput');
    assert.equal(input().props.secureTextEntry, true);
    assert.equal(input().props.autoComplete, creating ? 'new-password' : 'current-password');
    nodes(render()).find((node) => node.props?.accessibilityLabel === 'Show password').props.onPress();
    assert.equal(input().props.secureTextEntry, false);
    assert.equal(input().props.value, 'local-test');
    assert.deepEqual(edits, []);
    nodes(render()).find((node) => node.props?.accessibilityLabel === 'Hide password').props.onPress();
    assert.equal(input().props.secureTextEntry, true);
    props.disabled = true;
    assert.equal(input().props.editable, false);
  });
}

test('Intro buttons and auth footer/back retain the expected Expo Router destinations', () => {
  const intro = harness('src/components/intro-screen.tsx');
  const tree = intro.render('IntroScreen');
  button(tree, 'Login').props.onPress(); button(tree, 'Create Account').props.onPress();
  assert.deepEqual(intro.routes, [['push', '/login'], ['push', '/create-account']]);
  for (const [variant, footer, destination] of [['login', 'New to PhotoSync? Create an account', '/create-account'], ['create', 'Already have an account? Login', '/login']]) {
    const auth = harness('src/components/auth-route-screen.tsx');
    const form = auth.render('AuthRouteScreen', { variant });
    button(form, footer).props.onPress();
    nodes(form).find((node) => node.props?.accessibilityLabel === 'Back to intro').props.onPress();
    assert.deepEqual(auth.routes, [['replace', destination], ['replace', '/']]);
  }
});
