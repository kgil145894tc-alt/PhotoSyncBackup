import { supabase } from '@/lib/supabase';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { subscribeToNotificationsChanged } from '@/services/notification-events';
import { createNotificationInboxCache } from '@/services/notification-inbox-cache';
import { getMyNotificationInbox, getMyUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from '@/services/notifications';

export const notificationInboxApi = {
  load: getMyNotificationInbox,
  loadUnreadCount: () => getMyUnreadNotificationCount({ throwOnError: true }),
  markAll: markAllNotificationsRead,
  markRead: markNotificationRead,
};

export const notificationInboxStore = createNotificationInboxCache(notificationInboxApi);

// Invalidate even when the notification screen is closed.
subscribeToBookingsChanged(notificationInboxStore.invalidate);
subscribeToNotificationsChanged(notificationInboxStore.invalidate);

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    notificationInboxStore.setAccount(session?.user.id ?? null);
  });
} else {
  notificationInboxStore.setAccount(null);
}
