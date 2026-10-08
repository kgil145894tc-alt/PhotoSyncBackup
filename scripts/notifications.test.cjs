const { loadSource, sharedReadImports } = require('./session-read-test-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const code = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/services/notifications.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function setup({ rows = [], unreadCount = 0, feedError = null, countError = null, user = { id: 'account-a' }, authError = null, rpcResult = { data: true, error: null }, rpcHandler, queryHandler, authHandler } = {}) {
  const queries = [];
  const rpcs = [];
  const supabase = {
    auth: { getUser: async () => authHandler ? authHandler() : ({ data: { user }, error: authError }) },
    rpc: async (name, params) => { rpcs.push({ name, params }); return rpcHandler ? rpcHandler(name, params) : rpcResult; },
    from: (table) => {
      const query = { table, operations: [] };
      queries.push(query);
      const builder = {};
      for (const method of ['select', 'eq', 'gt', 'in', 'order', 'limit', 'or', 'update', 'maybeSingle']) {
        builder[method] = (...args) => { query.operations.push([method, ...args]); return builder; };
      }
      builder.then = (resolve, reject) => {
        const isCount = query.operations.some(([method, , options]) => method === 'select' && options?.head);
        return Promise.resolve(queryHandler ? queryHandler(query) : isCount ? { count: unreadCount, error: countError } : { data: rows, error: feedError }).then(resolve, reject);
      };
      return builder;
    },
  };
  const reminders = loadSource('src/services/booking-reminders.ts', { ...sharedReadImports(supabase, user?.id ?? null), '@/lib/supabase': { supabase }, '@/services/booking-events': { subscribeToBookingsChanged: () => () => {} } });
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => name === '@/lib/supabase' ? { supabase } : name === '@/services/booking-reminders' ? reminders : {},
    Intl, Date, Promise, Error,
  });
  return { api: exports, queries, rpcs };
}

test('Next notification page applies both cursor fields, caps downloads and skips reminder maintenance', async () => {
  const { api, queries, rpcs } = setup();
  const cursor = { createdAt: '2026-10-07T00:00:00.000001+00:00', id: '00000000-0000-4000-8000-000000000030' };
  await api.getMyNotificationInbox('unread', 90, undefined, cursor);
  const feed = queries.find((query) => !query.operations.some(([method, , options]) => method === 'select' && options?.head));
  assert.ok(feed.operations.some(([method, value]) => method === 'limit' && value === 31));
  const boundary = feed.operations.find(([method]) => method === 'or')[1];
  assert.equal(boundary, `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`);
  assert.ok(feed.operations.some(([method, column, value]) => method === 'eq' && column === 'is_read' && value === false));
  assert.equal(rpcs.length, 0);
});
test('Notification cursors reject filter syntax injection and malformed timestamps', async () => {
  for (const cursor of [
    { createdAt: '2026-10-07T00:00:00Z', id: 'id),is_read.eq.true' },
    { createdAt: '2026-10-07T00:00:00Z",id.gt.0', id: '00000000-0000-4000-8000-000000000030' },
    { createdAt: '2026-13-99T00:00:00Z', id: '00000000-0000-4000-8000-000000000030' },
  ]) {
    const { api } = setup();
    await assert.rejects(api.getMyNotificationInbox('all', 30, undefined, cursor), /Invalid notification/);
  }
});

function ownAccount(query) {
  assert.ok(query.operations.some((operation) => JSON.stringify(operation) === JSON.stringify(['eq', 'user_id', 'account-a'])));
}

test('Unread queries the full account inbox and maps complete messages', async () => {
  const row = { id: 'n1', user_id: 'account-a', booking_id: 'b1', is_read: false, created_at: '2026-10-07T00:00:00Z', title: 'Booking confirmed', message: 'Schedule and location stay visible.' };
  const { api, queries } = setup({ rows: [row, { ...row, id: 'n2' }], unreadCount: 42 });
  const result = await api.getMyNotificationInbox('unread', 1);
  assert.equal(result.unreadCount, 42);
  assert.equal(result.hasMore, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].bookingId, 'b1');
  assert.equal(result.items[0].message, row.message);
  queries.forEach(ownAccount);
  assert.ok(queries[0].operations.some(([method, key, value]) => method === 'eq' && key === 'is_read' && value === false));
  assert.ok(queries[0].operations.some(([method, value]) => method === 'limit' && value === 2));
});

test('All includes read messages and detects the end of the inbox', async () => {
  const { api, queries } = setup();
  const result = await api.getMyNotificationInbox('all', 30);
  assert.equal(result.hasMore, false);
  assert.equal(result.items.length, 0);
  assert.equal(queries[0].operations.some(([method, key]) => method === 'eq' && key === 'is_read'), false);
});

test('Feed and count errors reject instead of pretending the inbox is empty', async () => {
  for (const failure of [{ feedError: { message: 'Offline' } }, { countError: { message: 'Offline' } }]) {
    const { api } = setup(failure);
    await assert.rejects(api.getMyNotificationInbox('all', 30));
  }
});

test('Signed-out inbox does not query notifications', async () => {
  const { api, queries } = setup({ user: null });
  await assert.rejects(api.getMyNotificationInbox('all', 30));
  assert.equal(queries.length, 0);
});

test('Shared unread-count reads use one count-only query scoped to the account', async () => {
  const { api, queries } = setup({ unreadCount: 42 });
  assert.equal(await api.getMyUnreadNotificationCount({ throwOnError: true }), 42);
  assert.equal(queries.length, 1);
  ownAccount(queries[0]);
  assert.ok(queries[0].operations.some(([method, , options]) => method === 'select' && options?.head === true));
  assert.ok(queries[0].operations.some(([method, key, value]) => method === 'eq' && key === 'is_read' && value === false));
});

test('Strict count reads reject failed queries and authentication while existing count callers retain their fallback', async () => {
  for (const failure of [{ countError: { message: 'Offline' } }, { user: null }, { authError: { message: 'Expired login' } }]) {
    const { api } = setup(failure);
    await assert.rejects(api.getMyUnreadNotificationCount({ throwOnError: true }));
    assert.equal(await api.getMyUnreadNotificationCount(), 0);
  }
});

test('Inbox consumes the shared count without issuing a second head query, and shared count failures remain errors', async () => {
  const { api, queries } = setup();
  let reads = 0;
  const inbox = await api.getMyNotificationInbox('all', 30, async () => { reads++; return 42; });
  assert.equal(inbox.unreadCount, 42);
  assert.equal(reads, 1);
  assert.equal(queries.length, 1);
  ownAccount(queries[0]);
  assert.equal(queries[0].operations.some(([method, , options]) => method === 'select' && options?.head), false);
  await assert.rejects(api.getMyNotificationInbox('all', 30, async () => { throw new Error('Count failed'); }), /Count failed/);
});

test('Inbox can supply its authenticated count query to the shared cache without repeating auth or reminder requests', async () => {
  let authReads = 0;
  const { api, queries, rpcs } = setup({ unreadCount: 7, authHandler: async () => {
    authReads++;
    return { data: { user: { id: 'account-a' } }, error: null };
  } });
  const inbox = await api.getMyNotificationInbox('all', 30, (load) => load());
  assert.equal(inbox.unreadCount, 7);
  assert.equal(authReads, 1);
  assert.equal(rpcs.filter((rpc) => rpc.name === 'ensure_booking_reminder_notifications').length, 1);
  assert.equal(queries.length, 2);
  queries.forEach(ownAccount);
});

test('Mark all uses one authoritative RPC and accepts an already-read inbox', async () => {
  for (const count of [0, 42]) {
    const { api, queries, rpcs } = setup({ rpcResult: { data: count, error: null }, unreadCount: 1 });
    assert.equal((await api.markAllNotificationsRead()).success, true);
    assert.equal(rpcs.length, 1);
    assert.equal(rpcs[0].name, 'mark_all_my_notifications_read');
    assert.equal(rpcs[0].params, undefined);
    assert.equal(queries.length, 0); // New unread arrivals are not a failed save.
  }
});

test('Bulk RPC errors and invalid responses never become false successes', async () => {
  for (const rpcResult of [
    { data: null, error: { code: '42501', message: 'Permission denied' } },
    { data: null, error: { message: 'Offline' } },
    { data: null, error: null }, { data: false, error: null }, { data: -1, error: null },
  ]) {
    const { api, queries } = setup({ rpcResult });
    assert.equal((await api.markAllNotificationsRead()).success, false);
    assert.equal(queries.length, 0);
  }
});

test('Individual read uses the existing RPC and reports write failures', async () => {
  const { api, rpcs } = setup();
  assert.equal((await api.markNotificationRead('n1')).success, true);
  assert.equal(rpcs[0].name, 'mark_my_notification_read');
  assert.equal(rpcs[0].params.p_notification_id, 'n1');
  const failed = setup({ rpcResult: { data: false, error: null } });
  assert.equal((await failed.api.markNotificationRead('missing')).success, false);
});

const missingBulk = { data: null, error: { code: 'PGRST202', message: 'Function not found' } };
const isUpdate = (query) => query.operations.some(([method]) => method === 'update');
function legacyRpc(name) {
  return name === 'mark_all_my_notifications_read' ? missingBulk : { data: true, error: null };
}

test('Legacy database repairs silent RLS skips through individual RPCs', async () => {
  const rows = [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }];
  const { api, queries, rpcs } = setup({
    rpcHandler: legacyRpc,
    queryHandler: (query) => ({ data: isUpdate(query) ? [{ id: 'n2' }] : rows, error: null }),
  });
  assert.equal((await api.markAllNotificationsRead()).success, true);
  queries.forEach(ownAccount);
  assert.deepEqual(rpcs.slice(1).map(({ params }) => params.p_notification_id), ['n1', 'n3']);
});

test('Legacy database with working update policies requires no individual RPCs', async () => {
  const { api, queries, rpcs } = setup({ rows: [{ id: 'n1' }], rpcHandler: legacyRpc });
  assert.equal((await api.markAllNotificationsRead()).success, true);
  assert.equal(rpcs.length, 1);
  queries.forEach(ownAccount);
});

test('Legacy pagination marks all unread pages without skipping rows or altering other accounts', async () => {
  const rows = Array.from({ length: 405 }, (_, i) => ({ id: String(i).padStart(4, '0') }));
  const saved = [];
  const { api, queries } = setup({
    rpcHandler: legacyRpc,
    queryHandler: (query) => {
      if (isUpdate(query)) {
        const ids = query.operations.find(([method]) => method === 'in')[2];
        saved.push(...ids);
        return { data: ids.map((id) => ({ id })), error: null };
      }
      const cursor = query.operations.find(([method]) => method === 'gt')?.[2];
      return { data: rows.filter((row) => !cursor || row.id > cursor).slice(0, 200), error: null };
    },
  });
  assert.equal((await api.markAllNotificationsRead()).success, true);
  assert.deepEqual(saved, rows.map(({ id }) => id));
  assert.equal(queries.filter(isUpdate).length, 3);
  queries.forEach(ownAccount);
});

test('Legacy denied table privileges still use the existing single-read RPC', async () => {
  const { api, rpcs } = setup({
    rpcHandler: legacyRpc,
    queryHandler: (query) => isUpdate(query)
      ? { data: null, error: { code: '42501', message: 'Permission denied' } }
      : { data: [{ id: 'n1' }], error: null },
  });
  assert.equal((await api.markAllNotificationsRead()).success, true);
  assert.equal(rpcs[1].params.p_notification_id, 'n1');
});

test('Legacy repair never hides a refused individual write', async () => {
  for (const failure of [{ data: false, error: null }, { data: null, error: { message: 'Offline' } }]) {
    const { api } = setup({
      rpcHandler: (name) => name === 'mark_all_my_notifications_read' ? missingBulk : failure,
      queryHandler: (query) => ({ data: isUpdate(query) ? [] : [{ id: 'n1' }], error: null }),
    });
    assert.equal((await api.markAllNotificationsRead()).success, false);
  }
});

test('Legacy read and update connection failures stop the operation', async () => {
  for (const failUpdate of [false, true]) {
    const { api, rpcs } = setup({
      rpcHandler: legacyRpc,
      queryHandler: (query) => isUpdate(query) === failUpdate
        ? { data: null, error: { message: 'Offline' } }
        : { data: [{ id: 'n1' }], error: null },
    });
    assert.equal((await api.markAllNotificationsRead()).success, false);
    assert.equal(rpcs.length, 1);
  }
});

test('Signed-out users and auth failures do not attempt any read mutations', async () => {
  for (const session of [{ user: null }, { authError: { message: 'Expired' } }]) {
    const { api, queries, rpcs } = setup(session);
    assert.equal((await api.markAllNotificationsRead()).success, false);
    assert.equal(queries.length, 0);
    assert.equal(rpcs.length, 0);
  }
});

test('Legacy mutation stops if the account changes before saving', async () => {
  let calls = 0;
  const { api, queries, rpcs } = setup({
    rows: [{ id: 'n1' }], rpcHandler: legacyRpc,
    authHandler: () => ({ data: { user: { id: ++calls === 1 ? 'account-a' : 'account-b' } }, error: null }),
  });
  assert.equal((await api.markAllNotificationsRead()).success, false);
  assert.equal(queries.some(isUpdate), false);
  assert.equal(rpcs.length, 1);
});

test('Legacy individual writes are bounded to five concurrent requests', async () => {
  let active = 0;
  let maxActive = 0;
  const { api } = setup({
    queryHandler: (query) => ({ data: isUpdate(query) ? [] : Array.from({ length: 13 }, (_, i) => ({ id: `n${i}` })), error: null }),
    rpcHandler: async (name) => {
      if (name === 'mark_all_my_notifications_read') return missingBulk;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return { data: true, error: null };
    },
  });
  assert.equal((await api.markAllNotificationsRead()).success, true);
  assert.equal(maxActive, 5);
});
