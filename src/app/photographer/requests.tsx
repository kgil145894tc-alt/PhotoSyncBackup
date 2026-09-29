import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { AdminBrandHeader } from '@/components/admin-brand-header';
import { formatShortBookingDate, getAdminBookingRequests } from '@/services/admin-bookings';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

const filterOptions: ('all' | BookingStatus)[] = ['all', 'pending', 'confirmed', 'completed', 'rejected'];
const dateFilterOptions: DateFilter[] = ['all', 'today', 'tomorrow', 'thisWeek', 'upcoming'];
const requestThumbs = [
  require('@/assets/images/admin-request-thumb-1.png'),
  require('@/assets/images/admin-request-thumb-2.png'),
  require('@/assets/images/admin-request-thumb-3.png'),
  require('@/assets/images/admin-request-thumb-4.png'),
  require('@/assets/images/admin-request-thumb-5.png'),
];

type DateFilter = 'all' | 'today' | 'tomorrow' | 'thisWeek' | 'upcoming';

export default function PhotographerRequestsScreen() {
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<'all' | BookingStatus>('pending');
  const [activeDateFilter, setActiveDateFilter] = useState<DateFilter>('all');
  const [requests, setRequests] = useState<AdminBookingRequest[]>([]);
  const [searchText, setSearchText] = useState('');
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        const matchesFilter = activeFilter === 'all' || request.status === activeFilter;
        const matchesDateFilter = isRequestInDateFilter(request.bookingDate, activeDateFilter);
        const searchValue = searchText.trim().toLowerCase();
        const matchesSearch =
          !searchValue ||
          request.clientName.toLowerCase().includes(searchValue) ||
          request.serviceName.toLowerCase().includes(searchValue) ||
          request.packageName.toLowerCase().includes(searchValue) ||
          formatShortBookingDate(request.bookingDate).toLowerCase().includes(searchValue);

        return matchesFilter && matchesDateFilter && matchesSearch;
      }),
    [activeDateFilter, activeFilter, requests, searchText],
  );
  const loadRequests = useCallback(async (isMounted: () => boolean = () => true) => {
    const items = await getAdminBookingRequests();

    if (isMounted()) {
      setRequests(items);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void loadRequests(() => isMounted);

      return () => {
        isMounted = false;
      };
    }, [loadRequests]),
  );

  useEffect(
    () =>
      subscribeToBookingsChanged(() => {
        void loadRequests();
      }),
    [loadRequests],
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.adminRequestsScreenContent}>
        <AdminBrandHeader
          textureSource={require('@/assets/images/admin-calendar-banner.png')}
          topInset={insets.top}
        />

        <View style={styles.adminRequestsPanel}>
          <Image
            contentFit="cover"
            source={require('@/assets/images/admin-requests-bg.png')}
            style={styles.adminRequestsPanelBackground}
          />
          <Text style={styles.adminRequestsTitle}>Booking Requests</Text>
          <Text style={styles.adminRequestsSubtitle}>Review and manage client booking requests.</Text>

          <View style={styles.adminRequestsFilterRow}>
            {filterOptions.map((filter) => {
              const isActive = activeFilter === filter;
              const count = filter === 'all' ? requests.length : requests.filter((request) => request.status === filter).length;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={filter}
                  onPress={() => setActiveFilter(filter)}
                  style={({ pressed }) => [
                    styles.adminRequestsFilterPill,
                    isActive && styles.activeAdminRequestsFilterPill,
                    pressed && { opacity: 0.82 },
                  ]}>
                  <Text style={[styles.adminRequestsFilterText, isActive && styles.activeAdminRequestsFilterText]}>
                    {formatFilterLabel(filter)} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.adminRequestsSearchRow}>
            <View style={styles.adminRequestsSearchBox}>
              <SearchIcon />
              <TextInput
                accessibilityLabel="Search booking requests"
                onChangeText={setSearchText}
                placeholder="Search client name, service, date..."
                placeholderTextColor="rgba(76, 94, 118, 0.7)"
                style={styles.adminRequestsSearchInput}
                value={searchText}
              />
            </View>
            <Pressable
              accessibilityLabel={`Filter by date: ${formatDateFilterLabel(activeDateFilter)}`}
              accessibilityRole="button"
              onPress={() => setActiveDateFilter(getNextDateFilter(activeDateFilter))}
              style={({ pressed }) => [
                styles.adminRequestsFilterButton,
                activeDateFilter !== 'all' && styles.activeAdminRequestsDateFilterButton,
                pressed && { opacity: 0.82 },
              ]}>
              <FilterIcon active={activeDateFilter !== 'all'} />
            </Pressable>
          </View>

          <ScrollView
            bounces={false}
            contentContainerStyle={styles.adminRequestsDateFilterRow}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.adminRequestsDateFilterScroller}>
            {dateFilterOptions.map((filter) => {
              const isActive = activeDateFilter === filter;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={filter}
                  onPress={() => setActiveDateFilter(filter)}
                  style={({ pressed }) => [
                    styles.adminRequestsDateFilterPill,
                    isActive && styles.activeAdminRequestsDateFilterPill,
                    pressed && { opacity: 0.82 },
                  ]}>
                  <Text
                    style={[
                      styles.adminRequestsDateFilterText,
                      isActive && styles.activeAdminRequestsDateFilterText,
                    ]}>
                    {formatDateFilterLabel(filter)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            bounces={false}
            contentContainerStyle={[styles.adminRequestsList, { paddingBottom: bottomPadding }]}
            showsVerticalScrollIndicator={false}
            style={styles.adminRequestsListScroller}>
            {filteredRequests.length === 0 && (
              <Text style={styles.adminRequestsEmptyText}>No booking requests found.</Text>
            )}
            {filteredRequests.map((request, index) => (
              <Pressable
                accessibilityRole="button"
                key={request.id}
                onPress={() => router.push(`/photographer/requests/${request.id}` as never)}
                style={({ pressed }) => [styles.adminRequestListCard, pressed && { opacity: 0.86 }]}>
                <Image
                  contentFit="cover"
                  source={request.packageImageUrl ? { uri: request.packageImageUrl } : requestThumbs[index % requestThumbs.length]}
                  style={styles.adminRequestListImage}
                />
                <View style={styles.adminRequestListCopy}>
                  <Text numberOfLines={1} style={styles.adminRequestListName}>{request.clientName}</Text>
                  <Text numberOfLines={1} style={styles.adminRequestListPackage}>{request.packageName}</Text>
                  <Text numberOfLines={1} style={styles.adminRequestListDate}>{formatRequestMeta(request)}</Text>
                </View>
                <View style={[styles.adminRequestStatusPill, getStatusPillStyle(request.status)]}>
                  <Text style={[styles.adminRequestStatusText, getStatusTextStyle(request.status)]}>
                    {formatFilterLabel(request.status)}
                  </Text>
                </View>
                <ChevronRight />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function formatRequestMeta(request: AdminBookingRequest) {
  return formatShortBookingDate(request.bookingDate);
}

function getStatusPillStyle(status: BookingStatus) {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return styles.confirmedRequestStatusPill;
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return styles.rejectedRequestStatusPill;
    default:
      return styles.pendingRequestStatusPill;
  }
}

function getStatusTextStyle(status: BookingStatus) {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return styles.confirmedRequestStatusText;
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return styles.rejectedRequestStatusText;
    default:
      return styles.pendingRequestStatusText;
  }
}

function formatFilterLabel(status: 'all' | BookingStatus) {
  if (status === 'all') return 'All';

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDateFilterLabel(filter: DateFilter) {
  switch (filter) {
    case 'today':
      return 'Today';
    case 'tomorrow':
      return 'Tomorrow';
    case 'thisWeek':
      return 'This week';
    case 'upcoming':
      return 'Upcoming';
    default:
      return 'All dates';
  }
}

function getNextDateFilter(currentFilter: DateFilter) {
  const currentIndex = dateFilterOptions.indexOf(currentFilter);
  return dateFilterOptions[(currentIndex + 1) % dateFilterOptions.length];
}

function isRequestInDateFilter(bookingDate: string, filter: DateFilter) {
  if (filter === 'all') return true;

  const today = getDateKey(new Date());

  if (filter === 'today') {
    return bookingDate === today;
  }

  if (filter === 'tomorrow') {
    return bookingDate === getOffsetDateKey(1);
  }

  if (filter === 'upcoming') {
    return bookingDate >= today;
  }

  const { endOfWeek, startOfWeek } = getCurrentWeekRange();
  return bookingDate >= startOfWeek && bookingDate <= endOfWeek;
}

function getCurrentWeekRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);

  return {
    endOfWeek: getDateKey(end),
    startOfWeek: getDateKey(start),
  };
}

function getOffsetDateKey(daysFromToday: number) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromToday);

  return getDateKey(target);
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function SearchIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Circle cx={9.8} cy={9.8} r={6.3} stroke="#142C4C" strokeWidth={2} />
      <Path d="M14.5 14.5L19 19" stroke="#142C4C" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function FilterIcon({ active = false }: { active?: boolean }) {
  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
      <Path
        d="M5 7H20M8 12.5H17M10.5 18H14.5"
        stroke={active ? '#ffffff' : '#8AA3C3'}
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5.5L15 12L9 18.5" stroke="#111111" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}
