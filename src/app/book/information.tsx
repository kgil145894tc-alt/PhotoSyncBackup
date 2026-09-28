import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { BookingStepIndicator } from '@/components/booking-step-indicator';
import { getBookingDraft, setBookingInformation } from '@/services/booking-draft';
import { getMyProfile } from '@/services/profile';
import { getStudioSettings } from '@/services/studio-settings';
import { bookingInformationStyles as styles } from '@/styles/booking-information.styles';

const FIGMA_WIDTH = 412;
const FIGMA_NAV_TOP = 844;
const FORM_HEIGHT = 1224;

export default function BookingInformationScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const savedInformation = getBookingDraft().information;
  const [fullName, setFullName] = useState(savedInformation?.fullName ?? '');
  const [email, setEmail] = useState(savedInformation?.email ?? '');
  const [phone, setPhone] = useState(savedInformation?.phone ?? '');
  const [peopleCount, setPeopleCount] = useState(savedInformation?.peopleCount ?? '');
  const [sessionLocation, setSessionLocation] = useState(savedInformation?.sessionLocation ?? '');
  const [sessionTheme, setSessionTheme] = useState(savedInformation?.sessionTheme ?? '');
  const [studioLocationOption, setStudioLocationOption] = useState('');
  const [notes, setNotes] = useState(getSavedSpecialRequests(savedInformation?.notes));
  const bottomPadding = insets.bottom;
  const availableContentHeight = Math.max(1, height - bottomPadding);
  const scale = Math.min(width / FIGMA_WIDTH, availableContentHeight / FIGMA_NAV_TOP);
  const contentHeight = FORM_HEIGHT * scale;
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;

  useEffect(() => {
    let isMounted = true;

    getMyProfile().then((profile) => {
      if (!isMounted || !profile) {
        return;
      }

      setFullName((currentValue) => currentValue || profile.fullName);
      setEmail((currentValue) => currentValue || profile.email);
      setPhone((currentValue) => currentValue || profile.phone);
    });

    getStudioSettings().then((settings) => {
      if (!isMounted) {
        return;
      }

      setStudioLocationOption(settings.defaultShootLocation.trim() || settings.studioAddress.trim());
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.scrollContent,
          { minHeight: contentHeight + bottomPadding, paddingBottom: bottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={[styles.canvas, { height: contentHeight }]}>
          <Image
            contentFit="cover"
            source={require('@/assets/images/book-background.png')}
            style={[styles.backgroundImage, { left: x(0), width: px(412), height: px(1190) }]}
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

          <Text style={[styles.heading, { left: x(23), top: y(165), width: px(254), fontSize: px(32), lineHeight: px(43) }]}>
            Your Information
          </Text>
          <Text style={[styles.helperText, { left: x(24), top: y(213), width: px(350), fontSize: px(16), lineHeight: px(21) }]}>
            Please fill in your information so we can{'\n'}confirm your booking.
          </Text>

          <FieldLabel label="Full Name" px={px} required x={x(41)} y={y(263)} />
          <TextInput
            accessibilityLabel="Full Name"
            autoCapitalize="words"
            onChangeText={setFullName}
            style={[styles.input, { left: x(37), top: y(293), width: px(342), height: px(51), borderRadius: px(10), fontSize: px(16) }]}
            value={fullName}
          />

          <FieldLabel label="Email" px={px} required x={x(41)} y={y(358)} />
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            style={[styles.input, { left: x(37), top: y(388), width: px(342), height: px(51), borderRadius: px(10), fontSize: px(16) }]}
            value={email}
          />

          <FieldLabel label="Phone No." px={px} required x={x(41)} y={y(453)} />
          <TextInput
            accessibilityLabel="Phone Number"
            keyboardType="phone-pad"
            onChangeText={setPhone}
            style={[styles.input, { left: x(37), top: y(483), width: px(342), height: px(51), borderRadius: px(10), fontSize: px(16) }]}
            value={phone}
          />

          <Text style={[styles.sectionTitle, { left: x(32), top: y(566), width: px(270), fontSize: px(24), lineHeight: px(32) }]}>
            Session Details
          </Text>
          <Text style={[styles.sectionHint, { left: x(33), top: y(601), width: px(340), fontSize: px(12), lineHeight: px(17) }]}>
            These details help the photographer prepare for your shoot.
          </Text>

          <FieldLabel label="Shoot Location" px={px} required x={x(41)} y={y(650)} />
          {studioLocationOption ? (
            <Pressable
              accessibilityLabel="Use Studio Location"
              accessibilityRole="button"
              onPress={() => setSessionLocation(studioLocationOption)}
              style={({ pressed }) => [
                styles.studioLocationButton,
                {
                  left: x(222),
                  top: y(642),
                  width: px(157),
                  height: px(33),
                  borderRadius: px(17),
                  opacity: pressed ? 0.78 : 1,
                },
              ]}>
              <Text style={[styles.studioLocationText, { fontSize: px(11), lineHeight: px(15) }]}>Use Studio Location</Text>
            </Pressable>
          ) : null}
          <TextInput
            accessibilityLabel="Shoot Location"
            onChangeText={setSessionLocation}
            placeholder="Studio, outdoor place, event venue, or TBD"
            placeholderTextColor="#8AA3C3"
            style={[styles.input, { left: x(37), top: y(680), width: px(342), height: px(51), borderRadius: px(10), fontSize: px(15) }]}
            value={sessionLocation}
          />

          <FieldLabel label="Theme / Concept (Optional)" px={px} x={x(41)} y={y(746)} />
          <TextInput
            accessibilityLabel="Theme or Concept"
            onChangeText={setSessionTheme}
            placeholder="Example: simple, formal, garden, no concept"
            placeholderTextColor="#8AA3C3"
            style={[styles.input, { left: x(37), top: y(776), width: px(342), height: px(51), borderRadius: px(10), fontSize: px(15) }]}
            value={sessionTheme}
          />

          <FieldLabel label="Number of People" px={px} required x={x(41)} y={y(842)} />
          <TextInput
            accessibilityLabel="Number of People"
            keyboardType="number-pad"
            onChangeText={setPeopleCount}
            placeholder="Example: 1, 2, 5"
            placeholderTextColor="#8AA3C3"
            style={[styles.input, { left: x(37), top: y(872), width: px(342), height: px(51), borderRadius: px(10), fontSize: px(15) }]}
            value={peopleCount}
          />

          <FieldLabel label="Special Requests / Notes (Optional)" px={px} x={x(41)} y={y(938)} />
          <TextInput
            accessibilityLabel="Special Requests or Notes"
            multiline
            onChangeText={setNotes}
            style={[
              styles.input,
              styles.notesInput,
              { left: x(37), top: y(968), width: px(342), height: px(138), borderRadius: px(10), fontSize: px(15), lineHeight: px(21) },
            ]}
            value={notes}
          />

          <Pressable
            accessibilityLabel="Next"
            accessibilityRole="button"
            onPress={() => {
              const validationMessage = getInformationValidationMessage({
                email,
                fullName,
                peopleCount,
                phone,
                sessionLocation,
              });

              if (validationMessage) {
                Alert.alert('Check your information', validationMessage);
                return;
              }

              setBookingInformation({
                email: email.trim(),
                fullName: fullName.trim(),
                notes: buildSessionNotes({
                  notes,
                  peopleCount,
                  sessionLocation,
                  sessionTheme,
                }),
                peopleCount: peopleCount.trim(),
                phone: phone.trim(),
                sessionLocation: sessionLocation.trim(),
                sessionTheme: sessionTheme.trim(),
              });
              router.push('/book/review');
            }}
            style={({ pressed }) => [
              styles.nextButton,
              {
                left: x(33),
                top: y(1130),
                width: px(346),
                height: px(64),
                borderRadius: px(30),
                opacity: pressed ? 0.82 : 1,
              },
            ]}>
            <Text style={[styles.nextText, { fontSize: px(24), lineHeight: px(38) }]}>Next</Text>
            <ArrowRight size={px(31)} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function getInformationValidationMessage({
  email,
  fullName,
  peopleCount,
  phone,
  sessionLocation,
}: {
  email: string;
  fullName: string;
  peopleCount: string;
  phone: string;
  sessionLocation: string;
}) {
  if (!fullName.trim()) {
    return 'Please enter your full name.';
  }

  if (fullName.trim().length < 2) {
    return 'Please enter your complete name.';
  }

  if (!email.trim()) {
    return 'Please enter your email address.';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Please enter a valid email address, like name@example.com.';
  }

  if (!phone.trim()) {
    return 'Please enter your phone number.';
  }

  if (phone.replace(/\D/g, '').length < 7) {
    return 'Please enter a valid phone number.';
  }

  if (!sessionLocation.trim()) {
    return 'Please enter your shoot location.';
  }

  if (!peopleCount.trim()) {
    return 'Please enter the number of people.';
  }

  if (!/^\d+$/.test(peopleCount.trim())) {
    return 'Please enter the number of people using numbers only.';
  }

  return null;
}

function buildSessionNotes({
  notes,
  peopleCount,
  sessionLocation,
  sessionTheme,
}: {
  notes: string;
  peopleCount: string;
  sessionLocation: string;
  sessionTheme: string;
}) {
  const detailLines = [
    ['Shoot Location', sessionLocation.trim()],
    ['Theme / Concept', sessionTheme.trim()],
    ['Number of People', peopleCount.trim()],
    ['Special Requests', notes.trim()],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`);

  return detailLines.join('\n');
}

function getSavedSpecialRequests(savedNotes?: string) {
  if (!savedNotes?.trim()) {
    return '';
  }

  const specialRequests = savedNotes
    .split('\n')
    .find((line) => line.trim().toLowerCase().startsWith('special requests:'));

  if (specialRequests) {
    return specialRequests.split(':').slice(1).join(':').trim();
  }

  return savedNotes;
}

function FieldLabel({
  label,
  px,
  required,
  x,
  y,
}: {
  label: string;
  px: (value: number) => number;
  required?: boolean;
  x: number;
  y: number;
}) {
  return (
    <Text style={[styles.fieldLabel, { position: 'absolute', left: x, top: y, width: px(292), fontSize: px(16), lineHeight: px(23) }]}>
      {label} {required && <Text style={styles.requiredMark}>*</Text>}
    </Text>
  );
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
  return <BookingStepIndicator currentStep={2} previousStep={1} px={px} x={x} y={y} />;
}

function ChevronLeft({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#142C4C" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ArrowRight({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12H19" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M13 6L19 12L13 18" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

