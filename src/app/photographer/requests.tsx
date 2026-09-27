import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { formatShortBookingDate, getAdminBookingRequests } from '@/services/admin-bookings';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

const filterOptions: ('all' | BookingStatus)[] = ['all', 'pending', 'confirmed', 'rejected'];
const requestThumbs = [
  require('@/assets/images/admin-request-thumb-1.png'),
  require('@/assets/images/admin-request-thumb-2.png'),
  require('@/assets/images/admin-request-thumb-3.png'),
  require('@/assets/images/admin-request-thumb-4.png'),
  require('@/assets/images/admin-request-thumb-5.png'),
];

export default function PhotographerRequestsScreen() {
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<'all' | BookingStatus>('pending');
  const [requests, setRequests] = useState<AdminBookingRequest[]>([]);
  const [searchText, setSearchText] = useState('');
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        const matchesFilter = activeFilter === 'all' || request.status === activeFilter;
        const searchValue = searchText.trim().toLowerCase();
        const matchesSearch =
          !searchValue ||
          request.clientName.toLowerCase().includes(searchValue) ||
          request.serviceName.toLowerCase().includes(searchValue) ||
          request.packageName.toLowerCase().includes(searchValue) ||
          formatShortBookingDate(request.bookingDate).toLowerCase().includes(searchValue);

        return matchesFilter && matchesSearch;
      }),
    [activeFilter, requests, searchText],
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
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.adminRequestsScreenContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.adminRequestsHeroHeader, { paddingTop: insets.top }]}>
          <Image
            contentFit="cover"
            source={require('@/assets/images/admin-requests-header-camera.png')}
            style={styles.adminRequestsHeaderCamera}
          />
          <View style={styles.adminRequestsHeaderBrand}>
            <Text style={styles.adminRequestsHeaderBrandText}>PhotoSync</Text>
            <Image
              contentFit="contain"
              source={require('@/assets/images/admin-calendar-logo.png')}
              style={styles.adminRequestsHeaderLogo}
            />
          </View>
        </View>

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
              accessibilityLabel="Filter requests"
              accessibilityRole="button"
              style={({ pressed }) => [styles.adminRequestsFilterButton, pressed && { opacity: 0.82 }]}>
              <FilterIcon />
            </Pressable>
          </View>

          <View style={styles.adminRequestsList}>
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
          </View>
        </View>
      </ScrollView>
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

function SearchIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Circle cx={9.8} cy={9.8} r={6.3} stroke="#142C4C" strokeWidth={2} />
      <Path d="M14.5 14.5L19 19" stroke="#142C4C" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function FilterIcon() {
  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
      <Path d="M5 7H20M8 12.5H17M10.5 18H14.5" stroke="#8AA3C3" strokeLinecap="round" strokeWidth={2} />
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
