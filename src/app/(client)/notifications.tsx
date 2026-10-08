import { router } from 'expo-router';

import { NotificationInboxView } from '@/components/notification-inbox-view';
import { useNotificationInbox } from '@/hooks/use-notification-inbox';

export default function ClientNotificationsScreen() {
  const inbox = useNotificationInbox();
  return <NotificationInboxView
    inbox={inbox}
    role="client"
    onClose={() => router.canGoBack() ? router.back() : router.replace('/home')}
    onOpenBooking={(bookingId) => router.push({ pathname: '/book', params: { bookingId } })}
  />;
}
