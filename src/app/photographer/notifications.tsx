import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { showAppAlert } from '@/components/app-alert';
import { getMyNotifications, markNotificationRead } from '@/services/notifications';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type PhotoSyncNotification } from '@/types/notifications';

type NotificationFilter = 'all' | 'appointments' | 'booking';
type NotificationKind = 'appointment' | 'booking' | 'cancellation';
type NotificationGroup = {
  dateLabel: string;
  title: string;
  items: PhotoSyncNotification[];
};

export default function PhotographerNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [notifications, setNotifications] = useState<PhotoSyncNotification[]>([]);
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (activeFilter === 'all') return true;

        return inferNotificationKind(notification) === activeFilter || (activeFilter === 'appointments' && inferNotificationKind(notification) === 'cancellation');
      }),
    [activeFilter, notifications],
  );
  const groupedNotifications = useMemo(() => groupNotifications(filteredNotifications), [filteredNotifications]);

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
      const result = await markNotificationRead(notification.id);

      if (result.success) {
        setNotifications((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
        );
      } else {
        showAppAlert('Notification not updated', result.message ?? 'Please try again.');
      }
    }

    if (notification.bookingId) {
      router.push(`/photographer/requests/${notification.bookingId}` as never);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Image
        contentFit="cover"
        source={require('@/assets/images/admin-notifications-background.png')}
        style={styles.adminNotificationsBackground}
      />
      <Image
        contentFit="contain"
        source={require('@/assets/images/admin-notifications-camera.png')}
        style={styles.adminNotificationsCamera}
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.adminNotificationsContent,
          { paddingBottom: bottomPadding, paddingTop: insets.top + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <Pressable
          accessibilityLabel="Close notifications"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.adminNotificationsCloseButton, pressed && { opacity: 0.78 }]}>
          <CloseIcon />
        </Pressable>

        <View style={styles.adminNotificationsHeader}>
          <Text style={styles.adminNotificationsTitle}>Notifications</Text>
          <Text style={styles.adminNotificationsSubtitle}>See how your studio is working at the moment.</Text>
        </View>

        <View style={styles.adminNotificationsFilters}>
          <FilterChip active={activeFilter === 'all'} label="All" onPress={() => setActiveFilter('all')} />
          <FilterChip
            active={activeFilter === 'booking'}
            label="Booking Requests"
            onPress={() => setActiveFilter('booking')}
          />
          <FilterChip
            active={activeFilter === 'appointments'}
            label="Appointments"
            onPress={() => setActiveFilter('appointments')}
          />
        </View>

        {isLoading ? (
          <Text style={styles.adminNotificationsEmptyText}>Checking notifications...</Text>
        ) : groupedNotifications.length === 0 ? (
          <Text style={styles.adminNotificationsEmptyText}>No notifications yet.</Text>
        ) : (
          groupedNotifications.map((group) => (
            <View key={`${group.title}-${group.dateLabel}`} style={styles.adminNotificationsGroup}>
              <View style={styles.adminNotificationsGroupHeader}>
                <Text style={styles.adminNotificationsGroupTitle}>{group.title}</Text>
                <Text style={styles.adminNotificationsGroupDate}>{group.dateLabel}</Text>
              </View>
              <View style={styles.adminNotificationsList}>
                {group.items.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onPress={() => handleNotificationPress(notification)}
                  />
                ))}
              </View>
            </View>
          ))
          )}
      </ScrollView>
    </View>
  );
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.adminNotificationsFilterChip,
        active && styles.activeAdminNotificationsFilterChip,
        pressed && { opacity: 0.82 },
      ]}>
      <Text
        style={[
          styles.adminNotificationsFilterText,
          active && styles.activeAdminNotificationsFilterText,
        ]}>
        {label}
      </Text>
    </Pressable>
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
  const kind = inferNotificationKind(notification);

  return (
    <Pressable
      accessibilityHint={isActionable ? 'Marks the notification read and opens the booking request detail.' : 'Marks the notification read.'}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.adminNotificationItemCard, pressed && { opacity: 0.82 }]}>
      <View
        style={[
          styles.adminNotificationIconCircle,
          kind === 'appointment' && styles.adminNotificationIconCircleBlue,
          kind === 'cancellation' && styles.adminNotificationIconCircleYellow,
        ]}>
        <NotificationKindIcon kind={kind} />
      </View>
      <View style={styles.adminNotificationItemCopy}>
        <Text style={styles.adminNotificationItemTitle}>{formatNotificationTitle(notification)}</Text>
        <Text style={styles.adminNotificationItemMessage}>{formatNotificationMessage(notification)}</Text>
        <View style={styles.adminNotificationTimeRow}>
          <ClockIcon />
          <Text style={styles.adminNotificationItemTime}>{formatNotificationTime(notification.createdAt)}</Text>
        </View>
      </View>
      {!notification.isRead && <View style={styles.adminNotificationUnreadDot} />}
      <ChevronRight />
    </Pressable>
  );
}

function NotificationKindIcon({ kind }: { kind: NotificationKind }) {
  if (kind === 'booking') {
    return (
      <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
        <Path d="M18 16V11C18 7.7 16 5.2 13 4.4V3.8C13 3.1 12.5 2.6 11.8 2.6C11.1 2.6 10.6 3.1 10.6 3.8V4.4C7.7 5.1 5.8 7.7 5.8 11V16L4.4 18H19.4L18 16Z" fill="#D3262C" />
        <Path d="M9.8 19.4C10.2 20.3 11 20.8 12 20.8C13 20.8 13.8 20.3 14.2 19.4" stroke="#D3262C" strokeLinecap="round" strokeWidth={1.8} />
      </Svg>
    );
  }

  if (kind === 'cancellation') {
    return (
      <Svg width={38} height={38} viewBox="0 0 24 24" fill="none">
        <Rect x={5} y={6} width={14} height={13} rx={1.6} stroke="#B08A2E" strokeWidth={2} />
        <Path d="M8 4V8M16 4V8M5 10H19M12 13V16" stroke="#B08A2E" strokeLinecap="round" strokeWidth={2} />
        <Circle cx={12} cy={18} r={1} fill="#B08A2E" />
      </Svg>
    );
  }

  return (
    <Svg width={38} height={38} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={6} width={14} height={13} rx={1.6} stroke="#31527A" strokeWidth={2} />
      <Path d="M8 4V8M16 4V8M5 10H19M9 15L11 17L15.5 12.5" stroke="#31527A" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path d="M5.4 5.4L16.6 16.6M16.6 5.4L5.4 16.6" stroke="#ffffff" strokeLinecap="round" strokeWidth={3} />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={19} height={19} viewBox="0 0 19 19" fill="none">
      <Path d="M7 4.5L11.5 9.5L7 14.5" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
      <Circle cx={6} cy={6} r={4.7} stroke="#4C5E76" strokeWidth={1.2} />
      <Path d="M6 3.7V6.2L7.7 7.2" stroke="#4C5E76" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} />
    </Svg>
  );
}

function groupNotifications(items: PhotoSyncNotification[]): NotificationGroup[] {
  const todayKey = getDateKey(new Date());
  const yesterday = new Date();

  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);
  const groups = new Map<string, NotificationGroup>();

  items.forEach((item) => {
    const date = new Date(item.createdAt);
    const key = getDateKey(date);
    const title = key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : formatSectionDate(date);
    const dateLabel = formatShortDate(date);
    const groupKey = `${title}-${dateLabel}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { dateLabel, items: [], title });
    }

    groups.get(groupKey)?.items.push(item);
  });

  return Array.from(groups.values());
}

function inferNotificationKind(notification: PhotoSyncNotification): NotificationKind {
  const text = `${notification.title} ${notification.message}`.toLowerCase();

  if (text.includes('reminder')) {
    return 'appointment';
  }

  if (text.includes('cancel')) {
    return 'cancellation';
  }

  if (text.includes('appointment') || text.includes('confirmed') || text.includes('completed')) {
    return 'appointment';
  }

  return 'booking';
}

function formatNotificationTitle(notification: PhotoSyncNotification) {
  const kind = inferNotificationKind(notification);

  if (kind === 'booking') {
    const clientName = extractClientName(notification.message);

    return clientName ? `New booking request\nfrom ${clientName}` : notification.title;
  }

  if (notification.title.toLowerCase().includes('cancel')) {
    return 'Booking Request Cancellation';
  }

  return notification.title;
}

function formatNotificationMessage(notification: PhotoSyncNotification) {
  const message = notification.message.replace(/\.$/, '');
  const requestMatch = message.match(/submitted a (.+?) booking request/i);
  const cancelledMatch = message.match(/cancelled a (.+?) booking/i);

  if (requestMatch?.[1]) {
    return toTitleCase(requestMatch[1]);
  }

  if (cancelledMatch?.[1]) {
    const clientName = extractClientName(message);

    return clientName ? `${clientName} - ${toTitleCase(cancelledMatch[1])}` : toTitleCase(cancelledMatch[1]);
  }

  return message;
}

function extractClientName(message: string) {
  const requestMatch = message.match(/^(.+?) submitted/i);
  const cancelledMatch = message.match(/^(.+?) cancelled/i);

  return requestMatch?.[1] ?? cancelledMatch?.[1] ?? '';
}

function toTitleCase(value: string) {
  return value
    .split(' ')
    .map((word) => (word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word))
    .join(' ');
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatSectionDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
