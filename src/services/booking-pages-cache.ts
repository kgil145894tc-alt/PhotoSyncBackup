import { bookingQueryKey, type BookingCursor, type BookingPage, type BookingQuery } from '@/types/booking-pages';

type ActionResult = { success: boolean; message?: string };
type Api = {
  load: (query: BookingQuery, cursor: BookingCursor | null, accountId: string, isCurrent: () => boolean) => Promise<BookingPage>;
  cancel?: (id: string, accountId: string, isCurrent: () => boolean) => Promise<ActionResult>;
  ownBookingsOnly?: boolean;
};
export type BookingPageEntry = { data: BookingPage | null; fetchedAt: number | null; error: string | null; isFetching: boolean; isLoadingMore: boolean };
export const EMPTY_BOOKING_PAGE_ENTRY: BookingPageEntry = { data: null, fetchedAt: null, error: null, isFetching: false, isLoadingMore: false };
const EMPTY_ENTRY = EMPTY_BOOKING_PAGE_ENTRY;
const FRESHNESS_MS = 30_000;
const MAX_QUERIES = 12;

export function createBookingPagesCache(api: Api, now = Date.now) {
  const initial = { accountId: null as string | null, accountVersion: 0, isSessionReady: false,
    entries: {} as Record<string, BookingPageEntry>, cancellingId: null as string | null };
  let snapshot = initial;
  let generation = 0;
  let revision = 0;
  const pending = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  const publish = (next: typeof initial) => { snapshot = next; listeners.forEach((listener) => listener()); };
  const getEntry = (query: BookingQuery) => snapshot.entries[bookingQueryKey(query)] ?? EMPTY_ENTRY;
  const isFresh = (entry: BookingPageEntry) => entry.fetchedAt !== null && now() - entry.fetchedAt < FRESHNESS_MS;
  function update(key: string, changes: Partial<BookingPageEntry>) {
    const entries = { ...snapshot.entries, [key]: { ...(snapshot.entries[key] ?? EMPTY_ENTRY), ...changes } };
    // Bound search/filter cache growth. Active reads are never evicted.
    const candidates = Object.keys(entries).filter((candidate) => candidate !== key && !pending.has(candidate))
      .sort((a, b) => (entries[a].fetchedAt ?? 0) - (entries[b].fetchedAt ?? 0));
    while (Object.keys(entries).length > MAX_QUERIES && candidates.length) delete entries[candidates.shift()!];
    publish({ ...snapshot, entries });
  }
  function setAccount(accountId: string | null) {
    if (snapshot.isSessionReady && snapshot.accountId === accountId) return;
    generation++; revision++; pending.clear();
    publish({ ...initial, entries: {}, accountId, accountVersion: generation, isSessionReady: true });
  }
  function invalidate() {
    revision++;
    publish({ ...snapshot, entries: Object.fromEntries(Object.entries(snapshot.entries)
      .map(([key, entry]) => [key, { ...entry, fetchedAt: null }])) });
  }
  function refresh(query: BookingQuery, { force = false, loadMore = false } = {}): Promise<void> {
    if (!snapshot.accountId || snapshot.cancellingId) return Promise.resolve();
    const key = bookingQueryKey(query);
    if (pending.has(key)) {
      const existing = pending.get(key)!;
      const pendingGeneration = generation;
      return force ? existing.then(() => {
        if (pendingGeneration === generation && snapshot.accountId && !snapshot.cancellingId && !isFresh(getEntry(query))) return refresh(query, { force: true });
      }) : existing;
    }
    const entry = getEntry(query);
    if (loadMore && !entry.data?.hasMore) return Promise.resolve();
    if (!force && !loadMore && isFresh(entry)) return Promise.resolve();
    // A booking visible in a fresh list can immediately seed its detail view.
    if (query.bookingId && !force && !loadMore) {
      for (const cached of Object.values(snapshot.entries)) {
        const booking = cached.data?.items.find((item) => item.id === query.bookingId);
        if (booking && isFresh(cached)) {
          update(key, { data: { items: [booking], counts: null, hasMore: false, nextCursor: null }, fetchedAt: cached.fetchedAt, error: null });
          return Promise.resolve();
        }
      }
    }
    const owner = snapshot.accountId;
    const epoch = generation;
    const startingRevision = revision;
    const isCurrent = () => epoch === generation;
    const task = Promise.resolve().then(async () => {
      try {
        if (!isCurrent()) return;
        while (true) {
          const requestRevision = revision;
          // Any invalidation restarts at the head; appending across a status
          // change would leave missing or incorrectly filtered rows behind.
          const append = loadMore && startingRevision === revision && entry.fetchedAt !== null;
          const cursor = append ? entry.data?.nextCursor ?? null : null;
          let page: BookingPage;
          try { page = await api.load(query, cursor, owner, isCurrent); }
          catch (reason) { if (isCurrent() && requestRevision !== revision) continue; throw reason; }
          if (!isCurrent() || snapshot.cancellingId) return;
          if (requestRevision !== revision) continue;
          if (api.ownBookingsOnly && page.items.some((booking) => booking.clientId !== owner)) throw new Error('Account changed.');
          if (page.hasMore && !page.nextCursor) throw new Error('Missing booking cursor.');
          if (append && page.hasMore && JSON.stringify(page.nextCursor) === JSON.stringify(cursor)) throw new Error('Booking page did not advance.');
          const previous = append ? entry.data : null;
          const items = Array.from(new Map([...(previous?.items ?? []), ...page.items].map((item) => [item.id, item])).values());
          update(key, { data: { ...page, items, counts: page.counts ?? previous?.counts ?? null },
            // Loading an older page must not make the head or its counts fresh.
            fetchedAt: append ? entry.fetchedAt : now(), error: null });
          return;
        }
      } catch {
        if (isCurrent()) update(key, { error: getEntry(query).data
          ? 'Could not update bookings. Showing previously loaded data. Pull down to try again.'
          : 'Could not load bookings. Pull down to try again.' });
      } finally {
        if (isCurrent()) { pending.delete(key); update(key, { isFetching: false, isLoadingMore: false }); }
      }
    });
    pending.set(key, task);
    update(key, { isFetching: true, isLoadingMore: loadMore, error: null });
    return task;
  }
  async function cancel(id: string): Promise<ActionResult | null> {
    if (!id || !api.cancel || !snapshot.accountId || snapshot.cancellingId) return null;
    const owner = snapshot.accountId;
    const epoch = generation;
    const isCurrent = () => epoch === generation;
    invalidate();
    publish({ ...snapshot, cancellingId: id });
    try {
      await Promise.resolve();
      if (!isCurrent()) return null;
      const result = await api.cancel(id, owner, isCurrent);
      if (!isCurrent()) return null;
      invalidate();
      if (result.success) {
        publish({ ...snapshot, entries: Object.fromEntries(Object.entries(snapshot.entries).map(([key, entry]) => [key,
          { ...entry, data: entry.data ? { ...entry.data, items: entry.data.items.map((booking) => booking.id === id
            ? { ...booking, status: 'cancelled' as const } : booking) } : null }])) });
      }
      return result;
    } catch {
      return isCurrent() ? { success: false, message: 'Could not cancel this booking. Please try again.' } : null;
    } finally {
      if (isCurrent()) publish({ ...snapshot, cancellingId: null });
    }
  }
  return { getSnapshot: () => snapshot, getServerSnapshot: () => initial, getEntry, isFresh,
    setAccount, invalidate, refresh, cancel,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
