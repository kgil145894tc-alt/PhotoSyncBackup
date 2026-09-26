import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { formatShortBookingDate, getAdminBookingRequests } from '@/services/admin-bookings';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

const filterOptions: ('all' | BookingStatus)[] = ['all', 'pending', 'confirmed', 'completed', 'expired', 'rejected', 'cancelled'];

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

  useFocusEffect(
    useCallback(() => {
    let isMounted = true;

    getAdminBookingRequests().then((items) => {
      if (isMounted) {
        setRequests(items);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []));

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.adminRequestContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.adminPageTitle}>Booking Requests</Text>
        <Text style={styles.adminPageSubtitle}>Review and manage client booking requests.</Text>

        <ScrollView
          bounces={false}
          contentContainerStyle={styles.requestFilterContent}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {filterOptions.map((filter) => {
            const isActive = activeFilter === filter;
            const count = filter === 'all' ? requests.length : requests.filter((request) => request.status === filter).length;

            return (
            <Pressable
              accessibilityRole="button"
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={[styles.requestFilterPill, isActive && styles.activeRequestFilter]}>
              <Text style={[styles.requestFilterText, isActive && styles.activeRequestFilterText]}>
                {formatFilterLabel(filter)} ({count})
              </Text>
            </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.requestSearchRow}>
          <View style={styles.requestSearchBox}>
            <SearchIcon />
            <TextInput
              accessibilityLabel="Search booking requests"
              onChangeText={setSearchText}
              placeholder="Search client name, service, or date..."
              placeholderTextColor="#8AA3C3"
              style={styles.requestSearchInput}
              value={searchText}
            />
          </View>
          <Pressable accessibilityLabel="Filter requests" accessibilityRole="button" style={styles.requestFilterButton}>
            <FilterIcon />
          </Pressable>
        </View>

        <View style={styles.requestList}>
          {filteredRequests.length === 0 && (
            <Text style={styles.requestDate}>No booking requests found.</Text>
          )}
          {filteredRequests.map((request) => (
            <Pressable
              accessibilityRole="button"
              key={request.id}
              onPress={() => router.push(`/photographer/requests/${request.id}` as never)}
              style={({ pressed }) => [styles.requestCard, pressed && { opacity: 0.86 }]}>
              <View style={styles.requestAvatar}>
                <Text style={styles.requestAvatarText}>{request.clientName[0]}</Text>
              </View>
              <View style={styles.requestCopy}>
                <Text style={styles.requestName}>{request.clientName}</Text>
                <Text style={styles.requestPackage}>{request.packageName}</Text>
                <Text style={styles.requestDate}>{formatShortBookingDate(request.bookingDate)}</Text>
              </View>
              <View style={styles.pendingPill}>
                <Text style={styles.pendingPillText}>{formatFilterLabel(request.status)}</Text>
              </View>
              <ChevronRight />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function formatFilterLabel(status: 'all' | BookingStatus) {
  if (status === 'all') return 'All';

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function SearchIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Circle cx={9.8} cy={9.8} r={6.3} stroke="#8AA3C3" strokeWidth={2.2} />
      <Path d="M14.5 14.5L19 19" stroke="#8AA3C3" strokeLinecap="round" strokeWidth={2.2} />
    </Svg>
  );
}

function FilterIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M4 6H20L14 13V19L10 21V13L4 6Z" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.1} />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M7 4L11 9L7 14" stroke="#8AA3C3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}
