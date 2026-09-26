import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { getBookingDraft, setBookingInformation } from '@/services/booking-draft';
import { getStudioSettings } from '@/services/studio-settings';
import { bookingInformationStyles as styles } from '@/styles/booking-information.styles';

const FIGMA_WIDTH = 412;
const FIGMA_NAV_TOP = 844;
const FORM_HEIGHT = 1120;
const activeStep = 2;

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

          <FieldLabel icon="person" label="Full Name" px={px} required x={x(32)} y={y(263)} />
          <TextInput
            accessibilityLabel="Full Name"
            autoCapitalize="words"
            onChangeText={setFullName}
            style={[styles.input, { left: x(32), top: y(284), width: px(351), height: px(51), borderRadius: px(10), fontSize: px(16) }]}
            value={fullName}
          />

          <FieldLabel icon="email" label="Email" px={px} required x={x(32)} y={y(349)} />
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            style={[styles.input, { left: x(33), top: y(370), width: px(346), height: px(51), borderRadius: px(10), fontSize: px(16) }]}
            value={email}
          />

          <FieldLabel icon="phone" label="Phone No." px={px} required x={x(32)} y={y(440)} />
          <TextInput
            accessibilityLabel="Phone Number"
            keyboardType="phone-pad"
            onChangeText={setPhone}
            style={[styles.input, { left: x(35), top: y(460), width: px(344), height: px(51), borderRadius: px(10), fontSize: px(16) }]}
            value={phone}
          />

          <Text style={[styles.sectionTitle, { left: x(32), top: y(544), width: px(270), fontSize: px(24), lineHeight: px(32) }]}>
            Session Details
          </Text>
          <Text style={[styles.sectionHint, { left: x(33), top: y(579), width: px(340), fontSize: px(12), lineHeight: px(17) }]}>
            These details help the photographer prepare for your shoot.
          </Text>

          <PlainFieldLabel label="Shoot Location" px={px} x={x(41)} y={y(626)} />
          {studioLocationOption ? (
            <Pressable
              accessibilityLabel="Use Studio Location"
              accessibilityRole="button"
              onPress={() => setSessionLocation(studioLocationOption)}
              style={({ pressed }) => [
                styles.studioLocationButton,
                {
                  left: x(222),
                  top: y(618),
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
            style={[styles.input, { left: x(37), top: y(653), width: px(342), height: px(51), borderRadius: px(10), fontSize: px(15) }]}
            value={sessionLocation}
          />

          <PlainFieldLabel label="Theme / Concept (Optional)" px={px} x={x(41)} y={y(719)} />
          <TextInput
            accessibilityLabel="Theme or Concept"
            onChangeText={setSessionTheme}
            placeholder="Example: simple, formal, garden, no concept"
            placeholderTextColor="#8AA3C3"
            style={[styles.input, { left: x(37), top: y(746), width: px(342), height: px(51), borderRadius: px(10), fontSize: px(15) }]}
            value={sessionTheme}
          />

          <PlainFieldLabel label="Number of People" px={px} x={x(41)} y={y(812)} />
          <TextInput
            accessibilityLabel="Number of People"
            keyboardType="number-pad"
            onChangeText={setPeopleCount}
            placeholder="Example: 1, 2, 5"
            placeholderTextColor="#8AA3C3"
            style={[styles.input, { left: x(37), top: y(839), width: px(342), height: px(51), borderRadius: px(10), fontSize: px(15) }]}
            value={peopleCount}
          />

          <Text style={[styles.fieldLabel, { position: 'absolute', left: x(41), top: y(905), width: px(292), fontSize: px(16), lineHeight: px(23) }]}>
            Special Requests / Notes (Optional)
          </Text>
          <TextInput
            accessibilityLabel="Special Requests or Notes"
            multiline
            onChangeText={setNotes}
            style={[
              styles.input,
              styles.notesInput,
              { left: x(37), top: y(935), width: px(342), height: px(138), borderRadius: px(10), fontSize: px(15), lineHeight: px(21) },
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
                top: y(1015),
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
}: {
  email: string;
  fullName: string;
  peopleCount: string;
  phone: string;
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

  if (peopleCount.trim() && !/^\d+$/.test(peopleCount.trim())) {
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

function PlainFieldLabel({
  label,
  px,
  x,
  y,
}: {
  label: string;
  px: (value: number) => number;
  x: number;
  y: number;
}) {
  return (
    <Text style={[styles.fieldLabel, { position: 'absolute', left: x, top: y, width: px(292), fontSize: px(16), lineHeight: px(23) }]}>
      {label}
    </Text>
  );
}

function FieldLabel({
  icon,
  label,
  px,
  required,
  x,
  y,
}: {
  icon: 'email' | 'person' | 'phone';
  label: string;
  px: (value: number) => number;
  required?: boolean;
  x: number;
  y: number;
}) {
  return (
    <View style={[styles.fieldLabelRow, { left: x, top: y, height: px(23) }]}>
      <FieldIcon name={icon} size={px(22)} />
      <Text style={[styles.fieldLabel, { marginLeft: px(7), fontSize: px(16), lineHeight: px(23) }]}>
        {label} {required && <Text style={styles.requiredMark}>*</Text>}
      </Text>
    </View>
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
  return (
    <>
      <View style={[styles.stepLine, { left: x(135), top: y(130), width: px(65), height: px(2), backgroundColor: '#142C4C' }]} />
      <View style={[styles.stepLine, { left: x(226), top: y(130), width: px(65), height: px(2), backgroundColor: '#D1E2F7' }]} />
      {[1, 2, 3].map((step, index) => {
        const active = step <= activeStep;

        return (
          <View
            key={step}
            style={[
              styles.stepCircle,
              {
                left: x(109 + index * 91),
                top: y(118),
                width: px(26),
                height: px(26),
                borderRadius: px(13),
                backgroundColor: active ? '#142C4C' : '#D1E2F7',
              },
            ]}>
            <Text
              style={[
                styles.stepText,
                {
                  color: active ? '#ffffff' : '#142C4C',
                  fontSize: px(15.6),
                  lineHeight: px(20),
                },
              ]}>
              {step}
            </Text>
          </View>
        );
      })}
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

function ArrowRight({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12H19" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M13 6L19 12L13 18" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function FieldIcon({ name, size }: { name: 'email' | 'person' | 'phone'; size: number }) {
  const stroke = '#4C5E76';

  if (name === 'person') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={2.8} y={4.5} width={18.4} height={15} rx={1.8} stroke={stroke} strokeWidth={1.8} />
        <Circle cx={8} cy={10} r={2.1} stroke={stroke} strokeWidth={1.6} />
        <Path d="M4.9 16.4C5.5 14.7 6.6 13.8 8 13.8C9.4 13.8 10.5 14.7 11.1 16.4" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
        <Path d="M13.5 9H18M13.5 13H18M13.5 16.5H16.5" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    );
  }

  if (name === 'email') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={2.5} y={5} width={19} height={14} rx={1.8} stroke={stroke} strokeWidth={1.8} />
        <Path d="M4 7L12 13L20 7" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7.1 4.2L9.7 6.8C10.3 7.4 10.3 8.3 9.8 8.9L8.8 10C9.9 12.3 11.7 14.1 14 15.2L15.1 14.2C15.7 13.7 16.6 13.7 17.2 14.3L19.8 16.9C20.4 17.5 20.4 18.5 19.8 19.1L18.6 20.3C17.8 21.1 16.6 21.4 15.5 21C9.4 18.8 5.2 14.6 3 8.5C2.6 7.4 2.9 6.2 3.7 5.4L4.9 4.2C5.5 3.6 6.5 3.6 7.1 4.2Z"
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
