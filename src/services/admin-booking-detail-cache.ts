import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

const FRESHNESS_MS = 30_000;

type EditableStatus = Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'>;
type UpdateResult = { success: boolean; message?: string; booking?: AdminBookingRequest | null };
type BookingEntry = {
  data: AdminBookingRequest | null;
  fetchedAt: number | null;
  hasLoaded: boolean;
  error: string | null;
  isFetching: boolean;
  isUpdating: boolean;
};
type BookingDetailApi = {
  load: (id: string) => Promise<AdminBookingRequest | null>;
  update: (id: string, status: EditableStatus, reason?: string | null) => Promise<UpdateResult>;
};

type DetailsSnapshot = {
  accountId: string | null;
  accountVersion: number;
  details: Record<string, BookingEntry>;
  isSessionReady: boolean;
};

export function selectAdminBooking(snapshot: DetailsSnapshot, id: string): BookingEntry {
  return snapshot.details[id] ?? {
    data: null, fetchedAt: null, hasLoaded: false,
    error: null, isFetching: false, isUpdating: false,
  };
}

// Memory only: a session change discards both data and pending request results.
export function createAdminBookingDetailCache(
  bookingApi: BookingDetailApi,
  now: () => number = Date.now,
  maxEntries = 24,
) {
  const initialSnapshot: DetailsSnapshot = {
    accountId: null, accountVersion: 0, details: {}, isSessionReady: false,
  };
  let snapshot = initialSnapshot;
  let generation = 0;
  let revision = 0;
  let sequence = 0;
  let accessSequence = 0;
  const lastAccess = new Map<string, number>();
  const detailSequences = new Map<string, number>();
  const detailEpochs = new Map<string, number>();
  const pendingDetails = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();

  function publish(next: DetailsSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function setAccount(accountId: string | null) {
    if (snapshot.isSessionReady && snapshot.accountId === accountId) return;
    generation += 1;
    revision += 1;
    pendingDetails.clear();
    detailEpochs.clear();
    detailSequences.clear();
    lastAccess.clear();
    publish({ ...initialSnapshot, accountId, accountVersion: generation, isSessionReady: true });
  }

  function invalidate() {
    revision += 1;
    const details = { ...snapshot.details };
    for (const id of Object.keys(details)) details[id] = { ...details[id], fetchedAt: null };
    publish({ ...snapshot, details });
  }

  function updateDetail(id: string, changes: Partial<BookingEntry>) {
    const details = { ...snapshot.details, [id]: { ...selectAdminBooking(snapshot, id), ...changes } };
    trimDetails(details, id);
    publish({ ...snapshot, details });
  }

  function trimDetails(details: Record<string, BookingEntry>, keepId: string) {
    lastAccess.set(keepId, ++accessSequence);
    const candidates = Object.keys(details).filter((id) => id !== keepId && !details[id].isFetching && !details[id].isUpdating)
      .sort((a, b) => (lastAccess.get(a) ?? 0) - (lastAccess.get(b) ?? 0));
    let size = Object.keys(details).length;
    for (const id of candidates) {
      if (size <= maxEntries) break;
      delete details[id]; lastAccess.delete(id); detailSequences.delete(id); detailEpochs.delete(id); size--;
    }
  }

  function acceptBooking(id: string, data: AdminBookingRequest | null, requestSequence: number, timestamp: number | null) {
    detailSequences.set(id, requestSequence);
    const details = { ...snapshot.details, [id]: {
      ...selectAdminBooking(snapshot, id), data, fetchedAt: timestamp, hasLoaded: true, error: null,
    } };
    trimDetails(details, id);
    publish({ ...snapshot, details });
  }

  function refreshBooking(id: string, force = false): Promise<void> {
    if (!id || !snapshot.isSessionReady || !snapshot.accountId) return Promise.resolve();
    const entry = selectAdminBooking(snapshot, id);
    lastAccess.set(id, ++accessSequence);
    if (entry.isUpdating) return Promise.resolve();
    const existing = pendingDetails.get(id);
    if (existing) return existing;
    if (!force && entry.fetchedAt !== null && now() - entry.fetchedAt < FRESHNESS_MS) return Promise.resolve();
    const requestGeneration = generation;
    const epoch = detailEpochs.get(id) ?? ++sequence;
    detailEpochs.set(id, epoch);
    const isCurrent = () => requestGeneration === generation && epoch === detailEpochs.get(id);
    const task = Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      let requestSequence = 0;
      try {
        while (true) {
          const requestRevision = revision;
          requestSequence = ++sequence;
          let data: AdminBookingRequest | null;
          try {
            data = await bookingApi.load(id);
          } catch (reason) {
            if (isCurrent() && requestRevision !== revision) continue;
            throw reason;
          }
          if (!isCurrent()) return;
          if (requestRevision !== revision) continue;
          if (data && data.id !== id) throw new Error('The booking response did not match the request.');
          if (requestSequence >= (detailSequences.get(id) ?? 0)) {
            acceptBooking(id, data, requestSequence, now());
          }
          return;
        }
      } catch {
        if (isCurrent() && requestSequence >= (detailSequences.get(id) ?? 0)) updateDetail(id, { error: selectAdminBooking(snapshot, id).data
          ? 'Could not update booking details. Showing previously loaded data.'
          : 'Could not load booking details. Pull down to try again.' });
      } finally {
        if (isCurrent()) {
          pendingDetails.delete(id);
          updateDetail(id, { isFetching: false });
        }
      }
    });
    pendingDetails.set(id, task);
    updateDetail(id, { error: null, isFetching: true });
    return task;
  }

  async function updateBookingStatus(id: string, status: EditableStatus, reason?: string | null): Promise<UpdateResult | null> {
    if (!snapshot.accountId || selectAdminBooking(snapshot, id).isUpdating) return null;
    if (status === 'rejected' && !reason?.trim()) return { success: false, message: 'Please enter a reason before rejecting this request.' };
    const writeGeneration = generation;
    const previous = selectAdminBooking(snapshot, id).data;
    detailEpochs.set(id, ++sequence);
    pendingDetails.delete(id);
    invalidate();
    updateDetail(id, { isUpdating: true, isFetching: false });
    let result: UpdateResult;
    try {
      result = await Promise.resolve().then(() => writeGeneration === generation ? bookingApi.update(id, status, reason) : null)
        ?? { success: false };
      if (writeGeneration !== generation) return null;
      if (result.success) {
        // Only server-accepted writes patch the shared views. Reuse the row
        // already read by the update service, rather than fetching it twice.
        invalidate();
        const data = result.booking ?? (previous ? { ...previous, status,
          rejectionReason: status === 'rejected' ? reason!.trim() : null } : null);
        if (data) acceptBooking(id, data, ++sequence, result.booking ? now() : null);
      }
    } catch {
      if (writeGeneration !== generation) return null;
      result = { success: false, message: 'Could not update this booking. Please check its current status and try again.' };
    } finally {
      if (writeGeneration === generation) updateDetail(id, { isUpdating: false });
    }
    if (!result.success || !result.booking) void refreshBooking(id, true);
    return result;
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    invalidate,
    refreshBooking,
    updateBookingStatus,
    setAccount,
    seedBooking(booking: AdminBookingRequest, timestamp: number) {
      const entry = selectAdminBooking(snapshot, booking.id);
      if (!snapshot.accountId || entry.isUpdating || (entry.fetchedAt !== null && entry.fetchedAt >= timestamp)) return;
      acceptBooking(booking.id, booking, ++sequence, timestamp);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
