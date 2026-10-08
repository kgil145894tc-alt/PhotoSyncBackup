import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll } from '@/hooks/use-client-nav-scroll';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  Pressable,
  RefreshControl,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { showAppAlert } from '@/components/app-alert';
import { usePagedClientBookings } from '@/hooks/use-paged-client-bookings';
import { useMountedRef } from '@/hooks/use-mounted-ref';
import { setSelectedPackage } from '@/services/booking-draft';
import { getClientReschedulePackage } from '@/services/client-bookings';
import { bookingEmptyStyles as styles } from '@/styles/booking-empty.styles';
import { clientBookingsStyles as bookingStyles } from '@/styles/client-bookings.styles';
import { MobilePage } from '@/components/mobile-page';
import { type AdminBookingRequest } from '@/types/admin-bookings';
import {
  BookingCollection,
  BookingDetailView,
  type BookingFilter,
} from '@/components/client-bookings-view';

export default function BookingScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const selectedId = typeof bookingId === 'string' ? bookingId : bookingId?.[0];
  const [activeFilter, setActiveFilter] = useState<BookingFilter>('all');
  const state = usePagedClientBookings(selectedId ? { bookingId: selectedId } : { status: activeFilter });
  return <BookingContent key={`${state.accountVersion}:${state.accountId}`} state={state} bookingId={selectedId}
    activeFilter={activeFilter} onFilterChange={setActiveFilter} />;
}

function BookingContent({ state, bookingId, activeFilter, onFilterChange }: {
  state: ReturnType<typeof usePagedClientBookings>; bookingId?: string;
  activeFilter: BookingFilter; onFilterChange: (filter: BookingFilter) => void;
}) {
  const navHeight = useBottomNavHeight();
  const navScroll = useClientNavScroll();
  const insets = useSafeAreaInsets();
  const mounted = useMountedRef();
  const focused = useRef(false);
  const acting = useRef(false);
  const missingAlerted = useRef<string | null>(null);
  const { bookings, isLoading, error, hasLoaded, isFresh, isRefreshing, isCurrentSession } = state;
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [reschedulingBookingId, setReschedulingBookingId] = useState<
    string | null
  >(null);
  // Store IDs rather than row copies so details and the drawer follow updates.
  const displayedBooking = bookings.find((booking) => booking.id === bookingId) ?? null;
  const cancelTarget = bookings.find((booking) => booking.id === cancelTargetId && booking.status === 'pending') ?? null;
  const isCancelling = Boolean(state.cancellingId);
  const isActive = () => mounted.current && focused.current && isCurrentSession();

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));

  async function handleCancelBooking() {
    if (!cancelTarget || acting.current || isCancelling || !isActive()) return;
    acting.current = true;
    try {
      const result = await state.cancel(cancelTarget.id);
      if (!isActive() || !result) return;
      if (!result.success) {
        showAppAlert('Booking not cancelled', result.message ?? 'Please try again.');
        return;
      }
      setCancelTargetId(null);
      showAppAlert('Booking cancelled', 'The admin has been notified.');
    } finally {
      acting.current = false;
    }
  }

  async function handleRescheduleBooking(booking: AdminBookingRequest) {
    if (acting.current || isCancelling || !isActive()) return;
    acting.current = true;
    setReschedulingBookingId(booking.id);
    try {
      const result = await getClientReschedulePackage(booking.id, {
        expectedAccountId: state.accountId ?? undefined, isSessionCurrent: isCurrentSession,
      });
      if (!isActive()) return;
      if (!result.success || !result.packageItem) {
        showAppAlert('Cannot reschedule', result.message ?? 'Please try again.');
        void state.refresh();
        return;
      }
      setSelectedPackage(result.packageItem);
      router.push(`/book/schedule?mode=reschedule&bookingId=${booking.id}` as never);
    } catch {
      if (isActive()) showAppAlert('Cannot reschedule', 'Could not check this booking. Please try again.');
    } finally {
      acting.current = false;
      if (mounted.current && isCurrentSession()) setReschedulingBookingId(null);
    }
  }

  useFocusEffect(useCallback(() => {
    if (!bookingId) missingAlerted.current = null;
    // A failed or stale read does not prove a notification's booking is absent.
    if (!hasLoaded || !isFresh || isRefreshing || error || !isCurrentSession()) return;
    if (cancelTargetId && !bookings.some((booking) => booking.id === cancelTargetId && booking.status === 'pending')) setCancelTargetId(null);
    if (!bookingId) return;
    const target = bookings.find((booking) => booking.id === bookingId);
    if (!target && missingAlerted.current !== bookingId) {
      missingAlerted.current = bookingId;
      showAppAlert('Booking unavailable', 'This booking could not be found in your account.');
      router.setParams({ bookingId: undefined });
    }
  }, [bookingId, bookings, cancelTargetId, error, hasLoaded, isCurrentSession, isFresh, isRefreshing]));

  return (
    <MobilePage
      title={displayedBooking ? 'Booking Details' : 'My Bookings'}
      back={Boolean(bookingId)}
      onBack={() => {
        router.setParams({ bookingId: undefined });
      }}
      footerInset={navHeight}
      navScroll={navScroll}
      scrollable={Boolean(bookingId)}
      refreshControl={<RefreshControl refreshing={!isLoading && isRefreshing} onRefresh={() => { void state.refresh(); }} />}
    >
      {bookingId && error ? <Text accessibilityRole="alert" style={bookingStyles.body}>{error}</Text> : null}
      {displayedBooking ? (
        <BookingDetailView
          booking={displayedBooking}
          isRescheduling={reschedulingBookingId === displayedBooking.id}
          onCancel={() => { if (!acting.current && !isCancelling) setCancelTargetId(displayedBooking.id); }}
          onReschedule={() => handleRescheduleBooking(displayedBooking)}
        />
      ) : bookingId ? (
        <Text style={bookingStyles.body}>{isLoading ? 'Loading booking details…' : error ? '' : 'Booking unavailable.'}</Text>
      ) : (
        <BookingCollection
          navScroll={navScroll}
          bookings={bookings}
          isLoading={isLoading}
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
          onSelect={(booking) => router.setParams({ bookingId: booking.id })}
          counts={state.counts}
          isRefreshing={isRefreshing}
          isLoadingMore={state.isLoadingMore}
          hasMore={state.hasMore}
          onRefresh={() => { void state.refresh(); }}
          onLoadMore={() => { void state.loadMore(); }}
          bottomPadding={insets.bottom + navHeight + 24}
          error={error}
        />
      )}
      <CancelBookingDrawer
        booking={cancelTarget}
        isCancelling={isCancelling}
        onCancel={handleCancelBooking}
        onClose={() => {
          if (!isCancelling && !acting.current) setCancelTargetId(null);
        }}
      />
    </MobilePage>
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
    <Modal
      animationType="none"
      onRequestClose={onClose}
      transparent
      visible={Boolean(booking)}
    >
      <View style={styles.cancelDrawerOverlay}>
        <Pressable
          accessibilityLabel="Close cancel drawer"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.cancelDrawerScrim}
        />
        <View
          style={[
            styles.cancelDrawer,
            {
              paddingBottom: Math.max(24, insets.bottom + 18),
              width: drawerWidth,
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexShrink: 1 }}
          >
            <View style={styles.cancelDrawerHandle} />
            <View style={styles.cancelDrawerIconWrap}>
              <TrashIcon size={32} />
            </View>
            <Text style={styles.cancelDrawerTitle}>Cancel this Booking?</Text>
            <Text style={styles.cancelDrawerText}>
              This action will notify the studio and release your time slot.
            </Text>
            <View style={styles.cancelDrawerActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isCancelling}
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.confirmCancelButton,
                  (pressed || isCancelling) && { opacity: 0.72 },
                ]}
              >
                <Text style={styles.confirmCancelText}>
                  {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isCancelling}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.keepBookingButton,
                  pressed && !isCancelling && { opacity: 0.88 },
                ]}
              >
                <Text style={styles.keepBookingText}>Keep Booking</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TrashIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 7H19.5"
        stroke="#142C4C"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <Path
        d="M9.5 7V5.2C9.5 4.5 10 4 10.7 4H13.3C14 4 14.5 4.5 14.5 5.2V7"
        stroke="#142C4C"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <Path
        d="M7 7L7.8 19.1C7.9 20.2 8.7 21 9.8 21H14.2C15.3 21 16.1 20.2 16.2 19.1L17 7"
        stroke="#142C4C"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M10.5 11V17M13.5 11V17"
        stroke="#142C4C"
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  );
}
