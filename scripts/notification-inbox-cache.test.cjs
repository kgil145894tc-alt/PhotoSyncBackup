const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    Date, Promise, Error, Set,
  });
  return exports;
}

const { createNotificationInboxCache } = loadModule('src/services/notification-inbox-cache.ts');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function notification(id, isRead = false, userId = 'account-a') {
  return { id, isRead, userId, title: 'Update', message: 'Booking update', bookingId: null, createdAt: '2026-10-07T00:00:00Z' };
}
function setup(rows = [notification('n1'), notification('n2', true), notification('n3')]) {
  let time = 0;
  const reads = [];
  const countReads = [];
  const writes = [];
  const server = { rows, failLoad: false, failCount: false, failWrite: false };
  const api = {
    load: async (filter, limit, readUnreadCount, cursor) => {
      reads.push([filter, limit]);
      if (server.failLoad) throw new Error('offline');
      const afterCursor = cursor ? server.rows.slice(server.rows.findIndex((item) => item.id === cursor.id) + 1) : server.rows;
      const filtered = afterCursor.filter((item) => filter === 'all' || !item.isRead);
      return { items: filtered.slice(0, limit), hasMore: filtered.length > limit,
        unreadCount: readUnreadCount ? await readUnreadCount(api.loadUnreadCount) : server.rows.filter((item) => !item.isRead).length };
    },
    loadUnreadCount: async () => {
      countReads.push('count');
      if (server.failCount) throw new Error('offline');
      return server.rows.filter((item) => !item.isRead).length;
    },
    markRead: async (id) => {
      writes.push(id);
      if (server.failWrite) return { success: false, message: 'Write rejected' };
      server.rows = server.rows.map((item) => item.id === id ? { ...item, isRead: true } : item);
      return { success: true };
    },
    markAll: async () => {
      writes.push('all');
      if (server.failWrite) return { success: false, message: 'Write rejected' };
      server.rows = server.rows.map((item) => ({ ...item, isRead: true }));
      return { success: true };
    },
  };
  const cache = createNotificationInboxCache(api, () => time);
  cache.setAccount('account-a');
  return { api, cache, reads, countReads, writes, server, setTime: (value) => { time = value; } };
}

test('Returning to All or Unread reuses its own cache for 30 seconds', async () => {
  const { cache, reads, setTime } = setup();
  await cache.refresh('all');
  await cache.refresh('unread');
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 3);
  assert.equal(cache.getSnapshot().entries.unread.data.items.length, 2);
  setTime(29_999);
  await cache.refresh('all');
  await cache.refresh('unread');
  assert.equal(reads.length, 2);
  setTime(30_000);
  const previous = cache.getSnapshot().entries.all.data;
  const request = cache.refresh('all');
  assert.equal(cache.getSnapshot().entries.all.data, previous);
  assert.equal(cache.getSnapshot().entries.all.isFetching, true);
  await request;
  assert.equal(reads.length, 3);
});

test('Empty inboxes are cached and manual refresh bypasses freshness', async () => {
  const { cache, reads } = setup([]);
  await cache.refresh('all');
  await cache.refresh('all');
  assert.equal(reads.length, 1);
  await cache.refresh('all', { force: true });
  assert.equal(reads.length, 2);
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 0);
  assert.equal(cache.getSnapshot().unreadCount, 0);
});

test('Concurrent focus, resume and manual reads share the same request per filter', async () => {
  const { api, cache } = setup();
  const response = deferred();
  let calls = 0;
  api.load = () => { calls++; return response.promise; };
  const first = cache.refresh('all');
  assert.equal(cache.refresh('all'), first);
  assert.equal(cache.refresh('all', { force: true }), first);
  await flush();
  assert.equal(calls, 1);
  response.resolve({ items: [], unreadCount: 0, hasMore: false });
  await first;
  assert.equal(cache.getSnapshot().entries.all.isFetching, false);
});

test('Pagination retains loaded depth on return and leaves the other filter at its own depth', async () => {
  const { cache, reads } = setup(Array.from({ length: 80 }, (_, index) => notification(`n${index}`)));
  await cache.refresh('all');
  const more = cache.refresh('all', { loadMore: true });
  assert.equal(cache.refresh('all', { loadMore: true }), more);
  await more;
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 60);
  await cache.refresh('unread');
  assert.equal(cache.getSnapshot().entries.unread.data.items.length, 30);
  await cache.refresh('all');
  assert.deepEqual(reads, [['all', 30], ['all', 30], ['unread', 30]]);
  await cache.refresh('all', { force: true });
  assert.deepEqual(reads.at(-1), ['all', 30]);
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 30, 'Pull revalidates the first page');
});

test('Failed pagination retains the previous page and retries the same next page size', async () => {
  const { cache, reads, server } = setup(Array.from({ length: 80 }, (_, index) => notification(`n${index}`)));
  await cache.refresh('all');
  server.failLoad = true;
  await cache.refresh('all', { loadMore: true });
  assert.equal(cache.getSnapshot().entries.all.limit, 30);
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 30);
  server.failLoad = false;
  await cache.refresh('all', { loadMore: true });
  assert.deepEqual(reads, [['all', 30], ['all', 30], ['all', 30]]);
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 60);
});

test('Cursor paging downloads 30, 30 and 20 distinct records instead of repeating the prefix', async () => {
  const { api, cache, reads } = setup(Array.from({ length: 80 }, (_, index) => notification(`n${index}`)));
  const boundaries = [], downloaded = [];
  const original = api.load;
  api.load = async (...args) => {
    boundaries.push(args[3]?.id ?? null);
    const result = await original(...args); downloaded.push(...result.items.map((item) => item.id)); return result;
  };
  await cache.refresh('all');
  await cache.refresh('all', { loadMore: true });
  await cache.refresh('all', { loadMore: true });
  await cache.refresh('all', { loadMore: true });
  assert.deepEqual(boundaries, [null, 'n29', 'n59']);
  assert.equal(downloaded.length, 80); assert.equal(new Set(downloaded).size, 80);
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 80);
  assert.ok(reads.every(([, limit]) => limit === 30));
});
test('Loading another notification page does not renew the head timestamp', async () => {
  const { cache, reads, setTime } = setup(Array.from({ length: 80 }, (_, index) => notification(`n${index}`)));
  await cache.refresh('all'); setTime(29_000);
  await cache.refresh('all', { loadMore: true });
  assert.equal(cache.getSnapshot().entries.all.fetchedAt, 0);
  setTime(30_000); await cache.refresh('all');
  assert.equal(reads.length, 3);
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 30);
});
test('Marking the last loaded unread item keeps the original page boundary', async () => {
  const { api, cache } = setup(Array.from({ length: 80 }, (_, index) => notification(`n${index}`)));
  await cache.refresh('unread');
  const last = cache.getSnapshot().entries.unread.data.items.at(-1);
  await cache.markRead(last);
  const original = api.load;
  let boundary;
  api.load = async (...args) => { boundary = args[3]; return original(...args); };
  await cache.refresh('unread', { loadMore: true });
  assert.equal(boundary.id, 'n29');
  assert.equal(cache.getSnapshot().entries.unread.data.items.length, 59);
  assert.equal(cache.getSnapshot().entries.unread.data.items.at(-1).id, 'n59');
});
test('An insert ahead of a cursor does not repeat loaded notifications; pull loads the new head', async () => {
  const { cache, server } = setup(Array.from({ length: 80 }, (_, index) => notification(`n${index}`)));
  await cache.refresh('all');
  server.rows.unshift(notification('new-head'));
  await cache.refresh('all', { loadMore: true });
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 60);
  assert.equal(cache.getSnapshot().entries.all.data.items[0].id, 'n0');
  await cache.refresh('all', { force: true });
  assert.equal(cache.getSnapshot().entries.all.data.items[0].id, 'new-head');
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 30);
});
test('Invalidation during a failed next page retries from the head without appending obsolete cards', async () => {
  const { api, cache } = setup(Array.from({ length: 80 }, (_, index) => notification(`n${index}`)));
  await cache.refresh('all');
  const response = deferred(), boundaries = [];
  api.load = (_filter, _limit, _readCount, cursor) => {
    boundaries.push(cursor?.id ?? null);
    return boundaries.length === 1 ? response.promise : Promise.resolve({ items: [notification('new')], unreadCount: 1, hasMore: false });
  };
  const task = cache.refresh('all', { loadMore: true });
  await flush(); cache.invalidate(); response.reject(new Error('obsolete'));
  await task;
  assert.deepEqual(boundaries, ['n29', null]);
  assert.equal(cache.getSnapshot().entries.all.data.items.length, 1);
  assert.equal(cache.getSnapshot().entries.all.error, null);
});

test('Refresh errors retain list and count, and errors are isolated by filter', async () => {
  const { cache, server } = setup();
  await cache.refresh('all');
  const previous = cache.getSnapshot().entries.all.data;
  server.failLoad = true;
  await cache.refresh('all', { force: true });
  assert.equal(cache.getSnapshot().entries.all.data, previous);
  assert.equal(cache.getSnapshot().unreadCount, 2);
  assert.match(cache.getSnapshot().entries.all.error, /previously loaded/);
  await cache.refresh('unread');
  assert.equal(cache.getSnapshot().entries.unread.data, null);
  assert.match(cache.getSnapshot().entries.unread.error, /Couldn’t load/);
  server.failLoad = false;
  await cache.refresh('unread');
  assert.equal(cache.getSnapshot().entries.unread.error, null);
  assert.match(cache.getSnapshot().entries.all.error, /previously loaded/);
});

test('An older filter response cannot overwrite the newest unread count', async () => {
  const { api, cache } = setup();
  const all = deferred();
  const unread = deferred();
  api.load = (filter) => filter === 'all' ? all.promise : unread.promise;
  const older = cache.refresh('all');
  const newer = cache.refresh('unread');
  await flush();
  unread.resolve({ items: [], unreadCount: 0, hasMore: false });
  await newer;
  all.resolve({ items: [], unreadCount: 5, hasMore: false });
  await older;
  assert.equal(cache.getSnapshot().unreadCount, 0);
  assert.ok(cache.getSnapshot().entries.all.data);
});

test('Marking one read synchronizes both cached filters and cannot decrement twice', async () => {
  const { cache, writes } = setup();
  await cache.refresh('all');
  await cache.refresh('unread');
  const item = cache.getSnapshot().entries.all.data.items[0];
  assert.equal(await cache.markRead(item), null);
  assert.equal(cache.getSnapshot().entries.all.data.items[0].isRead, true);
  assert.deepEqual(Array.from(cache.getSnapshot().entries.unread.data.items, (row) => row.id), ['n3']);
  assert.equal(cache.getSnapshot().unreadCount, 1);
  await cache.markRead(item);
  await cache.markRead(notification('foreign', false, 'account-b'));
  await cache.markRead(notification('read', true));
  assert.deepEqual(writes, ['n1']);
  assert.equal(cache.getSnapshot().unreadCount, 1);
});

test('Mark all synchronizes loaded pages and clears Unread including its pagination', async () => {
  const { cache, writes } = setup(Array.from({ length: 80 }, (_, index) => notification(`n${index}`)));
  await cache.refresh('all');
  await cache.refresh('unread');
  await cache.markRead();
  assert.ok(cache.getSnapshot().entries.all.data.items.every((item) => item.isRead));
  assert.equal(cache.getSnapshot().entries.unread.data.items.length, 0);
  assert.equal(cache.getSnapshot().entries.unread.data.hasMore, false);
  assert.equal(cache.getSnapshot().unreadCount, 0);
  assert.deepEqual(writes, ['all']);
});

test('An outstanding refresh cannot undo a confirmed read action', async () => {
  const { api, cache } = setup();
  await cache.refresh('all');
  await cache.refresh('unread');
  const item = cache.getSnapshot().entries.all.data.items[0];
  const response = deferred();
  api.load = () => response.promise;
  const old = cache.refresh('all', { force: true });
  await flush();
  await cache.markRead(item);
  response.resolve({ items: [item], unreadCount: 2, hasMore: false });
  await old;
  assert.equal(cache.getSnapshot().entries.all.data.items[0].isRead, true);
  assert.equal(cache.getSnapshot().unreadCount, 1);
  assert.equal(cache.getSnapshot().entries.all.isFetching, false);
});

test('Read actions wait for server success, block overlapping writes, and retain data on failure', async () => {
  const { api, cache, reads } = setup();
  await cache.refresh('all');
  const item = cache.getSnapshot().entries.all.data.items[0];
  const write = deferred();
  let writes = 0;
  api.markRead = () => { writes++; return write.promise; };
  const pending = cache.markRead(item);
  await flush();
  assert.equal(cache.getSnapshot().isMarking, true);
  assert.equal(cache.getSnapshot().entries.all.data.items[0].isRead, false);
  await cache.markRead(item);
  await cache.refresh('all', { force: true });
  assert.equal(reads.length, 1);
  assert.equal(writes, 1);
  write.resolve({ success: false, message: 'Write rejected' });
  assert.equal(await pending, 'Write rejected');
  assert.equal(cache.getSnapshot().unreadCount, 2);
  assert.equal(cache.getSnapshot().entries.all.data.items[0].isRead, false);
  assert.equal(cache.getSnapshot().isMarking, false);
});

test('A write completing after all screen subscribers leave still patches the shared cache', async () => {
  const { api, cache } = setup();
  await cache.refresh('all');
  const write = deferred();
  api.markRead = () => write.promise;
  const unsubscribe = cache.subscribe(() => {});
  const pending = cache.markRead(cache.getSnapshot().entries.all.data.items[0]);
  unsubscribe();
  write.resolve({ success: true });
  await pending;
  assert.equal(cache.getSnapshot().entries.all.data.items[0].isRead, true);
});

test('Account switching discards old reads without stopping the new account request', async () => {
  const { api, cache } = setup();
  const old = deferred();
  const next = deferred();
  let calls = 0;
  api.load = () => ++calls === 1 ? old.promise : next.promise;
  const beforeSwitch = cache.refresh('all');
  await flush();
  cache.setAccount('account-b');
  const afterSwitch = cache.refresh('all');
  await flush();
  old.resolve({ items: [notification('private-a')], unreadCount: 3, hasMore: false });
  await beforeSwitch;
  assert.equal(cache.getSnapshot().entries.all.data, null);
  assert.equal(cache.getSnapshot().entries.all.isFetching, true);
  assert.equal(cache.refresh('all'), afterSwitch);
  next.resolve({ items: [notification('private-b', false, 'account-b')], unreadCount: 1, hasMore: false });
  await afterSwitch;
  assert.equal(cache.getSnapshot().entries.all.data.items[0].id, 'private-b');
});

test('Late write success or failure after account switching cannot affect the new inbox', async () => {
  for (const result of [{ success: true }, { success: false, message: 'Old session failed' }]) {
    const { api, cache, server } = setup();
    await cache.refresh('all');
    const write = deferred();
    api.markRead = () => write.promise;
    const pending = cache.markRead(cache.getSnapshot().entries.all.data.items[0]);
    await flush();
    cache.setAccount('account-b');
    server.rows = [notification('private-b', false, 'account-b')];
    await cache.refresh('all');
    write.resolve(result);
    assert.equal(await pending, null);
    assert.equal(cache.getSnapshot().unreadCount, 1);
    assert.equal(cache.getSnapshot().entries.all.data.items[0].isRead, false);
  }
});

test('Logout clears both filters, count and pagination; same-account token events preserve them', async () => {
  const { cache, reads } = setup(Array.from({ length: 80 }, (_, index) => notification(`n${index}`)));
  await cache.refresh('all');
  await cache.refresh('all', { loadMore: true });
  await cache.refresh('unread');
  const snapshot = cache.getSnapshot();
  cache.setAccount('account-a');
  assert.equal(cache.getSnapshot(), snapshot);
  assert.equal(cache.getServerSnapshot().entries.all.data, null);
  cache.setAccount(null);
  for (const filter of ['all', 'unread']) {
    assert.equal(cache.getSnapshot().entries[filter].data, null);
    assert.equal(cache.getSnapshot().entries[filter].limit, 30);
  }
  assert.equal(cache.getSnapshot().unreadCount, null);
  await cache.refresh('all');
  assert.equal(reads.length, 3);
  cache.setAccount('account-a');
  await cache.refresh('all');
  assert.deepEqual(reads.at(-1), ['all', 30]);
});

test('Invalidation while the screen is closed makes both filters refresh on return', async () => {
  const { cache, server, reads } = setup();
  await cache.refresh('all');
  await cache.refresh('unread');
  server.rows.unshift(notification('new'));
  cache.invalidate();
  await cache.refresh('all');
  await cache.refresh('unread');
  assert.equal(reads.length, 4);
  assert.equal(cache.getSnapshot().entries.all.data.items[0].id, 'new');
  assert.equal(cache.getSnapshot().unreadCount, 3);
});

test('Invalidation during a pending fetch rereads before accepting the response', async () => {
  const { api, cache } = setup();
  const old = deferred();
  let calls = 0;
  api.load = () => ++calls === 1 ? old.promise : Promise.resolve({ items: [notification('new')], unreadCount: 1, hasMore: false });
  const pending = cache.refresh('all');
  await flush();
  cache.invalidate();
  assert.equal(cache.refresh('all'), pending);
  old.resolve({ items: [], unreadCount: 0, hasMore: false });
  await pending;
  assert.equal(calls, 2);
  assert.equal(cache.getSnapshot().entries.all.data.items[0].id, 'new');
});

test('No queries start before session restoration or after a queued fetch/write is logged out', async () => {
  const { api, reads, writes } = setup();
  const cache = createNotificationInboxCache(api);
  await cache.refresh('all');
  assert.equal(reads.length, 0);
  cache.setAccount('account-a');
  const read = cache.refresh('all');
  cache.setAccount(null);
  await read;
  assert.equal(reads.length, 0);
  cache.setAccount('account-a');
  const write = cache.markRead(notification('n1'));
  cache.setAccount(null);
  await write;
  assert.equal(writes.length, 0);
});

test('A response containing another account’s items is rejected without caching it', async () => {
  const { api, cache } = setup();
  api.load = async () => ({ items: [notification('private-b', false, 'account-b')], unreadCount: 1, hasMore: false });
  await cache.refresh('all');
  assert.equal(cache.getSnapshot().entries.all.data, null);
  assert.equal(cache.getSnapshot().unreadCount, null);
  assert.ok(cache.getSnapshot().entries.all.error);
});

function hookHarness(cache) {
  let filter = 'all';
  const refs = [];
  let index = 0;
  let focus;
  let mountCleanup;
  let isMounted = false;
  let bookingChange;
  let notificationChange;
  let appChange;
  let removed = 0;
  const alerts = [];
  const { useNotificationInbox } = loadModule('src/hooks/use-notification-inbox.ts', {
    react: {
      useState: () => [filter, (value) => { filter = value; }],
      useCallback: (callback) => callback,
      useRef: (initial) => { const slot = index++; return refs[slot] ??= { current: initial }; },
      useEffect: (callback) => { if (!isMounted) mountCleanup = callback(); },
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    },
    'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native': { AppState: { addEventListener: (_event, callback) => {
      appChange = callback; return { remove: () => { removed++; } };
    } } },
    '@/components/app-alert': { showAppAlert: (...args) => alerts.push(args) },
    '@/services/notification-inbox-store': { notificationInboxStore: cache },
    '@/services/booking-events': { subscribeToBookingsChanged: (callback) => {
      bookingChange = callback; return () => { removed++; };
    } },
    '@/services/notification-events': { subscribeToNotificationsChanged: (callback) => {
      notificationChange = callback; return () => { removed++; };
    } },
  });
  return {
    render: () => { index = 0; const view = useNotificationInbox(); isMounted = true; return view; },
    focus: () => focus(),
    unmount: () => mountCleanup(),
    bookingChange: () => bookingChange(),
    notificationChange: () => notificationChange(),
    appChange: (state) => appChange(state),
    removed: () => removed, alerts,
  };
}

test('Hook shows cached lists immediately on remount and filter return, without refetching', async () => {
  const { cache, reads } = setup();
  await cache.refresh('all');
  await cache.refresh('unread');
  const hook = hookHarness(cache);
  let view = hook.render();
  assert.equal(view.isLoading, false);
  assert.equal(view.items.length, 3);
  let blur = hook.focus();
  view.setFilter('unread');
  blur();
  view = hook.render();
  assert.equal(view.items.length, 2);
  assert.equal(view.isLoading, false);
  blur = hook.focus();
  await flush();
  assert.equal(reads.length, 2);
  blur();
  hook.unmount();
  assert.equal(hook.removed(), 6);
  const remount = hookHarness(cache);
  assert.equal(remount.render().isLoading, false);
  const leave = remount.focus();
  await flush();
  assert.equal(reads.length, 2);
  leave();
  remount.unmount();
});

test('Hook resumes stale data, honors pull to refresh, and refills Unread after a write', async () => {
  const { cache, reads, setTime } = setup();
  await cache.refresh('all');
  await cache.refresh('unread');
  const hook = hookHarness(cache);
  const first = hook.render();
  first.setFilter('unread');
  const view = hook.render();
  const blur = hook.focus();
  hook.appChange('background');
  await flush();
  assert.equal(reads.length, 2);
  setTime(30_001);
  hook.appChange('active');
  await flush();
  assert.equal(reads.length, 3);
  view.refresh();
  await flush();
  assert.equal(reads.length, 4);
  hook.render().markRead(view.items[0]);
  await flush();
  assert.equal(reads.length, 5);
  assert.equal(cache.getSnapshot().entries.unread.data.items.length, 1);
  cache.invalidate();
  hook.notificationChange();
  await flush();
  assert.equal(reads.length, 6);
  blur();
  hook.unmount();
});

test('Hook does not refresh or show a write failure alert after it is closed', async () => {
  for (const success of [true, false]) {
    const { api, cache, reads } = setup();
    await cache.refresh('all');
    const write = deferred();
    api.markRead = () => write.promise;
    const hook = hookHarness(cache);
    const view = hook.render();
    const blur = hook.focus();
    view.markRead(view.items[0]);
    blur();
    hook.unmount();
    write.resolve({ success, message: 'Write rejected' });
    await flush();
    assert.equal(reads.length, 1);
    assert.equal(hook.alerts.length, 0);
    assert.equal(cache.getSnapshot().entries.all.data.items[0].isRead, success);
  }
});

test('Store session and event wiring invalidates cached filters while the screen is absent', async () => {
  let auth;
  let bookingChange;
  let notificationChange;
  const { api, reads } = setup();
  const { notificationInboxStore: cache } = loadModule('src/services/notification-inbox-store.ts', {
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => { auth = callback; } } } },
    '@/services/notification-inbox-cache': { createNotificationInboxCache },
    '@/services/notifications': { getMyNotificationInbox: api.load, getMyUnreadNotificationCount: (options) => {
      assert.equal(options.throwOnError, true);
      return api.loadUnreadCount();
    }, markAllNotificationsRead: api.markAll, markNotificationRead: api.markRead },
    '@/services/booking-events': { subscribeToBookingsChanged: (callback) => { bookingChange = callback; } },
    '@/services/notification-events': { subscribeToNotificationsChanged: (callback) => { notificationChange = callback; } },
  });
  auth('INITIAL_SESSION', { user: { id: 'account-a' } });
  await cache.refresh('all');
  auth('TOKEN_REFRESHED', { user: { id: 'account-a' } });
  await cache.refresh('all');
  assert.equal(reads.length, 1);
  bookingChange();
  await cache.refresh('all');
  notificationChange();
  await cache.refresh('all');
  assert.equal(reads.length, 3);
  auth('SIGNED_OUT', null);
  assert.equal(cache.getSnapshot().entries.all.data, null);
});

test('Push arrival and tap invalidate the inbox, preserve navigation, and clean up both listeners', () => {
  let received;
  let response;
  let changes = 0;
  let removed = 0;
  const routes = [];
  const payload = { request: { content: { data: { url: '/photographer/notifications', userId: 'account-a' } } } };
  const { observePushNotificationResponses } = loadModule('src/services/push-notifications.ts', {
    'expo-constants': {},
    'expo-notifications': {
      setNotificationHandler: () => {}, getLastNotificationResponse: () => ({ notification: payload }),
      addNotificationResponseReceivedListener: (callback) => { response = callback; return { remove: () => { removed++; } }; },
      addNotificationReceivedListener: (callback) => { received = callback; return { remove: () => { removed++; } }; },
    },
    'expo-router': { router: { push: (route) => routes.push(route) } },
    'react-native': { Platform: { OS: 'android' } },
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => {
      callback('INITIAL_SESSION', { user: { id: 'account-a' } });
    } } } },
    '@/services/notification-events': { emitNotificationsChanged: () => { changes++; } },
  });
  const cleanup = observePushNotificationResponses();
  received(payload);
  response({ notification: payload });
  assert.equal(changes, 3);
  assert.deepEqual(routes, ['/photographer/notifications', '/photographer/notifications']);
  cleanup();
  assert.equal(removed, 2);
});
