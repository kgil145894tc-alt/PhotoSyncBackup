import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { selectAdminBooking } from '@/services/admin-booking-detail-cache';
import { adminBookingDetailStore as store } from '@/services/admin-booking-detail-store';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { subscribeToNotificationsChanged } from '@/services/notification-events';
import { type BookingStatus } from '@/types/admin-bookings';
import { adminBookingPagesStore } from '@/services/booking-pages-store';

export function useAdminBookingDetail(id: string) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const entry = selectAdminBooking(snapshot, id);

  useFocusEffect(useCallback(() => {
    if (!id || !snapshot.isSessionReady || !snapshot.accountId) return;
    const refresh = () => {
      if (store.getSnapshot().accountVersion !== snapshot.accountVersion) return;
      const pages = adminBookingPagesStore.getSnapshot();
      if (pages.accountId === snapshot.accountId) {
        for (const page of Object.values(pages.entries)) {
          const booking = page.data?.items.find((item) => item.id === id);
          if (booking && page.fetchedAt !== null && adminBookingPagesStore.isFresh(page)) {
            store.seedBooking(booking, page.fetchedAt);
            break;
          }
        }
      }
      void store.refreshBooking(id);
    };
    refresh();
    const unsubscribeBookings = subscribeToBookingsChanged(refresh);
    const unsubscribeNotifications = subscribeToNotificationsChanged(refresh);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      unsubscribeBookings();
      unsubscribeNotifications();
      subscription.remove();
    };
  }, [id, snapshot.accountId, snapshot.accountVersion, snapshot.isSessionReady]));

  const refresh = useCallback(() => store.getSnapshot().accountVersion === snapshot.accountVersion
    ? store.refreshBooking(id, true) : Promise.resolve(), [id, snapshot.accountVersion]);
  const updateStatus = useCallback((status: Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'>, reason?: string | null) =>
    store.getSnapshot().accountVersion === snapshot.accountVersion
      ? store.updateBookingStatus(id, status, reason) : Promise.resolve(null), [id, snapshot.accountVersion]);

  return {
    accountId: snapshot.accountId,
    accountVersion: snapshot.accountVersion,
    booking: entry.data,
    error: !id ? 'This booking link is missing a booking ID.' : snapshot.isSessionReady && !snapshot.accountId
      ? 'Please sign in again to see this booking.' : entry.error,
    isLoading: Boolean(id) && (!snapshot.isSessionReady || (Boolean(snapshot.accountId) && !entry.hasLoaded && !entry.error)),
    isRefreshing: entry.isFetching,
    isUpdating: entry.isUpdating,
    refresh,
    updateStatus,
  };
}
