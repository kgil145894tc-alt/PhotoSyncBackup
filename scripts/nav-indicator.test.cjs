const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function harness(platform = 'android') {
  const state = [], animations = [];
  let cursor = 0, reduceMotion = false, effectDeps, cleanup;
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
  }
  const imports = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], (value) => { state[index] = value; }];
      },
      useEffect(effect, deps) {
        if (effectDeps && deps.every((value, index) => value === effectDeps[index])) return;
        cleanup?.();
        effectDeps = deps;
        cleanup = effect();
      },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { View: 'View', Platform: { OS: platform }, Animated: {
      View: 'AnimatedView', Value,
      multiply: (value, factor) => ({ value, factor }),
      spring(value, config) {
        const animation = { value, config, starts: 0, stops: 0,
          start() { this.starts++; }, stop() { this.stops++; } };
        animations.push(animation);
        return animation;
      },
    } },
    '@/hooks/use-reduced-motion-preference': { useReducedMotionPreference: () => reduceMotion },
    '@/styles/navigation.styles': { bottomNavStyles: {} },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..',
    'src/components/floating-nav-indicator.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return {
    animations,
    render(currentIndex) { cursor = 0; return exports.FloatingNavIndicator({ currentIndex, count: 5 }); },
    reduceMotion() { reduceMotion = true; },
    unmount() { cleanup?.(); },
  };
}

test('The indicator starts at the selected tab and stays aligned after the bar resizes', () => {
  const h = harness();
  let tree = h.render(2);
  assert.equal(tree.props.children, null);
  tree.props.onLayout({ nativeEvent: { layout: { width: 500 } } });
  tree = h.render(2);
  let geometry = tree.props.children.props.style[1];
  assert.equal(geometry.width, 100);
  assert.equal(geometry.transform[0].translateX.value.value, 2);
  assert.equal(geometry.transform[0].translateX.factor, 100);
  tree.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
  geometry = h.render(2).props.children.props.style[1];
  assert.equal(geometry.width, 60);
  assert.equal(geometry.transform[0].translateX.factor, 60);
  assert.equal(tree.props.pointerEvents, 'none');
  h.unmount();
});

test('Rapid route changes retarget the same native animated value from its current position', () => {
  const h = harness();
  h.render(0);
  h.render(4);
  assert.equal(h.animations[0].stops, 1);
  h.animations[1].value.value = 2.7;
  h.render(1);
  assert.equal(h.animations[1].stops, 1);
  assert.equal(h.animations[2].value, h.animations[1].value);
  assert.equal(h.animations[2].value.value, 2.7);
  assert.equal(h.animations[2].config.toValue, 1);
  assert.equal(h.animations[2].config.useNativeDriver, true);
  assert.equal(h.animations[2].config.isInteraction, false);
  h.unmount();
  assert.equal(h.animations[2].stops, 1);
});

test('Reduced motion stops the spring and moves immediately to the selected tab', () => {
  const h = harness();
  h.render(0);
  h.reduceMotion();
  h.render(4);
  assert.equal(h.animations.length, 1);
  assert.equal(h.animations[0].stops, 1);
  assert.equal(h.animations[0].value.value, 4);
  h.unmount();
});

test('Web selection animates with its supported driver', () => {
  const h = harness('web');
  h.render(0);
  h.render(3);
  assert.equal(h.animations[1].config.useNativeDriver, false);
  assert.equal(h.animations[1].config.toValue, 3);
  h.unmount();
});
