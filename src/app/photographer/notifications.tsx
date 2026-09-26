import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getMyNotifications, markNotificationRead } from '@/services/notifications';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type PhotoSyncNotification } from '@/types/notifications';

export default function PhotographerNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<PhotoSyncNotification[]>([]);
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      setIsLoading(true);
      getMyNotifications(30).then((items) => {
        if (isMounted) {
          setNotifications(items);
          setIsLoading(false);
        }
      });

      return () => {
        isMounted = false;
      };
    }, []),
  );

  async function handleNotificationPress(notification: PhotoSyncNotification) {
    if (!notification.isRead) {
      await markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
      );
    }

    if (notification.bookingId) {
      router.push(`/photographer/requests/${notification.bookingId}` as never);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Photographer View</Text>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Track booking requests, cancellations, reschedules, and appointment updates.</Text>
        </View>

        <View style={styles.placeholderPanel}>
          {isLoading ? (
            <Text style={styles.requestDate}>Checking notifications...</Text>
          ) : notifications.length === 0 ? (
            <Text style={styles.requestDate}>No notifications yet.</Text>
          ) : (
            notifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onPress={() => handleNotificationPress(notification)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function NotificationCard({
  notification,
  onPress,
}: {
  notification: PhotoSyncNotification;
  onPress: () => void;
}) {
  const isActionable = Boolean(notification.bookingId);

  return (
    <Pressable
      accessibilityHint={isActionable ? 'Opens the booking request detail.' : undefined}
      accessibilityRole={isActionable ? 'button' : undefined}
      disabled={!isActionable}
      onPress={onPress}
      style={({ pressed }) => [styles.listCard, pressed && { opacity: 0.82 }]}>
      <View style={styles.listTopRow}>
        <Text style={styles.listTitle}>{notification.title}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{notification.isRead ? 'Read' : 'New'}</Text>
        </View>
      </View>
      <Text style={styles.listMeta}>{notification.message}</Text>
      <Text style={styles.listMeta}>{formatNotificationDate(notification.createdAt)}</Text>
    </Pressable>
  );
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}
