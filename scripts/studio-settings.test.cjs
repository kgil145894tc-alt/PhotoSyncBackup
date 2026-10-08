const { sharedReadImports } = require('./session-read-test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const row = { id: true, studio_name: 'Studio', studio_address: 'Address', contact_email: 'admin@example.com',
  contact_phone: '09123456789', default_shoot_location: 'Studio', business_hours: 'Mon-Sat, 9:00 AM - 6:00 PM' };
const values = { studioName: ' Studio ', studioAddress: ' Address ', contactEmail: ' admin@example.com ',
  contactPhone: ' 09123456789 ', defaultShootLocation: ' Studio ', businessHours: 'Ignored', workingStartTime: '09:00:00', workingEndTime: '18:00:00' };

function setup({ read = { data: row, error: null }, write = { data: row, error: null }, disconnected = false } = {}) {
  const queries = [];
  let events = 0;
  const supabase = { from: (table) => {
    const query = { table, selected: null, payload: null };
    queries.push(query);
    const builder = {
      select: (columns) => { query.selected = columns; return builder; },
      eq: (column, value) => { query.filter = [column, value]; return builder; },
      upsert: (payload) => { query.payload = payload; return builder; },
      maybeSingle: async () => read,
      single: async () => write,
    };
    return builder;
  } };
  const imports = sharedReadImports(supabase);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/studio-settings.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: (name) => ({ ...imports,
    '@/lib/supabase': { supabase: disconnected ? null : supabase },
    '@/services/calendar-events': { emitCalendarChanged: () => events++, subscribeToCalendarChanged: () => () => {} },
  })[name], Error, Promise });
  return { api: exports, queries, events: () => events };
}

test('Studio settings map saved business hours and contacts from the singleton row', async () => {
  const { api, queries } = setup();
  const settings = await api.getStudioSettings({ throwOnError: true });
  assert.equal(settings.studioName, 'Studio');
  assert.equal(settings.workingStartTime, '09:00:00');
  assert.equal(settings.workingEndTime, '18:00:00');
  assert.equal(settings.contactEmail, row.contact_email);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].filter, ['id', true]);
});

test('Strict admin failures reject while legacy booking reads keep defaults; an absent row allows initial setup', async () => {
  for (const options of [{ disconnected: true }, { read: { data: null, error: new Error('Offline') } }]) {
    const { api } = setup(options);
    await assert.rejects(api.getStudioSettings({ throwOnError: true }));
    assert.equal((await api.getDefaultWorkingHoursWindow()).startTime, '08:00:00');
  }
  const { api } = setup({ read: { data: null, error: null } });
  const settings = await api.getStudioSettings({ throwOnError: true });
  assert.equal(settings.studioName, 'PhotoSync Studio');
  assert.equal(settings.contactEmail, '');
  assert.equal(settings.workingEndTime, '17:00:00');
});

test('A successful save returns the database row, trims inputs, and invalidates calendar working hours', async () => {
  const confirmed = { ...row, studio_name: 'Database-confirmed name' };
  const { api, queries, events } = setup({ write: { data: confirmed, error: null } });
  const result = await api.saveStudioSettings(values);
  assert.equal(result.success, true);
  assert.equal(result.settings.studioName, confirmed.studio_name);
  assert.equal(result.settings.workingStartTime, '09:00:00');
  assert.equal(events(), 1);
  assert.equal(queries.length, 1, 'The returning row avoids a second read after saving');
  assert.equal(queries[0].payload.contact_email, 'admin@example.com');
  assert.equal(queries[0].payload.studio_name, 'Studio');
  assert.equal(queries[0].payload.business_hours, 'Mon-Sat, 9:00 AM - 6:00 PM');
  assert.match(queries[0].selected, /studio_name/);
});

test('Rejected or unconfirmed writes never report success or invalidate calendar data', async () => {
  for (const options of [{ disconnected: true },
    { write: { data: null, error: new Error('Permission denied') } },
    { write: { data: null, error: null } }, { write: { data: { ...row, id: false }, error: null } }]) {
    const { api, events } = setup(options);
    assert.equal((await api.saveStudioSettings(values)).success, false);
    assert.equal(events(), 0);
  }
});

test('Working hours round-trip the weekday prefix and keep valid time-only values and invalid-value defaults', async () => {
  for (const hours of ['Mon-Sat, 9:30 AM - 6:45 PM', '9:30 AM - 6:45 PM']) {
    const { api } = setup({ read: { data: { ...row, business_hours: hours }, error: null } });
    const window = await api.getDefaultWorkingHoursWindow({ throwOnError: true });
    assert.equal(window.startTime, '09:30:00');
    assert.equal(window.endTime, '18:45:00');
    assert.equal(api.formatBusinessHours(window.startTime, window.endTime), 'Mon-Sat, 9:30 AM - 6:45 PM');
  }
  for (const hours of ['', 'Invalid', 'Mon-Sat, 6:00 PM - 9:00 AM']) {
    const { api } = setup({ read: { data: { ...row, business_hours: hours }, error: null } });
    assert.equal((await api.getDefaultWorkingHoursWindow()).startTime, '08:00:00');
  }
});
