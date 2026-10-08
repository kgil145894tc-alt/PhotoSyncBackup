import { router } from 'expo-router';

import { NotificationInboxView } from '@/components/notification-inbox-view';
import { useNotificationInbox } from '@/hooks/use-notification-inbox';

export default function PhotographerNotificationsScreen() {
  const inbox = useNotificationInbox();
  return <NotificationInboxView
    inbox={inbox}
    role="admin"
    onClose={() => router.canGoBack() ? router.back() : router.replace('/photographer')}
    onOpenBooking={(bookingId) => router.push({ pathname: '/photographer/requests/[id]', params: { id: bookingId } })}
  />;
}
