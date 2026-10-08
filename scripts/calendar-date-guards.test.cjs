const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function clock(initial = '2026-10-07T02:00:00.500Z') {
  let instant = new Date(initial).getTime();
  class StudioTestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  return { Date: StudioTestDate, set: (value) => { instant = new Date(value).getTime(); } };
}
function loadModule(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => {
    if (name.startsWith('@/assets/')) return name;
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Date, Intl, Promise, Map, Set, Error, ...globals });
  return exports;
}
const fixed = clock();
const guards = loadModule('src/services/calendar-date-guards.ts', {}, { Date: fixed.Date });

test('The studio clock uses Philippine midnight even when the device/host uses a different timezone', () => {
  assert.equal(guards.STUDIO_TIME_ZONE, 'Asia/Manila');
  assert.equal(guards.getStudioDateTime(new Date('2026-10-06T15:59:59Z')).date, '2026-10-06');
  const midnight = guards.getStudioDateTime(new Date('2026-10-06T16:00:00Z'));
  assert.equal(midnight.date, '2026-10-07');
  assert.equal(midnight.time, '00:00:00');
  assert.equal(guards.getStudioDateTime(new Date('2026-10-07T10:00:00-07:00')).date, '2026-10-08');
});

test('Past days/months/years are read-only while today and future dates are valid', () => {
  for (const date of ['2026-10-06', '2026-09-30', '2025-12-31']) {
    assert.match(guards.getCalendarDayValidationError(date), /Past dates are read-only/);
  }
  for (const date of ['2026-10-07', '2026-10-08', '2027-01-01']) {
    assert.equal(guards.getCalendarDayValidationError(date), null);
  }
});

test('Malformed and impossible dates are rejected rather than silently rolled into another month', () => {
  for (const date of ['', '2026-2-7', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '0000-01-01', '2026-10-07T00:00:00Z']) {
    assert.equal(guards.isValidCalendarDate(date), false);
    assert.match(guards.getCalendarDayValidationError(date), /valid calendar date/);
  }
  assert.equal(guards.isValidCalendarDate('2024-02-29'), true);
});

test('Today rejects elapsed or equal starts but accepts later seconds; future morning slots are valid', () => {
  for (const start of ['00:00:00', '09:59:59', '10:00:00']) {
    assert.match(guards.getCalendarSlotValidationError('2026-10-07', start, '11:00:00'), /already passed/);
  }
  assert.equal(guards.getCalendarSlotValidationError('2026-10-07', '10:00:01', '11:00:00'), null);
  assert.equal(guards.getCalendarSlotValidationError('2026-10-08', '08:00:00', '09:00:00'), null);
  for (const [start, end] of [['25:00:00', '26:00:00'], ['10:60:00', '11:00:00'], ['10:00', '11:00:00'], ['bad', 'bad']]) {
    assert.match(guards.getCalendarSlotValidationError('2026-10-08', start, end), /valid start and end/);
  }
  for (const end of ['10:00:00', '09:00:00']) {
    assert.match(guards.getCalendarSlotValidationError('2026-10-08', '10:00:00', end), /later than start/);
  }
});

function serviceHarness(options = {}) {
  const time = clock(options.now);
  const dateGuards = loadModule('src/services/calendar-date-guards.ts', {}, { Date: time.Date });
  const state = { reads: [], writes: [], events: [], audits: [], saved: { slot_date: '2026-10-08' },
    bookings: [], slots: [], failLookup: false, writeError: null, onRead: null, ...options };
  const supabase = { from: (table) => {
    const operations = [];
    const query = {};
    for (const method of ['select', 'eq', 'in', 'neq', 'limit', 'maybeSingle']) {
      query[method] = (...args) => { operations.push([method, ...args]); return query; };
    }
    for (const method of ['update', 'upsert', 'delete']) {
      query[method] = (payload) => { operations.push([method]); state.writes.push({ table, method, payload }); return query; };
    }
    query.then = (yes, no) => {
      const write = operations.some(([method]) => ['update', 'upsert', 'delete'].includes(method));
      const lookup = operations.some(([method]) => method === 'maybeSingle');
      if (!write) { state.reads.push({ table, operations }); state.onRead?.(table, time); }
      return Promise.resolve({ data: lookup ? state.saved : table === 'bookings' ? state.bookings : state.slots,
        error: lookup && state.failLookup ? new Error('Lookup offline') : write ? state.writeError : null,
      }).then(yes, no);
    };
    return query;
  } };
  const api = loadModule('src/services/calendar.ts', {
    '@/lib/supabase': { supabase }, '@/services/booking-availability': {},
    '@/services/audit-log': { createAuditLog: async (value) => state.audits.push(value) },
    '@/services/admin-bookings': { formatBookingTimeRange: () => '11 AM - 12 PM' },
    '@/services/calendar-events': { emitCalendarChanged: (date) => state.events.push(date) },
    '@/services/calendar-date-guards': dateGuards, '@/services/studio-settings': {
      getDefaultWorkingHoursWindow: async () => ({ startTime: '08:00:00', endTime: '17:00:00' }),
    },
  }, { Date: time.Date });
  return { api, state, time, guards: dateGuards };
}
const values = { date: '2026-10-07', startTime: '11:00:00', endTime: '12:00:00', status: 'available' };

test('Every calendar mutation rejects a past date before querying, writing, logging or invalidating', async () => {
  for (const date of ['2026-10-06', '2026-09-01', '2025-01-01']) {
    const { api, state } = serviceHarness();
    for (const run of [
      () => api.saveCalendarSlot({ ...values, date }), () => api.saveCalendarSlot({ ...values, date, slotId: 's1' }),
      () => api.markCalendarSlot({ ...values, date }), () => api.deleteCalendarSlot('s1', date),
      () => api.markCalendarDayUnavailable(date), () => api.reopenCalendarDay(date),
    ]) {
      const result = await run();
      assert.equal(result.success, false);
      assert.match(result.message, /read-only/);
    }
    assert.equal(state.reads.length + state.writes.length + state.events.length + state.audits.length, 0);
  }
});

test('Direct create/edit/mark calls reject elapsed starts today without writes', async () => {
  const { api, state } = serviceHarness();
  for (const slotId of [undefined, 's1']) {
    assert.equal((await api.saveCalendarSlot({ ...values, startTime: '09:00:00', slotId })).success, false);
  }
  assert.equal((await api.markCalendarSlot({ ...values, startTime: '09:00:00' })).success, false);
  assert.equal(state.reads.length + state.writes.length + state.events.length, 0);
});

test('Edit/delete use the saved original date, rejecting misleading or omitted caller dates and lookup failures', async () => {
  for (const extra of [{ saved: { slot_date: '2026-10-06' } }, { saved: null }, { failLookup: true }]) {
    const { api, state } = serviceHarness(extra);
    assert.equal((await api.saveCalendarSlot({ ...values, date: '2026-10-08', slotId: 's1' })).success, false);
    assert.equal((await api.deleteCalendarSlot('s1', '2026-10-08')).success, false);
    assert.equal((await api.deleteCalendarSlot('s1')).success, false);
    assert.equal(state.reads.length, 3);
    assert.equal(state.writes.length + state.events.length + state.audits.length, 0);
  }
});

test('Start time and midnight are checked again after awaited reads before any mutation', async () => {
  for (const method of ['saveCalendarSlot', 'markCalendarSlot']) {
    const { api, state } = serviceHarness({ onRead: (_table, time) => time.set('2026-10-07T03:00:01Z') });
    const result = await api[method](values);
    assert.equal(result.success, false);
    assert.match(result.message, /already passed/);
    assert.equal(state.writes.length + state.events.length, 0);
  }
  const late = serviceHarness({ now: '2026-10-07T15:59:59Z', onRead: (_table, time) => time.set('2026-10-07T16:00:01Z') });
  assert.equal((await late.api.markCalendarDayUnavailable(values.date)).success, false);
  assert.equal(late.state.writes.length, 0);
  const removal = serviceHarness({ now: '2026-10-07T15:59:59Z', saved: { slot_date: values.date },
    onRead: (_table, time) => time.set('2026-10-07T16:00:01Z') });
  assert.equal((await removal.api.deleteCalendarSlot('s1')).success, false);
  assert.equal(removal.state.writes.length, 0);
});

test('Future and later-today writes retain invalidation, audits, and existing overlap/booking protection', async () => {
  const { api, state } = serviceHarness();
  assert.equal((await api.saveCalendarSlot(values)).success, true);
  assert.equal((await api.saveCalendarSlot({ ...values, date: '2026-10-08', startTime: '08:00:00', slotId: 's1' })).success, true);
  assert.equal((await api.markCalendarSlot({ ...values, date: '2026-10-08' })).success, true);
  assert.equal(state.writes.length, 3);
  assert.equal(state.events.length, 3);
  assert.equal(state.audits.length, 3);
  const conflict = serviceHarness({ bookings: [{ id: 'b1', start_time: '11:30:00', end_time: '12:30:00' }] });
  assert.match((await conflict.api.saveCalendarSlot(values)).message, /confirmed booking/);
  assert.equal(conflict.state.writes.length, 0);
  const overlapping = serviceHarness({ slots: [{ id: 's2', start_time: '11:30:00', end_time: '12:30:00' }] });
  assert.match((await overlapping.api.saveCalendarSlot(values)).message, /overlaps/);
  assert.equal(overlapping.state.writes.length, 0);
});

test('Today can still close/reopen despite elapsed midnight; pending or confirmed bookings still block closure', async () => {
  const { api, state } = serviceHarness();
  assert.equal((await api.markCalendarDayUnavailable(values.date)).success, true);
  assert.equal(state.writes[0].payload.start_time, '00:00:00');
  assert.equal(state.writes[0].payload.status, 'unavailable');
  assert.equal((await api.reopenCalendarDay(values.date)).success, true);
  const busy = serviceHarness({ bookings: [{ id: 'pending-booking' }] });
  assert.match((await busy.api.markCalendarDayUnavailable(values.date)).message, /pending or confirmed/);
  assert.equal(busy.state.writes.length, 0);
});

const jsx = (type, props) => ({ type, props });
function nodesIn(tree) {
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === 'Modal' && !node.props.visible) return;
    nodes.push(node);
    if (typeof node.type === 'function') visit(node.type(node.props));
    else visit(node.props?.children);
  }
  visit(tree); return nodes;
}
const textIn = (nodes) => nodes.filter((node) => node.type === 'Text').map((node) => node.props.children).join(' ');
function screenHarness(date = '2026-10-07') {
  const fixture = serviceHarness();
  const selection = [], alerts = [];
  let stateIndex = 0;
  const { default: Screen } = loadModule('src/app/photographer/calendar-slots.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useMemo: (callback) => callback(), useState: (initial) => {
      const index = stateIndex++;
      if (!(index in selection)) selection[index] = typeof initial === 'function' ? initial() : initial;
      return [selection[index], (value) => { selection[index] = typeof value === 'function' ? value(selection[index]) : value; }];
    } },
    'expo-router': { router: { back() {} }, useLocalSearchParams: () => ({ date }) },
    'expo-image': { Image: 'Image' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { Modal: 'Modal', Pressable: 'Pressable', RefreshControl: 'RefreshControl', ScrollView: 'ScrollView',
      Text: 'Text', TextInput: 'TextInput', View: 'View', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' }, useWindowDimensions: () => ({ width: 375, fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'react-native-svg': { default: 'Svg', Circle: 'Circle', Path: 'Path' },
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 70 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-admin-calendar': { useAdminCalendarDay: () => ({ items: [{ id: 's1', startTime: '11:00:00',
      endTime: '12:00:00', status: 'available', isCustom: true, isSaved: true }], error: null,
      isLoading: false, isRefreshing: false, refresh: async () => {}, reconcile: async () => {} }) },
    '@/hooks/use-studio-calendar-clock': { useStudioCalendarClock: () => new fixture.time.Date() },
    '@/services/calendar-date-guards': fixture.guards, '@/services/calendar': fixture.api,
    '@/components/app-alert': { showAppAlert: (...args) => alerts.push(args) },
    '@/styles/photographer.styles': { photographerStyles: {} },
    '@/styles/admin-calendar-slots.styles': { adminCalendarSlotsStyles: {} },
    '@/styles/admin-theme': { adminColors: {} },
  }, { Date: fixture.time.Date });
  return { ...fixture, alerts, render: () => { stateIndex = 0; return nodesIn(Screen()); } };
}
const manage = (nodes) => nodes.find((node) => node.props.accessibilityLabel === 'Manage time slots');
const button = (nodes, text) => nodes.find((node) => node.type === 'Pressable' && textIn(nodesIn(node)) === text);

test('Past calendar dates remain visible with disabled editing, and direct callbacks cannot open the form', () => {
  for (const date of ['2026-10-06', '2026-09-01', '2025-12-31']) {
    const fixture = screenHarness(date);
    let nodes = fixture.render();
    assert.match(textIn(nodes), /Past dates are read-only/);
    assert.match(textIn(nodes), /11:00 AM - 12:00 PM/);
    assert.equal(manage(nodes).props.disabled, true);
    manage(nodes).props.onPress();
    nodes = fixture.render();
    assert.doesNotMatch(textIn(nodes), /Manage Date/);
    assert.equal(fixture.alerts.length, 1);
    assert.equal(fixture.state.writes.length, 0);
  }
});

test('A form left open across studio midnight disables mutations and rejects retained handlers', async () => {
  const fixture = screenHarness();
  manage(fixture.render()).props.onPress();
  let nodes = fixture.render();
  const add = button(nodes, '+ Add Time Slot');
  add.props.onPress();
  nodes = fixture.render();
  const submit = button(nodes, 'Add');
  const edit = nodes.find((node) => node.props.accessibilityLabel === 'Edit time slot');
  const availability = nodes.filter((node) => node.props.accessibilityRole === 'radio');
  fixture.time.set('2026-10-07T16:00:00Z');
  nodes = fixture.render();
  assert.equal(button(nodes, '+ Add Time Slot').props.disabled, true);
  assert.equal(button(nodes, 'Add').props.disabled, true);
  assert.ok(nodes.filter((node) => node.props.accessibilityRole === 'radio').every((node) => node.props.disabled));
  await submit.props.onPress();
  add.props.onPress(); edit.props.onPress();
  for (const option of availability) await option.props.onPress();
  assert.equal(fixture.state.reads.length + fixture.state.writes.length, 0);
  assert.equal(fixture.alerts.length, 5);
});

test('The slot form rejects a past start today and accepts a later valid slot using the existing save path', async () => {
  const fixture = screenHarness();
  manage(fixture.render()).props.onPress();
  button(fixture.render(), '+ Add Time Slot').props.onPress();
  let nodes = fixture.render();
  nodes.find((node) => node.props.accessibilityLabel === 'Start time').props.onChangeText('9:00 AM');
  nodes.find((node) => node.props.accessibilityLabel === 'End time').props.onChangeText('12:00 PM');
  await button(fixture.render(), 'Add').props.onPress();
  assert.match(textIn(fixture.render()), /already passed/);
  assert.ok(fixture.render().some((node) => node.type === 'KeyboardAvoidingView' && node.props.behavior === 'height'), 'Validation notices remain within the keyboard-adjusted modal viewport');
  assert.ok(fixture.render().some((node) => node.type === 'View' && node.props.accessibilityElementsHidden === true && node.props.accessibilityViewIsModal === false && node.props.importantForAccessibility === 'no-hide-descendants'), 'The time-entry form is hidden from TalkBack while its validation notice is visible');
  assert.equal(fixture.state.writes.length, 0);
  button(fixture.render(), 'OK').props.onPress();
  assert.ok(fixture.render().some((node) => node.type === 'View' && node.props.accessibilityElementsHidden === false && node.props.accessibilityViewIsModal === true), 'Dismissing the notice restores access to the unchanged form');
  fixture.render().find((node) => node.props.accessibilityLabel === 'Start time').props.onChangeText('11:00 AM');
  await button(fixture.render(), 'Add').props.onPress();
  assert.equal(fixture.state.writes.length, 1);
  assert.equal(fixture.state.writes[0].payload.start_time, '11:00:00');
});

test('Clock updates run only while focused, resume promptly and detach the timer and AppState listener', () => {
  const time = clock();
  let focus, tick, resume, stored, cleared = 0, removed = 0;
  const { useStudioCalendarClock } = loadModule('src/hooks/use-studio-calendar-clock.ts', {
    react: { useCallback: (callback) => callback, useState: (initial) => { stored ??= initial(); return [stored, (value) => { stored = value; }]; } },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_name, callback) => { resume = callback; return { remove: () => removed++ }; } } },
  }, { Date: time.Date, setInterval: (callback, interval) => { tick = callback; assert.equal(interval, 30_000); return 1; },
    clearInterval: (id) => { assert.equal(id, 1); cleared++; } });
  const first = useStudioCalendarClock().getTime();
  assert.equal(tick, undefined);
  const leave = focus();
  time.set('2026-10-07T16:00:00Z'); tick();
  assert.ok(useStudioCalendarClock().getTime() > first);
  time.set('2026-10-08T00:00:00Z'); resume('background');
  assert.equal(stored.toISOString(), '2026-10-07T16:00:00.000Z');
  resume('active');
  assert.equal(stored.toISOString(), '2026-10-08T00:00:00.000Z');
  leave();
  assert.equal(cleared + removed, 2);
  time.set('2026-10-09T00:00:00Z'); tick(); resume('active');
  assert.equal(stored.toISOString(), '2026-10-08T00:00:00.000Z');
});
