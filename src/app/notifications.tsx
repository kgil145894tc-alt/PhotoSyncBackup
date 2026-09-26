import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { getMyNotifications, markNotificationRead } from '@/services/notifications';
import { clientNotificationsStyles as styles } from '@/styles/client-notifications.styles';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { type PhotoSyncNotification } from '@/types/notifications';

export default function ClientNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<PhotoSyncNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
  }, []));

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={styles.iconButton}>
            <BackIcon />
          </Pressable>
          <View style={styles.brandRow}>
            <Text style={styles.brandText}>PhotoSync</Text>
            <CameraIcon />
          </View>
          <View style={styles.iconButton} />
        </View>

        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Booking updates and messages from PhotoSync.</Text>

        {isLoading ? (
          <EmptyState message="Checking for booking updates..." />
        ) : notifications.length === 0 ? (
          <EmptyState message="Booking confirmations and rejection notices will appear here." />
        ) : (
          <View style={styles.list}>
            {notifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onPress={async () => {
                  if (!notification.isRead) {
                    await markNotificationRead(notification.id);
                    setNotifications((current) =>
                      current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
                    );
                  }

                  if (notification.bookingId) {
                    router.push('/book');
                  }
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function NotificationCard({ notification, onPress }: { notification: PhotoSyncNotification; onPress: () => void }) {
  const isActionable = Boolean(notification.bookingId);

  return (
    <Pressable
      accessibilityHint={isActionable ? 'Opens your booking details.' : undefined}
      accessibilityRole={isActionable ? 'button' : undefined}
      disabled={!isActionable}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}>
      <View style={styles.iconWrap}>
        <BellIcon />
      </View>
      <View style={styles.copy}>
        <Text style={styles.cardTitle}>{notification.title}</Text>
        <Text style={styles.message}>{notification.message}</Text>
        <Text style={styles.meta}>{formatNotificationDate(notification.createdAt)}</Text>
      </View>
      {!notification.isRead && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyPanel}>
      <BellIcon size={34} />
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
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

function BackIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={30} height={24} viewBox="0 0 30 24" fill="none">
      <Path d="M26.3 5.7H21.8L20.6 3C20.4 2.5 19.9 2.2 19.4 2.2H10.6C10.1 2.2 9.6 2.5 9.4 3L8.2 5.7H3.7C2.5 5.7 1.5 6.7 1.5 7.9V20.1C1.5 21.3 2.5 22.3 3.7 22.3H26.3C27.5 22.3 28.5 21.3 28.5 20.1V7.9C28.5 6.7 27.5 5.7 26.3 5.7Z" stroke="#142C4C" strokeLinejoin="round" strokeWidth={2.2} />
      <Circle cx={15} cy={14} r={5} stroke="#142C4C" strokeWidth={2.2} />
    </Svg>
  );
}

function BellIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 16V11C18 7.7 16 5.2 13 4.4V3.8C13 3.1 12.5 2.6 11.8 2.6C11.1 2.6 10.6 3.1 10.6 3.8V4.4C7.7 5.1 5.8 7.7 5.8 11V16L4.4 18H19.4L18 16Z" fill="#142C4C" />
      <Path d="M9.8 19.4C10.2 20.3 11 20.8 12 20.8C13 20.8 13.8 20.3 14.2 19.4" stroke="#142C4C" strokeLinecap="round" strokeWidth={1.8} />
    </Svg>
  );
}
