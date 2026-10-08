const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const { createScrollNavigation } = load('src/navigation/scroll-navigation.ts');
const metrics = (offsetY, contentHeight = 1800, viewportHeight = 600) => ({ offsetY, contentHeight, viewportHeight });
function setup() {
  const controller = createScrollNavigation();
  const owner = {};
  controller.activate(owner, metrics(0));
  return { controller, owner, scroll: (y, height, viewport) => controller.scroll(owner, metrics(y, height, viewport)) };
}

test('Scrolling down hides after the threshold, scrolling up shows sooner, and the top always shows', () => {
  const { controller, scroll } = setup();
  for (const y of [5, 12, 20, 31, 40]) scroll(y);
  assert.equal(controller.getSnapshot(), false);
  scroll(44);
  assert.equal(controller.getSnapshot(), true);
  scroll(90); scroll(85);
  assert.equal(controller.getSnapshot(), true);
  scroll(78);
  assert.equal(controller.getSnapshot(), false);
  scroll(120);
  assert.equal(controller.getSnapshot(), true);
  scroll(8);
  assert.equal(controller.getSnapshot(), false);
});

test('Small direction changes do not flicker, and hundreds of scroll events notify only on visibility changes', () => {
  const { controller, scroll } = setup();
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => notifications++);
  for (const y of [14, 19, 17, 21, 19, 24, 22]) scroll(y);
  assert.equal(notifications, 0);
  for (let y = 23; y < 500; y++) scroll(y);
  assert.equal(notifications, 1);
  scroll(480);
  assert.equal(notifications, 2);
  unsubscribe();
  scroll(550);
  assert.equal(notifications, 2);
});

test('Top and bottom overscroll bounce cannot manufacture a reversal', () => {
  const { controller, scroll } = setup();
  scroll(-80); scroll(-10); scroll(0);
  assert.equal(controller.getSnapshot(), false);
  scroll(1200);
  assert.equal(controller.getSnapshot(), true);
  scroll(1300); scroll(1250); scroll(1200);
  assert.equal(controller.getSnapshot(), true);
  scroll(1188);
  assert.equal(controller.getSnapshot(), false);
});

test('Short pages and content shrinking or viewport growing restore navigation without another scroll', () => {
  const { controller, owner, scroll } = setup();
  scroll(100);
  assert.equal(controller.getSnapshot(), true);
  controller.resize(owner, metrics(100, 500));
  assert.equal(controller.getSnapshot(), false);
  scroll(20, 620);
  assert.equal(controller.getSnapshot(), false);
  controller.resize(owner, metrics(0));
  scroll(100);
  controller.resize(owner, metrics(100, 1800, 1800));
  assert.equal(controller.getSnapshot(), false);
});

test('Focus switches reset navigation and ignore late events or cleanup from retained screens', () => {
  const { controller, owner, scroll } = setup();
  scroll(300);
  const nextOwner = {};
  controller.activate(nextOwner, metrics(400));
  assert.equal(controller.getSnapshot(), false);
  controller.scroll(owner, metrics(600));
  controller.resize(owner, metrics(0, 100));
  controller.deactivate(owner);
  controller.scroll(nextOwner, metrics(440));
  assert.equal(controller.getSnapshot(), true);
  controller.deactivate(nextOwner);
  controller.scroll(nextOwner, metrics(900));
  assert.equal(controller.getSnapshot(), false);
  controller.activate(owner, metrics(300));
  scroll(300);
  assert.equal(controller.getSnapshot(), false, 'Restored offset must not count as a new downward scroll');
  scroll(340);
  assert.equal(controller.getSnapshot(), true);
  const freshLayout = createScrollNavigation();
  assert.equal(freshLayout.getSnapshot(), false);
});

test('Invalid measurements do not change tracking or visibility', () => {
  const { controller, scroll } = setup();
  scroll(NaN); scroll(Infinity); scroll(40, -1); scroll(40, 1800, 0);
  assert.equal(controller.getSnapshot(), false);
  scroll(45);
  assert.equal(controller.getSnapshot(), true);
});

test('Slow fractional scrolling still accumulates enough movement to hide and reveal', () => {
  const { controller, scroll } = setup();
  for (let y = 0; y <= 100; y += 0.25) scroll(y);
  assert.equal(controller.getSnapshot(), true);
  for (let y = 100; y >= 80; y -= 0.25) scroll(y);
  assert.equal(controller.getSnapshot(), false);
});

test('Scroll hook activates only after focus and forwards scroll, content size and viewport changes', () => {
  const controller = createScrollNavigation();
  let focus;
  const { useClientNavScroll } = load('src/hooks/use-client-nav-scroll.ts', {
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    react: { useCallback: (callback) => callback, useMemo: (callback) => callback(),
      useState: (initial) => [initial()], useRef: (initial) => ({ current: initial }) },
    '@/components/client-nav-scroll-provider': { useClientNavScrollController: () => controller },
  });
  const props = useClientNavScroll();
  const event = (y) => ({ nativeEvent: { contentOffset: { y }, contentSize: { height: 1800 }, layoutMeasurement: { height: 600 } } });
  props.onScroll(event(50));
  assert.equal(controller.getSnapshot(), false);
  const blur = focus();
  props.onScroll(event(100));
  assert.equal(controller.getSnapshot(), true);
  props.onContentSizeChange(390, 500);
  assert.equal(controller.getSnapshot(), false);
  props.onContentSizeChange(390, 1800);
  props.onScroll(event(150));
  assert.equal(controller.getSnapshot(), true);
  props.onLayout({ nativeEvent: { layout: { height: 1800 } } });
  assert.equal(controller.getSnapshot(), false);
  blur();
  props.onScroll(event(250));
  assert.equal(controller.getSnapshot(), false);
  assert.equal(props.scrollEventThrottle, 16);
});

function animationHarness(platform = 'android') {
  const states = [], effects = [], animations = [], writes = [], listeners = {}, removed = [];
  let cursor = 0, hidden = false;
  let resolveReader, resolveMotion;
  const readerQuery = new Promise((resolve) => { resolveReader = resolve; });
  const motionQuery = new Promise((resolve) => { resolveMotion = resolve; });
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; writes.push(value); }
    interpolate(config) { return config; }
  }
  const { useClientNavAnimation } = load('src/hooks/use-client-nav-animation.ts', {
    react: { useState: (initial) => { const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = value; writes.push(value); }];
    }, useEffect: (callback) => { effects.push(callback); } },
    'react-native': { Platform: { OS: platform }, Animated: { Value, timing: (_value, config) => {
      const animation = { config, starts: 0, stops: 0, start() { this.starts++; }, stop() { this.stops++; } };
      animations.push(animation); return animation;
    } }, AccessibilityInfo: { isScreenReaderEnabled: () => readerQuery, isReduceMotionEnabled: () => motionQuery,
      addEventListener: (event, callback) => { listeners[event] = callback; return { remove: () => removed.push(event) }; } } },
    '@/hooks/use-client-nav-scroll': { useClientNavHidden: () => hidden },
  });
  const render = () => { cursor = 0; effects.length = 0; return useClientNavAnimation(85, 34); };
  return { render, effects, animations, writes, listeners, removed, resolveReader, resolveMotion,
    hide: () => { hidden = true; } };
}

test('Bar animation uses the native driver, does not block virtualized lists, and stops on reversal/unmount', () => {
  const h = animationHarness();
  h.render();
  const showCleanup = h.effects[1]();
  assert.equal(h.animations[0].config.useNativeDriver, true);
  assert.equal(h.animations[0].config.isInteraction, false);
  showCleanup();
  h.hide();
  const result = h.render();
  const hideCleanup = h.effects[1]();
  assert.equal(result.hidden, true);
  assert.equal(result.containerStyle.transform[0].translateY.outputRange[1], 143);
  assert.equal(h.animations[1].config.toValue, 1);
  hideCleanup();
  assert.ok(h.animations.every((animation) => animation.starts === 1 && animation.stops === 1));
  const web = animationHarness('web');
  web.render(); web.effects[1]();
  assert.equal(web.animations[0].config.useNativeDriver, false);
});

test('Screen reader keeps tabs visible, reduced motion skips animation, and stale preference reads cannot override events', async () => {
  const h = animationHarness();
  h.render();
  const cleanup = h.effects[0]();
  h.listeners.screenReaderChanged(true);
  h.listeners.reduceMotionChanged(true);
  h.resolveReader(false); h.resolveMotion(false);
  await new Promise((resolve) => setImmediate(resolve));
  h.hide();
  assert.equal(h.render().hidden, false);
  h.effects[1]();
  assert.equal(h.animations.length, 0);
  h.listeners.screenReaderChanged(false);
  assert.equal(h.render().hidden, true);
  h.effects[1]();
  assert.equal(h.writes.at(-1), 1);
  cleanup();
  assert.equal(h.removed.length, 2);
});

test('Preference queries finishing after unmount never update React state', async () => {
  const h = animationHarness();
  h.render(); const cleanup = h.effects[0](); cleanup();
  h.resolveReader(true); h.resolveMotion(true);
  h.listeners.screenReaderChanged(true); h.listeners.reduceMotionChanged(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.writes, []);
});

test('Web uses scrolling even though its screen-reader API always reports true', async () => {
  const h = animationHarness('web');
  h.render(); const cleanup = h.effects[0]();
  h.resolveReader(true); h.resolveMotion(false);
  await new Promise((resolve) => setImmediate(resolve));
  h.hide();
  assert.equal(h.render().hidden, true);
  assert.equal(h.listeners.screenReaderChanged, undefined);
  cleanup();
});

test('Booking lists, details and profile forward vertical scroll handlers while preserving refresh and virtualization', () => {
  const jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, react: {}, 'expo-router': {}, 'expo-image': {}, 'expo-status-bar': {},
    'react-native': { FlatList: 'FlatList', ScrollView: 'ScrollView', View: 'View',
      Platform: { OS: 'android' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34, top: 0 }) },
    'react-native-svg': {}, '@/styles/responsive.styles': { responsiveStyles: {} },
    '@/styles/client-profile.styles': { clientProfileStyles: {} },
    '@/components/keyboard-form-scroll-view': { KeyboardFormScrollView: 'ScrollView' },
    '@/styles/client-bookings.styles': { clientBookingsStyles: {} },
    '@/data/service-catalog': { fallbackPortraitPackages: [] }, '@/services/admin-bookings': {},
  };
  const onScroll = () => {}, onLayout = () => {}, onContentSizeChange = () => {};
  const navScroll = { onScroll, onLayout, onContentSizeChange, scrollEventThrottle: 16 };
  const refreshControl = {};
  const { MobilePage } = load('src/components/mobile-page.tsx', imports);
  const { ProfilePage } = load('src/components/client-profile-view.tsx', imports);
  const { BookingCollection } = load('src/components/client-bookings-view.tsx', imports);
  for (const Component of [MobilePage, ProfilePage]) {
    const tree = Component({ title: 'Page', children: null, footerInset: 85, navScroll, refreshControl });
    const scroll = tree.props.children.find((node) => node.type === 'ScrollView');
    assert.equal(scroll.props.onScroll, onScroll);
    assert.equal(scroll.props.onLayout, onLayout);
    assert.equal(scroll.props.onContentSizeChange, onContentSizeChange);
    assert.equal(scroll.props.refreshControl, refreshControl);
    assert.ok(scroll.props.contentContainerStyle[1].paddingBottom >= 34 + 85);
  }
  const refresh = () => {};
  const list = BookingCollection({ bookings: [], isLoading: false, activeFilter: 'all', navScroll,
    onFilterChange: () => {}, onSelect: () => {}, onRefresh: refresh, bottomPadding: 143 });
  assert.equal(list.type, 'FlatList');
  assert.equal(list.props.onScroll, onScroll);
  assert.equal(list.props.onContentSizeChange, onContentSizeChange);
  assert.equal(list.props.onRefresh, refresh);
  assert.equal(list.props.initialNumToRender, 6);
  assert.equal(list.props.contentContainerStyle[1].paddingBottom, 143);
});
