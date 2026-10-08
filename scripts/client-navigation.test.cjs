const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, imports) {
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
const navigation = load('src/navigation/tab-navigation.ts', {});
const theme = load('src/styles/admin-theme.ts', {});
const styles = load('src/styles/navigation.styles.ts', {
  'react-native': { StyleSheet: { create: (value) => value } }, '@/styles/admin-theme': theme,
});
const jsx = (type, props) => ({ type, props });
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
function renderNav(currentIndex = 1, height = 85, insets = { bottom: 34, left: 44, right: 0 }, hidden = false) {
  const routes = [];
  const { ClientFloatingNav } = load('src/components/client-floating-nav.tsx', {
    '@/components/floating-nav-indicator': { FloatingNavIndicator: 'FloatingNavIndicator' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Animated: { View: 'View' }, View: 'View', Text: 'Text', Pressable: 'Pressable' },
    'react-native-svg': {}, '@/navigation/tab-navigation': navigation,
    '@/styles/admin-theme': theme, '@/styles/navigation.styles': styles,
  });
  return { routes, tree: ClientFloatingNav({ currentIndex, height,
    hidden,
    bottomInset: insets.bottom, leftInset: insets.left, rightInset: insets.right,
    onNavigate: (route) => routes.push(route) }) };
}

test('Client floating tabs retain all five routes, announce selection and avoid pushing the active screen', () => {
  const { tree, routes } = renderNav();
  const tabs = nodes(tree).filter((node) => node.props?.accessibilityRole === 'tab');
  assert.equal(tabs.length, 5);
  assert.deepEqual(tabs.map((node) => node.props.accessibilityLabel), ['Home page', 'Services', 'Booking', 'About us', 'Profile']);
  assert.deepEqual(tabs.map((node) => node.props.accessibilityState.selected), [false, true, false, false, false]);
  assert.deepEqual(tabs.map((node) => node.props['aria-selected']), [false, true, false, false, false]);
  tabs.forEach((tab) => tab.props.onPress());
  assert.deepEqual(routes, ['/home', '/book', '/about', '/profile']);
});

test('Client content reserves the entire floating bar across small screens, tablets and larger text', () => {
  for (const width of [320, 390, 768]) {
    let previous = 0;
    for (const fontScale of [1, 2, 3]) {
      const { useBottomNavHeight } = load('src/hooks/use-bottom-nav-height.ts', {
        'react-native': { useWindowDimensions: () => ({ width, fontScale }) },
        '@/styles/navigation.styles': styles,
      });
      const height = useBottomNavHeight();
      const { tree } = renderNav(0, height);
      const bar = tree.props.children;
      assert.ok(height + 34 >= bar.props.style[1].minHeight + tree.props.style[1].bottom);
      assert.ok(height >= previous);
      assert.ok(height >= 85);
      previous = height;
    }
  }
  const { tree } = renderNav();
  assert.equal(tree.props.style[1].bottom, 46);
  assert.equal(tree.props.style[1].paddingLeft, 44);
  assert.equal(tree.props.style[1].paddingRight, 12);
});

test('A hidden bar cannot intercept touches or expose off-screen accessibility targets', () => {
  const { tree, routes } = renderNav(0, 85, { bottom: 0, left: 0, right: 0 }, true);
  assert.equal(tree.props.pointerEvents, 'none');
  assert.equal(tree.props.accessibilityElementsHidden, true);
  assert.equal(tree.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(tree.props['aria-hidden'], true);
  const tabs = nodes(tree).filter((node) => node.props?.accessibilityRole === 'tab');
  tabs.forEach((tab) => {
    assert.equal(tab.props.disabled, true);
    tab.props.onPress();
  });
  assert.deepEqual(routes, []);
});

test('Floating navigation stays on the existing main screens and stays hidden during booking and profile editing', () => {
  for (const [index, item] of navigation.CLIENT_TAB_ITEMS.entries()) {
    assert.equal(navigation.getTabRouteIndex(item.route), index);
    assert.equal(navigation.isBottomNavVisible(item.route), true);
  }
  for (const route of ['/book/schedule', '/book/information', '/book/review', '/profile/edit', '/services/portrait', '/notifications']) {
    assert.equal(navigation.isBottomNavVisible(route), false);
  }
  assert.equal(navigation.getTabRouteIndex('/book/schedule'), 2);
  assert.equal(navigation.getTabRouteIndex('/services/portrait'), 1);
});

test('BottomNav routes client tabs through Expo Router without adding data reads or subscribing to admin counts', () => {
  const routes = [];
  const { BottomNav } = load('src/components/bottom-nav.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/admin-floating-nav': { AdminFloatingNav: 'AdminFloatingNav' },
    '@/components/client-floating-nav': { ClientFloatingNav: 'ClientFloatingNav' },
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 85 },
    '@/hooks/use-client-nav-animation': { useClientNavAnimation: () => ({ hidden: false }) },
    '@/navigation/tab-navigation': navigation,
    'expo-router': { usePathname: () => '/profile', router: { push: (route) => routes.push(route) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0 }) },
  });
  const selectedRenderer = BottomNav({});
  const tree = selectedRenderer.type(selectedRenderer.props);
  assert.equal(tree.type, 'ClientFloatingNav');
  assert.equal(tree.props.currentIndex, 4);
  assert.equal(tree.props.bottomInset, 34);
  tree.props.onNavigate('/book');
  assert.deepEqual(routes, ['/book']);
});
