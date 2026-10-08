const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function load(file, imports) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  } });
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function preferenceHarness() {
  const reads = []; const subscriptions = []; let store;
  const exports = load('src/hooks/use-reduced-motion-preference.ts', {
    react: { useSyncExternalStore(subscribe, snapshot, serverSnapshot) {
      store = { subscribe, snapshot, serverSnapshot }; return snapshot();
    } },
    'react-native': { AccessibilityInfo: {
      isReduceMotionEnabled() { const read = deferred(); reads.push(read); return read.promise; },
      addEventListener(name, onChange) {
        const item = { name, onChange, removed: false }; subscriptions.push(item);
        return { remove() { item.removed = true; } };
      },
    } },
  });
  exports.useReducedMotionPreference();
  return { store, reads, subscriptions };
}

test('Reduce Motion defaults to motion off, shares one subscription, and live changes outrank pending reads', async () => {
  const h = preferenceHarness(); let updates = 0;
  assert.equal(h.store.snapshot(), true);
  assert.equal(h.store.serverSnapshot(), true);
  const unsubscribe = h.store.subscribe(() => updates++);
  const unsubscribeOther = h.store.subscribe(() => updates++);
  assert.equal(h.subscriptions.length, 1);
  assert.equal(h.reads.length, 1);
  h.subscriptions[0].onChange(false);
  assert.equal(h.store.snapshot(), false);
  assert.equal(updates, 2);
  h.subscriptions[0].onChange(true);
  h.reads[0].resolve(false); await flush();
  assert.equal(h.store.snapshot(), true);
  unsubscribe();
  assert.equal(h.subscriptions[0].removed, false);
  unsubscribeOther();
  assert.equal(h.subscriptions[0].removed, true);
});

test('An abandoned Reduce Motion read cannot override a newly mounted subscriber', async () => {
  const h = preferenceHarness(); let updates = 0;
  const unsubscribe = h.store.subscribe(() => updates++);
  unsubscribe();
  const unsubscribeNext = h.store.subscribe(() => updates++);
  assert.equal(h.subscriptions.length, 2);
  h.reads[1].resolve(false); await flush();
  assert.equal(h.store.snapshot(), false);
  h.reads[0].resolve(true); await flush();
  assert.equal(h.store.snapshot(), false);
  assert.equal(updates, 1);
  unsubscribeNext();
  assert.equal(h.store.snapshot(), true, 'A later login must recheck the device preference');
});

test('Failed Reduce Motion reads keep motion disabled and still respond to accessibility changes', async () => {
  const h = preferenceHarness();
  const unsubscribe = h.store.subscribe(() => {});
  h.reads[0].reject(new Error('Preference unavailable')); await flush();
  assert.equal(h.store.snapshot(), true);
  h.subscriptions[0].onChange(false);
  assert.equal(h.store.snapshot(), false);
  unsubscribe();
});

function motionHarness(file, platform = 'android') {
  const refs = []; const state = []; const effects = []; const animations = [];
  let refCursor = 0; let stateCursor = 0; let effectCursor = 0; let reduceMotion = false;
  let focus; let focusCleanup;
  const jsx = (type, props) => ({ type, props });
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
  }
  const flatten = (style) => !style || typeof style !== 'object' ? undefined
    : Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style;
  const exports = load(file, {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      useRef(initial) { const index = refCursor++; return refs[index] ??= { current: initial }; },
      useState(initial) {
        const index = stateCursor++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
      useCallback(callback) { return callback; },
      useEffect(effect, dependencies) {
        const index = effectCursor++;
        const previous = effects[index];
        if (previous && dependencies.every((dep, i) => Object.is(dep, previous.dependencies[i]))) return;
        previous?.cleanup?.();
        effects[index] = { dependencies, effect, pending: true };
      },
    },
    'expo-router': { useFocusEffect(callback) { focus = callback; } },
    'react-native': {
      Pressable: 'Pressable', StyleSheet: { flatten }, Platform: { OS: platform },
      Easing: { cubic: 'cubic', out: (value) => `out(${value})` },
      Animated: { Value, View: 'AnimatedView', createAnimatedComponent: () => 'AnimatedPressable',
        timing(value, options) {
          const animation = { value, options, started: false, stopped: false,
            start() { this.started = true; }, stop() { this.stopped = true; } };
          animations.push(animation); return animation;
        },
      },
    },
    '@/hooks/use-reduced-motion-preference': { useReducedMotionPreference: () => reduceMotion },
  });
  return {
    animations, setReduceMotion(value) { reduceMotion = value; },
    render(name, props) {
      refCursor = stateCursor = effectCursor = 0;
      const tree = exports[name](props);
      for (const effect of effects) if (effect.pending) {
        effect.pending = false; effect.cleanup = effect.effect();
      }
      return tree;
    },
    focus() { focusCleanup?.(); focusCleanup = focus(); },
    blur() { focusCleanup?.(); focusCleanup = undefined; },
    unmount() { focusCleanup?.(); for (const effect of effects) effect.cleanup?.(); },
  };
}

test('Tab destination stays visible and interactive; interrupted fades restore full opacity', () => {
  const h = motionHarness('src/components/tab-screen-motion.tsx');
  const children = { meaningful: 'Existing route tree' };
  let tree = h.render('TabScreenMotion', { enabled: true, children });
  assert.equal(tree.props.children, children);
  assert.equal(tree.props.style.opacity.value, 1);
  assert.equal(tree.props.pointerEvents, undefined);
  h.focus();
  const first = h.animations[0];
  assert.equal(tree.props.style.opacity.value, 0.9);
  assert.deepEqual(plain(first.options), { toValue: 1, duration: 140,
    easing: 'out(cubic)', useNativeDriver: true, isInteraction: false });
  h.blur();
  assert.equal(first.stopped, true);
  assert.equal(tree.props.style.opacity.value, 1);
  tree = h.render('TabScreenMotion', { enabled: false, children });
  h.focus();
  assert.equal(h.animations.length, 1);
  assert.equal(tree.props.style.opacity.value, 1);
  assert.equal(tree.props.children, children);
});

test('Press feedback preserves function styles, existing transforms, children and original callbacks', () => {
  const h = motionHarness('src/components/motion-pressable.tsx'); const events = [];
  const transform = [{ rotate: '15deg' }]; const children = () => 'Existing pressed label';
  const props = { children, onPress: () => events.push('press'),
    onPressIn: (event) => events.push(['in', event]), onPressOut: (event) => events.push(['out', event]),
    onHoverIn: (event) => events.push(['hover in', event]), onHoverOut: (event) => events.push(['hover out', event]),
    style: ({ pressed, hovered }) => [{ transform, margin: 4 }, { opacity: pressed ? 0.5 : 1, borderWidth: hovered ? 2 : 1 }],
  };
  let tree = h.render('MotionPressable', props);
  assert.ok(Array.isArray(tree.props.style), 'AnimatedProps must receive an inspectable style array');
  assert.equal(tree.props.children, children);
  assert.equal(tree.props.onPress, props.onPress);
  assert.equal(tree.props.style[0][1].opacity, 1);
  const event = { type: 'original press event' };
  tree.props.onPressIn(event);
  tree = h.render('MotionPressable', props);
  assert.equal(tree.props.style[0][1].opacity, 0.5);
  assert.deepEqual(plain(tree.props.style[1].transform[0]), { rotate: '15deg' });
  assert.equal(transform.length, 1);
  assert.equal(h.animations[0].options.toValue, 0.98);
  tree.props.onPressOut(event);
  assert.equal(h.animations[0].stopped, true);
  assert.equal(h.animations[1].options.toValue, 1);
  assert.deepEqual(events, [['in', event], ['out', event]]);
  tree.props.onHoverIn(event); tree = h.render('MotionPressable', props);
  assert.equal(tree.props.style[0][1].borderWidth, 2);
  tree.props.onHoverOut(event); tree = h.render('MotionPressable', props);
  assert.equal(tree.props.style[0][1].borderWidth, 1);
  assert.deepEqual(events.slice(2), [['hover in', event], ['hover out', event]]);
  h.unmount(); assert.equal(h.animations[1].stopped, true);
});

test('Changing Reduce Motion or disabling a pressed control stops animation and restores neutral scale', () => {
  for (const mode of ['reduceMotion', 'disabled']) {
    const h = motionHarness('src/components/motion-pressable.tsx');
    let props = { style: { opacity: 1 }, disabled: false };
    let tree = h.render('MotionPressable', props);
    tree.props.onPressIn({});
    if (mode === 'reduceMotion') h.setReduceMotion(true);
    else props = { ...props, disabled: true };
    tree = h.render('MotionPressable', props);
    assert.equal(h.animations[0].stopped, true);
    assert.equal(tree.props.style[1].transform.at(-1).scale.value, 1);
    tree.props.onPressOut({});
    assert.equal(h.animations.length, 1);
  }
});

test('Selection feedback animates once, leaves the existing selection state intact, and respects Reduce Motion', () => {
  const h = motionHarness('src/components/motion-pressable.tsx');
  const original = { selected: false, accessibilityState: { selected: false } };
  h.render('MotionPressable', original);
  const selected = { selected: true, accessibilityState: { selected: true } };
  const tree = h.render('MotionPressable', selected);
  assert.equal(tree.props.accessibilityState, selected.accessibilityState);
  assert.equal(h.animations.length, 1);
  assert.equal(tree.props.style[1].transform.at(-1).scale.value, 0.97);
  h.render('MotionPressable', selected); assert.equal(h.animations.length, 1);
  h.setReduceMotion(true);
  h.render('MotionPressable', original); h.render('MotionPressable', selected);
  assert.equal(h.animations.length, 1);
  assert.equal(h.animations[0].stopped, true);
});

test('Web feedback uses the JS driver; route transitions remain disabled for main tabs, success and reduced motion', () => {
  const h = motionHarness('src/components/tab-screen-motion.tsx', 'web');
  h.render('TabScreenMotion', { enabled: true, children: 'Content' }); h.focus();
  assert.equal(h.animations[0].options.useNativeDriver, false);
  const routes = load('src/navigation/screen-motion.ts', {});
  for (const [name, area] of [['home', 'client'], ['book', 'client'], ['profile', 'client'],
    ['index', 'photographer'], ['requests', 'photographer'], ['calendar-slots', 'photographer'],
    ['book/success', 'client']]) {
    assert.equal(routes.getScreenMotionOptions(name, area, false, 'android').animation, 'none');
  }
  assert.equal(routes.getScreenMotionOptions('book/review', 'client', true, 'android').animation, 'none');
  assert.deepEqual(plain(routes.getScreenMotionOptions('book/review', 'client', false, 'ios')),
    { animation: 'simple_push', animationDuration: 240, headerShown: false });
  assert.deepEqual(plain(routes.getScreenMotionOptions('book/review', 'client', false, 'android')),
    { animation: 'slide_from_right', headerShown: false });
});
