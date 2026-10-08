import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll as useNavScroll } from '@/hooks/use-client-nav-scroll';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { AdminBrandHeader } from '@/components/admin-brand-header';
import { usePagedAdminBookings } from '@/hooks/use-paged-admin-bookings';
import { useNotificationUnreadCount } from '@/hooks/use-notification-unread-count';
import { formatBookingTimeRange, formatShortBookingDate } from '@/services/admin-bookings';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type AdminBookingRequest } from '@/types/admin-bookings';

type StatIconName = 'bell' | 'calendar' | 'request' | 'today';
type AppointmentItem = {
  bookingId: string;
  client: string;
  image: ImageSourcePropType;
  isSample?: boolean;
  service: string;
  status: 'Ongoing' | 'Upcoming';
  time: string;
  date: string;
};

const APPOINTMENT_IMAGES = [
  require('@/assets/images/admin-appointment-1.png'),
  require('@/assets/images/admin-appointment-2.png'),
  require('@/assets/images/admin-appointment-3.png'),
];

export default function PhotographerDashboardScreen() {
  const navHeight = useBottomNavHeight('admin');
  const navScroll = useNavScroll();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const useTwoStatColumns = width / fontScale < 440;
  const { requests: bookings, counts, error, isLoading: isDashboardLoading, isRefreshing, refresh } = usePagedAdminBookings({ dashboard: true });
  const { unreadCount: unreadNotificationCount, error: notificationError, isRefreshing: isNotificationRefreshing,
    refresh: refreshNotificationCount } = useNotificationUnreadCount();
  const bottomPadding = navHeight + insets.bottom + 24;
  const dashboardAppointmentBookings = bookings;
  const appointmentCards: AppointmentItem[] = dashboardAppointmentBookings.slice(0, 3).map((booking, index) => ({
    bookingId: booking.id,
    client: booking.clientName,
    image: booking.packageImageUrl ? { uri: booking.packageImageUrl } : APPOINTMENT_IMAGES[index % APPOINTMENT_IMAGES.length],
    service: booking.packageName,
    status: isOngoingAppointment(booking) ? 'Ongoing' : 'Upcoming',
    time: formatBookingTimeRange(booking.startTime, booking.endTime),
    date: formatShortBookingDate(booking.bookingDate),
  }));
  const appointmentSectionTitle = (counts?.today ?? 0) > 0 ? "Today's Appointments" : 'Upcoming Appointments';
  const unreadNotificationCountText = formatNotificationBadgeCount(unreadNotificationCount);
  const displayAppointments = isDashboardLoading ? [] : appointmentCards;
  const stats: { icon: StatIconName; label: string; labelLines: string[]; tone: 'blue' | 'orange' | 'red'; value: string }[] = [
    { icon: 'request', label: 'Pending Requests', labelLines: ['Pending', 'Requests'], tone: 'orange', value: counts ? String(counts.pending) : '—' },
    { icon: 'today', label: "Today's Appointments", labelLines: ["Today's", 'Appointments'], tone: 'blue', value: counts ? String(counts.today) : '—' },
    { icon: 'calendar', label: 'Upcoming Appointments', labelLines: ['Upcoming', 'Appointments'], tone: 'blue', value: counts ? String(counts.upcoming) : '—' },
    { icon: 'bell', label: 'New Notification', labelLines: ['New', 'Notification'], tone: 'red', value: unreadNotificationCount === null ? '—' : String(unreadNotificationCount) },
  ];
  const refreshDashboard = useCallback(() => {
    void refresh();
    void refreshNotificationCount();
  }, [refreshNotificationCount, refresh]);

  return (
    <View style={[styles.container, styles.adminCurvedHeaderScreen]}>
      <StatusBar style="light" />
      <AdminBrandHeader
        textureSource={require('@/assets/images/admin-calendar-banner.png')}
        topInset={insets.top}
      />
      <View style={styles.adminDashboardSurface}>
      <ScrollView
        {...navScroll}
        refreshControl={<RefreshControl refreshing={isRefreshing || isNotificationRefreshing} onRefresh={refreshDashboard} />}
        contentContainerStyle={[
          styles.adminDashboardContent,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={styles.adminDashboardHero}>
          <Text style={styles.adminDashboardGreeting}>YOUR STUDIO, AT A GLANCE</Text>
          <View style={styles.adminDashboardGreetingRow}>
            <Text style={styles.adminDashboardGreetingAccent}>Overview</Text>
            <Pressable
              accessibilityLabel="Open notifications"
              accessibilityRole="button"
              onPress={() => router.push('/photographer/notifications')}
              style={({ pressed }) => [styles.adminDashboardNotificationButton, pressed && { opacity: 0.72 }]}>
              <StatIcon name="bell" size={25} />
              {unreadNotificationCountText ? (
                <View style={styles.adminDashboardNotificationBadge}>
                  <Text style={styles.adminDashboardNotificationBadgeText}>
                    {unreadNotificationCountText}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
          <Text style={styles.adminDashboardSubtitle}>A clear view of your bookings and what’s next.</Text>
        </View>

        <View style={styles.adminDashboardStatsRow}>
          {stats.map((stat) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${stat.label}: ${stat.value}`}
              key={stat.label}
              onPress={() => router.push(stat.icon === 'bell' ? '/photographer/notifications'
                : stat.icon === 'request' ? '/photographer/requests' : '/photographer/calendar')}
              style={({ pressed }) => [styles.adminDashboardStatCard,
                useTwoStatColumns && { flexBasis: '45%', flexGrow: 1, flexShrink: 0 },
                pressed && { opacity: 0.82 }]}>
              <View
                style={[
                  styles.adminDashboardStatIconWrap,
                  stat.tone === 'orange' && styles.adminDashboardStatIconOrange,
                  stat.tone === 'red' && styles.adminDashboardStatIconRed,
                ]}>
                <StatIcon name={stat.icon} size={22} />
              </View>
              <Text style={styles.adminDashboardStatValue}>{stat.value}</Text>
              <Text style={styles.adminDashboardStatLabel}>{stat.labelLines.join('\n')}</Text>
            </Pressable>
          ))}
        </View>

        {notificationError ? <Text accessibilityRole="alert" style={styles.adminRequestsEmptyText}>{notificationError}</Text> : null}

        {counts ? (
          <View style={[styles.adminAttentionCard, counts.pending === 0 && styles.adminAttentionCardClear]}>
            <Text style={styles.adminAttentionEyebrow}>NEEDS ATTENTION</Text>
            <Text style={styles.adminAttentionTitle}>{counts.pending > 0
              ? `${counts.pending} ${counts.pending === 1 ? 'request is' : 'requests are'} waiting`
              : 'You’re all caught up'}</Text>
            <Text style={styles.adminAttentionDescription}>{counts.pending > 0
              ? 'Review new requests to help clients plan their session.'
              : 'No pending requests. Your next sessions are listed below.'}</Text>
            {counts.pending > 0 ? <Pressable accessibilityRole="button"
              accessibilityLabel="Review pending booking requests"
              onPress={() => router.push('/photographer/requests')}
              style={({ pressed }) => [styles.adminAttentionButton, pressed && { opacity: 0.8 }]}>
              <Text style={styles.adminAttentionButtonText}>Review requests →</Text>
            </Pressable> : null}
          </View>
        ) : null}

        <View style={styles.adminDashboardSectionHeader}>
          <Text style={styles.adminDashboardSectionTitle}>{appointmentSectionTitle}</Text>
          <View style={styles.adminDashboardHeaderActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/photographer/calendar')}
              style={({ pressed }) => [styles.adminDashboardViewAllButton, pressed && { opacity: 0.7 }]}>
              <Text style={styles.adminDashboardViewAllText}>View calendar</Text>
          </Pressable>
          </View>
        </View>

        <View style={styles.adminDashboardAppointmentList}>
          {error ? <DashboardAppointmentStateCard text={error} /> : null}
          {isDashboardLoading ? (
            <DashboardAppointmentStateCard text="Loading appointments..." />
          ) : displayAppointments.length > 0 ? (
            displayAppointments.map((item) => (
              <AppointmentCard
                item={item}
                key={item.bookingId}
                onPress={() => router.push(`/photographer/requests/${item.bookingId}` as never)}
              />
            ))
          ) : !error ? (
            <DashboardAppointmentStateCard text="No upcoming appointments." />
          ) : null}
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

function formatNotificationBadgeCount(count: number | null) {
  if (count === null || count <= 0) {
    return '';
  }

  return count > 99 ? '99+' : String(count);
}

function DashboardAppointmentStateCard({ text }: { text: string }) {
  return (
    <View style={styles.adminDashboardAppointmentStateCard}>
      <Text style={styles.adminDashboardAppointmentStateText}>{text}</Text>
    </View>
  );
}

function AppointmentCard({
  item,
  onPress,
}: {
  item: AppointmentItem;
  onPress: () => void;
}) {
  const isOngoing = item.status === 'Ongoing';

  return (
    <Pressable
      accessibilityHint={item.isSample ? undefined : 'Opens the appointment booking details.'}
      accessibilityRole={item.isSample ? undefined : 'button'}
      disabled={item.isSample}
      onPress={() => {
        if (!item.isSample) {
          onPress();
        }
      }}
      style={({ pressed }) => [styles.adminDashboardAppointmentCard, pressed && !item.isSample && { opacity: 0.86 }]}>
      <Image contentFit="cover" source={item.image} style={styles.adminDashboardAppointmentImage} />
      <View style={styles.adminDashboardAppointmentCopy}>
        <Text style={styles.adminDashboardAppointmentDate}>{item.date}</Text>
        <Text style={styles.adminDashboardAppointmentTime}>{item.time}</Text>
        <Text style={styles.adminDashboardAppointmentService}>{item.service}</Text>
        <Text style={styles.adminDashboardAppointmentClient}>{item.client}</Text>
      <View style={[styles.adminDashboardAppointmentBadge, isOngoing ? styles.ongoingBadge : styles.upcomingBadge]}>
        <Text style={[styles.adminDashboardAppointmentBadgeText, isOngoing ? styles.ongoingText : styles.upcomingText]}>
          {item.status}
        </Text>
      </View>

      </View>
      <ChevronRight />
    </Pressable>
  );
}

function StatIcon({ name, size = 24 }: { name: StatIconName; size?: number }) {
  if (name === 'bell') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M18 16V11C18 7.7 16 5.2 13 4.4V3.8C13 3.1 12.5 2.6 11.8 2.6C11.1 2.6 10.6 3.1 10.6 3.8V4.4C7.7 5.1 5.8 7.7 5.8 11V16L4.4 18H19.4L18 16Z" fill="#4C77A5" />
        <Path d="M9.8 19.4C10.2 20.3 11 20.8 12 20.8C13 20.8 13.8 20.3 14.2 19.4" stroke="#4C77A5" strokeLinecap="round" strokeWidth={1.8} />
      </Svg>
    );
  }

  if (name === 'request') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={5} y={4} width={14} height={16} rx={2} stroke="#FF9E44" strokeWidth={2} />
        <Path d="M8 9H16M8 13H14M8 17H12" stroke="#FF9E44" strokeLinecap="round" strokeWidth={2} />
      </Svg>
    );
  }

  if (name === 'today') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={5} width={16} height={15} rx={2} stroke="#4C8DEB" strokeWidth={2} />
        <Path d="M8 3.5V7M16 3.5V7M4 10H20" stroke="#4C8DEB" strokeLinecap="round" strokeWidth={2} />
        <Path d="M9 15L11 17L15.5 12.5" stroke="#4C8DEB" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5} width={16} height={15} rx={2} stroke="#4C8DEB" strokeWidth={2} />
      <Path d="M8 3.5V7M16 3.5V7M4 10H20M8 14H10M12 14H14M16 14H18M8 17H10M12 17H14" stroke="#4C8DEB" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
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
