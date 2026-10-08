export type SessionReadOptions = {
  force?: boolean;
  expectedAccountId?: string;
  isSessionCurrent?: () => boolean;
};

// A single shared value, never a cached failure or display fallback. Forced
// validation starts a new read even if an earlier browsing read is pending.
export function createSessionReadCache<T>(
  load: (accountId: string | null, isCurrent: () => boolean) => Promise<T>,
  { freshnessMs, requireAccount = true, now = Date.now, cacheKey = () => '' }: {
    freshnessMs: number; requireAccount?: boolean; now?: () => number; cacheKey?: () => string;
  },
) {
  let accountId: string | null = null;
  let ready = false;
  let generation = 0;
  let revision = 0;
  let sequence = 0;
  let acceptedSequence = 0;
  let value: { data: T; fetchedAt: number } | null = null;
  let partition = cacheKey();
  let pending: Promise<T> | null = null;
  const sessionChanged = () => new Error('Your session changed. Please sign in again.');
  function setAccount(nextAccountId: string | null) {
    if (ready && accountId === nextAccountId) return;
    ready = true; accountId = nextAccountId; generation++; revision++;
    value = null; pending = null; partition = cacheKey();
  }
  function invalidate() { revision++; value = null; }
  function isFresh() { return value !== null && now() >= value.fetchedAt && now() - value.fetchedAt < freshnessMs; }
  function accept(data: T) {
    if (!ready) return;
    revision++; acceptedSequence = ++sequence;
    value = { data, fetchedAt: now() };
  }
  function captureSession() {
    const epoch = generation;
    return () => ready && generation === epoch;
  }
  function read({ force = false, expectedAccountId, isSessionCurrent }: SessionReadOptions = {}): Promise<T> {
    if (!ready || (requireAccount && !accountId) || (expectedAccountId && expectedAccountId !== accountId)
      || isSessionCurrent?.() === false) return Promise.reject(sessionChanged());
    if (partition !== cacheKey()) { partition = cacheKey(); invalidate(); }
    const owner = accountId, epoch = generation;
    const isCurrent = () => generation === epoch && accountId === owner;
    const checkCaller = (data: T) => {
      if (!isCurrent() || isSessionCurrent?.() === false) throw sessionChanged();
      return data;
    };
    if (!force && isFresh()) return Promise.resolve(value!.data).then(checkCaller);
    if (!force && pending) return pending.then(checkCaller);
    const task = Promise.resolve().then(async () => {
      // Shared work belongs to the login, while each caller owns its result.
      if (!isCurrent()) throw sessionChanged();
      while (true) {
        const requestRevision = revision;
        const requestSequence = ++sequence;
        const startedAt = now();
        let data: T;
        try { data = await load(owner, isCurrent); }
        catch (reason) {
          if (!isCurrent()) throw sessionChanged();
          if (requestRevision !== revision) {
            if (isFresh()) return value!.data;
            continue;
          }
          throw reason;
        }
        if (!isCurrent()) throw sessionChanged();
        if (requestRevision !== revision) {
          if (isFresh()) return value!.data;
          continue;
        }
        if (requestSequence >= acceptedSequence) {
          acceptedSequence = requestSequence;
          value = { data, fetchedAt: startedAt };
        } else if (isFresh()) return value!.data;
        return data;
      }
    }).finally(() => { if (pending === task) pending = null; });
    if (!force) pending = task;
    return task.then(checkCaller);
  }
  return { setAccount, invalidate, accept, read, captureSession };
}
