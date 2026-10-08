const FRESHNESS_MS = 30_000;

type CalendarEntry<T> = {
  data: T[] | null;
  error: string | null;
  isFetching: boolean;
  fetchedAt: number | null;
};

type CalendarSnapshot<T> = {
  accountId: string | null;
  isSessionReady: boolean;
  entries: Record<string, CalendarEntry<T>>;
};

// Month summaries and day details use independent instances of this cache.
// No data or responses survive an account change, and no work starts in render.
export function createAdminCalendarCache<T>(
  load: (key: string) => Promise<T[]>,
  now: () => number = Date.now,
  maxEntries = 24,
) {
  const initialSnapshot: CalendarSnapshot<T> = { accountId: null, isSessionReady: false, entries: {} };
  let snapshot = initialSnapshot;
  let generation = 0;
  let accessSequence = 0;
  const revisions = new Map<string, number>();
  const lastAccess = new Map<string, number>();
  const pending = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();

  function publish(next: CalendarSnapshot<T>) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function setAccount(accountId: string | null) {
    if (snapshot.isSessionReady && snapshot.accountId === accountId) return;
    generation += 1;
    pending.clear();
    revisions.clear();
    lastAccess.clear();
    publish({ ...initialSnapshot, accountId, isSessionReady: true });
  }

  function invalidate(key?: string) {
    const keys = key ? [key] : Object.keys(snapshot.entries);
    const entries = { ...snapshot.entries };
    let changed = false;
    for (const entryKey of keys) {
      if (!entries[entryKey]) continue;
      revisions.set(entryKey, (revisions.get(entryKey) ?? 0) + 1);
      entries[entryKey] = { ...entries[entryKey], fetchedAt: null };
      changed = true;
    }
    if (changed) publish({ ...snapshot, entries });
  }

  function update(key: string, changes: Partial<CalendarEntry<T>>) {
    publish({ ...snapshot, entries: { ...snapshot.entries, [key]: { ...snapshot.entries[key], ...changes } } });
  }

  function prune() {
    const entries = { ...snapshot.entries };
    const candidates = Object.keys(entries)
      .sort((a, b) => (lastAccess.get(a) ?? 0) - (lastAccess.get(b) ?? 0));
    let size = Object.keys(entries).length;
    for (const key of candidates) {
      if (size <= maxEntries) break;
      // Defer pruning an older in-flight entry until it settles. Do not evict
      // the latest visible month simply because its request completed first.
      if (pending.has(key)) break;
      delete entries[key];
      revisions.delete(key);
      lastAccess.delete(key);
      size -= 1;
    }
    if (size !== Object.keys(snapshot.entries).length) publish({ ...snapshot, entries });
  }

  function refresh(key: string, force = false): Promise<void> {
    if (!snapshot.isSessionReady || !snapshot.accountId) return Promise.resolve();
    lastAccess.set(key, ++accessSequence);
    const existingRequest = pending.get(key);
    if (existingRequest) return existingRequest;
    const entry = snapshot.entries[key];
    if (!force && entry?.fetchedAt != null && now() - entry.fetchedAt < FRESHNESS_MS) return Promise.resolve();

    const requestGeneration = generation;
    const request = Promise.resolve().then(async () => {
      if (requestGeneration !== generation) return;
      try {
        while (requestGeneration === generation) {
          const requestRevision = revisions.get(key) ?? 0;
          try {
            const data = await load(key);
            if (requestGeneration !== generation) return;
            if (requestRevision !== (revisions.get(key) ?? 0)) continue;
            update(key, { data, error: null, fetchedAt: now() });
            break;
          } catch {
            if (requestGeneration !== generation) return;
            if (requestRevision !== (revisions.get(key) ?? 0)) continue;
            update(key, { fetchedAt: null, error: snapshot.entries[key]?.data
              ? 'Could not update the schedule. Showing previously loaded data. Pull down to try again.'
              : 'Could not load the schedule. Pull down to try again.' });
            break;
          }
        }
      } finally {
        if (requestGeneration === generation) {
          pending.delete(key);
          update(key, { isFetching: false });
          prune();
        }
      }
    });
    // Register before notifying React, so overlapping subscribers share work.
    pending.set(key, request);
    publish({ ...snapshot, entries: { ...snapshot.entries, [key]: {
      data: entry?.data ?? null, fetchedAt: entry?.fetchedAt ?? null, error: null, isFetching: true,
    } } });
    return request;
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    setAccount, invalidate, refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type AdminCalendarCache<T> = ReturnType<typeof createAdminCalendarCache<T>>;
