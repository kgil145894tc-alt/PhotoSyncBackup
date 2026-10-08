const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function setup(platform = 'android', callbacks = {}) {
  let focused = null;
  let visible = false;
  let keyboardTop = 500;
  let nextFrame = 0;
  const frames = new Map();
  const listeners = new Map();
  const cleanups = [];
  const scrolls = [];
  const viewport = { top: 100, height: 700 };
  const imports = {
    react: {
      useRef: (current) => ({ current }),
      useCallback: (callback) => callback,
      useEffect: (effect) => cleanups.push(effect()),
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': {
      ScrollView: 'ScrollView', Platform: { OS: platform },
      TextInput: { State: { currentlyFocusedInput: () => focused } },
      Keyboard: {
        isVisible: () => visible,
        metrics: () => visible ? { screenY: keyboardTop } : undefined,
        addListener: (event, callback) => {
          listeners.set(event, callback);
          return { remove: () => listeners.delete(event) };
        },
      },
    },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..',
    'src/components/keyboard-form-scroll-view.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name) => imports[name],
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const { props } = exports.KeyboardFormScrollView(callbacks);
  props.ref.current = {
    getNativeScrollRef: () => ({
      measureInWindow: (callback) => callback(0, viewport.top, 390, viewport.height),
    }),
    scrollTo: ({ y }) => scrolls.push(y),
  };
  return {
    props, viewport, scrolls, frames, listeners,
    focus(top, height = 48) {
      focused = { measureInWindow: (callback) => callback(0, top, 350, height) };
      props.onFocus({});
    },
    blur() { focused = null; },
    show(top = 500) {
      visible = true;
      keyboardTop = top;
      listeners.get('keyboardDidShow')?.();
    },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); },
    cleanup() { cleanups.forEach((cleanup) => cleanup()); },
  };
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: opening the keyboard reveals a lower password field after layout shrinks`, () => {
    const form = setup(platform);
    form.focus(650);
    form.flush();
    assert.deepEqual(form.scrolls, []);
    form.show();
    form.viewport.height = 400;
    form.props.onLayout({});
    form.flush();
    assert.deepEqual(form.scrolls, [214]);
    form.cleanup();
  });
}

test('Switching booking fields with the keyboard open preserves the existing scroll offset', () => {
  const form = setup();
  form.show();
  form.props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } });
  form.focus(520, 120);
  form.flush();
  assert.deepEqual(form.scrolls, [456]);
  form.focus(200);
  form.flush();
  assert.deepEqual(form.scrolls, [456], 'A visible field should not move the form');
  form.cleanup();
});

test('Layout changes forward navigation callbacks and use the smaller visible viewport', () => {
  const received = [];
  const event = { nativeEvent: { layout: { height: 300 } } };
  const form = setup('android', { onLayout: (value) => received.push(value) });
  form.show();
  form.focus(420);
  form.viewport.height = 300;
  form.props.onLayout(event);
  form.flush();
  assert.equal(received[0], event);
  assert.deepEqual(form.scrolls, [84]);
  form.cleanup();
});

test('Blurred inputs and unmounted forms cancel pending work and remove keyboard listeners', () => {
  const form = setup();
  form.show();
  form.focus(650);
  form.blur();
  form.flush();
  assert.deepEqual(form.scrolls, []);
  form.focus(650);
  assert.equal(form.frames.size, 1);
  form.cleanup();
  assert.equal(form.frames.size, 0);
  assert.equal(form.listeners.size, 0);
});

test('Web keeps browser focus scrolling without native measurements', () => {
  const form = setup('web');
  form.show();
  form.focus(650);
  form.props.onLayout({});
  form.flush();
  assert.deepEqual(form.scrolls, []);
  form.cleanup();
});
