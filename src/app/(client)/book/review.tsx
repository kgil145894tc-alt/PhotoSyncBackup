import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { showAppAlert } from '@/components/app-alert';
import { FlowSteps, MobilePage } from '@/components/mobile-page';
import { MotionPressable } from '@/components/motion-pressable';
import { useMountedRef } from '@/hooks/use-mounted-ref';
import {
  clearBookingDraft,
  getBookingDraft,
  getSelectedPackage,
} from '@/services/booking-draft';
import { submitBookingRequest } from '@/services/bookings';
import { responsiveStyles as styles } from '@/styles/responsive.styles';
export default function BookingReviewScreen() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const mounted = useMountedRef();
  const draft = getBookingDraft();
  const selectedPackage = getSelectedPackage();
  const rows = [
    ['Date', draft.schedule?.displayDate ?? 'Not selected'],
    ['Time', draft.schedule?.displayTime ?? 'Not selected'],
    ['Name', draft.information?.fullName ?? 'Not provided'],
    ['Phone', draft.information?.phone ?? 'Not provided'],
    ['Email', draft.information?.email ?? 'Not provided'],
    ['Location', draft.information?.sessionLocation?.trim() || 'Not provided'],
    [
      'Session Details',
      getReviewSessionDetails(draft.information?.notes) || 'None.',
    ],
  ];

  async function handleSubmit() {
    // The ref also guards taps dispatched before disabled state is rendered.
    if (submissionPending.current) return;
    submissionPending.current = true;
    setIsSubmitting(true);
    let submitted = false;
    try {
      const result = await submitBookingRequest();
      if (!result.success) {
        if (mounted.current) {
          showAppAlert(
            'Booking not submitted',
            result.message ?? 'Please try again.',
          );
        }
        return;
      }
      submitted = true;
      if (mounted.current) {
        clearBookingDraft();
        router.replace('/book/success');
      }
    } catch {
      if (mounted.current) {
        showAppAlert('Booking not submitted', 'Please try again.');
      }
    } finally {
      // A successful request stays locked until the success route replaces it.
      if (!submitted) {
        submissionPending.current = false;
        if (mounted.current) setIsSubmitting(false);
      }
    }
  }

  return (
    <MobilePage title="PhotoSync" onBack={() => {
      if (!submissionPending.current) router.back();
    }}>
      <FlowSteps step={3} />
      <Text style={styles.title}>Review Booking</Text>
      <Text style={styles.text}>
        Please check your details before confirming.
      </Text>
      <View style={[styles.card, styles.row]}>
        <Image
          source={selectedPackage.image}
          contentFit="cover"
          style={styles.thumbnail}
        />
        <View style={styles.copy}>
          <Text style={styles.heading}>{selectedPackage.name}</Text>
          <Text style={styles.price}>{selectedPackage.price}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        onPress={() => {
          if (!submissionPending.current) router.back();
        }}
        style={styles.chip}
      >
        <Text style={styles.text}>Edit information</Text>
      </Pressable>
      <View style={styles.card}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.text}>{value}</Text>
          </View>
        ))}
      </View>
      <MotionPressable
        accessibilityRole="button"
        accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
        disabled={isSubmitting}
        onPress={handleSubmit}
        style={[styles.button, isSubmitting && styles.disabled]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isSubmitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
          <Text style={styles.buttonText}>
            {isSubmitting ? 'Submitting...' : 'Confirm Booking'}
          </Text>
        </View>
      </MotionPressable>
    </MobilePage>
  );
}
function getReviewSessionDetails(notes?: string) {
  return (notes ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('Shoot Location:'))
    .join('\n')
    .trim();
}
