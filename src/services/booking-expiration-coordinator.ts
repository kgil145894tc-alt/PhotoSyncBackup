export type BookingExpirationResult = {
  success: boolean;
  message?: string;
  expiredCount?: number;
};

export type BookingExpirationOptions = {
  force?: boolean;
  expectedAccountId?: string;
  isSessionCurrent?: () => boolean;
};

const FRESHNESS_MS = 30_000;
const sessionChanged = (): BookingExpirationResult => ({ success: false, message: 'Your booking session changed. Please sign in again.' });

export function createBookingExpirationCoordinator(
  load: (accountId: string, isCurrent: () => boolean) => Promise<number>,
  now: () => number = Date.now,
  onExpired: () => void = () => {},
) {
  let accountId: string | null = null;
  let generation = 0;
  let revision = 0;
  let sequence = 0;
  let lastSuccessSequence = 0;
  let lastSuccessAt: number | null = null;
  let pending: Promise<BookingExpirationResult> | null = null;

  function setAccount(nextAccountId: string | null) {
    if (accountId === nextAccountId) return;
    accountId = nextAccountId;
    generation += 1;
    revision += 1;
    lastSuccessAt = null;
    pending = null;
  }

  function invalidate() {
    revision += 1;
    lastSuccessAt = null;
  }

  function run({ force = false, expectedAccountId, isSessionCurrent }: BookingExpirationOptions = {}): Promise<BookingExpirationResult> {
    if (!accountId || (expectedAccountId && expectedAccountId !== accountId) || isSessionCurrent?.() === false) {
      return Promise.resolve(sessionChanged());
    }
    const owner = accountId;
    const requestGeneration = generation;
    const isCurrent = () => accountId === owner && generation === requestGeneration;
    const accept = (result: BookingExpirationResult) => isCurrent() && isSessionCurrent?.() !== false ? result : sessionChanged();
    const startedAt = now();
    if (!force && lastSuccessAt !== null && startedAt >= lastSuccessAt && startedAt - lastSuccessAt < FRESHNESS_MS) {
      return Promise.resolve({ success: true, expiredCount: 0 }).then(accept);
    }
    if (!force && pending) return pending.then(accept);
    const requestRevision = revision;
    const requestSequence = ++sequence;
    const task = Promise.resolve().then(async (): Promise<BookingExpirationResult> => {
      if (!isCurrent()) return sessionChanged();
      try {
        const expiredCount = await load(owner, isCurrent);
        if (!isCurrent()) return sessionChanged();
        if (!Number.isInteger(expiredCount) || expiredCount < 0) throw new Error('Couldn’t verify booking status. Please try again.');
        // Use the start time: a slow response must not grant another 30 seconds.
        if (requestRevision === revision && requestSequence >= lastSuccessSequence) {
          lastSuccessSequence = requestSequence;
          lastSuccessAt = startedAt;
        }
        if (expiredCount > 0) onExpired();
        return { success: true, expiredCount };
      } catch (error) {
        if (!isCurrent()) return sessionChanged();
        return { success: false, message: error instanceof Error ? error.message : 'Couldn’t verify booking status. Please try again.' };
      }
    }).finally(() => { if (pending === task) pending = null; });
    // Booking actions always start their own server check. They cannot reuse a
    // recent result or a read that started before the action was requested.
    if (!force) pending = task;
    return task.then(accept);
  }

  return { setAccount, invalidate, run };
}
