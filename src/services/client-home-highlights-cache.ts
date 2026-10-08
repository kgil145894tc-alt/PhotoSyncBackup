import { type CatalogChange } from '@/services/catalog-events';
import { type ServiceHighlight } from '@/types/services';

const FRESHNESS_MS = 60_000;
type HighlightsSnapshot = {
  accountId: string | null;
  sessionKey: number;
  isSessionReady: boolean;
  data: ServiceHighlight[] | null;
  error: string | null;
  isFetching: boolean;
};

export function createClientHomeHighlightsCache(
  load: () => Promise<ServiceHighlight[]>, now: () => number = Date.now,
) {
  const initialSnapshot: HighlightsSnapshot = {
    accountId: null, sessionKey: 0, isSessionReady: false, data: null, error: null, isFetching: false,
  };
  let snapshot = initialSnapshot;
  let generation = 0;
  let revision = 0;
  let fetchedAt: number | null = null;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function publish(next: HighlightsSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function setAccount(accountId: string | null) {
    if (snapshot.isSessionReady && snapshot.accountId === accountId) return;
    generation++;
    revision++;
    fetchedAt = null;
    pending = null;
    publish({ ...initialSnapshot, accountId, sessionKey: generation, isSessionReady: true });
  }

  function invalidate(change?: CatalogChange) {
    if (change?.entity === 'package') return;
    revision++;
    fetchedAt = null;
    if (snapshot.data && change && !change.isActive) {
      // A confirmed service removal must disappear even if the next read fails.
      publish({ ...snapshot, data: snapshot.data.filter((item) => item.id !== change.id) });
    }
  }

  function refresh(force = false): Promise<void> {
    if (!snapshot.isSessionReady || !snapshot.accountId) return Promise.resolve();
    if (pending) return pending;
    if (!force && fetchedAt !== null && now() - fetchedAt < FRESHNESS_MS) return Promise.resolve();
    const requestGeneration = generation;
    const isCurrent = () => requestGeneration === generation;
    const request = Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      try {
        while (isCurrent()) {
          const requestRevision = revision;
          try {
            const data = await load();
            if (!isCurrent()) return;
            if (requestRevision !== revision) continue;
            fetchedAt = now();
            publish({ ...snapshot, data, error: null });
            return;
          } catch {
            if (!isCurrent()) return;
            if (requestRevision !== revision) continue;
            fetchedAt = null;
            publish({ ...snapshot, error: snapshot.data
              ? 'Could not update highlights. Showing previously loaded photos. Try again.'
              : 'Could not load highlights. Please try again.' });
            return;
          }
        }
      } finally {
        if (isCurrent()) {
          pending = null;
          publish({ ...snapshot, isFetching: false });
        }
      }
    });
    // Reserve the request before notifying subscribers; repeated focus/retry events share it.
    pending = request;
    publish({ ...snapshot, error: null, isFetching: true });
    return request;
  }

  return {
    getSnapshot: () => snapshot, getServerSnapshot: () => initialSnapshot,
    setAccount, invalidate, refresh,
    getHighlight: (id: string) => snapshot.accountId
      ? snapshot.data?.find((item) => item.id === id) ?? null : null,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
