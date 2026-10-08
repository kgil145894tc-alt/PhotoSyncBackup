import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { showAppAlert } from '@/components/app-alert';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { subscribeToNotificationsChanged } from '@/services/notification-events';
import { notificationInboxStore as store } from '@/services/notification-inbox-store';
import { type NotificationFilter, type PhotoSyncNotification } from '@/types/notifications';

export { notificationInboxApi } from '@/services/notification-inbox-store';

export function useNotificationInbox() {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const mounted = useRef(true);
  const focused = useRef(false);
  const focusedFilter = useRef(filter);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    focusedFilter.current = filter;
    if (!snapshot.isSessionReady || !snapshot.accountId) {
      return () => { focused.current = false; };
    }
    const refresh = () => { void store.refresh(filter); };
    refresh();
    const unsubscribeBookings = subscribeToBookingsChanged(refresh);
    const unsubscribeNotifications = subscribeToNotificationsChanged(refresh);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      focused.current = false;
      unsubscribeBookings();
      unsubscribeNotifications();
      subscription.remove();
    };
  }, [filter, snapshot.accountId, snapshot.isSessionReady]));

  const markRead = useCallback((notification?: PhotoSyncNotification) => {
    void store.markRead(notification).then((message) => {
      if (message && mounted.current) showAppAlert('Notification not updated', message);
      // Refill the active filter after a write; closed screens retain the
      // patched cache and refresh on their next visit.
      if (mounted.current && focused.current) void store.refresh(focusedFilter.current);
    });
  }, []);

  const inbox = snapshot.entries[filter];
  const error = snapshot.isSessionReady && !snapshot.accountId
    ? 'Please sign in again to see your notifications.' : inbox.error;
  return {
    filter, setFilter, error,
    unreadCount: snapshot.unreadCount,
    isMarking: snapshot.isMarking,
    items: inbox.data?.items ?? EMPTY_ITEMS,
    hasMore: inbox.data?.hasMore ?? false,
    isLoading: !snapshot.isSessionReady || (!inbox.data && !error),
    isRefreshing: inbox.isFetching,
    refresh: () => { void store.refresh(filter, { force: true }); },
    loadMore: () => { void store.refresh(filter, { loadMore: true }); },
    markAll: () => markRead(),
    markRead: (notification: PhotoSyncNotification) => markRead(notification),
  };
}

const EMPTY_ITEMS: PhotoSyncNotification[] = [];
