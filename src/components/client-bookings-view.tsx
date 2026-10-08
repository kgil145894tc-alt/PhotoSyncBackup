import { Image, type ImageSource } from 'expo-image';
import { router } from 'expo-router';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fallbackPortraitPackages } from '@/data/service-catalog';
import {
  formatBookingDate,
  formatBookingTimeRange,
  formatShortBookingDate,
} from '@/services/admin-bookings';
import { clientBookingsStyles as styles } from '@/styles/client-bookings.styles';
import { responsiveStyles } from '@/styles/responsive.styles';
import type { ClientNavScrollProps } from '@/hooks/use-client-nav-scroll';
import { type BookingCounts } from '@/types/booking-pages';
import {
  type AdminBookingRequest,
  type BookingStatus,
} from '@/types/admin-bookings';

export type BookingFilter = 'all' | 'approved' | 'cancelled' | 'pending';
const filters: BookingFilter[] = ['all', 'pending', 'approved', 'cancelled'];

export function BookingCollection({
  bookings,
  isLoading,
  activeFilter,
  onFilterChange,
  onSelect,
  counts,
  isRefreshing = false,
  isLoadingMore = false,
  hasMore = false,
  onRefresh,
  onLoadMore,
  bottomPadding = 24,
  error,
  navScroll,
}: {
  bookings: AdminBookingRequest[];
  isLoading: boolean;
  activeFilter: BookingFilter;
  onFilterChange: (filter: BookingFilter) => void;
  onSelect: (booking: AdminBookingRequest) => void;
  counts?: BookingCounts | null;
  isRefreshing?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  bottomPadding?: number;
  error?: string | null;
  navScroll?: ClientNavScrollProps;
}) {
  const filteredBookings = bookings.filter((booking) =>
    isBookingInFilter(booking, activeFilter),
  );
  const total = counts?.all ?? bookings.length;
  const filteredTotal = counts ? activeFilter === 'cancelled' ? counts.closed : counts[activeFilter] : filteredBookings.length;
  return (
    <FlatList
      {...navScroll}
      style={{ flex: 1 }}
      contentContainerStyle={[responsiveStyles.content, { paddingBottom: bottomPadding }]}
      ListHeaderComponentStyle={{ gap: 16 }}
      data={isLoading ? [] : filteredBookings}
      keyExtractor={(booking) => booking.id}
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      windowSize={7}
      refreshing={!isLoading && isRefreshing}
      onRefresh={onRefresh}
      renderItem={({ item }) => <BookingCard booking={item} onPress={() => onSelect(item)} />}
      ListFooterComponent={hasMore ? <Pressable accessibilityRole="button" disabled={isRefreshing || isLoadingMore}
        onPress={onLoadMore} style={[styles.secondaryButton, { marginTop: 16 }]}>
        <Text style={styles.secondaryText}>{isLoadingMore ? 'Loading more…' : 'Load more'}</Text>
      </Pressable> : null}
      ListHeaderComponent={<>
      {error ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <BookingIcon name="camera" size={26} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.heading}>Your photo sessions</Text>
          <Text style={styles.subtitle}>
            Track requests, schedules, and studio updates.
          </Text>
        </View>
      </View>
      {(isLoading || total > 0) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((filter) => {
            const selected = filter === activeFilter;
            const count = counts ? filter === 'cancelled' ? counts.closed : counts[filter] : bookings.filter((booking) =>
              isBookingInFilter(booking, filter),
            ).length;
            return (
              <Pressable
                key={filter}
                accessibilityRole="button"
                accessibilityLabel={`${formatFilterLabel(filter)} bookings${isLoading ? '' : `, ${count}`}`}
                accessibilityState={{ selected }}
                onPress={() => onFilterChange(filter)}
                style={({ pressed }) => [
                  styles.filter,
                  selected && styles.activeFilter,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    selected && styles.activeFilterText,
                  ]}
                >
                  {formatFilterLabel(filter)}
                </Text>
                {!isLoading && (
                  <Text
                    style={[
                      styles.filterCount,
                      selected && styles.activeFilterCount,
                    ]}
                  >
                    {count}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {isLoading ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Loading bookings"
          style={styles.skeleton}
        >
          {[0, 1].map((item) => (
            <View
              key={item}
              style={[styles.card, { borderLeftColor: '#DCE5EE' }]}
            >
              <View style={styles.cardTop}>
                <View
                  style={[styles.thumbnail, { backgroundColor: '#E4EAF0' }]}
                />
                <View style={[styles.copy, { gap: 12 }]}>
                  <View style={styles.skeletonBadge} />
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, { width: '60%' }]} />
                </View>
              </View>
              <View style={[styles.schedule, { minHeight: 64 }]} />
            </View>
          ))}
        </View>
      ) : !total ? (
        error ? null : <BookingEmptyState />
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <View style={[styles.copy, { flexBasis: 120 }]}>
              <Text style={styles.sectionTitle}>
                {activeFilter === 'all'
                  ? 'All bookings'
                  : `${formatFilterLabel(activeFilter)} bookings`}
              </Text>
              <Text style={styles.subtitle}>
                {filteredTotal}{' '}
                {filteredTotal === 1 ? 'session' : 'sessions'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/services')}
              style={({ pressed }) => [
                styles.newBooking,
                pressed && styles.pressed,
              ]}
            >
              <BookingIcon name="plus" size={17} />
              <Text style={styles.linkText}>New booking</Text>
            </Pressable>
          </View>
          {!filteredBookings.length && !error ? (
            <View style={styles.filterEmpty}>
              <BookingIcon name="calendar" size={30} />
              <Text style={styles.heading}>
                No {formatFilterLabel(activeFilter).toLowerCase()} bookings
              </Text>
              <Text style={styles.body}>
                Your other sessions are still here. View all bookings to see
                them.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => onFilterChange('all')}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryText}>View all bookings</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </>}
    />
  );
}

function BookingEmptyState() {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyArt}>
        <Image
          source={require('@/assets/images/booking-empty-collage.png')}
          contentFit="contain"
          style={styles.collage}
        />
      </View>
      <View style={styles.emptyCopy}>
        <View style={styles.accent} />
        <Text style={styles.emptyTitle}>Your next memory starts here</Text>
        <Text style={styles.body}>
          From portraits to life&apos;s big celebrations, find a session that
          feels like you.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/services')}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.buttonText}>Explore Services</Text>
          <BookingIcon name="arrow" color="#FFFFFF" size={20} />
        </Pressable>
        <Text style={styles.subtitle}>
          Once you book, your schedule and studio updates will appear here.
        </Text>
      </View>
    </View>
  );
}

function BookingCard({
  booking,
  onPress,
}: {
  booking: AdminBookingRequest;
  onPress: () => void;
}) {
  const status = getBookingStatusStyle(booking.status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${booking.packageName}, ${status.label}, ${formatShortBookingDate(booking.bookingDate)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: status.accent },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardTop}>
        <Image
          source={getBookingImageSource(booking)}
          contentFit="cover"
          style={styles.thumbnail}
        />
        <View style={styles.copy}>
          <BookingBadge booking={booking} />
          <Text style={styles.packageTitle}>{booking.packageName}</Text>
          <Text style={styles.subtitle}>{booking.serviceName}</Text>
        </View>
      </View>
      <View style={styles.schedule}>
        <View style={styles.metaRow}>
          <BookingIcon name="calendar" size={18} />
          <Text style={styles.metaText}>
            {formatShortBookingDate(booking.bookingDate)}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <BookingIcon name="clock" size={18} />
          <Text style={styles.metaText}>
            {formatBookingTimeRange(booking.startTime, booking.endTime)}
          </Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.linkText}>View booking</Text>
        <View style={styles.chevron}>
          <BookingIcon name="arrow" size={16} />
        </View>
      </View>
    </Pressable>
  );
}

function BookingBadge({ booking }: { booking: AdminBookingRequest }) {
  const status = getBookingStatusStyle(booking.status);
  return (
    <View style={[styles.badge, { backgroundColor: status.background }]}>
      <View style={[styles.statusDot, { backgroundColor: status.color }]} />
      <Text style={[styles.badgeText, { color: status.color }]}>
        {status.label}
      </Text>
    </View>
  );
}

export function BookingDetailView({
  booking,
  isRescheduling,
  onCancel,
  onReschedule,
}: {
  booking: AdminBookingRequest;
  isRescheduling: boolean;
  onCancel: () => void;
  onReschedule: () => void;
}) {
  const status = getBookingStatusStyle(booking.status);
  const info = getStatusCopy(booking.status);
  const canCancel = booking.status === 'pending';
  const canReschedule =
    booking.status === 'pending' || booking.status === 'confirmed';
  return (
    <>
      <View style={styles.detailHero}>
        <Image
          source={getBookingImageSource(booking)}
          contentFit="cover"
          style={styles.detailImage}
        />
        <View style={styles.detailHeading}>
          <BookingBadge booking={booking} />
          <Text style={styles.detailTitle}>{booking.packageName}</Text>
          <Text style={styles.body}>{booking.serviceName}</Text>
        </View>
      </View>
      <View style={styles.detailCard}>
        <Text style={styles.sectionTitle}>Session details</Text>
        <DetailRow
          icon="calendar"
          label="Date"
          value={formatBookingDate(booking.bookingDate)}
        />
        <DetailRow
          icon="clock"
          label="Time"
          value={formatBookingTimeRange(booking.startTime, booking.endTime)}
        />
        {booking.shootLocation.trim() ? (
          <DetailRow
            icon="pin"
            label="Location"
            value={booking.shootLocation}
          />
        ) : null}
      </View>
      <View
        style={[
          styles.statusPanel,
          { backgroundColor: status.background, borderColor: status.border },
        ]}
      >
        <View style={styles.statusHeading}>
          <BookingIcon
            name={
              booking.status === 'confirmed' || booking.status === 'completed'
                ? 'check'
                : 'info'
            }
            color={status.color}
            size={23}
          />
          <Text style={[styles.statusTitle, { color: status.color }]}>
            {info.title}
          </Text>
        </View>
        <Text style={styles.body}>{info.message}</Text>
        {booking.status === 'rejected' && booking.rejectionReason ? (
          <Text style={styles.reason}>{booking.rejectionReason}</Text>
        ) : null}
      </View>
      {canCancel ? (
        <Pressable
          accessibilityRole="button"
          disabled={isRescheduling}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.secondaryButton,
            isRescheduling && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryText}>Cancel Request</Text>
        </Pressable>
      ) : canReschedule ? (
        <Pressable
          accessibilityRole="button"
          disabled={isRescheduling}
          onPress={onReschedule}
          style={({ pressed }) => [
            styles.primaryButton,
            isRescheduling && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <BookingIcon name="calendar" color="#FFFFFF" size={20} />
          <Text style={styles.buttonText}>
            {isRescheduling ? 'Opening...' : 'Reschedule'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/services')}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.buttonText}>Explore Services</Text>
          <BookingIcon name="arrow" color="#FFFFFF" size={20} />
        </Pressable>
      )}
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: BookingIconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <BookingIcon name={icon} size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function isBookingInFilter(
  booking: AdminBookingRequest,
  filter: BookingFilter,
) {
  if (filter === 'all') return true;
  if (filter === 'approved')
    return booking.status === 'confirmed' || booking.status === 'completed';
  if (filter === 'cancelled')
    return (
      booking.status === 'cancelled' ||
      booking.status === 'rejected' ||
      booking.status === 'expired'
    );
  return booking.status === 'pending';
}

function formatFilterLabel(filter: BookingFilter) {
  if (filter === 'all') return 'All';
  if (filter === 'approved') return 'Approved';
  if (filter === 'cancelled') return 'Closed';
  return 'Pending';
}

function getBookingImageSource(booking: AdminBookingRequest): ImageSource {
  if (booking.packageImageUrl) return { uri: booking.packageImageUrl };
  return (
    fallbackPortraitPackages.find(
      (item) => item.name.toLowerCase() === booking.packageName.toLowerCase(),
    )?.image ?? fallbackPortraitPackages[0].image
  );
}

function getBookingStatusStyle(status: BookingStatus) {
  if (status === 'confirmed' || status === 'completed')
    return {
      background: '#E7F4ED',
      border: '#BFDCCB',
      color: '#246344',
      accent: '#5C9878',
      label: status === 'completed' ? 'Completed' : 'Approved',
    };
  if (status === 'pending')
    return {
      background: '#FFF2DC',
      border: '#EAD5AF',
      color: '#815917',
      accent: '#C88A55',
      label: 'Pending',
    };
  if (status === 'rejected' || status === 'expired')
    return {
      background: '#FBEAE7',
      border: '#EACAC4',
      color: '#973E35',
      accent: '#C57D73',
      label: status === 'expired' ? 'Expired' : 'Rejected',
    };
  return {
    background: '#EDF0F4',
    border: '#D4DBE4',
    color: '#586579',
    accent: '#94A1B3',
    label: 'Cancelled',
  };
}

function getStatusCopy(status: BookingStatus) {
  if (status === 'pending')
    return {
      title: 'Waiting for studio confirmation',
      message: "We'll notify you as soon as the studio confirms your request.",
    };
  if (status === 'confirmed')
    return {
      title: 'You’re all set',
      message:
        'Your appointment is confirmed. Review your session details above before your shoot.',
    };
  if (status === 'completed')
    return {
      title: 'A memory made',
      message:
        'Your photo session has been completed. Thank you for booking with PhotoSync.',
    };
  if (status === 'rejected')
    return {
      title: 'Booking not approved',
      message:
        'The studio could not accept this request. You can choose another package or time slot.',
    };
  if (status === 'expired')
    return {
      title: 'This request has expired',
      message:
        'The scheduled time passed before the studio confirmed this request.',
    };
  return {
    title: 'Booking cancelled',
    message:
      'This booking was cancelled. You can explore our services whenever you’re ready for another session.',
  };
}

type BookingIconName =
  | 'arrow'
  | 'calendar'
  | 'camera'
  | 'check'
  | 'clock'
  | 'info'
  | 'pin'
  | 'plus';
function BookingIcon({
  name,
  size = 20,
  color = '#142C4C',
}: {
  name: BookingIconName;
  size?: number;
  color?: string;
}) {
  const paths: Record<BookingIconName, string> = {
    arrow: 'M5 12H19M13 6L19 12L13 18',
    calendar:
      'M7 3V7M17 3V7M4 10H20M5 5H19Q20 5 20 6V20Q20 21 19 21H5Q4 21 4 20V6Q4 5 5 5M8 14H10M14 14H16M8 17H10',
    camera:
      'M8 6L10 3H14L16 6H20Q22 6 22 8V19Q22 21 20 21H4Q2 21 2 19V8Q2 6 4 6ZM16 13A4 4 0 1 1 8 13A4 4 0 1 1 16 13',
    check: 'M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12M7 12L10 15L17 8',
    clock: 'M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12M12 6V12L16 15',
    info: 'M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12M12 11V17M12 7V7.1',
    pin: 'M20 10C20 16 12 22 12 22C12 22 4 16 4 10A8 8 0 1 1 20 10M15 10A3 3 0 1 1 9 10A3 3 0 1 1 15 10',
    plus: 'M12 5V19M5 12H19',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
