import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { formatBookingTimeRange, getAdminBookingRequests } from '@/services/admin-bookings';
import { getClosedDayCount, getMonthPrefix } from '@/services/calendar';
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/notifications';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type AdminBookingRequest } from '@/types/admin-bookings';
import { type PhotoSyncNotification } from '@/types/notifications';

type StatIconName = 'bell' | 'calendar' | 'closed' | 'request' | 'today';
type AppointmentItem = {
  bookingId: string;
  client: string;
  service: string;
  status: 'Ongoing' | 'Upcoming';
  time: string;
};

export default function PhotographerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<AdminBookingRequest[]>([]);
  const [closedDays, setClosedDays] = useState(0);
  const [notifications, setNotifications] = useState<PhotoSyncNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const todayDate = getTodayDate();
  const currentMonth = getMonthPrefix(todayDate);
  const pendingRequests = useMemo(
    () => bookings.filter((booking) => booking.status === 'pending'),
    [bookings],
  );
  const todayAppointments = useMemo(
    () =>
      bookings
        .filter((booking) => booking.status === 'confirmed' && booking.bookingDate === todayDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [bookings, todayDate],
  );
  const upcomingAppointments = useMemo(
    () =>
      bookings
        .filter((booking) => booking.status === 'confirmed' && booking.bookingDate > todayDate)
        .sort((a, b) => `${a.bookingDate}-${a.startTime}`.localeCompare(`${b.bookingDate}-${b.startTime}`)),
    [bookings, todayDate],
  );
  const appointmentCards: AppointmentItem[] = todayAppointments.slice(0, 3).map((booking) => ({
    bookingId: booking.id,
    client: booking.clientName,
    service: booking.packageName,
    status: isOngoingAppointment(booking) ? 'Ongoing' : 'Upcoming',
    time: formatBookingTimeRange(booking.startTime, booking.endTime),
  }));
  const unreadNotifications = notifications.filter((notification) => !notification.isRead);
  const notificationItems = notifications.slice(0, 4);
  const stats: { icon: StatIconName; label: string; value: string }[] = [
    { icon: 'request', label: 'Pending Requests', value: String(pendingRequests.length) },
    { icon: 'today', label: "Today's Confirmed", value: String(todayAppointments.length) },
    { icon: 'calendar', label: 'Upcoming Confirmed', value: String(upcomingAppointments.length) },
    { icon: 'closed', label: 'Closed Days', value: String(closedDays) },
    { icon: 'bell', label: 'Unread Alerts', value: String(unreadNotifications.length) },
  ];

  useFocusEffect(
    useCallback(() => {
    let isMounted = true;

    Promise.all([getAdminBookingRequests(), getMyNotifications(), getClosedDayCount(currentMonth)]).then(([bookingItems, notificationRows, closedDayTotal]) => {
      if (isMounted) {
        setBookings(bookingItems);
        setNotifications(notificationRows);
        setClosedDays(closedDayTotal);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentMonth]));

  async function handleNotificationPress(notification: PhotoSyncNotification) {
    if (!notification.isRead) {
      const result = await markNotificationRead(notification.id);

      if (result.success) {
        setNotifications((items) =>
          items.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
        );
      }
    }

    if (notification.bookingId) {
      router.push(`/photographer/requests/${notification.bookingId}` as never);
    }
  }

  async function handleMarkAllRead() {
    const result = await markAllNotificationsRead();

    if (result.success) {
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.scrollContent, styles.adminHomeContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={styles.adminTopBar}>
          <Pressable accessibilityLabel="Open admin menu" accessibilityRole="button" style={styles.iconButton}>
            <MenuIcon />
          </Pressable>
          <View style={styles.adminBrand}>
            <Text style={styles.adminBrandText}>PhotoSync</Text>
            <CameraLogo />
          </View>
          <Pressable
            accessibilityLabel="Show notifications"
            accessibilityRole="button"
            onPress={() => setShowNotifications((value) => !value)}
            style={({ pressed }) => [styles.floatingBellButton, pressed && { opacity: 0.82 }]}>
            <StatIcon name="bell" />
            {unreadNotifications.length > 0 && <View style={styles.floatingBellDot} />}
          </Pressable>
        </View>

        {showNotifications && (
          <View style={styles.notificationPopover}>
            <View style={styles.notificationPopoverHeader}>
              <Text style={styles.notificationPopoverTitle}>Notifications</Text>
              <Pressable accessibilityRole="button" onPress={handleMarkAllRead}>
                <Text style={styles.notificationPopoverMeta}>
                  {unreadNotifications.length ? 'Mark all read' : 'All read'}
                </Text>
              </Pressable>
            </View>
            {notificationItems.length === 0 && (
              <Text style={styles.requestDate}>No new booking notifications.</Text>
            )}
            {notificationItems.map((item) => (
              <NotificationCard item={item} key={item.id} onPress={() => handleNotificationPress(item)} />
            ))}
          </View>
        )}

        <View style={styles.adminHero}>
          <View style={styles.heroDecorationOne} />
          <View style={styles.heroDecorationTwo} />
          <Text style={styles.adminGreeting}>Good morning,{'\n'}Admin!</Text>
          <Text style={styles.adminDate}>{formatDashboardDate(new Date())}</Text>
        </View>

        <View style={styles.adminStatsGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.adminStatCard}>
              <View style={styles.adminStatIconWrap}>
                <StatIcon name={stat.icon} />
              </View>
              <Text style={styles.adminStatValue}>{stat.value}</Text>
              <Text style={styles.adminStatLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.adminSectionHeader}>
          <Text style={styles.adminSectionTitle}>Today&apos;s Appointments</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/photographer/requests')}
            style={({ pressed }) => [styles.viewAllButton, pressed && { opacity: 0.7 }]}>
            <Text style={styles.viewAllText}>View All</Text>
          </Pressable>
        </View>

        <View style={styles.adminListPanel}>
          {appointmentCards.length === 0 && (
            <Text style={styles.requestDate}>No confirmed appointments today.</Text>
          )}
          {appointmentCards.map((item) => (
            <AppointmentCard item={item} key={item.bookingId} />
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

function AppointmentCard({
  item,
}: {
  item: AppointmentItem;
}) {
  const isOngoing = item.status === 'Ongoing';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/photographer/requests/${item.bookingId}` as never)}
      style={({ pressed }) => [styles.adminAppointmentCard, pressed && { opacity: 0.86 }]}>
      <View style={styles.appointmentThumb}>
        <CameraLogo compact />
      </View>
      <View style={styles.appointmentCopy}>
        <Text style={styles.appointmentTime}>{item.time}</Text>
        <Text style={styles.appointmentService}>{item.service}</Text>
        <Text style={styles.appointmentClient}>{item.client}</Text>
      </View>
      <View style={[styles.appointmentBadge, isOngoing ? styles.ongoingBadge : styles.upcomingBadge]}>
        <Text style={[styles.appointmentBadgeText, isOngoing ? styles.ongoingText : styles.upcomingText]}>
          {item.status}
        </Text>
      </View>
      <ChevronRight />
    </Pressable>
  );
}

function NotificationCard({ item, onPress }: { item: PhotoSyncNotification; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.adminNotificationCard,
        item.isRead && styles.readNotificationCard,
        pressed && { opacity: 0.86 },
      ]}>
      <View style={styles.notificationIconWrap}>
        <StatIcon name="bell" />
      </View>
      <View style={styles.notificationCopy}>
        <Text style={styles.notificationTitle}>{item.title}</Text>
        <Text style={styles.notificationMeta}>{item.message}</Text>
      </View>
      {!item.isRead && <View style={styles.notificationUnreadDot} />}
    </Pressable>
  );
}

function MenuIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
      <Path d="M6 9H22M6 14H18M6 19H22" stroke="#142C4C" strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

function CameraLogo({ compact = false }: { compact?: boolean }) {
  const size = compact ? 26 : 32;

  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 32 26" fill="none">
      <Path
        d="M28.4 6.2H23.6L22.3 3.2C22 2.5 21.4 2 20.6 2H11.4C10.6 2 10 2.5 9.7 3.2L8.4 6.2H3.6C2.2 6.2 1 7.4 1 8.8V22.4C1 23.8 2.2 25 3.6 25H28.4C29.8 25 31 23.8 31 22.4V8.8C31 7.4 29.8 6.2 28.4 6.2Z"
        stroke="#142C4C"
        strokeLinejoin="round"
        strokeWidth={2.4}
      />
      <Circle cx={16} cy={15.5} r={5.9} stroke="#142C4C" strokeWidth={2.4} />
      <Circle cx={26.2} cy={10.1} r={1.3} fill="#142C4C" />
    </Svg>
  );
}

function StatIcon({ name }: { name: StatIconName }) {
  if (name === 'bell') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path d="M18 16V11C18 7.7 16 5.2 13 4.4V3.8C13 3.1 12.5 2.6 11.8 2.6C11.1 2.6 10.6 3.1 10.6 3.8V4.4C7.7 5.1 5.8 7.7 5.8 11V16L4.4 18H19.4L18 16Z" fill="#F05D5D" />
        <Path d="M9.8 19.4C10.2 20.3 11 20.8 12 20.8C13 20.8 13.8 20.3 14.2 19.4" stroke="#F05D5D" strokeLinecap="round" strokeWidth={1.8} />
      </Svg>
    );
  }

  if (name === 'request') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Rect x={5} y={4} width={14} height={16} rx={2} stroke="#FF9E44" strokeWidth={2} />
        <Path d="M8 9H16M8 13H14M8 17H12" stroke="#FF9E44" strokeLinecap="round" strokeWidth={2} />
      </Svg>
    );
  }

  if (name === 'today') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={5} width={16} height={15} rx={2} stroke="#4C8DEB" strokeWidth={2} />
        <Path d="M8 3.5V7M16 3.5V7M4 10H20" stroke="#4C8DEB" strokeLinecap="round" strokeWidth={2} />
        <Path d="M9 15L11 17L15.5 12.5" stroke="#4C8DEB" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </Svg>
    );
  }

  if (name === 'closed') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={5} width={16} height={15} rx={2} stroke="#E45F62" strokeWidth={2} />
        <Path d="M8 3.5V7M16 3.5V7M4 10H20" stroke="#E45F62" strokeLinecap="round" strokeWidth={2} />
        <Path d="M9 14L15 18M15 14L9 18" stroke="#E45F62" strokeLinecap="round" strokeWidth={2} />
      </Svg>
    );
  }

  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5} width={16} height={15} rx={2} stroke="#4C8DEB" strokeWidth={2} />
      <Path d="M8 3.5V7M16 3.5V7M4 10H20M8 14H10M12 14H14M16 14H18M8 17H10M12 17H14" stroke="#4C8DEB" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function formatDashboardDate(date: Date) {
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);

  return `${formattedDate}   ${weekday}`;
}

function getTodayDate() {
  const today = new Date();

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function isOngoingAppointment(booking: AdminBookingRequest) {
  if (booking.bookingDate !== getTodayDate()) {
    return false;
  }

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;

  return booking.startTime <= currentTime && booking.endTime >= currentTime;
}

function ChevronRight() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M7 4L11 9L7 14" stroke="#4C77A5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}
