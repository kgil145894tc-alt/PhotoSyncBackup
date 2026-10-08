import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { AdminBrandHeader } from '@/components/admin-brand-header';
import { showAppAlert } from '@/components/app-alert';
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
import { useAdminBookingDetail } from '@/hooks/use-admin-booking-detail';
import { useMountedRef } from '@/hooks/use-mounted-ref';
import { adminBookingDetailStyles } from '@/styles/admin-booking-detail.styles';
import { adminColors } from '@/styles/admin-theme';
import { photographerStyles } from '@/styles/photographer.styles';
import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

const styles = { ...photographerStyles, ...adminBookingDetailStyles };

export default function PhotographerRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const bookingId = typeof id === 'string' ? id : id?.[0] ?? '';
  const detail = useAdminBookingDetail(bookingId);
  return <BookingDetailContent key={`${detail.accountVersion}:${detail.accountId}:${bookingId}`} detail={detail} />;
}

function BookingDetailContent({ detail }: { detail: ReturnType<typeof useAdminBookingDetail> }) {
  const navHeight = useBottomNavHeight('admin');
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const useStackedLayout = width < 390 || fontScale > 1.2;
  const { booking, isUpdating, isLoading, error } = detail;
  const mounted = useMountedRef();
  const updating = useRef(false);
  const [isRejectModalVisible, setIsRejectModalVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [successModal, setSuccessModal] = useState<Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'> | null>(null);
  const bottomPadding = navHeight + insets.bottom + 24;
  const canUpdate = booking?.status === 'pending' && !isUpdating;
  const canComplete = booking?.status === 'confirmed' && !isUpdating;

  async function handleStatusUpdate(status: Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'>, reason?: string | null) {
    if (updating.current || isUpdating) return;
    if (!booking || (status === 'completed' ? booking.status !== 'confirmed' : booking.status !== 'pending')) {
      showAppAlert(
        'Request already updated',
        status === 'completed' ? 'This booking is no longer confirmed.' : 'This booking request is no longer pending.',
      );
      void detail.refresh();
      return;
    }

    if (status === 'rejected' && !reason?.trim()) {
      showAppAlert('Reason required', 'Please enter a short reason before rejecting this request.');
      return;
    }

    updating.current = true;
    try {
      const result = await detail.updateStatus(status, reason);
      if (!mounted.current || !result) return;
      if (!result.success) {
        showAppAlert('Request not updated', result.message ?? 'Please try again.');
        return;
      }
      setIsRejectModalVisible(false);
      setRejectionReason('');
      setSuccessModal(status);
    } finally {
      updating.current = false;
    }
  }

  return (
    <View style={[styles.container, styles.adminCurvedHeaderScreen]}>
      <StatusBar style="light" />
      <AdminBrandHeader
        onBack={() => router.back()}
        textureSource={require('@/assets/images/admin-calendar-banner.png')}
        topInset={insets.top}
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={!isLoading && detail.isRefreshing} onRefresh={() => { void detail.refresh(); }} />}
        contentContainerStyle={[styles.adminBookingDetailPanel, { paddingBottom: bottomPadding }]}
        style={styles.adminBookingDetailScroller}
        showsVerticalScrollIndicator={false}>
        {error ? <Text accessibilityRole="alert" style={styles.adminBookingDetailLoading}>{error}</Text> : null}
        {isLoading && !booking ? <Text style={styles.adminBookingDetailLoading}>Loading booking request...</Text> : null}
        {!isLoading && !booking && !error ? <Text style={styles.adminBookingDetailLoading}>This booking was not found or is no longer available.</Text> : null}

        {booking && (
          <>
              <View style={[styles.adminBookingDetailStatusPill, getStatusPillStyle(booking.status)]}>
                <StatusIcon status={booking.status} />
                <Text style={[styles.adminBookingDetailStatusText, getStatusTextStyle(booking.status)]}>
                  {formatStatusLabel(booking.status)}
                </Text>
              </View>

              <View style={[styles.adminBookingDetailClientBlock, fontScale > 1.4 && styles.clientBlockStacked]}>
                <Image
                  contentFit="cover"
                  source={booking.clientAvatarUrl ? { uri: booking.clientAvatarUrl } : require('@/assets/images/admin-booking-detail-avatar.png')}
                  style={styles.adminBookingDetailAvatar}
                />
                <View style={[styles.adminBookingDetailClientCopy, fontScale > 1.4 && styles.stackedItem]}>
                  <Text style={styles.adminBookingDetailClientName}>{booking.clientName}</Text>
                  <View style={styles.adminBookingDetailContactRow}>
                    <PhoneIcon />
                    <Text style={styles.adminBookingDetailContactText}>{booking.clientPhone}</Text>
                  </View>
                  <View style={styles.adminBookingDetailContactRow}>
                    <MailIcon />
                    <Text style={styles.adminBookingDetailContactText}>{booking.clientEmail}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.adminBookingDetailSectionTitle}>Requested Service</Text>
              <View style={[styles.adminBookingDetailServiceCard, useStackedLayout && styles.serviceCardStacked]}>
                <Image
                  contentFit="cover"
                  source={booking.packageImageUrl ? { uri: booking.packageImageUrl } : require('@/assets/images/admin-booking-detail-service.png')}
                  style={[styles.adminBookingDetailServiceImage, useStackedLayout && styles.serviceImageStacked]}
                />
                <View style={[styles.adminBookingDetailServiceCopy, useStackedLayout && styles.stackedItem]}>
                  <Text style={styles.adminBookingDetailServiceTitle}>{booking.packageName}</Text>
                  <Text style={styles.adminBookingDetailServicePrice}>P{booking.packagePrice.toLocaleString('en-PH')}</Text>
                  {getBookingInclusions(booking).slice(0, 5).map((item) => (
                    <View key={item} style={styles.adminBookingDetailInclusionRow}>
                      <InclusionIcon />
                      <Text style={styles.adminBookingDetailInclusionText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <Text style={styles.adminBookingDetailSectionTitle}>Preferred Date & Time</Text>
              <View style={[styles.adminBookingDetailDateTimeRow, useStackedLayout && styles.detailRowStacked]}>
                <View style={[styles.adminBookingDetailDateTimeCard, useStackedLayout && styles.stackedItem]}>
                  <CalendarSmallIcon />
                  <View style={styles.adminBookingDetailDateTimeCopy}>
                    <Text style={styles.adminBookingDetailDateTimePrimary}>{getBookingDateLabel(booking)}</Text>
                    <Text style={styles.adminBookingDetailDateTimeSecondary}>{getBookingWeekday(booking)}</Text>
                  </View>
                </View>
                <View style={[styles.adminBookingDetailDateTimeCard, useStackedLayout && styles.stackedItem]}>
                  <ClockIcon />
                  <View style={styles.adminBookingDetailDateTimeCopy}>
                    <Text style={styles.adminBookingDetailDateTimePrimary}>{getBookingTimeLabel(booking)}</Text>
                    <Text style={styles.adminBookingDetailDateTimeSecondary}>{getBookingDurationLabel(booking)}</Text>
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
                <View style={[styles.adminBookingDetailActionRow, useStackedLayout && styles.detailRowStacked]}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canUpdate}
                    onPress={() => setIsRejectModalVisible(true)}
                    style={({ pressed }) => [styles.adminBookingDetailRejectButton, useStackedLayout && styles.stackedItem, (pressed || !canUpdate) && { opacity: 0.82 }]}>
                    <RejectIcon />
                    <Text style={styles.adminBookingDetailRejectText}>{isUpdating ? 'Updating...' : 'Reject Request'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canUpdate}
                    onPress={() => handleStatusUpdate('confirmed')}
                    style={({ pressed }) => [styles.adminBookingDetailConfirmButton, useStackedLayout && styles.stackedItem, (pressed || !canUpdate) && { opacity: 0.82 }]}>
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
      </ScrollView>

      <Modal animationType="fade" onRequestClose={() => { if (!isUpdating) setIsRejectModalVisible(false); }} transparent visible={isRejectModalVisible}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboardAvoider}>
          <View style={[styles.bookingDecisionModalOverlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              <View accessibilityViewIsModal style={styles.bookingDecisionModalCard}>
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
                  editable={!isUpdating}
                  multiline
                  onChangeText={setRejectionReason}
                  placeholder="Example: Please choose another date or time."
                  placeholderTextColor={adminColors.muted}
                  style={styles.bookingDecisionReasonInput}
                  value={rejectionReason}
                />
                <View style={[styles.bookingDecisionModalActions, fontScale > 1.4 && styles.detailRowStacked]}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdating}
                    onPress={() => {
                      setIsRejectModalVisible(false);
                      setRejectionReason('');
                    }}
                    style={({ pressed }) => [styles.bookingDecisionCancelButton, fontScale > 1.4 && styles.stackedItem, pressed && { opacity: 0.82 }]}>
                    <Text style={styles.bookingDecisionCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canUpdate}
                    onPress={() => handleStatusUpdate('rejected', rejectionReason)}
                    style={({ pressed }) => [styles.bookingDecisionRejectButton, fontScale > 1.4 && styles.stackedItem, (pressed || isUpdating) && { opacity: 0.75 }]}>
                    <Text style={styles.bookingDecisionRejectText}>{isUpdating ? 'Rejecting...' : 'Reject'}</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setSuccessModal(null)} transparent visible={successModal !== null}>
        <View style={[styles.bookingDecisionModalOverlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            <View accessibilityViewIsModal style={styles.bookingDecisionModalCard}>
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
          </ScrollView>
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

function PendingClockIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={8} stroke={adminColors.amber} strokeWidth={2} />
      <Path d="M10 5.8V10.2L13.2 12" stroke={adminColors.amber} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function CheckCircleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={8} stroke={adminColors.green} strokeWidth={2} />
      <Path d="M6.5 10.2L8.8 12.6L13.8 7.5" stroke={adminColors.green} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function RejectSmallIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={8} stroke={adminColors.red} strokeWidth={2} />
      <Path d="M7 7L13 13M13 7L7 13" stroke={adminColors.red} strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function PhoneIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4L10 7L8.7 9.2C9.8 11.6 12.4 14.2 14.8 15.3L17 14L20 17C20.4 17.4 20.4 18 20 18.4L18.5 19.9C17.8 20.6 16.8 20.8 15.9 20.4C9.9 18.1 5.9 14.1 3.6 8.1C3.2 7.2 3.4 6.2 4.1 5.5L5.6 4C6 3.6 6.6 3.6 7 4Z" stroke="#395276" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function MailIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
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
      <Path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke={adminColors.red} strokeLinecap="round" strokeWidth={2.4} />
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
    <Svg width={24} height={24} viewBox="0 0 34 34" fill="none">
      <Path d="M9 9L25 25M25 9L9 25" stroke={adminColors.ink} strokeLinecap="round" strokeWidth={3} />
    </Svg>
  );
}

function WarningIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 54 54" fill="none">
      <Path d="M24.1 9.6C25.4 7.2 28.6 7.2 29.9 9.6L48 42.1C49.3 44.5 47.6 47.4 44.8 47.4H9.2C6.4 47.4 4.7 44.5 6 42.1L24.1 9.6Z" fill={adminColors.red} />
      <Path d="M27 20V31" stroke="#ffffff" strokeLinecap="round" strokeWidth={4} />
      <Circle cx={27} cy={38} r={2.6} fill="#ffffff" />
    </Svg>
  );
}

function LargeCheckIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 62 62" fill="none">
      <Path d="M14.5 31.8L25.4 42.7L48 18.8" stroke={adminColors.green} strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} />
    </Svg>
  );
}
