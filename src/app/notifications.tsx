import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { getMyNotifications, markNotificationRead } from '@/services/notifications';
import { clientNotificationsStyles as styles } from '@/styles/client-notifications.styles';
import { type PhotoSyncNotification } from '@/types/notifications';

type NotificationKind = 'approved' | 'appointment' | 'review' | 'rejected' | 'announcement' | 'completed';
type DisplayNotification = PhotoSyncNotification & {
  kind: NotificationKind;
  packageName: string;
  timeText: string;
};

const SAMPLE_NOTIFICATIONS: DisplayNotification[] = [
  {
    bookingId: 'sample-approved',
    createdAt: '2026-09-25T10:34:00.000Z',
    id: 'sample-approved',
    isRead: false,
    kind: 'approved',
    message: 'Basic Portrait Package',
    packageName: 'Basic Portrait Package',
    timeText: '10:34 AM',
    title: 'Your booking has been approved!',
    userId: 'sample',
  },
  {
    bookingId: 'sample-appointment',
    createdAt: '2026-09-25T15:00:00.000Z',
    id: 'sample-appointment',
    isRead: false,
    kind: 'appointment',
    message: 'Basic Portrait',
    packageName: 'Basic Portrait',
    timeText: '3:00 PM',
    title: 'Upcoming appointment',
    userId: 'sample',
  },
  {
    bookingId: 'sample-review',
    createdAt: '2026-09-25T15:00:00.000Z',
    id: 'sample-review',
    isRead: false,
    kind: 'review',
    message: 'Premium Portrait Package',
    packageName: 'Premium Portrait Package',
    timeText: '3:00 PM',
    title: 'Booking request is under review.',
    userId: 'sample',
  },
  {
    bookingId: 'sample-rejected',
    createdAt: '2026-09-24T14:00:00.000Z',
    id: 'sample-rejected',
    isRead: false,
    kind: 'rejected',
    message: 'Premium Portrait Package',
    packageName: 'Premium Portrait Package',
    timeText: '2:00 PM',
    title: 'Your booking request was rejected.',
    userId: 'sample',
  },
  {
    bookingId: null,
    createdAt: '2026-09-24T14:30:00.000Z',
    id: 'sample-announcement',
    isRead: false,
    kind: 'announcement',
    message: 'Check out our new Graduation Package now available.',
    packageName: 'Check out our new Graduation Package now available.',
    timeText: '',
    title: 'New service available!',
    userId: 'sample',
  },
  {
    bookingId: 'sample-completed',
    createdAt: '2026-09-24T17:00:00.000Z',
    id: 'sample-completed',
    isRead: false,
    kind: 'completed',
    message: 'Graduation Portrait',
    packageName: 'Graduation Portrait',
    timeText: '5:00 PM',
    title: 'Your booking has been completed!',
    userId: 'sample',
  },
];

export default function ClientNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<'all' | 'bookings' | 'announcements'>('all');
  const [notifications, setNotifications] = useState<PhotoSyncNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const displayNotifications = useMemo(() => {
    const items = notifications.length ? notifications.map(toDisplayNotification) : SAMPLE_NOTIFICATIONS;

    if (activeFilter === 'bookings') {
      return items.filter((item) => item.bookingId);
    }

    if (activeFilter === 'announcements') {
      return items.filter((item) => !item.bookingId || item.kind === 'announcement');
    }

    return items;
  }, [activeFilter, notifications]);

  const groupedNotifications = useMemo(() => groupNotifications(displayNotifications), [displayNotifications]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Image
        contentFit="cover"
        source={require('@/assets/images/notifications-background.png')}
        style={styles.backgroundImage}
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28, paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>Stay updated with your bookings and appointments.</Text>
          </View>
          <Pressable accessibilityLabel="Close notifications" accessibilityRole="button" onPress={() => router.back()} style={styles.closeButton}>
            <CloseIcon />
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          <FilterChip active={activeFilter === 'all'} label="All" onPress={() => setActiveFilter('all')} />
          <FilterChip active={activeFilter === 'bookings'} label="My Bookings" onPress={() => setActiveFilter('bookings')} />
          <FilterChip active={activeFilter === 'announcements'} label="Announcements" onPress={() => setActiveFilter('announcements')} />
        </View>

        {isLoading ? (
          <Text style={styles.loadingText}>Checking notifications...</Text>
        ) : groupedNotifications.map((section) => (
          <View key={section.key} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionDate}>{section.dateLabel}</Text>
            </View>
            <View style={styles.list}>
              {section.items.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onPress={async () => {
                    if (notification.id.startsWith('sample-')) {
                      return;
                    }

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
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        label === 'All' ? styles.filterChipAll : label === 'My Bookings' ? styles.filterChipBookings : styles.filterChipAnnouncements,
        active && styles.filterChipActive,
        pressed && { opacity: 0.82 },
      ]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

function NotificationCard({ notification, onPress }: { notification: DisplayNotification; onPress: () => void }) {
  const isAnnouncement = notification.kind === 'announcement';

  return (
    <Pressable
      accessibilityHint={notification.bookingId ? 'Opens your booking details.' : undefined}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.86 }]}>
      <View style={[styles.badge, getBadgeStyle(notification.kind)]}>
        <NotificationIcon kind={notification.kind} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.cardTitle}>{notification.title}</Text>
        <Text numberOfLines={isAnnouncement ? 2 : 1} style={styles.message}>{notification.packageName}</Text>
        {notification.timeText ? (
          <View style={styles.timeRow}>
            <ClockIcon />
            <Text style={styles.meta}>{notification.timeText}</Text>
          </View>
        ) : null}
      </View>
      {!notification.isRead ? <View style={styles.unreadDot} /> : null}
      <ChevronRight />
    </Pressable>
  );
}

function toDisplayNotification(notification: PhotoSyncNotification): DisplayNotification {
  return {
    ...notification,
    kind: inferNotificationKind(notification),
    packageName: extractPackageName(notification.message),
    timeText: formatNotificationTime(notification.createdAt),
  };
}

function inferNotificationKind(notification: PhotoSyncNotification): NotificationKind {
  const text = `${notification.title} ${notification.message}`.toLowerCase();

  if (text.includes('approved') || text.includes('confirmed')) return 'approved';
  if (text.includes('appointment') || text.includes('schedule')) return 'appointment';
  if (text.includes('review') || text.includes('submitted')) return 'review';
  if (text.includes('rejected') || text.includes('cancelled')) return 'rejected';
  if (text.includes('completed')) return 'completed';

  return notification.bookingId ? 'appointment' : 'announcement';
}

function extractPackageName(message: string) {
  const match = message.match(/Your\s+(.+?)\s+booking/i);

  if (match?.[1]) {
    return `${match[1].trim()} Package`;
  }

  return message.replace(/\s+/g, ' ').trim();
}

function groupNotifications(items: DisplayNotification[]) {
  const sections: { dateLabel: string; items: DisplayNotification[]; key: string; title: string }[] = [];

  items.forEach((item) => {
    const title = getRelativeSectionTitle(item.createdAt);
    const dateLabel = formatNotificationDate(item.createdAt);
    const key = `${title}-${dateLabel}`;
    const existing = sections.find((section) => section.key === key);

    if (existing) {
      existing.items.push(item);
    } else {
      sections.push({ dateLabel, items: [item], key, title });
    }
  });

  return sections;
}

function getRelativeSectionTitle(value: string) {
  const date = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((startOfToday - startOfDate) / 86400000);

  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';

  return formatNotificationDate(value);
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getBadgeStyle(kind: NotificationKind) {
  switch (kind) {
    case 'approved':
      return styles.badgeApproved;
    case 'appointment':
      return styles.badgeAppointment;
    case 'review':
      return styles.badgeReview;
    case 'rejected':
      return styles.badgeRejected;
    case 'completed':
      return styles.badgeCompleted;
    case 'announcement':
      return styles.badgeAnnouncement;
  }
}

function NotificationIcon({ kind }: { kind: NotificationKind }) {
  switch (kind) {
    case 'approved':
      return (
        <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
          <Circle cx={18} cy={18} r={14} stroke="#12C650" strokeWidth={3} />
          <Path d="M11 18.5L16 23L25 13.5" stroke="#12C650" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
        </Svg>
      );
    case 'appointment':
      return (
        <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
          <Path d="M10 9H25C26.1 9 27 9.9 27 11V28C27 29.1 26.1 30 25 30H10C8.9 30 8 29.1 8 28V11C8 9.9 8.9 9 10 9Z" stroke="#395276" strokeWidth={2.4} />
          <Path d="M13 6V12M22 6V12M8 15H27" stroke="#395276" strokeLinecap="round" strokeWidth={2.4} />
          <Circle cx={24} cy={25} r={6} fill="#E8F2FC" stroke="#395276" strokeWidth={2.1} />
          <Path d="M24 21.8V25.3L26.5 27" stroke="#395276" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
        </Svg>
      );
    case 'review':
      return (
        <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
          <Circle cx={18} cy={18} r={14} stroke="#DD9711" strokeWidth={3} />
          <Path d="M18 10V19H25" stroke="#DD9711" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
        </Svg>
      );
    case 'rejected':
      return (
        <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
          <Circle cx={18} cy={18} r={14} stroke="#DC2020" strokeWidth={3} />
          <Path d="M13.5 13.5L22.5 22.5M22.5 13.5L13.5 22.5" stroke="#DC2020" strokeLinecap="round" strokeWidth={3} />
        </Svg>
      );
    case 'completed':
    case 'announcement':
      return (
        <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
          <Path d="M8 19H13L25 12V27L13 21H8V19Z" stroke="#7148C8" strokeLinejoin="round" strokeWidth={2.7} />
          <Path d="M13 21V28" stroke="#7148C8" strokeLinecap="round" strokeWidth={2.7} />
          <Path d="M28 16C29.5 17.5 29.5 21.5 28 23" stroke="#7148C8" strokeLinecap="round" strokeWidth={2.7} />
        </Svg>
      );
  }
}

function ClockIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
      <Circle cx={6} cy={6} r={4.5} stroke="#4C5E76" strokeWidth={1.1} />
      <Path d="M6 3.4V6.2L8.1 7.4" stroke="#4C5E76" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.1} />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30" fill="none">
      <Circle cx={15} cy={15} r={15} fill="#142C4C" />
      <Path d="M9.5 9.5L20.5 20.5M20.5 9.5L9.5 20.5" stroke="#ffffff" strokeLinecap="round" strokeWidth={3} />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5L16 12L9 19" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    </Svg>
  );
}
