const { sharedReadImports } = require('./session-read-test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(file, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    }, Date, Intl, Promise, Map, Set, Error,
  });
  return exports;
}

const workingWindow = { startTime: '08:00:00', endTime: '17:00:00' };
const calendarDateGuards = loadModule('src/services/calendar-date-guards.ts', {});
function setup({ bookedRows = [], adminRows = [], failTable, workingError, availabilityError, summaries = [], disconnected = false } = {}) {
  const queries = [];
  const events = [];
  const workingOptions = [];
  const rpcs = [];
  const supabase = { rpc: async (name, args) => { rpcs.push({ name, args }); return { data: summaries, error: failTable ? new Error('Offline') : null }; }, from: (table) => {
    const query = { table, operations: [] };
    queries.push(query);
    const builder = {};
    for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'in', 'limit', 'update', 'upsert', 'delete', 'neq', 'maybeSingle']) {
      builder[method] = (...args) => { query.operations.push([method, ...args]); return builder; };
    }
    builder.then = (resolve, reject) => Promise.resolve({
      data: query.operations.some(([method]) => method === 'maybeSingle')
        ? { slot_date: '2099-10-07' } : table === 'bookings' ? bookedRows : adminRows,
      error: table === failTable ? new Error('Offline') : null,
    }).then(resolve, reject);
    return builder;
  } };
  const api = loadModule('src/services/calendar.ts', {
    '@/lib/supabase': { supabase: disconnected ? null : supabase },
    '@/services/booking-availability': { getActiveBookingSlotsForDate: async () => availabilityError
      ? { success: false, message: 'Availability offline' } : { success: true, slots: bookedRows } },
    '@/services/audit-log': { createAuditLog: async () => {} },
    '@/services/admin-bookings': { formatBookingTimeRange: () => '9 AM - 10 AM' },
    '@/services/calendar-events': { emitCalendarChanged: (date) => events.push(date) },
    '@/services/calendar-date-guards': calendarDateGuards,
    '@/services/studio-settings': {
      fallbackWorkingHoursWindow: workingWindow,
      getDefaultWorkingHoursWindow: async (options) => {
        workingOptions.push(options);
        if (workingError && options?.throwOnError) throw new Error('Settings offline');
        return workingWindow;
      },
    },
  });
  return { api, queries, rpcs, events, workingOptions };
}

test('Strict month RPC errors remain errors; display callers retain their fallback', async () => {
  for (const failTable of ['bookings', 'time_slots']) {
    const { api } = setup({ failTable });
    await assert.rejects(api.getCalendarDaySummaries('2026-10', { throwOnError: true }), /Offline/);
    assert.equal((await api.getCalendarDaySummaries('2026-10')).length, 0);
  }
  const { api } = setup({ disconnected: true });
  await assert.rejects(api.getCalendarDaySummaries('2026-10', { throwOnError: true }), /not connected/);
  assert.equal((await api.getCalendarDaySummaries('2026-10')).length, 0);
});

test('Month summaries use one bounded RPC and map server flags without downloading bookings or slots', async () => {
  const { api, queries, rpcs } = setup({ summaries: [
    { date: '2026-10-07', has_available: false, has_booked: true, has_full_day_unavailable: true, has_unavailable: true },
    { date: '2026-10-08', has_available: true, has_booked: false, has_full_day_unavailable: false, has_unavailable: false },
  ] });
  const summaries = await api.getCalendarDaySummaries('2026-10', { throwOnError: true });
  assert.equal(summaries[0].hasBooked, true); assert.equal(summaries[0].hasFullDayUnavailable, true);
  assert.equal(summaries[1].hasAvailable, true); assert.equal(summaries[1].hasUnavailable, false);
  assert.equal(queries.length, 0);
  assert.equal(rpcs.length, 1); assert.equal(rpcs[0].name, 'get_calendar_day_summaries');
  assert.equal(rpcs[0].args.p_month, '2026-10-01');
});

test('Invalid month input never reaches the server', async () => {
  const { api, rpcs } = setup();
  for (const month of ['2026-13', '2026-00', '2026-1', '0000-01', 'invalid']) {
    await assert.rejects(api.getCalendarDaySummaries(month, { throwOnError: true }), /valid calendar month/);
    assert.equal((await api.getCalendarDaySummaries(month)).length, 0);
  }
  assert.equal(rpcs.length, 0);
});

test('Strict day reads reject bookings, availability and working-hours errors instead of inventing free slots', async () => {
  for (const failure of [{ failTable: 'bookings' }, { failTable: 'time_slots' }, { workingError: true }, { disconnected: true }]) {
    const { api } = setup(failure);
    await assert.rejects(api.getCalendarSlotsForDate('2026-10-07', { throwOnError: true }));
    assert.equal((await api.getCalendarSlotsForDate('2026-10-07')).length, 1, 'Legacy fallback remains available for existing callers');
  }
});

test('Strict client availability reads reject failed sources and preserve legacy fallback behavior', async () => {
  for (const failure of [{ availabilityError: true }, { failTable: 'time_slots' }, { workingError: true }, { disconnected: true }]) {
    const { api } = setup(failure);
    await assert.rejects(api.getClientBookableSlotsForDate({ date: '2026-10-08', durationMinutes: 60, throwOnError: true }));
    const legacySlots = await api.getClientBookableSlotsForDate({ date: '2026-10-08', durationMinutes: 60 });
    assert.equal(legacySlots.length > 0, !failure.availabilityError);
  }
});

test('Day details preserve booking identity, custom windows and closed-day behavior; hours load once', async () => {
  const { api, workingOptions } = setup({
    bookedRows: [{ id: 'b1', start_time: '10:00:00', end_time: '11:00:00', profiles: { full_name: 'Client A' } }],
    adminRows: [{ id: 's1', start_time: '12:00:00', end_time: '13:00:00', status: 'available' }],
  });
  const slots = await api.getCalendarSlotsForDate('2026-10-07', { throwOnError: true });
  assert.equal(slots.length, 2);
  assert.equal(slots[0].bookingId, 'b1');
  assert.equal(slots[0].clientName, 'Client A');
  assert.equal(slots[1].isCustom, true);
  assert.equal(workingOptions.length, 1);
  assert.equal(workingOptions[0].throwOnError, true);
  const closed = setup({ adminRows: [{ id: 's2', status: 'unavailable', start_time: '00:00:00', end_time: '23:59:00' }] });
  const closedSlots = await closed.api.getCalendarSlotsForDate('2026-10-07', { throwOnError: true });
  assert.equal(closedSlots.length, 1);
  assert.equal(closedSlots[0].status, 'unavailable');
});

test('Client availability continues to query the server each time and include active pending bookings', async () => {
  const { api, queries } = setup({ bookedRows: [{ id: 'pending-b1', start_time: '08:00:00', end_time: '10:00:00' }] });
  for (let i = 0; i < 2; i++) {
    const slots = await api.getClientBookableSlotsForDate({ date: '2099-10-07', durationMinutes: 60 });
    assert.ok(slots.length > 0);
    assert.ok(slots.every((slot) => slot.startTime >= '10:00:00'));
  }
  assert.equal(queries.filter((query) => query.table === 'time_slots').length, 2);
});

test('Successful slot create/update/delete/mark and close/reopen emit cache invalidation after writes', async () => {
  const { api, events } = setup();
  const values = { date: '2099-10-07', startTime: '09:00:00', endTime: '10:00:00', status: 'available' };
  assert.equal((await api.saveCalendarSlot(values)).success, true);
  assert.equal((await api.saveCalendarSlot({ ...values, slotId: 's1' })).success, true);
  assert.equal((await api.deleteCalendarSlot('s1', '2099-10-07')).success, true);
  assert.equal((await api.deleteCalendarSlot('s2')).success, true);
  assert.equal((await api.markCalendarSlot(values)).success, true);
  assert.equal((await api.markCalendarDayUnavailable('2099-10-07')).success, true);
  assert.equal((await api.reopenCalendarDay('2099-10-07')).success, true);
  assert.deepEqual(events, ['2099-10-07', undefined, '2099-10-07', undefined, '2099-10-07', '2099-10-07', '2099-10-07']);
});

test('Failed writes and confirmed-booking conflicts do not invalidate the cache or bypass existing checks', async () => {
  const { api, events } = setup({ failTable: 'time_slots' });
  const values = { date: '2099-10-07', startTime: '09:00:00', endTime: '10:00:00', status: 'available' };
  for (const operation of [
    () => api.saveCalendarSlot(values), () => api.deleteCalendarSlot('s1'),
    () => api.markCalendarSlot(values), () => api.markCalendarDayUnavailable(values.date), () => api.reopenCalendarDay(values.date),
  ]) assert.equal((await operation()).success, false);
  assert.equal(events.length, 0);
  const conflict = setup({ bookedRows: [{ id: 'b1', start_time: '09:30:00', end_time: '10:30:00' }] });
  assert.equal((await conflict.api.saveCalendarSlot(values)).success, false);
  assert.equal((await conflict.api.markCalendarDayUnavailable(values.date)).success, false);
  assert.equal(conflict.events.length, 0);
});

test('Working-hours reads propagate errors only in strict mode and successful settings saves invalidate all dates', async () => {
  let fail = true;
  let events = 0;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: fail ? new Error('Offline') : null }) };
  const connection = { from: () => ({ ...query, upsert: () => ({ select: () => ({ single: async () => ({ data: fail ? null : { id: true }, error: fail ? new Error('Offline') : null }) }) }) }) };
  const { getDefaultWorkingHoursWindow, saveStudioSettings } = loadModule('src/services/studio-settings.ts', {
    ...sharedReadImports(connection),
    '@/lib/supabase': { supabase: connection },
    '@/services/calendar-events': { emitCalendarChanged: () => events++, subscribeToCalendarChanged: () => () => {} },
  });
  await assert.rejects(getDefaultWorkingHoursWindow({ throwOnError: true }), /Offline/);
  assert.equal((await getDefaultWorkingHoursWindow()).startTime, '08:00:00');
  const values = { contactEmail: '', contactPhone: '', defaultShootLocation: '', studioAddress: '', studioName: '', workingStartTime: '08:00:00', workingEndTime: '17:00:00' };
  assert.equal((await saveStudioSettings(values)).success, false);
  assert.equal(events, 0);
  fail = false;
  assert.equal((await saveStudioSettings(values)).success, true);
  assert.equal(events, 1);
});

test('Availability browsing reuses hours, while confirmation and slot saves force a fresh strict settings read', async () => {
  const f = setup();
  await f.api.getClientBookableSlotsForDate({ date: '2099-10-08', durationMinutes: 60, throwOnError: true });
  assert.equal(f.workingOptions.at(-1).force, false);
  await f.api.getClientBookableSlotsForDate({ date: '2099-10-08', durationMinutes: 60, throwOnError: true, forceSettings: true });
  assert.equal(f.workingOptions.at(-1).force, true);
  await f.api.saveCalendarSlot({ date: '2099-10-08', startTime: '10:00:00', endTime: '11:00:00', status: 'available' });
  assert.equal(f.workingOptions.at(-1).force, true); assert.equal(f.workingOptions.at(-1).throwOnError, true);
  const failed = setup({ workingError: true });
  const result = await failed.api.saveCalendarSlot({ date: '2099-10-08', startTime: '10:00:00', endTime: '11:00:00', status: 'available' });
  assert.equal(result.success, false);
  assert.equal(failed.queries.some(q => q.operations.some(([method]) => method === 'upsert')), false);
});
