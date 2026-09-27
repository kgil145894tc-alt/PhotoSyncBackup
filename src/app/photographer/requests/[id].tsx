import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import {
  formatStatusLabel,
  getAdditionalNotes,
  getBookingDateLabel,
  getBookingDurationLabel,
  getBookingInclusions,
  getBookingTimeLabel,
  getBookingWeekday,
  getResolvedStatusMessage,
  getResolvedStatusTitle,
  hasSessionDetails,
} from '@/features/photographer/booking-detail/display';
import { getAdminBookingRequest, updateAdminBookingStatus } from '@/services/admin-bookings';
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
  const [successModal, setSuccessModal] = useState<Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'> | null>(null);
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
    setSuccessModal(status);
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.adminBookingDetailContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.adminBookingDetailHeader, { paddingTop: insets.top }]}>
          <Image contentFit="cover" source={require('@/assets/images/admin-booking-detail-camera.png')} style={styles.adminBookingDetailHeaderCamera} />
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.adminBookingDetailBackButton, pressed && { opacity: 0.78 }]}>
            <BackIcon />
          </Pressable>
          <View style={styles.adminBookingDetailBrand}>
            <Text style={styles.adminBookingDetailBrandText}>PhotoSync</Text>
            <Image contentFit="contain" source={require('@/assets/images/admin-calendar-logo.png')} style={styles.adminBookingDetailBrandLogo} />
          </View>
        </View>

        <View style={styles.adminBookingDetailPanel}>
          <Image contentFit="cover" source={require('@/assets/images/admin-booking-detail-background.png')} style={styles.adminBookingDetailBackground} />

          {!booking && <Text style={styles.adminBookingDetailLoading}>Loading booking request...</Text>}

          {booking && (
            <>
              <View style={[styles.adminBookingDetailStatusPill, getStatusPillStyle(booking.status)]}>
                <StatusIcon status={booking.status} />
                <Text style={[styles.adminBookingDetailStatusText, getStatusTextStyle(booking.status)]}>
                  {formatStatusLabel(booking.status)}
                </Text>
              </View>

              <View style={styles.adminBookingDetailClientBlock}>
                <Image contentFit="contain" source={require('@/assets/images/admin-booking-detail-avatar.png')} style={styles.adminBookingDetailAvatar} />
                <View style={styles.adminBookingDetailClientCopy}>
                  <Text numberOfLines={1} style={styles.adminBookingDetailClientName}>{booking.clientName}</Text>
                  <View style={styles.adminBookingDetailContactRow}>
                    <PhoneIcon />
                    <Text numberOfLines={1} style={styles.adminBookingDetailContactText}>{booking.clientPhone}</Text>
                  </View>
                  <View style={styles.adminBookingDetailContactRow}>
                    <MailIcon />
                    <Text numberOfLines={1} style={styles.adminBookingDetailContactText}>{booking.clientEmail}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.adminBookingDetailSectionTitle}>Requested Service</Text>
              <View style={styles.adminBookingDetailServiceCard}>
                <Image
                  contentFit="cover"
                  source={booking.packageImageUrl ? { uri: booking.packageImageUrl } : require('@/assets/images/admin-booking-detail-service.png')}
                  style={styles.adminBookingDetailServiceImage}
                />
                <View style={styles.adminBookingDetailServiceCopy}>
                  <Text numberOfLines={2} style={styles.adminBookingDetailServiceTitle}>{booking.packageName}</Text>
                  <Text style={styles.adminBookingDetailServicePrice}>P{booking.packagePrice.toLocaleString('en-PH')}</Text>
                  {getBookingInclusions(booking).slice(0, 5).map((item) => (
                    <View key={item} style={styles.adminBookingDetailInclusionRow}>
                      <InclusionIcon />
                      <Text numberOfLines={1} style={styles.adminBookingDetailInclusionText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <Text style={styles.adminBookingDetailSectionTitle}>Preferred Date & Time</Text>
              <View style={styles.adminBookingDetailDateTimeRow}>
                <View style={styles.adminBookingDetailDateTimeCard}>
                  <CalendarSmallIcon />
                  <View style={styles.adminBookingDetailDateTimeCopy}>
                    <Text numberOfLines={1} style={styles.adminBookingDetailDateTimePrimary}>{getBookingDateLabel(booking)}</Text>
                    <Text numberOfLines={1} style={styles.adminBookingDetailDateTimeSecondary}>{getBookingWeekday(booking)}</Text>
                  </View>
                </View>
                <View style={styles.adminBookingDetailDateTimeCard}>
                  <ClockIcon />
                  <View style={styles.adminBookingDetailDateTimeCopy}>
                    <Text numberOfLines={1} style={styles.adminBookingDetailDateTimePrimary}>{getBookingTimeLabel(booking)}</Text>
                    <Text numberOfLines={1} style={styles.adminBookingDetailDateTimeSecondary}>{getBookingDurationLabel(booking)}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.adminBookingDetailSectionTitle}>Additional Notes</Text>
              <View style={styles.adminBookingDetailNotesBox}>
                <DocIcon />
                <Text style={styles.adminBookingDetailNotesText}>{getAdditionalNotes(booking)}</Text>
              </View>

              {hasSessionDetails(booking) ? (
                <View style={styles.adminBookingDetailMetaPanel}>
                  <SessionDetailRow label="Shoot Location" value={booking.shootLocation} />
                  <SessionDetailRow label="Theme / Concept" value={booking.sessionTheme} />
                  <SessionDetailRow label="Number of People" value={booking.peopleCount} />
                </View>
              ) : null}

              {booking.status === 'pending' ? (
                <View style={styles.adminBookingDetailActionRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canUpdate}
                    onPress={() => setIsRejectModalVisible(true)}
                    style={({ pressed }) => [styles.adminBookingDetailRejectButton, (pressed || !canUpdate) && { opacity: 0.82 }]}>
                    <RejectIcon />
                    <Text style={styles.adminBookingDetailRejectText}>{isUpdating ? 'Updating...' : 'Reject Request'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canUpdate}
                    onPress={() => handleStatusUpdate('confirmed')}
                    style={({ pressed }) => [styles.adminBookingDetailConfirmButton, (pressed || !canUpdate) && { opacity: 0.82 }]}>
                    <CheckIcon />
                    <Text style={styles.adminBookingDetailConfirmText}>{isUpdating ? 'Updating...' : 'Confirm Request'}</Text>
                  </Pressable>
                </View>
              ) : booking.status === 'confirmed' ? (
                <>
                  <ResolvedRequestPanel booking={booking} />
                  <View style={styles.adminBookingDetailActionRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!canComplete}
                      onPress={() => handleStatusUpdate('completed')}
                      style={({ pressed }) => [styles.adminBookingDetailConfirmButton, (pressed || !canComplete) && { opacity: 0.82 }]}>
                      <CheckIcon />
                      <Text style={styles.adminBookingDetailConfirmText}>{isUpdating ? 'Updating...' : 'Mark Completed'}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <ResolvedRequestPanel booking={booking} />
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal animationType="fade" onRequestClose={() => setIsRejectModalVisible(false)} transparent visible={isRejectModalVisible}>
        <View style={styles.bookingDecisionModalOverlay}>
          <View style={styles.bookingDecisionModalCard}>
            <Pressable
              accessibilityLabel="Close reject request modal"
              accessibilityRole="button"
              disabled={isUpdating}
              onPress={() => setIsRejectModalVisible(false)}
              style={({ pressed }) => [styles.bookingDecisionModalClose, pressed && { opacity: 0.75 }]}>
              <ModalCloseIcon />
            </Pressable>
            <View style={styles.bookingDecisionWarningIconWrap}>
              <WarningIcon />
            </View>
            <Text style={styles.bookingDecisionModalTitle}>Reject this booking request?</Text>
            <Text style={styles.bookingDecisionModalMessage}>This action cannot be undone.</Text>
            <TextInput
              accessibilityLabel="Rejection reason"
              multiline
              onChangeText={setRejectionReason}
              placeholder="Example: Please choose another date or time."
              placeholderTextColor="#8AA3C3"
              style={styles.bookingDecisionReasonInput}
              value={rejectionReason}
            />
            <View style={styles.bookingDecisionModalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isUpdating}
                onPress={() => {
                  setIsRejectModalVisible(false);
                  setRejectionReason('');
                }}
                style={({ pressed }) => [styles.bookingDecisionCancelButton, pressed && { opacity: 0.82 }]}>
                <Text style={styles.bookingDecisionCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isUpdating}
                onPress={() => handleStatusUpdate('rejected', rejectionReason)}
                style={({ pressed }) => [styles.bookingDecisionRejectButton, (pressed || isUpdating) && { opacity: 0.75 }]}>
                <Text style={styles.bookingDecisionRejectText}>{isUpdating ? 'Rejecting...' : 'Reject'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setSuccessModal(null)} transparent visible={successModal !== null}>
        <View style={styles.bookingDecisionModalOverlay}>
          <View style={styles.bookingDecisionModalCard}>
            <Pressable
              accessibilityLabel="Close booking confirmation"
              accessibilityRole="button"
              onPress={() => setSuccessModal(null)}
              style={({ pressed }) => [styles.bookingDecisionModalClose, pressed && { opacity: 0.75 }]}>
              <ModalCloseIcon />
            </Pressable>
            <View style={styles.bookingDecisionSuccessIconWrap}>
              <LargeCheckIcon />
            </View>
            <Text style={styles.bookingDecisionModalTitle}>{getSuccessModalTitle(successModal)}</Text>
            <Text style={styles.bookingDecisionModalMessage}>{getSuccessModalMessage(successModal)}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSuccessModal(null)}
              style={({ pressed }) => [styles.bookingDecisionOkButton, pressed && { opacity: 0.84 }]}>
              <Text style={styles.bookingDecisionOkText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getSuccessModalTitle(status: Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'> | null) {
  if (status === 'rejected') {
    return 'Booking Rejected';
  }

  if (status === 'completed') {
    return 'Booking Completed!';
  }

  return 'Booking Confirmed!';
}

function getSuccessModalMessage(status: Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'> | null) {
  if (status === 'rejected') {
    return 'The booking request has been rejected and the client has been notified.';
  }

  if (status === 'completed') {
    return 'The booking has been marked completed and the client has been notified.';
  }

  return 'The booking request has been confirmed and the time slot is now marked as booked.';
}

function ResolvedRequestPanel({ booking }: { booking: AdminBookingRequest }) {
  return (
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
  );
}

function SessionDetailRow({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <View style={styles.adminBookingDetailMetaRow}>
      <Text style={styles.adminBookingDetailMetaLabel}>{label}</Text>
      <Text style={styles.adminBookingDetailMetaValue}>{value}</Text>
    </View>
  );
}

function getStatusPillStyle(status: BookingStatus) {
  if (status === 'completed' || status === 'confirmed') return styles.adminBookingDetailConfirmedPill;
  if (status === 'expired' || status === 'rejected' || status === 'cancelled') return styles.adminBookingDetailRejectedPill;
  return styles.adminBookingDetailPendingPill;
}

function getStatusTextStyle(status: BookingStatus) {
  if (status === 'completed' || status === 'confirmed') return styles.adminBookingDetailConfirmedText;
  if (status === 'expired' || status === 'rejected' || status === 'cancelled') return styles.adminBookingDetailRejectedText;
  return styles.adminBookingDetailPendingText;
}

function StatusIcon({ status }: { status: BookingStatus }) {
  if (status === 'completed' || status === 'confirmed') return <CheckCircleIcon />;
  if (status === 'expired' || status === 'rejected' || status === 'cancelled') return <RejectSmallIcon />;
  return <PendingClockIcon />;
}

function BackIcon() {
  return (
    <Svg width={35} height={35} viewBox="0 0 35 35" fill="none">
      <Path d="M21.5 8.5L12.5 17.5L21.5 26.5" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
    </Svg>
  );
}

function PendingClockIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={8} stroke="#FF7E00" strokeWidth={2} />
      <Path d="M10 5.8V10.2L13.2 12" stroke="#FF7E00" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function CheckCircleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={8} stroke="#23865E" strokeWidth={2} />
      <Path d="M6.5 10.2L8.8 12.6L13.8 7.5" stroke="#23865E" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function RejectSmallIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={8} stroke="#E00000" strokeWidth={2} />
      <Path d="M7 7L13 13M13 7L7 13" stroke="#E00000" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function PhoneIcon() {
  return (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4L10 7L8.7 9.2C9.8 11.6 12.4 14.2 14.8 15.3L17 14L20 17C20.4 17.4 20.4 18 20 18.4L18.5 19.9C17.8 20.6 16.8 20.8 15.9 20.4C9.9 18.1 5.9 14.1 3.6 8.1C3.2 7.2 3.4 6.2 4.1 5.5L5.6 4C6 3.6 6.6 3.6 7 4Z" stroke="#395276" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function MailIcon() {
  return (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={6} width={18} height={12} rx={2} stroke="#395276" strokeWidth={2} />
      <Path d="M4.5 8L12 13.5L19.5 8" stroke="#395276" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function InclusionIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 13 13" fill="none">
      <Rect x={2.1} y={2.1} width={8.8} height={8.8} rx={1.2} stroke="#395276" strokeWidth={1.3} />
      <Path d="M4.2 6.6L5.7 8L8.8 4.8" stroke="#395276" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} />
    </Svg>
  );
}

function CalendarSmallIcon() {
  return (
    <Svg width={27} height={27} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5.5} width={16} height={14} rx={2} stroke="#083979" strokeWidth={2} />
      <Path d="M8 3.5V7M16 3.5V7M4 10H20" stroke="#083979" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg width={27} height={27} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke="#083979" strokeWidth={2} />
      <Path d="M12 7.5V12L15 14" stroke="#083979" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function DocIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      <Path d="M8 4H19L25 10V28H8V4Z" fill="#8AA3C3" />
      <Path d="M19 4V11H25" fill="#CFE0F5" />
      <Path d="M12 17H21M12 21H21M12 25H18" stroke="#ffffff" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function RejectIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="#FF0000" strokeLinecap="round" strokeWidth={2.4} />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path d="M5 11.4L9 15.4L17 6.6" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Svg>
  );
}

function ModalCloseIcon() {
  return (
    <Svg width={34} height={34} viewBox="0 0 34 34" fill="none">
      <Path d="M11 11L23 23M23 11L11 23" stroke="#142C4C" strokeLinecap="round" strokeWidth={4} />
    </Svg>
  );
}

function WarningIcon() {
  return (
    <Svg width={54} height={54} viewBox="0 0 54 54" fill="none">
      <Path d="M24.1 9.6C25.4 7.2 28.6 7.2 29.9 9.6L48 42.1C49.3 44.5 47.6 47.4 44.8 47.4H9.2C6.4 47.4 4.7 44.5 6 42.1L24.1 9.6Z" fill="#B32B2B" />
      <Path d="M27 20V31" stroke="#ffffff" strokeLinecap="round" strokeWidth={4} />
      <Circle cx={27} cy={38} r={2.6} fill="#ffffff" />
    </Svg>
  );
}

function LargeCheckIcon() {
  return (
    <Svg width={62} height={62} viewBox="0 0 62 62" fill="none">
      <Path d="M14.5 31.8L25.4 42.7L48 18.8" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={5.5} />
    </Svg>
  );
}
