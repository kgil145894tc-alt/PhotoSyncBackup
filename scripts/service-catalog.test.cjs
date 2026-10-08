const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const fallbackService = { id: 'sample-service', slug: 'portrait', description: 'Sample', basePrice: 500,
  durationMinutes: 60, bufferMinutes: 30, minimumNoticeDays: 1, image: 'sample-service-image' };
const fallbackPackage = { id: 'sample-package', priceAmount: 500, image: 'sample-package-image' };
const serviceRow = { id: 's1', slug: 'portrait', name: 'Portrait', description: 'Real service description',
  duration_minutes: 90, buffer_minutes: 15, minimum_notice_days: 3, price: 1500, image_url: 'https://example.com/service.jpg', is_active: true };
const packageRow = { id: 'p1', service_id: 's1', name: 'Portrait Package', badge: 'Popular',
  price: 2500, inclusions: ['10 edited photos'], image_url: 'https://example.com/package.jpg', is_active: true };
function setup({ serviceRows = [], packageRows = [], failTable, failFrom = 0, onPage, writeError, savedId = 'saved-id', archiveResult = true, archiveError, archiveThrows = false, disconnected = false } = {}) {
  const queries = [];
  const events = [];
  const audit = [];
  const order = [];
  const rpcs = [];
  const supabase = { rpc: async (name, args) => {
    rpcs.push({ name, args }); order.push('archive');
    if (archiveThrows) throw new Error('Connection lost');
    return { data: archiveResult, error: archiveError };
  }, from: (table) => {
    const query = { table, operations: [] };
    queries.push(query);
    const builder = {};
    for (const method of ['select', 'eq', 'is', 'in', 'order', 'update', 'insert', 'maybeSingle', 'single', 'range']) {
      builder[method] = (...args) => { query.operations.push([method, ...args]); return builder; };
    }
    builder.then = (resolve, reject) => {
      const write = query.operations.some(([method]) => ['insert', 'update'].includes(method));
      const range = query.operations.find(([method]) => method === 'range');
      onPage?.(table, range?.[1] ?? 0);
      if (write) order.push('write');
      const result = write ? { data: savedId ? { id: savedId } : null, error: writeError }
        : { data: table === 'services' ? serviceRows : packageRows, error: table === failTable && (range?.[1] ?? 0) >= failFrom ? new Error('Offline') : null };
      if (range && Array.isArray(result.data)) result.data = result.data.slice(range[1], range[2] + 1);
      return Promise.resolve(result).then(resolve, reject);
    };
    return builder;
  } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/service-catalog.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, require: (name) => ({
      '@/lib/supabase': { supabase: disconnected ? null : supabase },
      '@/data/service-catalog': { fallbackServices: [fallbackService], fallbackPortraitPackages: [fallbackPackage], getFallbackServiceBySlug: () => fallbackService },
      '@/services/audit-log': { createAuditLog: async (values) => { order.push('audit'); audit.push(values); } },
      '@/services/catalog-events': { emitCatalogChanged: (change) => { order.push('event'); events.push(change); } },
    })[name],
    Date, Intl, Map, Promise, Error,
  });
  return { api: exports, queries, events, audit, order, rpcs };
}

test('Large admin catalogs read bounded pages beyond the API cap and retain complete package counts', async () => {
  const serviceRows = Array.from({ length: 1005 }, (_, i) => ({ ...serviceRow, id: `s${i}` }));
  const packageRows = Array.from({ length: 1005 }, (_, i) => ({ ...packageRow, id: `p${i}`, service_id: `s${i}` }));
  const { api, queries } = setup({ serviceRows, packageRows });
  const catalog = await api.getAdminServiceCatalog();
  assert.equal(catalog.services.length, 1005); assert.equal(catalog.packages.length, 1005);
  assert.equal(catalog.services[1004].packageCount, 1);
  for (const table of ['services', 'packages']) {
    const ranges = queries.filter(q => q.table === table).map(q => q.operations.find(([method]) => method === 'range').slice(1));
    assert.deepEqual(ranges, [[0,199],[200,399],[400,599],[600,799],[800,999],[1000,1199]]);
  }
});

test('Catalog pagination rejects a failed later page instead of publishing an incomplete snapshot', async () => {
  const serviceRows = Array.from({ length: 205 }, (_, i) => ({ ...serviceRow, id: `s${i}` }));
  const f = setup({ serviceRows, failTable: 'services', failFrom: 200 });
  await assert.rejects(f.api.getAdminServiceCatalog(), /Offline/);
  assert.equal(f.queries.filter(q => q.table === 'services').length, 2);
});

test('Catalog pagination stops immediately when the captured login changes', async () => {
  const serviceRows = Array.from({ length: 1005 }, (_, i) => ({ ...serviceRow, id: `s${i}` }));
  let current = true;
  const f = setup({ serviceRows, onPage: () => { current = false; } });
  await assert.rejects(f.api.getAdminServiceCatalog({ isSessionCurrent: () => current }), /session changed/);
  assert.equal(f.queries.length, 2, 'No later pages run under a new login');
});

test('Combined admin read uses exactly two queries and maps server prices, images, rules and active package counts', async () => {
  const { api, queries } = setup({
    serviceRows: [serviceRow, { ...serviceRow, id: 's2', is_active: false }],
    packageRows: [packageRow, { ...packageRow, id: 'p2', is_active: false }],
  });
  const result = await api.getAdminServiceCatalog();
  assert.equal(queries.length, 2);
  assert.equal(result.services.length, 2, 'The admin snapshot includes inactive records for edit behavior');
  assert.equal(result.services[0].basePrice, 1500);
  assert.equal(result.services[0].packageCount, 1);
  assert.equal(result.services[1].isActive, false);
  assert.equal(result.packages[0].priceAmount, 2500);
  assert.equal(result.packages[0].price, '₱2,500');
  assert.equal(result.packages[0].durationMinutes, 90);
  assert.equal(result.packages[0].bufferMinutes, 15);
  assert.equal(result.packages[0].minimumNoticeDays, 3);
  assert.equal(result.packages[0].image.uri, packageRow.image_url);
  assert.equal(result.packages[0].inclusions[0], '10 edited photos');
});

test('A genuine empty admin catalog stays empty instead of returning sample records', async () => {
  const { api } = setup();
  const result = await api.getAdminServiceCatalog();
  assert.equal(result.services.length, 0);
  assert.equal(result.packages.length, 0);
});

test('Any catalog read failure rejects the snapshot, including missing configuration', async () => {
  for (const failTable of ['services', 'packages']) {
    const { api } = setup({ failTable });
    await assert.rejects(api.getAdminServiceCatalog(), /Offline/);
  }
  const offline = setup({ disconnected: true });
  await assert.rejects(offline.api.getAdminServiceCatalog(), /not connected/);
});

const serviceValues = { name: 'Portrait', slug: 'portrait', description: '', basePrice: 1500,
  bufferMinutes: 15, durationMinutes: 90, minimumNoticeDays: 3, imageUrl: null, isActive: true };
const packageValues = { serviceId: 's1', name: 'Portrait Package', badge: null, inclusions: [], priceAmount: 2500, imageUrl: null, isActive: true };
test('Service and package create/edit events follow accepted writes and precede audit logging', async () => {
  for (const [method, values] of [['saveServiceCategory', serviceValues], ['saveServicePackage', packageValues]]) {
    for (const edit of [false, true]) {
      const { api, events, order, audit } = setup();
      assert.equal((await api[method]({ ...values, ...(edit ? { id: 'edited-id' } : {}) })).success, true);
      assert.equal(events.length, 1);
      assert.equal(events[0], undefined, 'A save invalidates services, package rules and counts together');
      assert.deepEqual(order, ['write', 'event', 'audit']);
      assert.equal(audit.length, 1);
    }
  }
});

test('Rejected writes and silently skipped edits never report success or invalidate cached lists', async () => {
  for (const failure of [{ writeError: { message: 'Offline' } }, { savedId: null }]) {
    for (const [method, values] of [['saveServiceCategory', serviceValues], ['saveServicePackage', packageValues]]) {
      const { api, events, audit } = setup(failure);
      assert.equal((await api[method]({ ...values, id: 'existing-id' })).success, false);
      assert.equal(events.length, 0);
      assert.equal(audit.length, 0);
    }
  }
});

test('Delete uses one atomic server archive and publishes removal only after confirmation', async () => {
  for (const [method, entity] of [['archiveService', 'service'], ['archivePackage', 'package']]) {
    const { api, events, queries, rpcs, order, audit } = setup();
    assert.equal((await api[method]('existing-id')).success, true);
    assert.equal(queries.length, 0, 'Booking checks and archive audit belong to the server transaction');
    assert.equal(rpcs[0].name, 'archive_catalog_item');
    assert.equal(rpcs[0].args.p_entity, entity);
    assert.equal(rpcs[0].args.p_id, 'existing-id');
    assert.equal(events[0].entity, entity);
    assert.equal(events[0].isActive, false);
    assert.equal(events[0].isArchived, true);
    assert.deepEqual(order, ['archive', 'event']);
    assert.equal(audit.length, 0, 'The database already recorded the deletion atomically');
  }
});

test('Failed, refused, disconnected and unconfirmed archives never remove a card', async () => {
  for (const method of ['archiveService', 'archivePackage']) {
    for (const failure of [{ archiveError: { message: 'Existing bookings' } }, { archiveError: { message: 'Admin access required' } },
      { archiveResult: false }, { archiveResult: null }, { archiveResult: 'true' }, { archiveThrows: true }, { disconnected: true }]) {
      const { api, events } = setup(failure);
      assert.equal((await api[method]('existing-id')).success, false);
      assert.equal(events.length, 0);
    }
  }
});

test('Admin reads retain switched-off rows but exclude archived rows and their packages', async () => {
  const archivedAt = '2026-10-07T12:30:00Z';
  const { api, queries } = setup({ serviceRows: [serviceRow, { ...serviceRow, id: 'off', is_active: false },
    { ...serviceRow, id: 'deleted', archived_at: archivedAt }], packageRows: [packageRow,
    { ...packageRow, id: 'off-p', service_id: 'off', is_active: false },
    { ...packageRow, id: 'deleted-p', archived_at: archivedAt },
    { ...packageRow, id: 'deleted-parent-p', service_id: 'deleted' }] });
  const result = await api.getAdminServiceCatalog();
  assert.deepEqual(Array.from(result.services, row => row.id), ['s1', 'off']);
  assert.deepEqual(Array.from(result.packages, row => row.id), ['p1', 'off-p']);
  assert.ok(queries.every(query => query.operations.some(([method, field, value]) => method === 'is' && field === 'archived_at' && value === null)));
});

test('Stale edit forms cannot clear archive status or update an archived row', async () => {
  for (const [method, values] of [['saveServiceCategory', serviceValues], ['saveServicePackage', packageValues]]) {
    const { api, queries } = setup();
    await api[method]({ ...values, id: 'old-id' });
    const query = queries[0];
    assert.ok(query.operations.some(([method, field, value]) => method === 'is' && field === 'archived_at' && value === null));
    const payload = query.operations.find(([method]) => method === 'update')[1];
    assert.equal(Object.hasOwn(payload, 'archived_at'), false);
  }
});
