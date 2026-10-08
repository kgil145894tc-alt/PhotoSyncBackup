import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { EMPTY_BOOKING_PAGE_ENTRY, type createBookingPagesCache } from '@/services/booking-pages-cache';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { subscribeToNotificationsChanged } from '@/services/notification-events';
import { bookingQueryKey, type BookingQuery } from '@/types/booking-pages';
import { type AdminBookingRequest } from '@/types/admin-bookings';

export function useBookingPage(store: ReturnType<typeof createBookingPagesCache>, options: BookingQuery = {}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const key = bookingQueryKey(options);
  const query = useMemo<BookingQuery>(() => {
    const [status, dateFilter, search, bookingId, dashboard] = JSON.parse(key);
    return { status, dateFilter, search, bookingId: bookingId || undefined, dashboard };
  }, [key]);
  const entry = snapshot.entries[key] ?? EMPTY_BOOKING_PAGE_ENTRY;
  const isCurrentSession = useCallback(() => store.getSnapshot().accountVersion === snapshot.accountVersion, [store, snapshot.accountVersion]);
  useFocusEffect(useCallback(() => {
    if (!snapshot.isSessionReady || !snapshot.accountId) return;
    const refresh = () => { if (isCurrentSession()) void store.refresh(query); };
    refresh();
    const unsubscribeBookings = subscribeToBookingsChanged(refresh);
    const unsubscribeNotifications = subscribeToNotificationsChanged(refresh);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { unsubscribeBookings(); unsubscribeNotifications(); subscription.remove(); };
  }, [isCurrentSession, query, snapshot.accountId, snapshot.isSessionReady, store]));
  const refresh = useCallback(() => isCurrentSession() ? store.refresh(query, { force: true }) : Promise.resolve(), [isCurrentSession, query, store]);
  const loadMore = useCallback(() => isCurrentSession() ? store.refresh(query, { loadMore: true }) : Promise.resolve(), [isCurrentSession, query, store]);
  const cancel = useCallback(async (id: string) => {
    if (!isCurrentSession()) return null;
    const result = await store.cancel(id);
    if (isCurrentSession()) void store.refresh(query, { force: true });
    return result;
  }, [isCurrentSession, query, store]);
  return { accountId: snapshot.accountId, accountVersion: snapshot.accountVersion,
    bookings: entry.data?.items ?? EMPTY_BOOKINGS, counts: entry.data?.counts ?? null,
    hasMore: entry.data?.hasMore ?? false, hasLoaded: entry.data !== null, isFresh: store.isFresh(entry),
    isLoading: !snapshot.isSessionReady || (Boolean(snapshot.accountId) && entry.data === null && !entry.error),
    isRefreshing: entry.isFetching && !entry.isLoadingMore, isLoadingMore: entry.isLoadingMore,
    cancellingId: snapshot.cancellingId, error: snapshot.isSessionReady && !snapshot.accountId
      ? 'Please sign in again to see bookings.' : entry.error,
    refresh, loadMore, cancel, isCurrentSession };
}

const EMPTY_BOOKINGS: AdminBookingRequest[] = [];
