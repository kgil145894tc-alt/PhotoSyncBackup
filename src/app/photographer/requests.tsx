import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll as useNavScroll } from '@/hooks/use-client-nav-scroll';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { AdminBrandHeader } from '@/components/admin-brand-header';
import { usePagedAdminBookings } from '@/hooks/use-paged-admin-bookings';
import { formatShortBookingDate, formatBookingTimeRange } from '@/services/admin-bookings';
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
  const navHeight = useBottomNavHeight('admin');
  const navScroll = useNavScroll();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<'all' | BookingStatus>('pending');
  const [activeDateFilter, setActiveDateFilter] = useState<DateFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  const { requests, counts, error, isLoading, isRefreshing, isLoadingMore, hasMore, refresh, loadMore } =
    usePagedAdminBookings({ status: activeFilter, dateFilter: activeDateFilter, search });
  const bottomPadding = navHeight + insets.bottom + 24;
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.adminRequestsScreenContent}>
        <AdminBrandHeader
          textureSource={require('@/assets/images/admin-calendar-banner.png')}
          topInset={insets.top}
        />

        <View style={[styles.adminRequestsPanel, { paddingHorizontal: 0, paddingTop: 0 }]}>
          <FlatList
            {...navScroll}
            style={{ flex: 1 }}
            data={requests}
            keyExtractor={(request) => request.id}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
            refreshing={!isLoading && isRefreshing}
            onRefresh={refresh}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 25, paddingBottom: bottomPadding }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListHeaderComponent={<View style={{ paddingBottom: 8 }}>
          <Text style={styles.adminRequestsTitle}>Booking Requests</Text>
          <Text style={styles.adminRequestsSubtitle}>Review and manage client booking requests.</Text>
          {error ? <Text accessibilityRole="alert" style={styles.adminRequestsEmptyText}>{error}</Text> : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.adminRequestsStatusFilterScroller}
            contentContainerStyle={styles.adminRequestsFilterRow}>
            {filterOptions.map((filter) => {
              const isActive = activeFilter === filter;
              const count = counts?.[filter];

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={filter}
                  onPress={() => setActiveFilter(filter)}
                  style={({ pressed }) => [
                    styles.adminRequestsFilterPill,
                    isActive && styles.activeAdminRequestsFilterPill,
                    pressed && { opacity: 0.82 },
                  ]}>
                  <Text style={[styles.adminRequestsFilterText, isActive && styles.activeAdminRequestsFilterText]}>
                    {formatFilterLabel(filter)} ({count ?? '—'})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

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

          <View style={[styles.adminRequestsDateFilterScroller, styles.adminRequestsDateFilterRow]}>
            {dateFilterOptions.map((filter) => {
              const isActive = activeDateFilter === filter;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
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
          </View>

          </View>}
            ListEmptyComponent={<Text style={styles.adminRequestsEmptyText}>{isLoading
              ? 'Loading booking requests...' : error ? '' : 'No booking requests found.'}</Text>}
            ListFooterComponent={hasMore ? <Pressable accessibilityRole="button"
              disabled={isLoadingMore || isRefreshing} onPress={() => { void loadMore(); }}
              style={{ padding: 18, alignItems: 'center' }}>
              <Text style={styles.adminRequestsEmptyText}>{isLoadingMore ? 'Loading more…' : 'Load more'}</Text>
            </Pressable> : null}
            renderItem={({ item: request, index }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View booking for ${request.clientName}`}
                key={request.id}
                onPress={() => router.push(`/photographer/requests/${request.id}` as never)}
                style={({ pressed }) => [styles.adminRequestListCard, pressed && { opacity: 0.86 }]}>
                <Image
                  contentFit="cover"
                  source={request.packageImageUrl ? { uri: request.packageImageUrl } : requestThumbs[index % requestThumbs.length]}
                  style={styles.adminRequestListImage}
                />
                <View style={styles.adminRequestListCopy}>
                  <Text style={styles.adminRequestListName}>{request.clientName}</Text>
                  <Text style={styles.adminRequestListPackage}>{request.packageName}</Text>
                <View style={[styles.adminRequestStatusPill, getStatusPillStyle(request.status)]}>
                  <Text style={[styles.adminRequestStatusText, getStatusTextStyle(request.status)]}>
                    {formatFilterLabel(request.status)}
                  </Text>
                </View>
                  <Text style={styles.adminRequestListDate}>{formatRequestMeta(request)}</Text>
                </View>
                <ChevronRight />
              </Pressable>
            )}
          />
        </View>
      </View>
    </View>
  );
}

function formatRequestMeta(request: AdminBookingRequest) {
  return `${formatShortBookingDate(request.bookingDate)}\n${formatBookingTimeRange(request.startTime, request.endTime)}`;
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
