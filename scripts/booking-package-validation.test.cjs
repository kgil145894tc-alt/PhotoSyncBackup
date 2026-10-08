const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const packageId = '11111111-1111-4111-8111-111111111111';
const serviceId = '22222222-2222-4222-8222-222222222222';
const packageItem = (changes = {}) => ({ id: packageId, serviceId, name: 'Portrait', priceAmount: 2500, price: '₱2,500',
  durationMinutes: 60, bufferMinutes: 0, minimumNoticeDays: 1, inclusions: [], isActive: true, ...changes });
function dateInDays(days) {
  const date = new Date(); date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function setup(options = {}) {
  const state = { confirmed: packageItem(), failLookup: false, conflict: false, writeError: null, catalogEvents: 0,
    reads: [], writes: [], history: [], notifications: [], bookingEvents: 0, ...options };
  const draft = { package: packageItem(), schedule: { bookingDate: dateInDays(10), startTime: '10:00:00', endTime: '11:00:00' },
    information: { fullName: 'Client', email: 'client@example.com', phone: '09123456789', notes: '', sessionLocation: 'Studio' } };
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'client-a' } }, error: null }) }, from: (table) => {
    const query = {};
    for (const method of ['select', 'eq', 'limit', 'single']) query[method] = () => query;
    for (const method of ['upsert', 'insert']) query[method] = (values) => { state.writes.push({ table, values }); return query; };
    query.then = (yes, no) => Promise.resolve(table === 'time_slots' ? { data: [], error: null }
      : table === 'bookings' ? { data: { id: 'new-booking' }, error: state.writeError } : { error: null }).then(yes, no);
    return query;
  } };
  const exports = {};
  const imports = {
    '@/lib/supabase': { supabase },
    '@/services/booking-draft': { getBookingDraft: () => draft, setSelectedPackage: (item) => { draft.package = item; } },
    '@/services/service-catalog': { getBookablePackage: async (id, parentId) => {
      state.reads.push([id, parentId]);
      if (state.failLookup) throw new Error('Offline');
      return state.confirmed;
    } },
    '@/services/catalog-events': { emitCatalogChanged: () => state.catalogEvents++ },
    '@/services/booking-availability': { getActiveBookingSlotsForDate: async () => ({ success: true,
      slots: state.conflict ? [{ start_time: '10:30:00', end_time: '11:30:00' }] : [] }) },
    '@/services/booking-events': { emitBookingsChanged: () => state.bookingEvents++ },
    '@/services/booking-status-history': { createBookingStatusHistory: async (value) => state.history.push(value) },
    '@/services/notifications': { createAdminBookingSubmittedNotifications: async (value) => state.notifications.push(value) },
    '@/services/studio-settings': { getDefaultWorkingHoursWindow: async (options) => {
      (state.workingOptions ??= []).push(options);
      if (state.workingError) throw new Error('Settings offline');
      return { startTime: '08:00:00', endTime: '17:00:00' };
    } },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/bookings.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Date, Promise, Error });
  return { api: exports, state, draft };
}

test('Every confirmation rechecks the package on the server before any write', async () => {
  const { api, state } = setup();
  assert.equal((await api.submitBookingRequest()).success, true);
  assert.deepEqual(state.reads, [[packageId, serviceId]]);
  assert.equal(state.writes.find((write) => write.table === 'bookings').values.package_id, packageId);
  assert.equal(state.bookingEvents, 1);
  await api.submitBookingRequest();
  assert.equal(state.reads.length, 2, 'A fresh browsing catalog cannot skip confirmation checks');
});

test('Booking submission forces current studio hours and a failed settings read prevents every write', async () => {
  for (const workingError of [false, true]) {
    const { api, state } = setup({ workingError });
    assert.equal((await api.submitBookingRequest()).success, !workingError);
    assert.equal(state.workingOptions[0].force, true); assert.equal(state.workingOptions[0].throwOnError, true);
    assert.equal(state.writes.some(w => w.table === 'bookings'), !workingError);
  }
});

test('Changed prices update the review draft and require another confirmation without inserting a booking', async () => {
  const { api, state, draft } = setup({ confirmed: packageItem({ priceAmount: 2800, price: '₱2,800' }) });
  const result = await api.submitBookingRequest();
  assert.equal(result.success, false);
  assert.match(result.message, /price changed to ₱2,800.*confirm again/);
  assert.equal(draft.package.priceAmount, 2800);
  assert.equal(state.writes.length, 0);
  assert.equal(state.catalogEvents, 1);
  assert.equal((await api.submitBookingRequest()).success, true);
  assert.equal(state.reads.length, 2);
});

test('Missing/deactivated packages and failed verification cannot submit using the cached selection', async () => {
  for (const options of [{ confirmed: null }, { failLookup: true }]) {
    const { api, state } = setup(options);
    const result = await api.submitBookingRequest();
    assert.equal(result.success, false);
    assert.match(result.message, options.failLookup ? /could not verify/ : /no longer available/);
    assert.equal(state.writes.length, 0);
    assert.equal(state.bookingEvents, 0);
  }
});

test('Confirmation uses current duration, preparation time and notice rules rather than cached rules', async () => {
  const duration = setup({ confirmed: packageItem({ durationMinutes: 120 }) });
  assert.match((await duration.api.submitBookingRequest()).message, /too short/);
  assert.equal(duration.state.writes.length, 0);
  const notice = setup({ confirmed: packageItem({ minimumNoticeDays: 3 }) });
  notice.draft.schedule.bookingDate = dateInDays(1);
  assert.match((await notice.api.submitBookingRequest()).message, /at least 3 days/);
  assert.equal(notice.state.writes.length, 0);
  const buffer = setup({ confirmed: packageItem({ bufferMinutes: 90 }) });
  buffer.draft.schedule.startTime = '16:00:00'; buffer.draft.schedule.endTime = '17:00:00';
  assert.match((await buffer.api.submitBookingRequest()).message, /outside the admin available time/);
  assert.equal(buffer.state.writes.length, 0);
});

test('Existing availability and database conflict checks still block bookings after package validation', async () => {
  const conflict = setup({ conflict: true });
  assert.match((await conflict.api.submitBookingRequest()).message, /overlaps/);
  assert.equal(conflict.state.writes.length, 0);
  const refused = setup({ writeError: { code: '23505', message: 'Slot was taken' } });
  assert.match((await refused.api.submitBookingRequest()).message, /just taken/);
  assert.equal(refused.state.bookingEvents, 0);
  assert.equal(refused.state.history.length, 0);
  assert.equal(refused.state.notifications.length, 0);
});

test('Accepted bookings and notifications use the freshly verified package name', async () => {
  const { api, state, draft } = setup({ confirmed: packageItem({ name: 'Updated Portrait' }) });
  assert.equal((await api.submitBookingRequest()).success, true);
  assert.equal(draft.package.name, 'Updated Portrait');
  assert.equal(state.history[0].metadata.packageName, 'Updated Portrait');
  assert.equal(state.notifications[0].packageName, 'Updated Portrait');
});

test('Review renders a changed server price, keeps the draft, and submits only after the next confirmation', async () => {
  const { api, state, draft } = setup({ confirmed: packageItem({ priceAmount: 2800, price: '₱2,800' }) });
  const screen = setupReviewScreen(api, draft);
  await screen.render().confirm.props.onPress();
  assert.equal(state.writes.length, 0);
  assert.equal(screen.cleared, false);
  assert.match(screen.alerts[0][1], /price changed/);
  assert.ok(screen.render().nodes.some((node) => node.type === 'Text' && node.props.children === '₱2,800'));
  await screen.render().confirm.props.onPress();
  assert.equal(screen.cleared, true);
  assert.deepEqual(screen.routes, ['/book/success']);
  assert.equal(state.reads.length, 2);
});

function setupReviewScreen(api, draft) {
  let isSubmitting = false, cleared = false, refCursor = 0;
  const refs = [];
  const mounted = { current: true };
  const routes = [], alerts = [];
  const jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, react: {
      useState: () => [isSubmitting, (value) => { isSubmitting = value; }],
      useRef: (value) => { const index = refCursor++; return refs[index] ??= { current: value }; },
    },
    'expo-image': { Image: 'Image' }, 'expo-router': { router: { back: () => {}, replace: (route) => routes.push(route) } },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View' },
    '@/components/app-alert': { showAppAlert: (...args) => alerts.push(args) },
    '@/components/mobile-page': { MobilePage: 'MobilePage', FlowSteps: 'FlowSteps' },
    '@/components/motion-pressable': { MotionPressable: 'MotionPressable' },
    '@/hooks/use-mounted-ref': { useMountedRef: () => mounted },
    '@/services/booking-draft': { getBookingDraft: () => draft, getSelectedPackage: () => draft.package,
      clearBookingDraft: () => { cleared = true; } },
    '@/services/bookings': api, '@/styles/responsive.styles': { responsiveStyles: {} },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/(client)/book/review.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => imports[name] });
  function render() {
    refCursor = 0;
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node); visit(node.props?.children);
    }
    visit(exports.default());
    return { nodes, confirm: nodes.find((node) => node.type === 'MotionPressable') };
  }
  return { render, routes, alerts, mounted, get cleared() { return cleared; } };
}

test('Review locks consecutive taps and shows loading only while one request is pending', async () => {
  let resolve, calls = 0;
  const screen = setupReviewScreen({ submitBookingRequest: () => {
    calls++;
    return new Promise((done) => { resolve = done; });
  } }, setup().draft);
  const confirm = screen.render().confirm;
  const pending = confirm.props.onPress();
  await confirm.props.onPress();
  assert.equal(calls, 1);
  const loading = screen.render();
  assert.equal(loading.confirm.props.disabled, true);
  assert.equal(loading.confirm.props.accessibilityState.busy, true);
  assert.ok(loading.nodes.some((node) => node.type === 'ActivityIndicator'));
  assert.ok(loading.nodes.some((node) => node.type === 'Text' && node.props.children === 'Submitting...'));
  assert.deepEqual(screen.routes, []);
  resolve({ success: true });
  await pending;
  assert.deepEqual(screen.routes, ['/book/success']);
  assert.equal(screen.cleared, true);
  await confirm.props.onPress();
  assert.equal(calls, 1);
});

test('Review releases the submission lock on a rejected request and retains the draft for retry', async () => {
  let calls = 0;
  const screen = setupReviewScreen({ submitBookingRequest: async () => {
    if (++calls === 1) throw new Error('offline');
    return { success: true };
  } }, setup().draft);
  await screen.render().confirm.props.onPress();
  assert.equal(screen.cleared, false);
  assert.equal(screen.render().confirm.props.disabled, false);
  assert.deepEqual(screen.alerts, [['Booking not submitted', 'Please try again.']]);
  await screen.render().confirm.props.onPress();
  assert.equal(calls, 2);
  assert.equal(screen.cleared, true);
  assert.deepEqual(screen.routes, ['/book/success']);
});

test('Review does not navigate or show an alert after its screen unmounts', async () => {
  for (const result of [{ success: true }, { success: false, message: 'offline' }]) {
    let resolve;
    const screen = setupReviewScreen({ submitBookingRequest: () => new Promise((done) => { resolve = done; }) }, setup().draft);
    const pending = screen.render().confirm.props.onPress();
    screen.mounted.current = false;
    resolve(result);
    await pending;
    assert.deepEqual(screen.routes, []);
    assert.deepEqual(screen.alerts, []);
    assert.equal(screen.cleared, false);
  }
});
