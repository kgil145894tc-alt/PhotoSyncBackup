import { type StudioSettings, type StudioSettingsSaveResult } from '@/services/studio-settings';

const FRESHNESS_MS = 60_000;
type StudioSettingsSnapshot = {
  accountId: string | null;
  sessionKey: number;
  isSessionReady: boolean;
  data: StudioSettings | null;
  error: string | null;
  isFetching: boolean;
  isSaving: boolean;
};

export function createAdminStudioSettingsCache(
  load: () => Promise<StudioSettings>,
  persist: (values: StudioSettings) => Promise<StudioSettingsSaveResult>,
  now: () => number = Date.now,
) {
  const initialSnapshot: StudioSettingsSnapshot = {
    accountId: null, sessionKey: 0, isSessionReady: false,
    data: null, error: null, isFetching: false, isSaving: false,
  };
  let snapshot = initialSnapshot;
  let generation = 0;
  let revision = 0;
  let fetchedAt: number | null = null;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function publish(next: StudioSettingsSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function setAccount(accountId: string | null) {
    if (snapshot.isSessionReady && snapshot.accountId === accountId) return;
    generation += 1;
    revision += 1;
    fetchedAt = null;
    pending = null;
    publish({ ...initialSnapshot, accountId, sessionKey: generation, isSessionReady: true });
  }

  function refresh(force = false): Promise<void> {
    if (!snapshot.isSessionReady || !snapshot.accountId) return Promise.resolve();
    if (pending) return pending;
    if (!force && fetchedAt !== null && now() - fetchedAt < FRESHNESS_MS) return Promise.resolve();
    const requestGeneration = generation;
    pending = Promise.resolve().then(async () => {
      if (requestGeneration !== generation) return;
      const requestRevision = revision;
      try {
        const data = await load();
        if (requestGeneration !== generation || requestRevision !== revision) return;
        fetchedAt = now();
        publish({ ...snapshot, data, error: null });
      } catch {
        if (requestGeneration !== generation || requestRevision !== revision) return;
        fetchedAt = null;
        publish({ ...snapshot, error: snapshot.data
          ? 'Could not update studio information. Showing previously loaded data. Pull down to try again.'
          : 'Could not load studio information. Pull down to try again.' });
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

  async function save(values: StudioSettings): Promise<StudioSettingsSaveResult> {
    if (!snapshot.accountId || !snapshot.data) {
      return { success: false, message: 'Load your studio information before saving.' };
    }
    if (snapshot.isSaving) {
      return { success: false, message: 'Studio information is already being saved.' };
    }
    const requestGeneration = generation;
    const sessionChanged: StudioSettingsSaveResult = {
      success: false, message: 'Your session changed. Please sign in again before saving.',
    };
    publish({ ...snapshot, isSaving: true });
    try {
      // Do not start a queued write after logout or an account change.
      await Promise.resolve();
      if (requestGeneration !== generation) return sessionChanged;
      const result = await persist(values);
      if (requestGeneration !== generation) return sessionChanged;
      if (result.success) {
        // The returned database row is authoritative. Older reads must never
        // replace it, even if they finish after this screen has closed.
        revision += 1;
        fetchedAt = now();
        publish({ ...snapshot, data: result.settings, error: null });
      }
      return result;
    } catch {
      return requestGeneration !== generation ? sessionChanged : {
        success: false, message: 'Could not save studio information. Please try again.',
      };
    } finally {
      if (requestGeneration === generation) publish({ ...snapshot, isSaving: false });
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    setAccount, refresh, save,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
