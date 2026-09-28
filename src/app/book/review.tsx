import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BookingStepIndicator } from '@/components/booking-step-indicator';
import { clearBookingDraft, getBookingDraft, getSelectedPackage } from '@/services/booking-draft';
import { submitBookingRequest } from '@/services/bookings';
import { bookingReviewStyles as styles } from '@/styles/booking-review.styles';

const FIGMA_WIDTH = 412;
const FIGMA_NAV_TOP = 844;

type ReviewIconName = 'calendar' | 'email' | 'location' | 'notes' | 'person' | 'phone' | 'time';

type ReviewRowItem = {
  icon: ReviewIconName;
  label: string;
  top: number;
  value: string;
  valueSize: number;
};

export default function BookingReviewScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const draft = getBookingDraft();
  const selectedPackage = getSelectedPackage();
  const sessionLocation = draft.information?.sessionLocation?.trim() || 'Not provided';
  const reviewRows: ReviewRowItem[] = [
    { icon: 'calendar', label: 'Date', top: 408, value: draft.schedule?.displayDate ?? 'Not selected', valueSize: 16 },
    { icon: 'time', label: 'Time', top: 438, value: draft.schedule?.displayTime ?? 'Not selected', valueSize: 16 },
    { icon: 'person', label: 'Name', top: 495, value: draft.information?.fullName ?? 'Not provided', valueSize: 16 },
    { icon: 'phone', label: 'Phone', top: 535, value: draft.information?.phone ?? 'Not provided', valueSize: 16 },
    { icon: 'email', label: 'Email', top: 575, value: draft.information?.email ?? 'Not provided', valueSize: 14 },
    { icon: 'location', label: 'Location', top: 615, value: sessionLocation, valueSize: 13 },
  ];
  const bottomPadding = insets.bottom;
  const availableContentHeight = Math.max(1, height - bottomPadding);
  const scale = Math.min(width / FIGMA_WIDTH, availableContentHeight / FIGMA_NAV_TOP);
  const contentHeight = FIGMA_NAV_TOP * scale;
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.scrollContent,
          { minHeight: contentHeight + bottomPadding, paddingBottom: bottomPadding },
        ]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={[styles.canvas, { height: contentHeight }]}>
          <Image
            contentFit="cover"
            source={require('@/assets/images/book-background.png')}
            style={[styles.backgroundImage, { left: x(0), width: px(412), height: px(917) }]}
          />

          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={[styles.backButton, { left: x(28), top: y(59), width: px(35), height: px(35) }]}>
            <ChevronLeft size={px(26)} />
          </Pressable>

          <Text style={[styles.brandTitle, { left: x(131), top: y(58), width: px(125), fontSize: px(24), lineHeight: px(38) }]}>
            PhotoSync
          </Text>
          <Image
            contentFit="contain"
            source={require('@/assets/images/photosync-logo.png')}
            style={[styles.logo, { left: x(253), top: y(54), width: px(54), height: px(45) }]}
          />

          <StepIndicator px={px} x={x} y={y} />

          <Text style={[styles.heading, { left: x(23), top: y(155), width: px(254), fontSize: px(32), lineHeight: px(43) }]}>
            Review Booking
          </Text>
          <Text style={[styles.helperText, { left: x(24), top: y(204), width: px(325), fontSize: px(16), lineHeight: px(21) }]}>
            Please check your details before{'\n'}confirming.
          </Text>

          <View style={[styles.packageCard, { left: x(19), top: y(251), width: px(373), height: px(130), borderRadius: px(20) }]}>
            <Image
              contentFit="cover"
              source={selectedPackage.image}
              style={[styles.packageImage, { left: px(10), top: px(14), width: px(101), height: px(101), borderRadius: px(11) }]}
            />
            <Text style={[styles.packageTitle, { left: px(122), top: px(12), width: px(223), fontSize: px(24), lineHeight: px(32) }]}>
              {formatPackageTitle(selectedPackage.name)}
            </Text>
            <Text style={[styles.packagePrice, { left: px(122), top: px(85), width: px(79), fontSize: px(20), lineHeight: px(29) }]}>
              {selectedPackage.price}
            </Text>
            <Pressable
              accessibilityLabel="Edit package"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={[styles.editButton, { left: px(326), top: px(10), width: px(32), height: px(32) }]}>
              <EditIcon size={px(23)} />
            </Pressable>
            <CameraIcon size={px(39)} style={{ left: px(322), top: px(78) }} />
          </View>

          <View style={[styles.detailsCard, { left: x(19), top: y(389), width: px(373), height: px(372), borderRadius: px(20) }]} />
          <View style={[styles.detailsHeader, { left: x(19), top: y(389), width: px(373), height: px(83) }]} />
          <View style={[styles.separator, { left: x(20), top: y(472), width: px(371), height: px(1) }]} />

          {reviewRows.map((row) => (
            <ReviewRow key={row.label} px={px} row={row} x={x} y={y} />
          ))}

          <View style={[styles.row, { left: x(57), top: y(662), height: px(23) }]}>
            <ReviewIcon name="notes" size={px(17)} />
            <Text style={[styles.rowLabel, { marginLeft: px(6), fontSize: px(16), lineHeight: px(23) }]}>
              Session Details:
            </Text>
          </View>
          <Text style={[styles.notesValue, { left: x(80), top: y(696), width: px(280), fontSize: px(13), lineHeight: px(18) }]} numberOfLines={3}>
            {getReviewSessionDetails(draft.information?.notes) || 'None.'}
          </Text>

          <Pressable
            accessibilityLabel="Confirm Booking"
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={async () => {
              setIsSubmitting(true);
              const result = await submitBookingRequest();
              setIsSubmitting(false);

              if (!result.success) {
                Alert.alert('Booking not submitted', result.message ?? 'Please try again.');
                return;
              }

              clearBookingDraft();
              router.replace('/book/success');
            }}
            style={({ pressed }) => [
              styles.confirmButton,
              {
                left: x(33),
                top: y(772),
                width: px(346),
                height: px(64),
                borderRadius: px(30),
                opacity: pressed || isSubmitting ? 0.82 : 1,
              },
            ]}>
            <Text style={[styles.confirmText, { fontSize: px(24), lineHeight: px(38) }]}>
              {isSubmitting ? 'Submitting...' : 'Confirm Booking'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function formatPackageTitle(name: string) {
  return name.replace(' Package', '\nPackage');
}

function getReviewSessionDetails(notes?: string) {
  return (notes ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('Shoot Location:'))
    .join('\n')
    .trim();
}

function StepIndicator({
  px,
  x,
  y,
}: {
  px: (value: number) => number;
  x: (value: number) => number;
  y: (value: number) => number;
}) {
  return <BookingStepIndicator currentStep={3} previousStep={2} px={px} x={x} y={y} />;
}

function ReviewRow({
  px,
  row,
  x,
  y,
}: {
  px: (value: number) => number;
  row: ReviewRowItem;
  x: (value: number) => number;
  y: (value: number) => number;
}) {
  return (
    <>
      <View style={[styles.row, { left: x(57), top: y(row.top), height: px(23) }]}>
        <ReviewIcon name={row.icon} size={px(row.icon === 'person' || row.icon === 'email' ? 17 : 16)} />
        <Text style={[styles.rowLabel, { marginLeft: px(7), fontSize: px(16), lineHeight: px(23) }]}>
          {row.label}
        </Text>
      </View>
      <Text style={[styles.rowValue, { left: x(200), top: y(row.top), width: px(175), fontSize: px(row.valueSize), lineHeight: px(23) }]}>
        {row.value}
      </Text>
    </>
  );
}

function ChevronLeft({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#142C4C" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function EditIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 16.7V20H7.3L17.1 10.2L13.8 6.9L4 16.7Z" fill="#ffffff" />
      <Path d="M15 5.7L16.8 3.9C17.2 3.5 17.9 3.5 18.3 3.9L20.1 5.7C20.5 6.1 20.5 6.8 20.1 7.2L18.3 9L15 5.7Z" fill="#ffffff" />
    </Svg>
  );
}

function CameraIcon({ size, style }: { size: number; style: { left: number; top: number } }) {
  return (
    <View style={[{ position: 'absolute' }, style]}>
      <Svg width={size} height={size * 0.67} viewBox="0 0 39 26" fill="none">
        <Path
          d="M34.8 4.3H28.4L26.9 1.2C26.7 0.8 26.3 0.5 25.8 0.5H13.2C12.7 0.5 12.3 0.8 12.1 1.2L10.6 4.3H4.2C2.1 4.3 0.5 5.9 0.5 8V21.8C0.5 23.9 2.1 25.5 4.2 25.5H34.8C36.9 25.5 38.5 23.9 38.5 21.8V8C38.5 5.9 36.9 4.3 34.8 4.3Z"
          stroke="#8AA3C3"
        />
        <Circle cx={19.5} cy={15} r={6.2} stroke="#8AA3C3" />
        <Circle cx={32} cy={9} r={1.5} fill="#8AA3C3" />
      </Svg>
    </View>
  );
}

function ReviewIcon({ name, size }: { name: ReviewIconName; size: number }) {
  const stroke = '#142C4C';

  if (name === 'calendar') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={5.5} width={16} height={14} rx={1.5} stroke={stroke} strokeWidth={1.8} />
        <Path d="M8 3.5V7.5M16 3.5V7.5M4 10H20" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    );
  }

  if (name === 'time') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={8.5} stroke={stroke} strokeWidth={1.8} />
        <Path d="M12 7.5V12L15 14" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'person') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={8} r={3} stroke={stroke} strokeWidth={1.8} />
        <Path d="M6.5 19C7.5 15.8 9.4 14.2 12 14.2C14.6 14.2 16.5 15.8 17.5 19" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    );
  }

  if (name === 'phone') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M7 4L10 7L8.7 9.2C9.8 11.6 12.4 14.2 14.8 15.3L17 14L20 17C20.4 17.4 20.4 18 20 18.4L18.5 19.9C17.8 20.6 16.8 20.8 15.9 20.4C9.9 18.1 5.9 14.1 3.6 8.1C3.2 7.2 3.4 6.2 4.1 5.5L5.6 4C6 3.6 6.6 3.6 7 4Z" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'email') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={6} width={18} height={12} rx={1.5} stroke={stroke} strokeWidth={1.8} />
        <Path d="M4.5 8L12 13.5L19.5 8" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'location') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12 21C15.5 17.6 18 14.4 18 10.6C18 7.2 15.3 4.5 12 4.5C8.7 4.5 6 7.2 6 10.6C6 14.4 8.5 17.6 12 21Z" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={12} cy={10.5} r={2.2} stroke={stroke} strokeWidth={1.8} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 5H19V16H9L5 20V5Z" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
