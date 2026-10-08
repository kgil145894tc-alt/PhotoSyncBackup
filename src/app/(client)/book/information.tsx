import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { showAppAlert } from '@/components/app-alert';
import { FlowSteps, MobilePage } from '@/components/mobile-page';
import { MotionPressable } from '@/components/motion-pressable';
import {
  getBookingDraft,
  setBookingInformation,
} from '@/services/booking-draft';
import { getMyProfile } from '@/services/profile';
import { getStudioSettings } from '@/services/studio-settings';
import { responsiveStyles as styles } from '@/styles/responsive.styles';
export default function BookingInformationScreen() {
  const savedInformation = getBookingDraft().information;
  const [fullName, setFullName] = useState(savedInformation?.fullName ?? '');
  const [email, setEmail] = useState(savedInformation?.email ?? '');
  const [phone, setPhone] = useState(savedInformation?.phone ?? '');
  const [peopleCount, setPeopleCount] = useState(
    savedInformation?.peopleCount ?? '',
  );
  const [sessionLocation, setSessionLocation] = useState(
    savedInformation?.sessionLocation ?? '',
  );
  const [sessionTheme, setSessionTheme] = useState(
    savedInformation?.sessionTheme ?? '',
  );
  const [studioLocationOption, setStudioLocationOption] = useState('');
  const [notes, setNotes] = useState(
    getSavedSpecialRequests(savedInformation?.notes),
  );
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

      setStudioLocationOption(
        settings.defaultShootLocation.trim() || settings.studioAddress.trim(),
      );
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <MobilePage title="PhotoSync">
      <FlowSteps step={2} />
      <Text style={styles.title}>Your Information</Text>
      <Text style={styles.text}>
        Please fill in your information so we can confirm your booking.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Full Name *</Text>

        <TextInput
          accessibilityLabel="Full Name"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Email *</Text>

        <TextInput
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Phone No. *</Text>

        <TextInput
          accessibilityLabel="Phone No."
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          style={styles.input}
        />
      </View>
      <Text style={styles.heading}>Session Details</Text>
      <Text style={styles.text}>
        These details help the photographer prepare for your shoot.
      </Text>
      <View style={styles.field}>
        <Text style={styles.label}>Shoot Location *</Text>
        <>
          {studioLocationOption ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSessionLocation(studioLocationOption)}
              style={styles.chip}
            >
              <Text style={styles.text}>Use Studio Location</Text>
            </Pressable>
          ) : null}
        </>
        <TextInput
          accessibilityLabel="Shoot Location"
          value={sessionLocation}
          onChangeText={setSessionLocation}
          placeholder="Studio, outdoor place, event venue, or TBD"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Theme / Concept (Optional)</Text>

        <TextInput
          accessibilityLabel="Theme / Concept (Optional)"
          value={sessionTheme}
          onChangeText={setSessionTheme}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Number of People *</Text>

        <TextInput
          accessibilityLabel="Number of People"
          value={peopleCount}
          onChangeText={setPeopleCount}
          keyboardType="number-pad"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Special Requests / Notes (Optional)</Text>

        <TextInput
          accessibilityLabel="Special Requests / Notes (Optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
          style={[styles.input, { minHeight: 120 }]}
        />
      </View>
      <MotionPressable
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
            showAppAlert('Check your information', validationMessage);
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
        style={styles.button}
      >
        <Text style={styles.buttonText}>Next</Text>
      </MotionPressable>
    </MobilePage>
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
