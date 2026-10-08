import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { subscribeToBookingsChanged } from '@/services/booking-events';
import { subscribeToNotificationsChanged } from '@/services/notification-events';
import { notificationInboxStore as store } from '@/services/notification-inbox-store';

export function useNotificationUnreadCount() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  useFocusEffect(useCallback(() => {
    if (!snapshot.isSessionReady || !snapshot.accountId || snapshot.isMarking) return;
    const refresh = () => { void store.refreshUnreadCount(); };
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
  }, [snapshot.accountId, snapshot.isSessionReady, snapshot.isMarking]));

  const refresh = useCallback(() => store.refreshUnreadCount({ force: true }), []);

  return {
    unreadCount: snapshot.unreadCount,
    error: snapshot.unreadCountError,
    isRefreshing: snapshot.isUnreadCountFetching,
    refresh,
  };
}
