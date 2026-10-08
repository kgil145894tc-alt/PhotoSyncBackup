import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { type AdminCalendarCache } from '@/services/admin-calendar-cache';
import { adminCalendarDayStore, adminCalendarMonthStore } from '@/services/admin-calendar-store';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { subscribeToCalendarChanged } from '@/services/calendar-events';
import { subscribeToNotificationsChanged } from '@/services/notification-events';

function useCalendarEntry<T>(store: AdminCalendarCache<T>, key: string, kind: 'month' | 'day') {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  useFocusEffect(useCallback(() => {
    if (!snapshot.isSessionReady || !snapshot.accountId) return;
    const refresh = () => { void store.refresh(key); };
    refresh();
    const unsubscribeBookings = subscribeToBookingsChanged(refresh);
    const unsubscribeNotifications = subscribeToNotificationsChanged(refresh);
    const unsubscribeCalendar = subscribeToCalendarChanged((date) => {
      if (!date || (kind === 'month' ? date.slice(0, 7) : date) === key) refresh();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      unsubscribeBookings();
      unsubscribeNotifications();
      unsubscribeCalendar();
      subscription.remove();
    };
  }, [key, kind, snapshot.accountId, snapshot.isSessionReady, store]));

  const entry = snapshot.entries[key];
  const error = snapshot.isSessionReady && !snapshot.accountId
    ? 'Please sign in again to see your schedule.' : entry?.error ?? null;
  const refresh = useCallback(() => store.refresh(key, true), [key, store]);
  const reconcile = useCallback(() => store.refresh(key), [key, store]);
  return {
    items: entry?.data ?? EMPTY_ITEMS,
    error,
    isLoading: !snapshot.isSessionReady || (!entry?.data && !error),
    isRefreshing: entry?.isFetching ?? false,
    refresh, reconcile,
  };
}

export function useAdminCalendarMonth(month: string) {
  return useCalendarEntry(adminCalendarMonthStore, month, 'month');
}

export function useAdminCalendarDay(date: string) {
  return useCalendarEntry(adminCalendarDayStore, date, 'day');
}

const EMPTY_ITEMS: never[] = [];
