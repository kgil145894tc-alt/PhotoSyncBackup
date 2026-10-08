const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function setup(reduced) {
  let cursor = 0, reduceMotion = reduced;
  const hooks = [], effects = [], animationCalls = [], routes = [];
  const jsx = (type, props) => ({ type, props });
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
  }
  const animations = [];
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      useState: (initial) => {
        const index = cursor++;
        hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
        return [hooks[index].value, () => {}];
      },
      useRef: (initial) => hooks[cursor++] ??= { current: initial },
      useEffect: (effect, deps) => {
        const index = cursor++, previous = hooks[index];
        if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
          effects.push(() => {
            previous?.cleanup?.();
            hooks[index] = { deps, cleanup: effect() };
          });
        }
      },
    },
    'expo-router': { router: { replace: (route) => routes.push(route) } },
    'react-native': {
      Animated: {
        Value, View: 'Animated.View', Text: 'Animated.Text',
        timing: (value, config) => { animationCalls.push(config); return { value, config }; },
        parallel: () => {
          const animation = { started: false, stopped: false,
            start() { this.started = true; }, stop() { this.stopped = true; } };
          animations.push(animation); return animation;
        },
      },
      Easing: { out: (value) => value, cubic: 'cubic' },
      Platform: { OS: 'android' }, Text: 'Text', View: 'View',
    },
    'react-native-svg': { default: 'Svg', Path: 'Path' },
    '@/components/mobile-page': { MobilePage: 'MobilePage' },
    '@/components/motion-pressable': { MotionPressable: 'MotionPressable' },
    '@/hooks/use-reduced-motion-preference': { useReducedMotionPreference: () => reduceMotion },
    '@/styles/responsive.styles': { responsiveStyles: {} },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/(client)/book/success.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  function render() {
    cursor = 0;
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node); visit(node.props?.children);
    }
    visit(exports.default());
    while (effects.length) effects.shift()();
    return nodes;
  }
  return { render, animationCalls, animations, routes,
    setReduced(value) { reduceMotion = value; },
    unmount() { hooks.forEach((hook) => hook?.cleanup?.()); },
  };
}

test('Booking success with Reduce Motion displays the icon and copy immediately', () => {
  const screen = setup(true);
  const nodes = screen.render();
  assert.equal(screen.animationCalls.length, 0);
  const icon = nodes.find((node) => node.type === 'Animated.View');
  assert.equal(icon.props.style.at(-1).opacity.value, 1);
  assert.equal(icon.props.style.at(-1).transform[0].scale.value, 1);
  for (const text of nodes.filter((node) => node.type === 'Animated.Text')) {
    assert.equal(text.props.style.at(-1).opacity.value, 1);
  }
});

test('Booking success motion never delays navigation and stops on unmount', () => {
  const screen = setup(false);
  const nodes = screen.render();
  assert.equal(screen.animations[0].started, true);
  assert.ok(screen.animationCalls.every((call) => call.useNativeDriver && call.isInteraction === false));
  assert.ok(screen.animationCalls.every((call) => call.duration + (call.delay ?? 0) <= 450));
  nodes.find((node) => node.type === 'MotionPressable').props.onPress();
  assert.deepEqual(screen.routes, ['/home']);
  screen.unmount();
  assert.equal(screen.animations[0].stopped, true);
});

test('Turning Reduce Motion on stops success motion and later preference changes do not replay it', () => {
  const screen = setup(false);
  screen.render();
  screen.setReduced(true);
  const nodes = screen.render();
  assert.equal(screen.animations[0].stopped, true);
  assert.ok(nodes.filter((node) => node.type === 'Animated.Text').every((node) => node.props.style.at(-1).opacity.value === 1));
  screen.setReduced(false);
  screen.render();
  assert.equal(screen.animations.length, 1);
});
