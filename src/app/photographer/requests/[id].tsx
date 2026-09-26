import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import {
  formatBookingDate,
  formatBookingTimeRange,
  getAdminBookingRequest,
  updateAdminBookingStatus,
} from '@/services/admin-bookings';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

export default function PhotographerRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [booking, setBooking] = useState<AdminBookingRequest | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRejectModalVisible, setIsRejectModalVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const canUpdate = booking?.status === 'pending' && !isUpdating;
  const canComplete = booking?.status === 'confirmed' && !isUpdating;

  async function loadBooking() {
    if (id) {
      setBooking(await getAdminBookingRequest(id));
    }
  }

  useEffect(() => {
    let isMounted = true;

    if (id) {
      getAdminBookingRequest(id).then((item) => {
        if (isMounted) {
          setBooking(item);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [id]);

  async function handleStatusUpdate(status: Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'>, reason?: string | null) {
    if (!booking || (status === 'completed' ? booking.status !== 'confirmed' : booking.status !== 'pending')) {
      Alert.alert(
        'Request already updated',
        status === 'completed' ? 'This booking is no longer confirmed.' : 'This booking request is no longer pending.',
      );
      await loadBooking();
      return;
    }

    if (status === 'rejected' && !reason?.trim()) {
      Alert.alert('Reason required', 'Please enter a short reason before rejecting this request.');
      return;
    }

    setIsUpdating(true);
    const result = await updateAdminBookingStatus(booking.id, status, reason);

    if (!result.success) {
      setIsUpdating(false);
      await loadBooking();
      Alert.alert('Request not updated', result.message ?? 'Please try again.');
      return;
    }

    await loadBooking();
    setIsUpdating(false);
    setIsRejectModalVisible(false);
    setRejectionReason('');
    Alert.alert('Request updated', getUpdateSuccessMessage(status));
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.requestDetailContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.detailTopBar}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={styles.detailIconButton}>
            <BackIcon />
          </Pressable>
          <View style={styles.detailBrand}>
            <Text style={styles.detailBrandText}>PhotoSync</Text>
            <CameraIcon />
          </View>
          <View style={styles.detailIconButton} />
        </View>

        {!booking && <Text style={styles.requestDate}>Loading booking request...</Text>}

        {booking && (
          <>
            {(() => {
              const hasSessionDetails = Boolean(
                booking.shootLocation || booking.sessionTheme || booking.peopleCount || booking.specialRequests,
              );

              return (
                <>
            <View style={[styles.detailPendingPill, getStatusPillStyle(booking.status)]}>
              <Text style={[styles.detailPendingText, getStatusTextStyle(booking.status)]}>{formatStatusLabel(booking.status)}</Text>
            </View>

            <View style={styles.clientHeaderRow}>
              <View style={styles.detailAvatar}>
                <Text style={styles.detailAvatarText}>{booking.clientName[0]}</Text>
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{booking.clientName}</Text>
                <View style={styles.clientInfoRow}>
                  <PhoneIcon />
                  <Text style={styles.clientMeta}>{booking.clientPhone}</Text>
                </View>
                <View style={styles.clientInfoRow}>
                  <MailIcon />
                  <Text style={styles.clientMeta}>{booking.clientEmail}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.detailSectionTitle}>Requested Service</Text>
            <View style={styles.serviceDetailRow}>
              <View style={styles.serviceImagePlaceholder}>
                <CameraIcon />
              </View>
              <View style={styles.serviceDetailCopy}>
                <Text style={styles.serviceDetailTitle}>{booking.packageName}</Text>
                <Text style={styles.serviceDetailPrice}>
                  ₱{booking.packagePrice.toLocaleString('en-PH')}
                </Text>
                {(booking.packageInclusions.length ? booking.packageInclusions : [booking.serviceName]).map((item) => (
                  <Text key={item} style={styles.serviceBullet}>•   {item}</Text>
                ))}
              </View>
            </View>

            <Text style={styles.detailSectionTitle}>Preferred Date & Time</Text>
            <View style={styles.dateTimeRow}>
              <View style={styles.dateTimePill}>
                <CalendarSmallIcon />
                <Text style={styles.dateTimeText}>{formatBookingDate(booking.bookingDate)}</Text>
              </View>
              <View style={styles.dateTimePill}>
                <ClockIcon />
                <Text style={styles.dateTimeText}>
                  {formatBookingTimeRange(booking.startTime, booking.endTime)}
                </Text>
              </View>
            </View>

            <Text style={styles.detailSectionTitle}>Session Details</Text>
            <View style={styles.notesBox}>
              <SessionDetailRow label="Shoot Location" value={booking.shootLocation} />
              <SessionDetailRow label="Theme / Concept" value={booking.sessionTheme} />
              <SessionDetailRow label="Number of People" value={booking.peopleCount} />
              {booking.specialRequests ? (
                <View style={styles.sessionDetailBlock}>
                  <Text style={styles.sessionDetailLabel}>Special Requests</Text>
                  <Text style={styles.notesText}>{booking.specialRequests}</Text>
                </View>
              ) : null}
              {!hasSessionDetails ? <Text style={styles.notesText}>No session details provided.</Text> : null}
            </View>

            {booking.status === 'pending' ? (
              <View style={styles.detailActionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canUpdate}
                  onPress={() => setIsRejectModalVisible(true)}
                  style={({ pressed }) => [styles.rejectButton, (pressed || !canUpdate) && { opacity: 0.82 }]}>
                  <Text style={styles.rejectButtonText}>{isUpdating ? 'Updating...' : 'Reject Request'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canUpdate}
                  onPress={() => handleStatusUpdate('confirmed')}
                  style={({ pressed }) => [styles.confirmButton, (pressed || !canUpdate) && { opacity: 0.82 }]}>
                  <Text style={styles.confirmButtonText}>
                    {isUpdating ? 'Updating...' : 'Confirm Request'}
                  </Text>
                </Pressable>
              </View>
            ) : booking.status === 'confirmed' ? (
              <>
                <View style={styles.resolvedRequestPanel}>
                  <Text style={styles.resolvedRequestTitle}>{getResolvedStatusTitle(booking.status)}</Text>
                  <Text style={styles.resolvedRequestText}>{getResolvedStatusMessage(booking.status)}</Text>
                </View>
                <View style={styles.detailActionRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canComplete}
                    onPress={() => handleStatusUpdate('completed')}
                    style={({ pressed }) => [styles.confirmButton, (pressed || !canComplete) && { opacity: 0.82 }]}>
                    <Text style={styles.confirmButtonText}>
                      {isUpdating ? 'Updating...' : 'Mark Completed'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.resolvedRequestPanel}>
                <Text style={styles.resolvedRequestTitle}>{getResolvedStatusTitle(booking.status)}</Text>
                <Text style={styles.resolvedRequestText}>{getResolvedStatusMessage(booking.status)}</Text>
                {booking.status === 'rejected' && booking.rejectionReason ? (
                  <View style={styles.rejectionReasonBox}>
                    <Text style={styles.rejectionReasonLabel}>Reason</Text>
                    <Text style={styles.rejectionReasonText}>{booking.rejectionReason}</Text>
                  </View>
                ) : null}
              </View>
            )}
                </>
              );
            })()}
          </>
        )}
      </ScrollView>

      <Modal animationType="fade" onRequestClose={() => setIsRejectModalVisible(false)} transparent visible={isRejectModalVisible}>
        <View style={styles.rejectModalOverlay}>
          <View style={styles.rejectModalCard}>
            <Text style={styles.rejectModalTitle}>Reject request</Text>
            <Text style={styles.rejectModalMessage}>Add a short reason so the client understands what to do next.</Text>
            <TextInput
              accessibilityLabel="Rejection reason"
              multiline
              onChangeText={setRejectionReason}
              placeholder="Example: Please choose another date or time."
              placeholderTextColor="#8AA3C3"
              style={styles.rejectReasonInput}
              value={rejectionReason}
            />
            <View style={styles.rejectModalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isUpdating}
                onPress={() => {
                  setIsRejectModalVisible(false);
                  setRejectionReason('');
                }}
                style={styles.rejectModalCancelButton}>
                <Text style={styles.rejectModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isUpdating}
                onPress={() => handleStatusUpdate('rejected', rejectionReason)}
                style={[styles.rejectModalSubmitButton, isUpdating && { opacity: 0.75 }]}>
                <Text style={styles.rejectModalSubmitText}>{isUpdating ? 'Rejecting...' : 'Reject'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SessionDetailRow({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <View style={styles.sessionDetailRow}>
      <Text style={styles.sessionDetailLabel}>{label}</Text>
      <Text style={styles.sessionDetailValue}>{value}</Text>
    </View>
  );
}

function formatStatusLabel(status: BookingStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusPillStyle(status: BookingStatus) {
  if (status === 'completed' || status === 'confirmed') {
    return styles.detailConfirmedPill;
  }

  if (status === 'expired' || status === 'rejected' || status === 'cancelled') {
    return styles.detailRejectedPill;
  }

  return styles.detailPendingPill;
}

function getStatusTextStyle(status: BookingStatus) {
  if (status === 'completed' || status === 'confirmed') {
    return styles.detailConfirmedText;
  }

  if (status === 'expired' || status === 'rejected' || status === 'cancelled') {
    return styles.detailRejectedText;
  }

  return styles.detailPendingText;
}

function getUpdateSuccessMessage(status: Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'>) {
  if (status === 'completed') {
    return 'Booking marked completed. The client has been notified.';
  }

  return status === 'confirmed'
    ? 'Booking request confirmed. The client has been notified and the time slot is now booked.'
    : 'Booking request rejected. The client has been notified.';
}

function getResolvedStatusTitle(status: BookingStatus) {
  if (status === 'completed') {
    return 'This booking is completed';
  }

  if (status === 'confirmed') {
    return 'This request is confirmed';
  }

  if (status === 'rejected') {
    return 'This request is rejected';
  }

  if (status === 'expired') {
    return 'This request expired';
  }

  return 'This request is cancelled';
}

function getResolvedStatusMessage(status: BookingStatus) {
  if (status === 'completed') {
    return 'The session has been marked finished.';
  }

  if (status === 'confirmed') {
    return 'The selected date and time appears as booked on the calendar.';
  }

  if (status === 'rejected') {
    return 'No further action is needed unless the client submits a new request.';
  }

  if (status === 'expired') {
    return 'The requested time has already passed, so this request can no longer be confirmed.';
  }

  return 'No further action is available for this booking.';
}

function BackIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={30} height={24} viewBox="0 0 30 24" fill="none">
      <Path d="M26.3 5.7H21.8L20.6 3C20.4 2.5 19.9 2.2 19.4 2.2H10.6C10.1 2.2 9.6 2.5 9.4 3L8.2 5.7H3.7C2.5 5.7 1.5 6.7 1.5 7.9V20.1C1.5 21.3 2.5 22.3 3.7 22.3H26.3C27.5 22.3 28.5 21.3 28.5 20.1V7.9C28.5 6.7 27.5 5.7 26.3 5.7Z" stroke="#142C4C" strokeLinejoin="round" strokeWidth={2.2} />
      <Circle cx={15} cy={14} r={5} stroke="#142C4C" strokeWidth={2.2} />
    </Svg>
  );
}

function PhoneIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4L10 7L8.7 9.2C9.8 11.6 12.4 14.2 14.8 15.3L17 14L20 17C20.4 17.4 20.4 18 20 18.4L18.5 19.9C17.8 20.6 16.8 20.8 15.9 20.4C9.9 18.1 5.9 14.1 3.6 8.1C3.2 7.2 3.4 6.2 4.1 5.5L5.6 4C6 3.6 6.6 3.6 7 4Z" stroke="#8AA3C3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function MailIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={6} width={18} height={12} rx={2} stroke="#8AA3C3" strokeWidth={2} />
      <Path d="M4.5 8L12 13.5L19.5 8" stroke="#8AA3C3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function CalendarSmallIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5.5} width={16} height={14} rx={2} stroke="#8AA3C3" strokeWidth={2} />
      <Path d="M8 3.5V7M16 3.5V7M4 10H20" stroke="#8AA3C3" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke="#8AA3C3" strokeWidth={2} />
      <Path d="M12 7.5V12L15 14" stroke="#8AA3C3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}
