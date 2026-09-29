import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { formatBookingTimeRange, getAdminBookingRequests } from '@/services/admin-bookings';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { getMyUnreadNotificationCount } from '@/services/notifications';
import { bottomNavMetrics } from '@/styles/navigation.styles';
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
};

const APPOINTMENT_IMAGES = [
  require('@/assets/images/admin-appointment-1.png'),
  require('@/assets/images/admin-appointment-2.png'),
  require('@/assets/images/admin-appointment-3.png'),
];

export default function PhotographerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<AdminBookingRequest[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const todayDate = getTodayDate();
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
  const dashboardAppointmentBookings = todayAppointments.length > 0 ? todayAppointments : upcomingAppointments;
  const appointmentCards: AppointmentItem[] = dashboardAppointmentBookings.slice(0, 3).map((booking, index) => ({
    bookingId: booking.id,
    client: booking.clientName,
    image: booking.packageImageUrl ? { uri: booking.packageImageUrl } : APPOINTMENT_IMAGES[index % APPOINTMENT_IMAGES.length],
    service: booking.packageName,
    status: isOngoingAppointment(booking) ? 'Ongoing' : 'Upcoming',
    time: formatBookingTimeRange(booking.startTime, booking.endTime),
  }));
  const appointmentSectionTitle = todayAppointments.length > 0 ? "Today's Appointments" : 'Upcoming Appointments';
  const unreadNotificationCountText = formatNotificationBadgeCount(unreadNotificationCount);
  const displayAppointments = isDashboardLoading ? [] : appointmentCards;
  const stats: { icon: StatIconName; label: string; labelLines: string[]; tone: 'blue' | 'orange' | 'red'; value: string }[] = [
    { icon: 'request', label: 'Pending Requests', labelLines: ['Pending', 'Requests'], tone: 'orange', value: String(pendingRequests.length) },
    { icon: 'today', label: "Today's Appointments", labelLines: ["Today's", 'Appointments'], tone: 'blue', value: String(todayAppointments.length) },
    { icon: 'calendar', label: 'Upcoming Appointments', labelLines: ['Upcoming', 'Appointments'], tone: 'blue', value: String(upcomingAppointments.length) },
    { icon: 'bell', label: 'New Notification', labelLines: ['New', 'Notification'], tone: 'red', value: String(unreadNotificationCount) },
  ];
  const loadDashboardData = useCallback(async (isMounted: () => boolean = () => true) => {
    setIsDashboardLoading(true);

    try {
      const [bookingItems, unreadCount] = await Promise.all([
        getAdminBookingRequests(),
        getMyUnreadNotificationCount(),
      ]);

      if (isMounted()) {
        setBookings(bookingItems);
        setUnreadNotificationCount(unreadCount);
      }
    } catch {
      if (isMounted()) {
        setBookings([]);
        setUnreadNotificationCount(0);
      }
    } finally {
      if (isMounted()) {
        setIsDashboardLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void loadDashboardData(() => isMounted);

      return () => {
        isMounted = false;
      };
    }, [loadDashboardData]),
  );

  useEffect(
    () =>
      subscribeToBookingsChanged(() => {
        void loadDashboardData();
      }),
    [loadDashboardData],
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image
        contentFit="cover"
        source={require('@/assets/images/admin-dashboard-background.png')}
        style={styles.adminDashboardBackground}
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.adminDashboardContent,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={[styles.adminDashboardHeader, { paddingTop: insets.top }]}>
          <Image
            contentFit="cover"
            source={require('@/assets/images/admin-header-texture.png')}
            style={styles.adminHeaderTexture}
          />
          <View style={styles.adminDashboardBrand}>
            <Text style={styles.adminDashboardBrandText}>PhotoSync</Text>
            <Image
              contentFit="contain"
              source={require('@/assets/images/photosync-logo.png')}
              style={styles.adminDashboardBrandLogo}
            />
          </View>
        </View>

        <View style={styles.adminDashboardHero}>
          <Image
            contentFit="contain"
            source={require('@/assets/images/admin-dashboard-extra.png')}
            style={styles.adminDashboardHeroImage}
          />
          <Text style={styles.adminDashboardGreeting}>Good morning,</Text>
          <View style={styles.adminDashboardGreetingRow}>
            <Text style={styles.adminDashboardGreetingAccent}>Admin!</Text>
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
          <Text style={styles.adminDashboardSubtitle}>See how your business is doing today.</Text>
        </View>

        <View style={styles.adminDashboardStatsRow}>
          {stats.map((stat) => (
            <Pressable
              accessibilityRole={stat.icon === 'bell' ? 'button' : undefined}
              disabled={stat.icon !== 'bell'}
              key={stat.label}
              onPress={() => router.push('/photographer/notifications')}
              style={({ pressed }) => [styles.adminDashboardStatCard, pressed && { opacity: 0.82 }]}>
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

        <View style={styles.adminDashboardSectionHeader}>
          <Text style={styles.adminDashboardSectionTitle}>{appointmentSectionTitle}</Text>
          <View style={styles.adminDashboardHeaderActions}>
            <View style={styles.adminDashboardUpcomingPill}>
              <Text style={styles.adminDashboardUpcomingText}>Upcoming</Text>
            </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/photographer/requests')}
              style={({ pressed }) => [styles.adminDashboardViewAllButton, pressed && { opacity: 0.7 }]}>
              <Text style={styles.adminDashboardViewAllText}>View All</Text>
          </Pressable>
          </View>
        </View>

        <View style={styles.adminDashboardAppointmentList}>
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
          ) : (
            <DashboardAppointmentStateCard text="No upcoming appointments." />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function formatNotificationBadgeCount(count: number) {
  if (count <= 0) {
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
        <Text style={styles.adminDashboardAppointmentTime}>{item.time}</Text>
        <Text style={styles.adminDashboardAppointmentService}>{item.service}</Text>
        <Text style={styles.adminDashboardAppointmentClient}>{item.client}</Text>
      </View>
      <View style={[styles.adminDashboardAppointmentBadge, isOngoing ? styles.ongoingBadge : styles.upcomingBadge]}>
        <Text style={[styles.adminDashboardAppointmentBadgeText, isOngoing ? styles.ongoingText : styles.upcomingText]}>
          {item.status}
        </Text>
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
