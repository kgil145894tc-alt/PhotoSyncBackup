import { type NotificationCursor, type NotificationFilter, type NotificationInbox, type PhotoSyncNotification } from '@/types/notifications';

export type NotificationInboxApi = {
  load: (filter: NotificationFilter, limit: number, readUnreadCount?: (load: () => Promise<number>) => Promise<number>, cursor?: NotificationCursor | null) => Promise<NotificationInbox>;
  loadUnreadCount: () => Promise<number>;
  markAll: () => Promise<{ success: boolean; message?: string }>;
  markRead: (id: string) => Promise<{ success: boolean; message?: string }>;
};

type InboxEntry = {
  data: Omit<NotificationInbox, 'unreadCount'> | null;
  limit: number;
  fetchedAt: number | null;
  error: string | null;
  isFetching: boolean;
};

type InboxSnapshot = {
  accountId: string | null;
  isSessionReady: boolean;
  entries: Record<NotificationFilter, InboxEntry>;
  unreadCount: number | null;
  unreadCountFetchedAt: number | null;
  unreadCountError: string | null;
  isUnreadCountFetching: boolean;
  isMarking: boolean;
};

const PAGE_SIZE = 30;
const FRESHNESS_MS = 30_000;
const FILTERS = ['all', 'unread'] as const;

function emptyEntry(): InboxEntry {
  return { data: null, limit: PAGE_SIZE, fetchedAt: null, error: null, isFetching: false };
}

export function createNotificationInboxCache(api: NotificationInboxApi, now: () => number = Date.now) {
  const initialSnapshot: InboxSnapshot = {
    accountId: null, isSessionReady: false, unreadCount: null, unreadCountFetchedAt: null,
    unreadCountError: null, isUnreadCountFetching: false, isMarking: false,
    entries: { all: emptyEntry(), unread: emptyEntry() },
  };
  let snapshot = initialSnapshot;
  let generation = 0;
  let requestEpoch = 0;
  let revision = 0;
  let sequence = 0;
  let countSequence = 0;
  let pending: Partial<Record<NotificationFilter, Promise<void>>> = {};
  let pendingCount: Promise<number> | null = null;
  const listeners = new Set<() => void>();

  function publish(next: InboxSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function updateEntry(filter: NotificationFilter, changes: Partial<InboxEntry>) {
    publish({ ...snapshot, entries: { ...snapshot.entries, [filter]: { ...snapshot.entries[filter], ...changes } } });
  }

  function setAccount(accountId: string | null) {
    if (snapshot.isSessionReady && snapshot.accountId === accountId) return;
    generation += 1;
    requestEpoch += 1;
    revision += 1;
    pending = {};
    pendingCount = null;
    countSequence = 0;
    publish({ ...initialSnapshot, accountId, isSessionReady: true });
  }

  function invalidate() {
    revision += 1;
    publish({ ...snapshot, unreadCountFetchedAt: null, entries: {
      all: { ...snapshot.entries.all, fetchedAt: null },
      unread: { ...snapshot.entries.unread, fetchedAt: null },
    } });
  }

  // The badge can refresh without downloading an inbox page. Inbox reads use
  // this same request, so overlapping badge/filter reads share one count query.
  function readUnreadCount({ force = false, load = api.loadUnreadCount } = {}): Promise<number> {
    if (!snapshot.accountId || snapshot.isMarking) return Promise.reject(new Error('Notification read cancelled.'));
    if (pendingCount) return pendingCount;
    if (!force && snapshot.unreadCount !== null && snapshot.unreadCountFetchedAt !== null
      && now() - snapshot.unreadCountFetchedAt < FRESHNESS_MS) {
      return Promise.resolve(snapshot.unreadCount);
    }

    const requestGeneration = generation;
    const epoch = requestEpoch;
    const isCurrent = () => requestGeneration === generation && epoch === requestEpoch;
    const task = Promise.resolve().then(async () => {
      try {
        if (!isCurrent()) throw new Error('Notification read cancelled.');
        while (true) {
          const requestRevision = revision;
          const requestSequence = ++sequence;
          let count: number;
          try {
            count = await load();
          } catch (reason) {
            if (isCurrent() && requestRevision !== revision) continue;
            throw reason;
          }
          if (!isCurrent()) throw new Error('Notification read cancelled.');
          if (!Number.isInteger(count) || count < 0) throw new Error('Invalid notification count.');
          if (requestRevision !== revision) continue;
          if (requestSequence >= countSequence) {
            countSequence = requestSequence;
            publish({ ...snapshot, unreadCount: count, unreadCountFetchedAt: now(), unreadCountError: null });
          }
          return count;
        }
      } catch (reason) {
        if (isCurrent()) publish({ ...snapshot, unreadCountError: snapshot.unreadCount === null
          ? 'Couldn’t load the notification count. Pull down to try again.'
          : 'Couldn’t update the notification count. Showing the last known count.' });
        throw reason;
      } finally {
        if (isCurrent()) {
          pendingCount = null;
          publish({ ...snapshot, isUnreadCountFetching: false });
        }
      }
    });
    pendingCount = task;
    publish({ ...snapshot, isUnreadCountFetching: true, unreadCountError: null });
    return task;
  }

  function refreshUnreadCount({ force = false } = {}): Promise<void> {
    if (!snapshot.accountId || snapshot.isMarking) return Promise.resolve();
    // An inbox already loading will refresh the shared count itself.
    const inboxRead = pending.all ?? pending.unread;
    if (!force && inboxRead) return inboxRead;
    return readUnreadCount({ force }).then(() => {}, () => {});
  }

  function refresh(filter: NotificationFilter, { force = false, loadMore = false } = {}): Promise<void> {
    if (!snapshot.accountId || snapshot.isMarking) return Promise.resolve();
    if (pending[filter]) return pending[filter];
    const entry = snapshot.entries[filter];
    if (loadMore && !entry.data?.hasMore) return Promise.resolve();
    if (!force && !loadMore && entry.fetchedAt !== null && now() - entry.fetchedAt < FRESHNESS_MS) {
      return Promise.resolve();
    }

    const limit = PAGE_SIZE;
    const startingRevision = revision;
    const owner = snapshot.accountId;
    const requestGeneration = generation;
    const epoch = requestEpoch;
    const isCurrent = () => requestGeneration === generation && epoch === requestEpoch;
    const task = Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      try {
        let requestRevision: number;
        do {
          requestRevision = revision;
          const append = loadMore && startingRevision === revision;
          // Retain the server boundary when read items disappear from Unread.
          const cursor = append ? entry.data?.nextCursor ?? null : null;
          const requestSequence = ++sequence;
          let usedSharedCount = false;
          let inbox: NotificationInbox;
          try {
            inbox = await api.load(filter, limit, (load) => {
              if (!isCurrent()) return Promise.reject(new Error('Notification read cancelled.'));
              usedSharedCount = true;
              return readUnreadCount({ force, load });
            }, cursor);
          } catch (reason) {
            if (isCurrent() && requestRevision !== revision) continue;
            throw reason;
          }
          if (!isCurrent()) return;
          if (inbox.items.some((item) => item.userId !== owner)) throw new Error('Account changed.');
          if (requestRevision === revision) {
            const lastItem = inbox.items.at(-1);
            const nextCursor = inbox.nextCursor ?? (inbox.hasMore && lastItem
              ? { createdAt: lastItem.createdAt, id: lastItem.id } : null);
            if (inbox.hasMore && (!nextCursor || (cursor && JSON.stringify(cursor) === JSON.stringify(nextCursor)))) {
              throw new Error('Notification page did not advance.');
            }
            const items = Array.from(new Map([...(append ? entry.data?.items ?? [] : []), ...inbox.items]
              .map((item) => [item.id, item])).values());
            // Shared reads publish their count separately. Finishing a slower
            // page must not make an older count fresh again or overwrite it.
            const acceptsCount = !usedSharedCount && requestSequence >= countSequence;
            const unreadCount = acceptsCount ? inbox.unreadCount : snapshot.unreadCount;
            const unreadCountFetchedAt = acceptsCount ? now() : snapshot.unreadCountFetchedAt;
            const unreadCountError = acceptsCount ? null : snapshot.unreadCountError;
            if (acceptsCount) countSequence = requestSequence;
            publish({ ...snapshot, unreadCount, unreadCountFetchedAt, unreadCountError, entries: { ...snapshot.entries, [filter]: {
              data: { items, hasMore: inbox.hasMore, nextCursor }, limit,
              fetchedAt: append ? entry.fetchedAt : now(), error: null, isFetching: true,
            } } });
          }
        } while (requestRevision !== revision);
      } catch {
        if (isCurrent()) updateEntry(filter, { error: snapshot.entries[filter].data
          ? 'Couldn’t update notifications. Showing previously loaded updates.'
          : 'Couldn’t load notifications. Please try again.' });
      } finally {
        if (isCurrent()) {
          delete pending[filter];
          updateEntry(filter, { isFetching: false });
        }
      }
    });
    pending[filter] = task;
    updateEntry(filter, { isFetching: true, error: null });
    return task;
  }

  async function markRead(notification?: PhotoSyncNotification): Promise<string | null> {
    if (!snapshot.accountId || snapshot.isMarking || notification?.isRead) return null;
    if (notification && (notification.userId !== snapshot.accountId || FILTERS.some((filter) =>
      snapshot.entries[filter].data?.items.some((item) => item.id === notification.id && item.isRead)))) return null;

    const writeGeneration = generation;
    // Ignore outstanding reads before the write. Its result updates both lists,
    // even if navigation unmounts the screen while the write is running.
    requestEpoch += 1;
    pending = {};
    pendingCount = null;
    revision += 1;
    publish({ ...snapshot, isMarking: true, unreadCountFetchedAt: null, isUnreadCountFetching: false, entries: {
      all: { ...snapshot.entries.all, fetchedAt: null, isFetching: false },
      unread: { ...snapshot.entries.unread, fetchedAt: null, isFetching: false },
    } });

    try {
      const result = await Promise.resolve().then(() => {
        if (writeGeneration !== generation) return null;
        return notification ? api.markRead(notification.id) : api.markAll();
      });
      if (writeGeneration !== generation || !result) return null;
      if (!result.success) throw new Error(result.message ?? 'Please try again.');

      const entries = { ...snapshot.entries };
      for (const filter of FILTERS) {
        const entry = entries[filter];
        if (!entry.data) continue;
        const items = entry.data.items.map((item) =>
          !notification || item.id === notification.id ? { ...item, isRead: true } : item);
        entries[filter] = { ...entry, error: null, data: {
          ...entry.data,
          items: filter === 'unread' ? items.filter((item) => !item.isRead) : items,
          hasMore: !notification && filter === 'unread' ? false : entry.data.hasMore,
        } };
      }
      publish({ ...snapshot, entries, unreadCountError: null, unreadCount: notification
        ? snapshot.unreadCount === null ? null : Math.max(0, snapshot.unreadCount - 1)
        : 0 });
      return null;
    } catch (reason) {
      if (writeGeneration !== generation) return null;
      return reason instanceof Error ? reason.message : 'Please try again.';
    } finally {
      if (writeGeneration === generation) publish({ ...snapshot, isMarking: false });
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    setAccount, invalidate, refresh, refreshUnreadCount, markRead,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
