import { type ProfileFormValues, type ProfileSaveResult, type ProfileSessionOptions, type UserProfile } from '@/services/profile';

const FRESHNESS_MS = 60_000;
type ClientProfileSnapshot = {
  accountId: string | null;
  sessionKey: number;
  isSessionReady: boolean;
  data: UserProfile | null;
  error: string | null;
  isFetching: boolean;
  isSaving: boolean;
};
type ClientProfileApi = {
  load: (options: ProfileSessionOptions) => Promise<UserProfile | null>;
  persist: (values: ProfileFormValues, options: ProfileSessionOptions) => Promise<ProfileSaveResult>;
};

export function createClientProfileCache(api: ClientProfileApi, now: () => number = Date.now) {
  const initialSnapshot: ClientProfileSnapshot = {
    accountId: null, sessionKey: 0, isSessionReady: false,
    data: null, error: null, isFetching: false, isSaving: false,
  };
  let snapshot = initialSnapshot;
  let generation = 0;
  let revision = 0;
  let fetchedAt: number | null = null;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function publish(next: ClientProfileSnapshot) {
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

  function refresh(force = false): Promise<void> {
    if (!snapshot.isSessionReady || !snapshot.accountId || snapshot.isSaving) return Promise.resolve();
    if (pending) return pending;
    if (!force && fetchedAt !== null && now() - fetchedAt < FRESHNESS_MS) return Promise.resolve();
    const requestGeneration = generation;
    const requestRevision = revision;
    const options = { expectedAccountId: snapshot.accountId, isSessionCurrent: () => requestGeneration === generation };
    pending = Promise.resolve().then(async () => {
      if (!options.isSessionCurrent()) return;
      try {
        if (snapshot.isSaving) return;
        const data = await api.load(options);
        if (!options.isSessionCurrent() || requestRevision !== revision) return;
        if (!data) throw new Error('No profile was returned.');
        fetchedAt = now();
        publish({ ...snapshot, data, error: null });
      } catch {
        if (!options.isSessionCurrent() || requestRevision !== revision) return;
        fetchedAt = null;
        publish({ ...snapshot, error: snapshot.data
          ? 'Could not update your profile. Showing previously loaded details. Pull down to try again.'
          : 'Could not load your profile. Pull down to try again.' });
      } finally {
        if (options.isSessionCurrent()) {
          pending = null;
          publish({ ...snapshot, isFetching: false });
        }
      }
    });
    publish({ ...snapshot, error: null, isFetching: true });
    return pending;
  }

  async function save(values: ProfileFormValues): Promise<ProfileSaveResult> {
    if (!snapshot.accountId || !snapshot.data) {
      return { success: false, message: 'Load your profile before saving.' };
    }
    if (snapshot.isSaving) return { success: false, message: 'Your profile is already being saved.' };
    const requestGeneration = generation;
    const options = { expectedAccountId: snapshot.accountId, isSessionCurrent: () => requestGeneration === generation };
    const sessionChanged: ProfileSaveResult = { success: false, message: 'Your session changed. Please sign in again before saving.' };
    // Reads already in flight cannot overwrite a write or its confirmed row.
    revision++;
    publish({ ...snapshot, isSaving: true });
    try {
      await Promise.resolve();
      if (!options.isSessionCurrent()) return sessionChanged;
      const result = await api.persist(values, options);
      if (!options.isSessionCurrent()) return sessionChanged;
      if (result.profile) {
        fetchedAt = now();
        publish({ ...snapshot, data: result.profile, error: null });
      }
      return result;
    } catch {
      return options.isSessionCurrent()
        ? { success: false, message: 'Could not save your profile. Please try again.' } : sessionChanged;
    } finally {
      if (options.isSessionCurrent()) publish({ ...snapshot, isSaving: false });
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
