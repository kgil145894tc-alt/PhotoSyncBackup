import { Image, type ImageSource } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { fallbackPortraitPackages } from '@/data/service-catalog';
import { formatBookingDate, formatBookingTimeRange, formatShortBookingDate } from '@/services/admin-bookings';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { setSelectedPackage } from '@/services/booking-draft';
import { cancelClientBooking, getClientBookings, getClientReschedulePackage } from '@/services/client-bookings';
import { bookingEmptyStyles as styles } from '@/styles/booking-empty.styles';
import { clientUi } from '@/styles/client-ui.styles';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

const FIGMA_WIDTH = 412;
const FIGMA_NAV_TOP = 844;
const CLIENT_HEADER_HEIGHT = clientUi.metrics.headerHeight;
const CLIENT_HEADER_UNDERLAY_HEIGHT = CLIENT_HEADER_HEIGHT + 29;
const CLIENT_HEADER_TITLE_TOP = 57;
const CLIENT_HEADER_TITLE_SIZE = clientUi.type.pageTitleSize;
const CLIENT_HEADER_TITLE_LINE_HEIGHT = 34;
const CLIENT_HEADER_BACK_TOP = 52;
const CLIENT_PRIMARY_BUTTON_HEIGHT = clientUi.metrics.primaryButtonHeight;
const CLIENT_PRIMARY_BUTTON_TEXT_SIZE = clientUi.type.buttonSize;
const CLIENT_PRIMARY_BUTTON_LINE_HEIGHT = 22;
type BookingFilter = 'all' | 'approved' | 'cancelled' | 'pending';

const filters: BookingFilter[] = ['all', 'pending', 'approved', 'cancelled'];

export default function BookingScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<BookingFilter>('all');
  const [bookings, setBookings] = useState<AdminBookingRequest[]>([]);
  const [cancelTarget, setCancelTarget] = useState<AdminBookingRequest | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reschedulingBookingId, setReschedulingBookingId] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<AdminBookingRequest | null>(null);
  const bookingsRef = useRef<AdminBookingRequest[]>([]);
  const hasLoadedBookings = useRef(false);
  const bottomPadding = bottomNavMetrics.height + insets.bottom;
  const availableContentHeight = Math.max(1, height - bottomPadding);
  const scale = Math.min(width / FIGMA_WIDTH, availableContentHeight / FIGMA_NAV_TOP);
  const contentHeight = availableContentHeight;
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;
  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;
  const filteredBookings = useMemo(
    () => bookings.filter((booking) => isBookingInFilter(booking, activeFilter)),
    [activeFilter, bookings],
  );

  const applyBookingItems = useCallback((items: AdminBookingRequest[]) => {
    bookingsRef.current = items;
    hasLoadedBookings.current = true;
    setBookings(items);
    setSelectedBooking((current) => (current ? items.find((item) => item.id === current.id) ?? null : null));
  }, []);

  const refreshBookings = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) {
      setIsLoading(true);
    }

    const items = await getClientBookings();

    applyBookingItems(items);
    setIsLoading(false);
  }, [applyBookingItems]);

  async function handleCancelBooking() {
    if (!cancelTarget) {
      return;
    }

    setIsCancelling(true);
    const result = await cancelClientBooking(cancelTarget.id);

    if (!result.success) {
      setIsCancelling(false);
      Alert.alert('Booking not cancelled', result.message ?? 'Please try again.');
      return;
    }

    setCancelTarget(null);
    await refreshBookings(false);
    setIsCancelling(false);
    Alert.alert('Booking cancelled', 'The admin has been notified.');
  }

  async function handleRescheduleBooking(booking: AdminBookingRequest) {
    setReschedulingBookingId(booking.id);
    const result = await getClientReschedulePackage(booking.id);
    setReschedulingBookingId(null);

    if (!result.success || !result.packageItem) {
      Alert.alert('Cannot reschedule', result.message ?? 'Please try again.');
      return;
    }

    setSelectedPackage(result.packageItem);
    router.push(`/book/schedule?mode=reschedule&bookingId=${booking.id}` as never);
  }

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const shouldShowSkeleton = !hasLoadedBookings.current && bookingsRef.current.length === 0;

      if (shouldShowSkeleton) {
        setIsLoading(true);
      }

      getClientBookings().then((items) => {
        if (isMounted) {
          applyBookingItems(items);
          setIsLoading(false);
        }
      });

      return () => {
        isMounted = false;
      };
    }, [applyBookingItems]),
  );

  useEffect(
    () =>
      subscribeToBookingsChanged(() => {
        void refreshBookings(false);
      }),
    [refreshBookings],
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {selectedBooking ? (
        <BookingDetailView
          booking={selectedBooking}
          contentHeight={contentHeight}
          isRescheduling={reschedulingBookingId === selectedBooking.id}
          onBack={() => setSelectedBooking(null)}
          onCancel={() => setCancelTarget(selectedBooking)}
          onReschedule={() => handleRescheduleBooking(selectedBooking)}
          px={px}
          width={width}
          x={x}
          y={y}
        />
      ) : (
        <BookingListView
          activeFilter={activeFilter}
          bookings={filteredBookings}
          contentHeight={contentHeight}
          isLoading={isLoading}
          onBrowse={() => router.push('/services')}
          onFilterChange={setActiveFilter}
          onSelectBooking={setSelectedBooking}
          px={px}
          width={width}
          x={x}
          y={y}
        />
      )}

      <CancelBookingDrawer
        booking={cancelTarget}
        isCancelling={isCancelling}
        onCancel={handleCancelBooking}
        onClose={() => {
          if (!isCancelling) {
            setCancelTarget(null);
          }
        }}
      />
    </View>
  );
}

function BookingListView({
  activeFilter,
  bookings,
  contentHeight,
  isLoading,
  onBrowse,
  onFilterChange,
  onSelectBooking,
  px,
  width,
  x,
  y,
}: {
  activeFilter: BookingFilter;
  bookings: AdminBookingRequest[];
  contentHeight: number;
  isLoading: boolean;
  onBrowse: () => void;
  onFilterChange: (filter: BookingFilter) => void;
  onSelectBooking: (booking: AdminBookingRequest) => void;
  px: (value: number) => number;
  width: number;
  x: (value: number) => number;
  y: (value: number) => number;
}) {
  const listHeight = Math.max(1, contentHeight - y(CLIENT_HEADER_HEIGHT));
  const contentSize = bookings.length ? 88 + bookings.length * 120 + 120 : 650;

  return (
    <View style={[styles.canvas, { height: contentHeight }]}>
      <View style={[styles.bookingHeader, { height: y(CLIENT_HEADER_UNDERLAY_HEIGHT), width }]}>
        <Image
          contentFit="cover"
          source={require('@/assets/images/admin-calendar-banner.png')}
          style={styles.bookingHeaderTexture}
        />
      </View>
      <Text style={[styles.bookingHeaderTitle, { left: x(108), top: y(CLIENT_HEADER_TITLE_TOP), width: px(196), fontSize: px(CLIENT_HEADER_TITLE_SIZE), lineHeight: px(CLIENT_HEADER_TITLE_LINE_HEIGHT) }]}>
        My Bookings
      </Text>

      <View style={[styles.bookingBodyShell, { left: 0, top: y(CLIENT_HEADER_HEIGHT), width, height: listHeight + y(30), borderTopLeftRadius: px(20), borderTopRightRadius: px(20) }]}>
        <Image contentFit="cover" source={require('@/assets/images/booking-empty-background.png')} style={styles.bookingBodyBackground} />
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={{ height: px(contentSize) }}
        showsVerticalScrollIndicator={false}
        style={[styles.bookingListScroll, { left: 0, top: y(CLIENT_HEADER_HEIGHT), width, height: listHeight }]}>
        <View style={[styles.bookingFilterRow, { left: x(19), top: y(35), width: px(376) }]}>
          {filters.map((filter) => {
            const isActive = filter === activeFilter;

            return (
              <Pressable
                accessibilityRole="button"
                key={filter}
                onPress={() => onFilterChange(filter)}
                style={[styles.bookingFilterPill, isActive && styles.activeBookingFilterPill, { width: px(85), height: px(33), borderRadius: px(15) }]}>
                <Text style={[styles.bookingFilterText, isActive && styles.activeBookingFilterText]}>{formatFilterLabel(filter)}</Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <BookingSkeletonList px={px} x={x} />
        ) : bookings.length ? (
          bookings.map((booking, index) => (
            <BookingListCard booking={booking} index={index} key={booking.id} onPress={() => onSelectBooking(booking)} px={px} x={x} />
          ))
        ) : (
          <View style={[styles.bookingEmptyPanel, { left: x(33), top: y(103), width: px(348), borderRadius: px(20) }]}>
            <Text style={styles.bookingEmptyTitle}>No bookings found</Text>
            <Text style={styles.bookingEmptyText}>Choose another status or browse services to create a new booking.</Text>
          </View>
        )}

        <BrowseServicesButton onPress={onBrowse} px={px} top={Math.max(589, 103 + bookings.length * 120)} x={x} />
      </ScrollView>
    </View>
  );
}

function BookingListCard({
  booking,
  index,
  onPress,
  px,
  x,
}: {
  booking: AdminBookingRequest;
  index: number;
  onPress: () => void;
  px: (value: number) => number;
  x: (value: number) => number;
}) {
  const statusStyle = getBookingStatusStyle(booking.status);

  return (
    <Pressable
      accessibilityLabel={`View ${booking.packageName} booking`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.bookingListCard,
        {
          left: x(18),
          opacity: pressed ? 0.86 : 1,
          top: px(103 + index * 120),
          transform: [{ scale: pressed ? 0.99 : 1 }],
          width: px(376),
          height: px(109),
          borderRadius: px(10),
        },
      ]}>
      <Image contentFit="cover" source={getBookingImageSource(booking)} style={[styles.bookingListImage, { left: px(7), top: px(9), width: px(91), height: px(91), borderRadius: px(10) }]} />
      <View style={[styles.bookingStatusPill, { backgroundColor: statusStyle.background, left: px(107), top: px(9), width: px(92), height: px(24), borderRadius: px(10) }]}>
        <Text style={[styles.bookingStatusText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.bookingListTitle, { left: px(106), top: px(39), width: px(185), fontSize: px(14), lineHeight: px(19) }]}>
        {booking.packageName}
      </Text>
      <View style={[styles.bookingListMetaRow, { left: px(109), top: px(67) }]}>
        <CalendarIcon color="#4C5E76" size={px(10)} />
        <Text style={[styles.bookingListMetaText, { fontSize: px(10), lineHeight: px(13) }]}>{formatShortBookingDate(booking.bookingDate)}</Text>
      </View>
      <View style={[styles.bookingListMetaRow, { left: px(109), top: px(85) }]}>
        <ClockIcon color="#4C5E76" size={px(10)} />
        <Text style={[styles.bookingListMetaText, { fontSize: px(10), lineHeight: px(13) }]}>{formatListTime(booking.startTime)}</Text>
      </View>
      <View style={[styles.bookingChevron, { left: px(349), top: px(47), width: px(20), height: px(20) }]}>
        <ChevronRight size={px(20)} />
      </View>
    </Pressable>
  );
}

function BookingDetailView({
  booking,
  contentHeight,
  isRescheduling,
  onBack,
  onCancel,
  onReschedule,
  px,
  width,
  x,
  y,
}: {
  booking: AdminBookingRequest;
  contentHeight: number;
  isRescheduling: boolean;
  onBack: () => void;
  onCancel: () => void;
  onReschedule: () => void;
  px: (value: number) => number;
  width: number;
  x: (value: number) => number;
  y: (value: number) => number;
}) {
  const statusStyle = getBookingStatusStyle(booking.status);
  const canCancel = booking.status === 'pending';
  const canReschedule = booking.status === 'pending' || booking.status === 'confirmed';
  const info = getStatusCopy(booking.status);

  return (
    <View style={[styles.canvas, { height: contentHeight }]}>
      <View style={[styles.bookingHeader, { height: y(CLIENT_HEADER_UNDERLAY_HEIGHT), width }]}>
        <Image
          contentFit="cover"
          source={require('@/assets/images/admin-calendar-banner.png')}
          style={styles.bookingHeaderTexture}
        />
      </View>
      <Text style={[styles.bookingHeaderTitle, { left: x(98), top: y(CLIENT_HEADER_TITLE_TOP), width: px(216), fontSize: px(CLIENT_HEADER_TITLE_SIZE), lineHeight: px(CLIENT_HEADER_TITLE_LINE_HEIGHT) }]}>
        Booking Details
      </Text>
      <Pressable accessibilityLabel="Back to bookings" accessibilityRole="button" onPress={onBack} style={[styles.bookingBackButton, { left: x(28), top: y(CLIENT_HEADER_BACK_TOP), width: px(35), height: px(35) }]}>
        <ChevronLeft color="#ffffff" size={px(26)} />
      </Pressable>

      <View style={[styles.bookingDetailBodyShell, { left: 0, top: y(CLIENT_HEADER_HEIGHT), width, height: Math.max(1, contentHeight - y(CLIENT_HEADER_HEIGHT) + y(30)), borderTopLeftRadius: px(28), borderTopRightRadius: px(28) }]}>
        <Image contentFit="cover" source={getBookingImageSource(booking)} style={[styles.detailHeroImage, { left: 0, top: 0, width, height: y(263) }]} />
        <Image contentFit="cover" source={require('@/assets/images/booking-empty-background.png')} style={[styles.bookingBodyBackground, { top: y(263), height: Math.max(1, contentHeight - y(CLIENT_HEADER_HEIGHT + 263) + y(30)) }]} />
      </View>

      <View style={[styles.detailInfoCard, { left: x(33), top: y(362), width: px(348), minHeight: px(270), borderRadius: px(20) }]}>
        <View style={[styles.detailStatusPill, { backgroundColor: statusStyle.background }]}>
          <Text style={[styles.detailStatusText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
        </View>
        <Text numberOfLines={2} style={[styles.detailPackageTitle, { fontSize: px(24), lineHeight: px(34) }]}>{booking.packageName}</Text>
        <Text style={styles.detailServiceName}>{booking.serviceName.toUpperCase()}</Text>
        <DetailInfoRow icon="calendar" label="Date:" value={formatBookingDate(booking.bookingDate)} />
        <DetailInfoRow icon="time" label="Time:" value={formatBookingTimeRange(booking.startTime, booking.endTime)} />
      </View>

      <View style={[styles.detailStatusPanel, { backgroundColor: statusStyle.panel, left: x(33), top: y(657), width: px(348), borderRadius: px(20) }]}>
        <InfoIcon color={statusStyle.color} size={px(38)} />
        <View style={styles.detailStatusCopy}>
          <Text style={[styles.detailStatusTitle, { color: statusStyle.color }]}>{info.title}</Text>
          <Text style={styles.detailStatusMessage}>{info.message}</Text>
          {booking.status === 'rejected' && booking.rejectionReason ? <Text style={styles.detailReasonText}>{booking.rejectionReason}</Text> : null}
        </View>
      </View>

      {canCancel ? (
        <Pressable
          accessibilityRole="button"
          disabled={isRescheduling}
          onPress={onCancel}
          style={({ pressed }) => [styles.detailPrimaryButton, { left: x(33), top: y(786), width: px(348), height: px(CLIENT_PRIMARY_BUTTON_HEIGHT), borderRadius: px(28), opacity: pressed ? 0.84 : 1 }]}>
          <CancelCalendarIcon size={px(28)} />
          <Text style={[styles.detailPrimaryButtonText, { fontSize: px(CLIENT_PRIMARY_BUTTON_TEXT_SIZE), lineHeight: px(CLIENT_PRIMARY_BUTTON_LINE_HEIGHT) }]}>Cancel Request</Text>
        </Pressable>
      ) : canReschedule ? (
        <Pressable
          accessibilityRole="button"
          disabled={isRescheduling}
          onPress={onReschedule}
          style={({ pressed }) => [styles.detailPrimaryButton, { left: x(33), top: y(786), width: px(348), height: px(CLIENT_PRIMARY_BUTTON_HEIGHT), borderRadius: px(28), opacity: pressed || isRescheduling ? 0.84 : 1 }]}>
          <CalendarIcon color="#ffffff" size={px(25)} />
          <Text style={[styles.detailPrimaryButtonText, { fontSize: px(CLIENT_PRIMARY_BUTTON_TEXT_SIZE), lineHeight: px(CLIENT_PRIMARY_BUTTON_LINE_HEIGHT) }]}>{isRescheduling ? 'Opening...' : 'Reschedule'}</Text>
        </Pressable>
      ) : (
        <BrowseServicesButton onPress={() => router.push('/services')} px={px} top={786} x={x} />
      )}
    </View>
  );
}

function DetailInfoRow({ icon, label, value }: { icon: 'calendar' | 'time'; label: string; value: string }) {
  return (
    <View style={styles.detailInfoRow}>
      {icon === 'calendar' ? <CalendarIcon color="#142C4C" size={24} /> : <ClockIcon color="#142C4C" size={24} />}
      <Text style={styles.detailInfoLabel}>{label}</Text>
      <Text style={styles.detailInfoValue}>{value}</Text>
    </View>
  );
}

function CancelBookingDrawer({
  booking,
  isCancelling,
  onCancel,
  onClose,
}: {
  booking: AdminBookingRequest | null;
  isCancelling: boolean;
  onCancel: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width, 412);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(booking)}>
      <View style={styles.cancelDrawerOverlay}>
        <Pressable accessibilityLabel="Close cancel drawer" accessibilityRole="button" onPress={onClose} style={styles.cancelDrawerScrim} />
        <View style={[styles.cancelDrawer, { paddingBottom: Math.max(24, insets.bottom + 18), width: drawerWidth }]}>
          <View style={styles.cancelDrawerHandle} />
          <View style={styles.cancelDrawerIconWrap}>
            <TrashIcon size={32} />
          </View>
          <Text style={styles.cancelDrawerTitle}>Cancel this Booking?</Text>
          <Text style={styles.cancelDrawerText}>This action will notify the studio and release your time slot.</Text>
          <View style={styles.cancelDrawerActions}>
            <Pressable
              accessibilityRole="button"
              disabled={isCancelling}
              onPress={onCancel}
              style={({ pressed }) => [styles.confirmCancelButton, (pressed || isCancelling) && { opacity: 0.72 }]}>
              <Text style={styles.confirmCancelText}>{isCancelling ? 'Cancelling...' : 'Yes, Cancel'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isCancelling}
              onPress={onClose}
              style={({ pressed }) => [styles.keepBookingButton, pressed && !isCancelling && { opacity: 0.88 }]}>
              <Text style={styles.keepBookingText}>Keep Booking</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BookingSkeletonList({ px, x }: { px: (value: number) => number; x: (value: number) => number }) {
  return (
    <>
      {[0, 1, 2].map((item) => (
        <View key={item} style={[styles.bookingListCard, { left: x(18), top: px(103 + item * 120), width: px(376), height: px(109), borderRadius: px(10) }]}>
          <View style={[styles.bookingSkeletonImage, { left: px(7), top: px(9), width: px(91), height: px(91), borderRadius: px(10) }]} />
          <View style={[styles.bookingSkeletonLine, { left: px(107), top: px(13), width: px(92), height: px(20), borderRadius: px(10) }]} />
          <View style={[styles.bookingSkeletonLineStrong, { left: px(106), top: px(43), width: px(170), height: px(14), borderRadius: px(8) }]} />
          <View style={[styles.bookingSkeletonLine, { left: px(123), top: px(69), width: px(90), height: px(10), borderRadius: px(5) }]} />
          <View style={[styles.bookingSkeletonLine, { left: px(123), top: px(87), width: px(70), height: px(10), borderRadius: px(5) }]} />
        </View>
      ))}
    </>
  );
}

function BrowseServicesButton({ onPress, px, top, x }: { onPress: () => void; px: (value: number) => number; top: number; x: (value: number) => number }) {
  return (
    <Pressable
      accessibilityLabel="Browse Services"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.browseButton, { left: x(33), top: px(top), width: px(348), height: px(CLIENT_PRIMARY_BUTTON_HEIGHT), borderRadius: px(28), opacity: pressed ? 0.84 : 1 }]}>
      <BrowseIcon size={px(22)} />
      <Text style={[styles.browseText, { marginLeft: px(9), fontSize: px(CLIENT_PRIMARY_BUTTON_TEXT_SIZE), lineHeight: px(CLIENT_PRIMARY_BUTTON_LINE_HEIGHT) }]}>Browse Services</Text>
    </Pressable>
  );
}

function isBookingInFilter(booking: AdminBookingRequest, filter: BookingFilter) {
  if (filter === 'all') return true;
  if (filter === 'approved') return booking.status === 'confirmed' || booking.status === 'completed';
  if (filter === 'cancelled') return booking.status === 'cancelled' || booking.status === 'rejected' || booking.status === 'expired';

  return booking.status === 'pending';
}

function formatFilterLabel(filter: BookingFilter) {
  if (filter === 'all') return 'All';
  if (filter === 'approved') return 'Approved';
  if (filter === 'cancelled') return 'Cancelled';

  return 'Pending';
}

function getBookingImageSource(booking: AdminBookingRequest): ImageSource {
  if (booking.packageImageUrl) {
    return { uri: booking.packageImageUrl };
  }

  return fallbackPortraitPackages.find((item) => item.name.toLowerCase() === booking.packageName.toLowerCase())?.image ?? fallbackPortraitPackages[0].image;
}

function getBookingStatusStyle(status: BookingStatus) {
  if (status === 'confirmed' || status === 'completed') {
    return {
      background: '#59E073',
      color: '#1F622C',
      label: status === 'completed' ? 'COMPLETED' : 'APPROVED',
      panel: '#CFF3D6',
    };
  }

  if (status === 'pending') {
    return {
      background: '#FDC860',
      color: '#685123',
      label: 'PENDING',
      panel: '#F8CD79',
    };
  }

  if (status === 'rejected' || status === 'expired') {
    return {
      background: '#E7887B',
      color: '#7A2A1F',
      label: status === 'expired' ? 'EXPIRED' : 'REJECTED',
      panel: '#F1B4AB',
    };
  }

  return {
    background: '#B3B3B3',
    color: '#4F4F4E',
    label: 'CANCELLED',
    panel: '#D7D7D7',
  };
}

function getStatusCopy(status: BookingStatus) {
  if (status === 'pending') {
    return {
      message: "We'll notify you as soon as the studio confirms your request",
      title: 'Waiting for studio confirmation',
    };
  }

  if (status === 'confirmed') {
    return {
      message: 'Your appointment is confirmed. Check your final schedule and location above.',
      title: 'Booking approved',
    };
  }

  if (status === 'completed') {
    return {
      message: 'Your photo session has been completed. Thank you for booking with PhotoSync.',
      title: 'Booking completed',
    };
  }

  if (status === 'rejected') {
    return {
      message: 'Your booking request was rejected. You may choose another package or time slot.',
      title: 'Booking rejected',
    };
  }

  if (status === 'expired') {
    return {
      message: 'This request expired because the scheduled time passed before it was confirmed.',
      title: 'Booking expired',
    };
  }

  return {
    message: 'This booking was cancelled. You may choose a new package and schedule.',
    title: 'Booking cancelled',
  };
}

function formatListTime(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function ChevronLeft({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronRight({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5L16 12L9 19" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    </Svg>
  );
}

function CalendarIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5.5} width={16} height={14} rx={1.5} stroke={color} strokeWidth={2} />
      <Path d="M8 3.5V8M16 3.5V8M4 10H20" stroke={color} strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function ClockIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={2} />
      <Path d="M12 7.5V12.5L15.5 14.5" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function InfoIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2.2} />
      <Path d="M12 10.5V17" stroke={color} strokeLinecap="round" strokeWidth={2.2} />
      <Circle cx={12} cy={7.2} r={1.2} fill={color} />
    </Svg>
  );
}

function CancelCalendarIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={5} width={17} height={15} rx={2} fill="#ffffff" />
      <Path d="M7.5 3.5V7M16.5 3.5V7M4 9.5H20" stroke="#142C4C" strokeLinecap="round" strokeWidth={2} />
      <Circle cx={16.5} cy={16.5} r={4.5} fill="#ffffff" stroke="#142C4C" strokeWidth={1.7} />
      <Path d="M15 15L18 18M18 15L15 18" stroke="#142C4C" strokeLinecap="round" strokeWidth={1.7} />
    </Svg>
  );
}

function BrowseIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={7} height={7} rx={1.2} fill="#ffffff" />
      <Rect x={14} y={3} width={7} height={7} rx={1.2} fill="#ffffff" />
      <Rect x={3} y={14} width={7} height={7} rx={1.2} fill="#ffffff" />
      <Rect x={14} y={14} width={7} height={7} rx={1.2} fill="#ffffff" />
    </Svg>
  );
}

function TrashIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4.5 7H19.5" stroke="#142C4C" strokeLinecap="round" strokeWidth={2} />
      <Path d="M9.5 7V5.2C9.5 4.5 10 4 10.7 4H13.3C14 4 14.5 4.5 14.5 5.2V7" stroke="#142C4C" strokeLinecap="round" strokeWidth={2} />
      <Path d="M7 7L7.8 19.1C7.9 20.2 8.7 21 9.8 21H14.2C15.3 21 16.1 20.2 16.2 19.1L17 7" stroke="#142C4C" strokeLinejoin="round" strokeWidth={2} />
      <Path d="M10.5 11V17M13.5 11V17" stroke="#142C4C" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}
