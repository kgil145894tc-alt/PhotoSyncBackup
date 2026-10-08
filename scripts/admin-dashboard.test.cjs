const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name) => {
      if (name.startsWith('@/assets/')) return name;
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    Date, Promise, Error, Set,
  });
  return exports;
}

function renderDashboard(snapshot) {
  const jsx = (type, props) => ({ type, props });
  const { default: Dashboard } = loadModule('src/app/photographer/index.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useMemo: (callback) => callback(), useCallback: (callback) => callback,
      useState: (initial) => [initial, () => {}] },
    'expo-router': { router: {}, useFocusEffect: () => {} },
    'expo-image': { Image: 'Image' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
      RefreshControl: 'RefreshControl', useWindowDimensions: () => ({ width: 375, fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'react-native-svg': {}, '@/components/admin-brand-header': {},
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-paged-admin-bookings': { usePagedAdminBookings: () => snapshot },
    '@/hooks/use-notification-unread-count': { useNotificationUnreadCount: () => ({ unreadCount: 0,
      error: null, isRefreshing: false, refresh: async () => {} }) },
    '@/services/admin-bookings': { formatBookingTimeRange: () => '10 AM - 11 AM', formatShortBookingDate: (date) => date },
    '@/services/booking-events': {}, '@/services/notifications': {},
    '@/styles/photographer.styles': { photographerStyles: {} },
  });
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(Dashboard());
  return nodes;
}

test('Attention panel uses exact pending totals, while unknown totals do not claim requests are cleared', () => {
  const state = { requests: [], error: null, isLoading: false, isRefreshing: false, refresh: async () => {} };
  const pending = renderDashboard({ ...state, counts: { pending: 4, today: 0, upcoming: 0 } });
  assert.ok(pending.some((node) => node.props?.children === '4 requests are waiting'));
  assert.ok(pending.some((node) => node.props?.accessibilityLabel === 'Review pending booking requests'));
  const cleared = renderDashboard({ ...state, counts: { pending: 0, today: 0, upcoming: 0 } });
  assert.ok(cleared.some((node) => node.props?.children === 'You’re all caught up'));
  const unknown = renderDashboard({ ...state, counts: null });
  assert.ok(!unknown.some((node) => node.props?.children === 'You’re all caught up'));
});

test('Dashboard keeps cached appointment cards visible while refreshing independently of the notification badge', () => {
  const nodes = renderDashboard({ accountId: 'admin-a', error: null, isLoading: false, isRefreshing: true,
    refresh: async () => {}, requests: [{ id: 'confirmed-booking', status: 'confirmed', bookingDate: '2099-01-01',
      clientName: 'Client', packageName: 'Portrait', startTime: '10:00:00', endTime: '11:00:00' }] });
  assert.ok(nodes.some((node) => node.props?.item?.bookingId === 'confirmed-booking'));
  assert.ok(!nodes.some((node) => node.props?.text === 'Loading appointments...'));
});

test('Dashboard initial fetch failure shows an error rather than claiming there are no appointments', () => {
  const nodes = renderDashboard({ accountId: 'admin-a', error: 'Could not load bookings. Please try again.',
    isLoading: false, isRefreshing: false, refresh: async () => {}, requests: [] });
  assert.ok(nodes.some((node) => node.props?.text?.startsWith('Could not load')));
  assert.ok(!nodes.some((node) => node.props?.text === 'No upcoming appointments.'));
});
