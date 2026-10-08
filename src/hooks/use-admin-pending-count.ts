import { useSyncExternalStore } from 'react';

import { adminBookingPagesStore } from '@/services/booking-pages-store';
import { type BookingPageEntry } from '@/services/booking-pages-cache';

// Booking-page counts describe the whole studio, independently of list filters.
// Reuse the newest server count. This subscription performs no network reads.
export function selectAdminPendingCount(entries: Record<string, BookingPageEntry>) {
  let count: number | null = null;
  let latest = -Infinity;
  for (const entry of Object.values(entries)) {
    if (!entry.data?.counts) continue;
    const fetchedAt = entry.fetchedAt ?? -1;
    if (fetchedAt >= latest) {
      latest = fetchedAt;
      count = entry.data.counts.pending;
    }
  }
  return count;
}

export function useAdminPendingCount() {
  const snapshot = useSyncExternalStore(adminBookingPagesStore.subscribe,
    adminBookingPagesStore.getSnapshot, adminBookingPagesStore.getServerSnapshot);
  return snapshot.accountId ? selectAdminPendingCount(snapshot.entries) : null;
}
