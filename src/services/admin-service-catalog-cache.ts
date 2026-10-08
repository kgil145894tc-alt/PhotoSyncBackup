import { type CatalogChange } from '@/services/catalog-events';
import { type AdminServiceCatalog } from '@/types/services';

const FRESHNESS_MS = 60_000;
type CatalogSnapshot = {
  accountId: string | null;
  isSessionReady: boolean;
  data: AdminServiceCatalog | null;
  error: string | null;
  isFetching: boolean;
};

export function createAdminServiceCatalogCache(
  load: (isSessionCurrent: () => boolean) => Promise<AdminServiceCatalog>,
  now: () => number = Date.now,
) {
  const initialSnapshot: CatalogSnapshot = {
    accountId: null, isSessionReady: false, data: null, error: null, isFetching: false,
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
    generation += 1;
    revision += 1;
    fetchedAt = null;
    pending = null;
    publish({ ...initialSnapshot, accountId, isSessionReady: true });
  }

  function invalidate(change?: CatalogChange) {
    revision += 1;
    fetchedAt = null;
    if (!change || !snapshot.data) return;
    const packages = snapshot.data.packages.filter((item) => !change.isArchived ||
      (change.entity === 'service' ? item.serviceId !== change.id : item.id !== change.id))
      .map((item) => change.entity === 'package' && item.id === change.id
        ? { ...item, isActive: change.isActive } : item);
    const packageCounts = new Map<string, number>();
    for (const item of packages) {
      if (item.isActive) packageCounts.set(item.serviceId, (packageCounts.get(item.serviceId) ?? 0) + 1);
    }
    const services = snapshot.data.services.filter((item) => !change.isArchived || change.entity !== 'service' || item.id !== change.id)
      .map((item) => ({
        ...item,
        isActive: change.entity === 'service' && item.id === change.id ? change.isActive : item.isActive,
        packageCount: packageCounts.get(item.id) ?? 0,
      }));
    // Keep disabled records editable; remove only confirmed archived records.
    // A failed reconciliation cannot bring a deleted card back.
    publish({ ...snapshot, data: { services, packages } });
  }

  function refresh(force = false): Promise<void> {
    if (!snapshot.isSessionReady || !snapshot.accountId) return Promise.resolve();
    if (pending) return pending;
    if (!force && fetchedAt !== null && now() - fetchedAt < FRESHNESS_MS) return Promise.resolve();
    const requestGeneration = generation;
    pending = Promise.resolve().then(async () => {
      if (requestGeneration !== generation) return;
      try {
        while (requestGeneration === generation) {
          const requestRevision = revision;
          try {
            const data = await load(() => requestGeneration === generation);
            if (requestGeneration !== generation) return;
            if (requestRevision !== revision) continue;
            fetchedAt = now();
            publish({ ...snapshot, data, error: null });
            break;
          } catch {
            if (requestGeneration !== generation) return;
            if (requestRevision !== revision) continue;
            fetchedAt = null;
            publish({ ...snapshot, error: snapshot.data
              ? 'Could not update services. Showing previously loaded data. Pull down to try again.'
              : 'Could not load services. Pull down to try again.' });
            break;
          }
        }
      } finally {
        if (requestGeneration === generation) {
          pending = null;
          publish({ ...snapshot, isFetching: false });
        }
      }
    });
    publish({ ...snapshot, error: null, isFetching: true });
    return pending;
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
