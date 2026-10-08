import { type CatalogChange } from '@/services/catalog-events';
import { type ClientServiceCatalog } from '@/types/services';

const FRESHNESS_MS = 60_000;
type CatalogSnapshot = {
  accountId: string | null;
  sessionKey: number;
  isSessionReady: boolean;
  data: ClientServiceCatalog | null;
  error: string | null;
  isFetching: boolean;
};

export function createClientServiceCatalogCache(
  load: (isSessionCurrent: () => boolean) => Promise<ClientServiceCatalog>, now: () => number = Date.now,
) {
  const initialSnapshot: CatalogSnapshot = {
    accountId: null, sessionKey: 0, isSessionReady: false, data: null, error: null, isFetching: false,
  };
  let snapshot = initialSnapshot;
  let generation = 0;
  let revision = 0;
  let fetchedAt: number | null = null;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function publish(next: CatalogSnapshot) {
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
    revision++;
    fetchedAt = null;
    if (!snapshot.data || !change || change.isActive) return;
    // Remove only entities the server confirmed were deactivated/deleted.
    const services = snapshot.data.services.filter((item) => change.entity !== 'service' || item.id !== change.id);
    const serviceIds = new Set(services.map((item) => item.id));
    const packages = snapshot.data.packages.filter((item) => serviceIds.has(item.serviceId)
      && (change.entity !== 'package' || item.id !== change.id));
    const packageCounts = new Map<string, number>();
    for (const item of packages) packageCounts.set(item.serviceId, (packageCounts.get(item.serviceId) ?? 0) + 1);
    publish({ ...snapshot, data: { services: services.map((item) => ({ ...item,
      packageCount: packageCounts.get(item.id) ?? 0 })), packages } });
  }

  function refresh(force = false): Promise<void> {
    if (!snapshot.isSessionReady || !snapshot.accountId) return Promise.resolve();
    if (pending) return pending;
    if (!force && fetchedAt !== null && now() - fetchedAt < FRESHNESS_MS) return Promise.resolve();
    const requestGeneration = generation;
    const isCurrent = () => requestGeneration === generation;
    pending = Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      try {
        while (isCurrent()) {
          const requestRevision = revision;
          try {
            const data = await load(isCurrent);
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
              ? 'Could not update services and packages. Showing previously loaded data. Pull down to try again.'
              : 'Could not load services and packages. Pull down to try again.' });
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
    publish({ ...snapshot, error: null, isFetching: true });
    return pending;
  }

  function getPackage(id: string, serviceId: string) {
    if (!snapshot.accountId || !snapshot.data?.services.some((item) => item.id === serviceId && item.isActive)) return null;
    return snapshot.data.packages.find((item) => item.id === id && item.serviceId === serviceId && item.isActive) ?? null;
  }

  return {
    getSnapshot: () => snapshot, getServerSnapshot: () => initialSnapshot,
    setAccount, invalidate, refresh, getPackage,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
