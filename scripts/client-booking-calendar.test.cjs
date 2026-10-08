const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(file, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, Date, Intl, Promise, Map, Set, Error, ...globals });
  return exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function slotsFor(date, duration = 60) {
  return [9, 11].map(hour => ({ id: `${date}-${hour}`, status: 'available',
    startTime: `${String(hour).padStart(2, '0')}:00:00`,
    endTime: `${String(hour + duration / 60).padStart(2, '0')}:00:00` }));
}
function nodesIn(tree) {
  const nodes = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    nodes.push(node); visit(node.props?.children);
  };
  visit(tree); return nodes;
}
function textIn(tree) {
  if (Array.isArray(tree)) return tree.map(textIn).join(' ');
  if (tree && typeof tree === 'object') return textIn(tree.props?.children);
  return tree == null ? '' : String(tree);
}
const findButton = (fixture, label) => fixture.nodes.find(node => node.type === 'Pressable' &&
  (node.props.accessibilityLabel === label || textIn(node) === label));

function fixture(options = {}) {
  const state = { now: '2026-10-07T02:00:00Z', package: { durationMinutes: 60, bufferMinutes: 0, minimumNoticeDays: 1 },
    calls: [], alerts: [], navigation: [], schedules: [], saves: [], writesAfterUnmount: 0, ...options };
  class StudioDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return new Date(state.now).getTime(); }
  }
  let cursor = 0, dirty = false, mounted = true, focused = true, tree;
  const hooks = [];
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (callback, deps) => {
    const index = cursor++;
    if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) hooks[index] = { value: callback(), deps };
    return hooks[index].value;
  };
  const effect = (type, callback, deps) => {
    const index = cursor++;
    const old = hooks[index];
    if (!old || !sameDeps(old.deps, deps)) hooks[index] = { type, callback, deps, changed: true,
      cleanup: old?.cleanup, active: old?.active ?? false };
  };
  const react = {
    useState: initial => {
      const index = cursor++;
      hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, value => {
        if (!mounted) state.writesAfterUnmount++;
        const next = typeof value === 'function' ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
      }];
    },
    useRef: value => { const index = cursor++; hooks[index] ??= { value: { current: value } }; return hooks[index].value; },
    useMemo: memo, useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect: (callback, deps) => effect('effect', callback, deps),
  };
  const routerApi = {
    useFocusEffect: callback => effect('focus', callback, [callback]),
    useLocalSearchParams: () => state.params ?? {},
    router: { push: route => state.navigation.push(['push', route]), replace: route => state.navigation.push(['replace', route]) },
  };
  const calendarApi = {
    getCalendarDaySummaries: async (month, flags) => {
      state.calls.push(['month', month, flags]);
      return state.loadMonth ? state.loadMonth(month) : [];
    },
    getClientBookableSlotsForDate: async args => {
      state.calls.push(['day', args.date, args]);
      return state.loadSlots ? state.loadSlots(args) : slotsFor(args.date, args.durationMinutes);
    },
    getMonthPrefix: date => date.slice(0, 7),
    addMonthsToMonthPrefix: (month, offset) => {
      const date = new Date(`${month}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + offset); return date.toISOString().slice(0, 7);
    },
    getClampedDateInMonth: (month, day) => {
      const date = new Date(`${month}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + 1, 0);
      return `${month}-${String(Math.min(day, date.getUTCDate())).padStart(2, '0')}`;
    },
    buildCalendarGridDays: month => Array.from({ length: 35 }, (_, index) => {
      const date = new Date(`${month}-01T00:00:00Z`);
      date.setUTCDate(index + 1);
      const value = date.toISOString().slice(0, 10);
      return { date: value, isCurrentMonth: value.startsWith(month) };
    }),
    formatCalendarMonthLabel: month => month,
    formatSlotTimeRange: slot => `${slot.startTime} - ${slot.endTime}`,
  };
  const calendarHook = loadModule('src/hooks/use-client-booking-calendar.ts', {
    react, 'expo-router': routerApi, '@/services/calendar': calendarApi,
  });
  const guards = loadModule('src/services/calendar-date-guards.ts', {}, { Date: StudioDate });
  const mountedHook = loadModule('src/hooks/use-mounted-ref.ts', { react });
  const jsx = (type, props, key) => ({ type, props, key });
  const { default: Screen } = loadModule('src/app/(client)/book/schedule.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-router': routerApi,
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' },
    '@/components/app-alert': { showAppAlert: (...args) => state.alerts.push(args) },
    '@/components/mobile-page': { MobilePage: 'MobilePage', FlowSteps: 'FlowSteps' },
    '@/components/motion-pressable': { MotionPressable: 'Pressable' },
    '@/hooks/use-client-booking-calendar': calendarHook, '@/hooks/use-mounted-ref': mountedHook,
    '@/hooks/use-studio-calendar-clock': { useStudioCalendarClock: () => new StudioDate() },
    '@/services/calendar': calendarApi, '@/services/calendar-date-guards': guards,
    '@/services/booking-draft': { getSelectedPackage: () => state.package, setBookingSchedule: schedule => state.schedules.push(schedule) },
    '@/services/client-bookings': { rescheduleClientBooking: async (id, schedule) => {
      state.saves.push([id, schedule]); return state.save ? state.save() : { success: true };
    } },
    '@/styles/responsive.styles': { responsiveStyles: {} },
  }, { Date: StudioDate });
  function commit() {
    for (const hook of hooks) {
      if (!hook.changed || !hook.type) continue;
      if (hook.active) hook.cleanup?.();
      hook.active = hook.type === 'effect' || focused;
      hook.changed = false;
      hook.cleanup = hook.active ? hook.callback() : undefined;
    }
  }
  function render(commitEffects = true) {
    cursor = 0; dirty = false; tree = Screen();
    if (commitEffects) commit();
    return nodesIn(tree);
  }
  async function settle() {
    for (let index = 0; index < 8; index++) {
      await flush();
      if (!dirty) return;
      render();
    }
    throw new Error('Render did not settle');
  }
  const api = { state, render, settle, commit, get nodes() { return nodesIn(tree); }, get text() { return textIn(tree); },
    blur() {
      focused = false;
      for (const hook of hooks) if (hook.type === 'focus' && hook.active) { hook.cleanup?.(); hook.active = false; }
    },
    focus() {
      focused = true;
      for (const hook of hooks) if (hook.type === 'focus' && !hook.active) { hook.cleanup = hook.callback(); hook.active = true; }
    },
    unmount() {
      api.blur(); mounted = false;
      for (const hook of hooks) if (hook.type === 'effect' && hook.active) { hook.cleanup?.(); hook.active = false; }
    },
  };
  return api;
}
const initial = async options => { const f = fixture(options); f.render(); await f.settle(); return f; };
const readKeys = f => f.state.calls.map(([kind, key]) => `${kind}:${key}`);
const selectedId = f => f.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityState?.selected &&
  /^\d{4}-\d{2}-\d{2}-\d/.test(node.key ?? ''))?.key;

test('Reads begin after commit; month navigation makes one summary read and one read for the selected date', async () => {
  const f = fixture(); f.render(false);
  assert.equal(f.state.calls.length, 0);
  assert.match(f.text, /Checking available times/);
  assert.doesNotMatch(f.text, /No available times/);
  f.commit(); await f.settle();
  assert.deepEqual(readKeys(f), ['month:2026-10', 'day:2026-10-08']);
  f.state.calls.length = 0;
  findButton(f, 'Next month').props.onPress(); f.render(); await f.settle();
  assert.deepEqual(readKeys(f), ['month:2026-11', 'day:2026-11-08']);
  assert.equal(selectedId(f), '2026-11-08-9');
  assert.match(f.text, /November 8, 2026/);
  assert.ok(f.state.calls.every(([, , flags]) => flags.throwOnError));
});

test('Selecting a day loads only that day and hides previous slots before effects run', async () => {
  const next = deferred(); const f = await initial(); f.state.calls.length = 0;
  f.state.loadSlots = () => next.promise;
  findButton(f, 'October 12, 2026').props.onPress(); f.render(false);
  assert.equal(selectedId(f), undefined);
  assert.equal(findButton(f, 'Continue').props.disabled, true);
  f.commit(); await f.settle();
  assert.deepEqual(readKeys(f), ['day:2026-10-12']);
  next.resolve(slotsFor('2026-10-12')); await f.settle();
  assert.equal(selectedId(f), '2026-10-12-9');
});

test('Out-of-order date responses and obsolete failures cannot overwrite the latest date', async () => {
  for (const failOld of [false, true]) {
    const old = deferred(), latest = deferred(); const f = await initial();
    f.state.loadSlots = ({date}) => date.endsWith('-12') ? old.promise : latest.promise;
    findButton(f, 'October 12, 2026').props.onPress(); f.render(); await f.settle();
    findButton(f, 'October 13, 2026').props.onPress(); f.render(); await f.settle();
    latest.resolve(slotsFor('2026-10-13')); await f.settle();
    if (failOld) old.reject(new Error('Old read failed')); else old.resolve(slotsFor('2026-10-12'));
    await f.settle();
    assert.equal(selectedId(f), '2026-10-13-9');
    assert.doesNotMatch(f.text, /Couldn’t check/);
  }
});

test('Rapid month taps advance from current state and late month results cannot close a day in the new month', async () => {
  const oldMonth = deferred(), oldSlots = deferred(); const f = await initial();
  f.state.loadMonth = month => month === '2026-11' ? oldMonth.promise : [];
  f.state.loadSlots = ({date}) => date.startsWith('2026-11') ? oldSlots.promise : slotsFor(date);
  findButton(f, 'Next month').props.onPress(); f.render(); await f.settle();
  const nextButton = findButton(f, 'Next month'); nextButton.props.onPress(); nextButton.props.onPress();
  f.render(); await f.settle();
  assert.equal(selectedId(f), '2027-01-08-9');
  oldMonth.resolve([{ date: '2027-01-08', hasFullDayUnavailable: true }]);
  oldSlots.resolve(slotsFor('2026-11-08')); await f.settle();
  findButton(f, 'January 8, 2027').props.onPress(); f.render(); await f.settle();
  assert.equal(f.state.alerts.length, 0);
  assert.equal(selectedId(f), '2027-01-08-9');
});

test('Package duration and buffer changes invalidate slots but reuse the same month summary', async () => {
  const next = deferred(); const f = await initial(); f.state.calls.length = 0;
  f.state.package = { durationMinutes: 120, bufferMinutes: 30, minimumNoticeDays: 1 };
  f.state.loadSlots = () => next.promise; f.render(); await f.settle();
  assert.equal(findButton(f, 'Continue').props.disabled, true);
  assert.deepEqual(readKeys(f), ['day:2026-10-08']);
  assert.equal(f.state.calls[0][2].durationMinutes, 120);
  assert.equal(f.state.calls[0][2].bufferMinutes, 30);
  next.resolve(slotsFor('2026-10-08', 120)); await f.settle();
  assert.equal(findButton(f, 'Continue').props.disabled, false);
});

test('Read errors show retry controls rather than an empty calendar, and retry reloads only the failed resource', async () => {
  for (const kind of ['month', 'day']) {
    const f = await initial({ [kind === 'month' ? 'loadMonth' : 'loadSlots']: async () => { throw new Error('Offline'); } });
    assert.match(f.text, kind === 'month' ? /Couldn’t load the calendar/ : /Couldn’t check availability/);
    if (kind === 'day') {
      assert.equal(findButton(f, 'Continue').props.disabled, true);
      assert.doesNotMatch(f.text, /No available times/);
    }
    f.state.calls.length = 0;
    f.state.loadMonth = () => []; f.state.loadSlots = ({date}) => slotsFor(date);
    findButton(f, 'Try again').props.onPress(); await f.settle();
    assert.deepEqual(readKeys(f), [kind === 'month' ? 'month:2026-10' : 'day:2026-10-08']);
    assert.doesNotMatch(f.text, /Couldn’t/);
  }
});

test('Focus replay shares unfinished reads, while leaving or unmounting discards their state updates', async () => {
  for (const unmount of [false, true]) {
    const month = deferred(), day = deferred();
    const f = fixture({ loadMonth: () => month.promise, loadSlots: () => day.promise });
    f.render(); f.blur(); f.focus(); await f.settle();
    assert.deepEqual(readKeys(f), ['month:2026-10', 'day:2026-10-08']);
    if (unmount) f.unmount(); else f.blur();
    month.resolve([]); day.resolve(slotsFor('2026-10-08')); await flush();
    assert.equal(f.state.writesAfterUnmount, 0);
    f.render(false);
    assert.equal(selectedId(f), undefined);
  }
});

test('Continue always performs a fresh read, rejects a taken slot and updates the visible alternatives', async () => {
  const f = await initial();
  f.state.loadSlots = ({date}) => slotsFor(date).slice(1);
  await findButton(f, 'Continue').props.onPress(); await f.settle();
  const reads = f.state.calls.filter(([kind]) => kind === 'day');
  assert.equal(reads[0][2].forceSettings, false, 'Browsing can reuse working hours');
  assert.equal(reads.at(-1)[2].forceSettings, true, 'Continue verifies working hours on the server');
  assert.equal(f.state.calls.filter(([kind]) => kind === 'day').length, 2);
  assert.equal(f.state.schedules.length, 0);
  assert.equal(f.state.navigation.length, 0);
  assert.equal(f.state.alerts[0][0], 'Slot already taken');
  assert.equal(selectedId(f), '2026-10-08-11');
});

test('A fresh confirmation bypasses a pending background read; its result cannot be replaced by that older read', async () => {
  const background = deferred(), confirmation = deferred(); const f = await initial();
  let reads = 0;
  f.state.loadSlots = () => ++reads === 1 ? background.promise : confirmation.promise;
  f.blur(); f.focus(); await f.settle();
  const action = findButton(f, 'Continue').props.onPress(); await f.settle();
  assert.equal(reads, 2);
  confirmation.resolve(slotsFor('2026-10-08').slice(1)); await action; await f.settle();
  background.resolve(slotsFor('2026-10-08')); await f.settle();
  assert.equal(selectedId(f), '2026-10-08-11');
  assert.equal(f.state.schedules.length, 0);
});

test('Double taps share one confirmation, selection controls are locked, and the saved schedule matches the chosen date and slot', async () => {
  const check = deferred(); const f = await initial();
  findButton(f, 'October 12, 2026').props.onPress(); f.render(); await f.settle();
  f.nodes.find(node => node.key === '2026-10-12-11').props.onPress(); f.render();
  const retainedNext = findButton(f, 'Next month'), retainedDay = findButton(f, 'October 13, 2026');
  f.state.loadSlots = () => check.promise;
  const submit = findButton(f, 'Continue'); const first = submit.props.onPress();
  await submit.props.onPress(); retainedNext.props.onPress(); retainedDay.props.onPress();
  f.render(); await f.settle();
  assert.equal(findButton(f, 'Next month').props.disabled, true);
  assert.equal(findButton(f, 'October 13, 2026').props.disabled, true);
  assert.equal(f.state.calls.filter(([kind]) => kind === 'day').length, 3);
  check.resolve(slotsFor('2026-10-12')); await first; await f.settle();
  assert.equal(f.state.schedules.length, 1);
  assert.equal(f.state.schedules[0].bookingDate, '2026-10-12');
  assert.equal(f.state.schedules[0].startTime, '11:00:00');
  assert.deepEqual(f.state.navigation, [['push', '/book/information']]);
});

test('A retained Continue handler cannot check or save an old date or slot after a newer selection', async () => {
  for (const chooseDate of [false, true]) {
    const f = await initial(); const retained = findButton(f, 'Continue');
    f.state.calls.length = 0;
    if (chooseDate) findButton(f, 'October 12, 2026').props.onPress();
    else f.nodes.find(node => node.key === '2026-10-08-11').props.onPress();
    await retained.props.onPress();
    assert.equal(f.state.calls.length + f.state.schedules.length + f.state.navigation.length, 0);
    f.render(); await f.settle();
    await findButton(f, 'Continue').props.onPress(); await f.settle();
    assert.equal(f.state.schedules[0].bookingDate, chooseDate ? '2026-10-12' : '2026-10-08');
    assert.equal(f.state.schedules[0].startTime, chooseDate ? '09:00:00' : '11:00:00');
  }
});

test('Confirmation failures unlock controls without navigating; retry can recover', async () => {
  const f = await initial(); f.state.loadSlots = async () => { throw new Error('Offline'); };
  await findButton(f, 'Continue').props.onPress(); await f.settle();
  assert.equal(f.state.alerts[0][0], 'Availability not checked');
  assert.equal(f.state.navigation.length, 0);
  assert.equal(findButton(f, 'Next month').props.disabled, false);
  f.state.loadSlots = ({date}) => slotsFor(date);
  findButton(f, 'Try again').props.onPress(); await f.settle();
  await findButton(f, 'Continue').props.onPress(); await f.settle();
  assert.equal(f.state.schedules.length, 1);
});

test('Navigating away during confirmation prevents draft writes, navigation and alerts after completion', async () => {
  for (const returnBeforeFinish of [false, true]) {
    const check = deferred(); const f = await initial(); f.state.loadSlots = () => check.promise;
    const action = findButton(f, 'Continue').props.onPress(); await f.settle();
    f.blur();
    if (returnBeforeFinish) { f.focus(); await f.settle(); } else f.unmount();
    check.resolve(slotsFor('2026-10-08')); await action; await flush();
    assert.equal(f.state.schedules.length + f.state.navigation.length + f.state.alerts.length, 0);
    assert.equal(f.state.writesAfterUnmount, 0);
  }
});

test('Rescheduling keeps the server mutation and its rejection handling after the fresh availability check', async () => {
  for (const success of [false, true]) {
    const f = await initial({ params: { bookingId: 'booking-1', mode: 'reschedule' },
      save: () => ({ success, message: 'The booking changed.' }) });
    await findButton(f, 'Save Schedule').props.onPress(); await f.settle();
    assert.equal(f.state.saves.length, 1);
    assert.equal(f.state.saves[0][0], 'booking-1');
    assert.equal(f.state.saves[0][1].bookingDate, '2026-10-08');
    assert.equal(f.state.schedules.length, 0);
    assert.deepEqual(f.state.navigation, success ? [['replace', '/book']] : []);
    assert.equal(f.state.alerts[0][0], success ? 'Reschedule sent' : 'Booking not rescheduled');
    assert.equal(findButton(f, 'Save Schedule').props.disabled, false);
  }
});

test('Leaving during the reschedule mutation prevents completion UI after unmount', async () => {
  const save = deferred(); const f = await initial({ params: { bookingId: 'booking-1', mode: 'reschedule' }, save: () => save.promise });
  const action = findButton(f, 'Save Schedule').props.onPress(); await f.settle();
  assert.equal(f.state.saves.length, 1);
  f.unmount(); save.resolve({ success: true }); await action;
  assert.equal(f.state.navigation.length + f.state.alerts.length + f.state.writesAfterUnmount, 0);
});

test('The studio date advances across midnight without refreshing unchanged keys every clock tick', async () => {
  const f = await initial(); f.state.calls.length = 0;
  f.state.now = '2026-10-07T02:00:30Z'; f.render(); await f.settle();
  assert.equal(f.state.calls.length, 0);
  f.state.now = '2026-10-07T16:00:00Z'; f.render(); await f.settle();
  assert.equal(selectedId(f), '2026-10-09-9');
  assert.deepEqual(readKeys(f), ['day:2026-10-09']);
  assert.equal(findButton(f, 'October 8, 2026').props.disabled, true);
});

test('Crossing midnight during confirmation cannot save a date that no longer meets minimum notice', async () => {
  const check = deferred(); const f = await initial(); f.state.loadSlots = () => check.promise;
  const action = findButton(f, 'Continue').props.onPress(); await f.settle();
  f.state.now = '2026-10-07T16:00:00Z'; check.resolve(slotsFor('2026-10-08'));
  await action; await f.settle();
  assert.equal(f.state.schedules.length + f.state.navigation.length, 0);
  assert.equal(f.state.alerts[0][0], 'Select another date');
});

test('Minimum notice and month boundaries stay consistent, including short months', async () => {
  const f = await initial({ now: '2026-01-30T02:00:00Z' });
  assert.equal(findButton(f, 'Previous month').props.disabled, true);
  findButton(f, 'Next month').props.onPress(); f.render(); await f.settle();
  assert.equal(selectedId(f), '2026-02-28-9');
  const notice = await initial({ package: { durationMinutes: 60, bufferMinutes: 0, minimumNoticeDays: 3 } });
  assert.equal(selectedId(notice), '2026-10-10-9');
  assert.equal(findButton(notice, 'October 9, 2026').props.disabled, true);
});
