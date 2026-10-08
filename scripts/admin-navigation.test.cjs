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
function renderNav(pendingCount, hidden = false) {
  const routes = [];
  const { AdminFloatingNav } = load('src/components/admin-floating-nav.tsx', {
    '@/components/floating-nav-indicator': { FloatingNavIndicator: 'FloatingNavIndicator' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Animated: { View: 'View' }, View: 'View', Text: 'Text', Pressable: 'Pressable' },
    'react-native-svg': {}, '@/navigation/tab-navigation': navigation,
    '@/styles/admin-theme': theme, '@/styles/navigation.styles': styles,
  });
  return { routes, tree: AdminFloatingNav({ currentIndex: 2, height: 100, bottomInset: 34,
    leftInset: 44, rightInset: 0, hidden, pendingCount, onNavigate: (route) => routes.push(route) }) };
}

test('Hidden admin navigation does not intercept touches or expose off-screen tabs', () => {
  const { tree, routes } = renderNav(4, true);
  assert.equal(tree.props.pointerEvents, 'none');
  assert.equal(tree.props.accessibilityElementsHidden, true);
  assert.equal(tree.props.importantForAccessibility, 'no-hide-descendants');
  for (const tab of nodes(tree).filter((node) => node.props?.accessibilityRole === 'tab')) {
    assert.equal(tab.props.disabled, true);
    tab.props.onPress();
  }
  assert.deepEqual(routes, []);
});

test('Floating admin tabs retain routes, expose the selected tab and avoid pushing the active route', () => {
  const { tree, routes } = renderNav(4);
  const tabs = nodes(tree).filter((node) => node.props?.accessibilityRole === 'tab');
  assert.equal(tabs.length, 5);
  assert.deepEqual(tabs.map((node) => node.props.accessibilityState.selected), [false, false, true, false, false]);
  tabs.forEach((tab) => tab.props.onPress());
  assert.deepEqual(routes, ['/photographer', '/photographer/requests', '/photographer/services', '/photographer/profile']);
  assert.equal(navigation.getTabRouteIndex('/photographer/calendar-slots'), 2);
  assert.equal(navigation.isBottomNavVisible('/photographer/requests/booking-id'), false);
});

test('Floating bar clears bottom and landscape safe areas while the admin hook reserves its complete height', () => {
  const { tree } = renderNav(0);
  assert.equal(tree.props.style[1].bottom, 46);
  assert.equal(tree.props.style[1].paddingLeft, 44);
  assert.equal(tree.props.style[1].paddingRight, 12);
  const { useBottomNavHeight } = load('src/hooks/use-bottom-nav-height.ts', {
    'react-native': { useWindowDimensions: () => ({ width: 320, fontScale: 2 }) },
    '@/styles/navigation.styles': styles,
  });
  const occupied = useBottomNavHeight('admin') + 34;
  assert.ok(occupied >= tree.props.children.props.style[1].minHeight + tree.props.style[1].bottom);
  assert.equal(useBottomNavHeight(), 124);
  assert.ok(useBottomNavHeight('admin') > 110);
});

test('Pending badge hides unknown/zero counts, caps large counts and announces the true number', () => {
  for (const count of [null, 0]) {
    const { tree } = renderNav(count);
    assert.ok(!nodes(tree).some((node) => node.props?.accessibilityLabel?.includes(' pending')));
  }
  const { tree } = renderNav(123);
  assert.ok(nodes(tree).some((node) => node.props?.children === '99+'));
  assert.ok(nodes(tree).some((node) => node.props?.accessibilityLabel === 'Booking requests, 123 pending'));
});

test('Badge reuses the newest studio-wide server count without fetching, then clears on logout/account switch', () => {
  let snapshot = { accountId: 'admin-a', entries: {} };
  let reads = 0;
  const { useAdminPendingCount, selectAdminPendingCount } = load('src/hooks/use-admin-pending-count.ts', {
    react: { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    '@/services/booking-pages-store': { adminBookingPagesStore: {
      getSnapshot: () => snapshot, getServerSnapshot: () => snapshot, subscribe: () => () => {},
      refresh: () => { reads++; },
    } },
  });
  const entry = (pending, fetchedAt) => ({ data: { counts: { pending } }, fetchedAt });
  assert.equal(useAdminPendingCount(), null);
  snapshot.entries = { dashboard: entry(7, 10), filteredRequests: entry(0, 20), details: { data: { counts: null }, fetchedAt: 30 } };
  assert.equal(useAdminPendingCount(), 0);
  assert.equal(selectAdminPendingCount({ cached: entry(4, null) }), 4);
  snapshot = { accountId: null, entries: {} };
  assert.equal(useAdminPendingCount(), null);
  snapshot = { accountId: 'admin-b', entries: {} };
  assert.equal(useAdminPendingCount(), null);
  assert.equal(reads, 0);
});
