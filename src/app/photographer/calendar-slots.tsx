import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { subscribeToBookingsChanged } from '@/services/booking-events';
import {
  deleteCalendarSlot,
  getCalendarSlotsForDate,
  getCurrentDateString,
  markCalendarDayUnavailable,
  reopenCalendarDay,
  saveCalendarSlot,
} from '@/services/calendar';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type CalendarTimeSlot } from '@/types/calendar';

export default function PhotographerCalendarSlotsScreen() {
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const selectedDate = normalizeDateParam(date);
  const [editingSlot, setEditingSlot] = useState<CalendarTimeSlot | null>(null);
  const [endTimeInput, setEndTimeInput] = useState('');
  const [isManageModalVisible, setIsManageModalVisible] = useState(false);
  const [isSlotModalVisible, setIsSlotModalVisible] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<CalendarTimeSlot[]>([]);
  const [startTimeInput, setStartTimeInput] = useState('');
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const isSelectedDayClosed = selectedSlots.some(isFullDayUnavailableSlot);
  const visibleSlots = useMemo(
    () => selectedSlots.filter((slot) => !isFullDayUnavailableSlot(slot)),
    [selectedSlots],
  );

  const refreshSlots = useCallback(async () => {
    setSelectedSlots(await getCalendarSlotsForDate(selectedDate));
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      getCalendarSlotsForDate(selectedDate).then((slots) => {
        if (isMounted) {
          setSelectedSlots(slots);
        }
      });

      return () => {
        isMounted = false;
      };
    }, [selectedDate]),
  );

  useEffect(
    () =>
      subscribeToBookingsChanged(() => {
        void refreshSlots();
      }),
    [refreshSlots],
  );

  async function updateDayAvailability(status: 'available' | 'unavailable') {
    if (status === 'unavailable' && isSelectedDayClosed) {
      return;
    }

    if (status === 'available' && !isSelectedDayClosed) {
      return;
    }

    const result = status === 'unavailable'
      ? await markCalendarDayUnavailable(selectedDate)
      : await reopenCalendarDay(selectedDate);

    if (!result.success) {
      Alert.alert(status === 'unavailable' ? 'Day not closed' : 'Day not reopened', result.message ?? 'Please try again.');
      return;
    }

    await refreshSlots();
  }

  function openAddSlotModal() {
    setEditingSlot(null);
    setStartTimeInput('');
    setEndTimeInput('');
    setIsManageModalVisible(false);
    setIsSlotModalVisible(true);
  }

  function openEditSlotModal(slot: CalendarTimeSlot) {
    if (slot.status === 'booked') {
      Alert.alert('Booked slot', 'Confirmed bookings cannot be edited here.');
      return;
    }

    if (!slot.isCustom || !slot.isSaved) {
      Alert.alert('Default available time', 'Default available times can only be marked available or unavailable.');
      return;
    }

    setEditingSlot(slot);
    setStartTimeInput(formatEditableTime(slot.startTime));
    setEndTimeInput(formatEditableTime(slot.endTime));
    setIsManageModalVisible(false);
    setIsSlotModalVisible(true);
  }

  async function saveSlotFromModal() {
    const parsedStart = parseTimeInput(startTimeInput);
    const parsedEnd = parseTimeInput(endTimeInput);

    if (!parsedStart || !parsedEnd) {
      Alert.alert('Check time format', 'Please enter times like 8:00 AM, 1:30 PM, or 18:00.');
      return;
    }

    if (parsedStart >= parsedEnd) {
      Alert.alert('Check time range', 'End time must be later than start time.');
      return;
    }

    const result = await saveCalendarSlot({
      date: selectedDate,
      endTime: parsedEnd,
      slotId: editingSlot?.id,
      startTime: parsedStart,
      status: editingSlot?.status === 'unavailable' ? 'unavailable' : 'available',
    });

    if (!result.success) {
      Alert.alert('Slot not saved', result.message ?? 'Please try again.');
      return;
    }

    setIsSlotModalVisible(false);
    setEditingSlot(null);
    setStartTimeInput('');
    setEndTimeInput('');
    await refreshSlots();
  }

  async function deleteSlot(slot: CalendarTimeSlot) {
    if (slot.status === 'booked') {
      Alert.alert('Booked slot', 'Confirmed booking slots cannot be deleted.');
      return;
    }

    if (!slot.isCustom || !slot.isSaved) {
      Alert.alert('Default available time', 'Default available times cannot be deleted. Mark them unavailable instead.');
      return;
    }

    const result = await deleteCalendarSlot(slot.id);

    if (!result.success) {
      Alert.alert('Slot not deleted', result.message ?? 'Please try again.');
      return;
    }

    await refreshSlots();
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Image
        contentFit="cover"
        source={require('@/assets/images/admin-calendar-background.png')}
        style={styles.timeSlotFigmaBackground}
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.timeSlotFigmaContent, { paddingBottom: bottomPadding, paddingTop: insets.top + 4 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.figmaDateHeaderRow}>
          <Pressable
            accessibilityLabel="Back to calendar"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.figmaBackButton, pressed && { opacity: 0.72 }]}>
            <BackIcon />
          </Pressable>
          <View style={styles.figmaDatePill}>
            <CalendarIcon />
            <Text style={styles.figmaDatePillText}>{formatFigmaDate(selectedDate)}</Text>
          </View>
        </View>

        <View style={styles.figmaSlotLegend}>
          <View style={styles.figmaLegendItem}>
            <View style={[styles.figmaLegendDot, styles.figmaAvailableDot]} />
            <Text style={styles.figmaLegendText}>Available</Text>
          </View>
          <View style={styles.figmaLegendItem}>
            <View style={[styles.figmaLegendDot, styles.figmaBookedDot]} />
            <Text style={styles.figmaLegendText}>Booked</Text>
          </View>
        </View>

        <View style={styles.figmaTimeSlotHeader}>
          <Text style={styles.figmaTimeSlotTitle}>Time Slots</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsManageModalVisible(true)}
            style={({ pressed }) => [styles.figmaEditButton, pressed && { opacity: 0.82 }]}>
            <PencilIcon />
            <Text style={styles.figmaEditButtonText}>Edit</Text>
          </Pressable>
        </View>

        <View style={styles.figmaTimeSlotList}>
          {isSelectedDayClosed ? (
            <View style={styles.figmaSlotCard}>
              <View style={styles.figmaSlotCardTop}>
                <ClockIcon />
                <View style={styles.figmaSlotCopy}>
                  <Text style={styles.figmaSlotTime}>Unavailable</Text>
                  <Text style={styles.figmaSlotDuration}>Full day</Text>
                </View>
                <View style={[styles.figmaStatusPill, styles.unavailableSlotPill]}>
                    <View style={[styles.figmaStatusPillDot, styles.figmaUnavailableDot]} />
                  <Text style={[styles.figmaStatusPillText, styles.unavailableSlotPillText]}>Unavailable</Text>
                </View>
              </View>
            </View>
          ) : visibleSlots.length ? (
            visibleSlots.map((slot) => (
              <View key={slot.id} style={styles.figmaSlotCard}>
                <View style={styles.figmaSlotCardTop}>
                  <ClockIcon />
                  <View style={styles.figmaSlotCopy}>
                    <Text style={styles.figmaSlotTime}>{formatCompactSlotTimeRange(slot)}</Text>
                    <Text style={styles.figmaSlotDuration}>{formatSlotDuration(slot)}</Text>
                  </View>
                  <View style={[styles.figmaStatusPill, getSlotStatusPillStyle(slot.status)]}>
                    <View style={[styles.figmaStatusPillDot, getSlotStatusDotStyle(slot.status)]} />
                    <Text style={[styles.figmaStatusPillText, getSlotStatusTextStyle(slot.status)]}>{formatShortSlotStatus(slot)}</Text>
                  </View>
                </View>
                {slot.status === 'booked' ? (
                  <View style={styles.figmaBookedInfoBox}>
                    <Text numberOfLines={1} style={styles.figmaBookedClient}>{slot.clientName ?? 'Client'}</Text>
                    <Text numberOfLines={1} style={styles.figmaBookedPackage}>Booked session</Text>
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <View style={styles.figmaSlotCard}>
              <View style={styles.figmaSlotCardTop}>
                <ClockIcon />
                <View style={styles.figmaSlotCopy}>
                  <Text style={styles.figmaSlotTime}>No time slots</Text>
                  <Text style={styles.figmaSlotDuration}>Use Edit to add time</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal animationType="fade" onRequestClose={() => setIsManageModalVisible(false)} transparent visible={isManageModalVisible}>
        <View style={styles.manageDateScreen}>
          <StatusBar style="dark" />
          <Image
            contentFit="cover"
            source={require('@/assets/images/admin-calendar-background.png')}
            style={styles.timeSlotFigmaBackground}
          />
          <ScrollView
            bounces={false}
            contentContainerStyle={[styles.manageDateContent, { paddingBottom: bottomPadding, paddingTop: insets.top + 4 }]}
            showsVerticalScrollIndicator={false}>
            <View style={styles.manageDateHeader}>
              <Pressable
                accessibilityLabel="Close manage date"
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => setIsManageModalVisible(false)}
                style={({ pressed }) => [styles.manageDateBackButton, pressed && { opacity: 0.72 }]}>
                <BackIcon />
              </Pressable>
              <Text style={styles.manageDateTitle}>Manage Date</Text>
            </View>

            <View style={styles.manageDateCard}>
              <Text style={styles.manageDateLabel}>Date</Text>
              <View style={styles.manageDateInput}>
                <Text style={styles.manageDateInputText}>{formatFigmaDate(selectedDate)}</Text>
                <CalendarIcon />
              </View>

              <Text style={styles.manageDateSectionLabel}>Status</Text>
              <View style={styles.manageStatusOptions}>
                <AvailabilityOption
                  active={!isSelectedDayClosed}
                  label="Available"
                  onPress={() => updateDayAvailability('available')}
                  tone="available"
                />
                <AvailabilityOption
                  active={isSelectedDayClosed}
                  label="Unavailable"
                  onPress={() => updateDayAvailability('unavailable')}
                  tone="unavailable"
                />
              </View>

              <View style={styles.manageTimeSlotsHeader}>
                <Text style={styles.manageDateSectionLabel}>Time Slots</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSelectedDayClosed}
                  onPress={openAddSlotModal}
                  style={({ pressed }) => [
                    styles.manageAddTimeButton,
                    isSelectedDayClosed && styles.disabledAddTimeButton,
                    pressed && !isSelectedDayClosed && { opacity: 0.84 },
                  ]}>
                  <Text style={styles.manageAddTimeText}>+ Add Time Slot</Text>
                </Pressable>
              </View>

              <View style={styles.manageSlotList}>
                {visibleSlots.length ? (
                  visibleSlots.map((slot) => (
                    <View key={slot.id} style={styles.manageSlotCard}>
                      <ManageClockIcon />
                      <Text numberOfLines={1} style={styles.manageSlotTime}>{formatCompactSlotTimeRange(slot)}</Text>
                      <View style={styles.manageSlotActions}>
                        <Pressable accessibilityLabel="Edit time slot" accessibilityRole="button" hitSlop={8} onPress={() => openEditSlotModal(slot)}>
                          <SmallPencilIcon />
                        </Pressable>
                        <Pressable accessibilityLabel="Delete time slot" accessibilityRole="button" hitSlop={8} onPress={() => deleteSlot(slot)}>
                          <DeleteIcon />
                        </Pressable>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.manageSlotCard}>
                    <ManageClockIcon />
                    <Text style={styles.manageSlotTime}>{isSelectedDayClosed ? 'Unavailable all day' : 'No time slots'}</Text>
                  </View>
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => setIsManageModalVisible(false)}
                style={({ pressed }) => [styles.manageSaveButton, pressed && { opacity: 0.86 }]}>
                <Text style={styles.manageSaveText}>Save</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setIsSlotModalVisible(false)} transparent visible={isSlotModalVisible}>
        <View style={styles.timeEntryOverlay}>
          <View style={styles.timeEntryCard}>
            <View style={styles.timeEntryHeader}>
              <Text style={styles.timeEntryTitle}>{editingSlot ? 'Edit Time Slot' : 'Add Time Slot'}</Text>
              <Pressable
                accessibilityLabel="Close time slot form"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => setIsSlotModalVisible(false)}
                style={({ pressed }) => [styles.timeEntryCloseButton, pressed && { opacity: 0.72 }]}>
                <CloseIcon />
              </Pressable>
            </View>
            <View style={styles.timeEntryFields}>
              <View style={styles.timeEntryField}>
                <Text style={[styles.formLabel, styles.timeEntryLabel]}>Start Time</Text>
                <TextInput
                  accessibilityLabel="Start time"
                  onChangeText={setStartTimeInput}
                  placeholder="8:00 AM"
                  placeholderTextColor="#8AA3C3"
                  style={styles.calendarSlotInput}
                  value={startTimeInput}
                />
              </View>
              <View style={styles.timeEntryField}>
                <Text style={[styles.formLabel, styles.timeEntryLabel]}>End Time</Text>
                <TextInput
                  accessibilityLabel="End time"
                  onChangeText={setEndTimeInput}
                  placeholder="10:00 AM"
                  placeholderTextColor="#8AA3C3"
                  style={styles.calendarSlotInput}
                  value={endTimeInput}
                />
              </View>
            </View>
            <View style={styles.timeEntryActions}>
              <Pressable accessibilityRole="button" onPress={() => setIsSlotModalVisible(false)} style={styles.timeEntryCancelButton}>
                <Text style={styles.timeEntryCancelText}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={saveSlotFromModal} style={styles.timeEntrySubmitButton}>
                <Text style={styles.timeEntrySubmitText}>{editingSlot ? 'Update' : 'Add'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AvailabilityOption({
  active,
  label,
  onPress,
  tone,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  tone: 'available' | 'unavailable';
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayAvailabilityOption,
        active && (tone === 'available' ? styles.activeAvailableOption : styles.activeUnavailableOption),
        pressed && { opacity: 0.84 },
      ]}>
      <View style={[styles.radioOuter, active && (tone === 'available' ? styles.availableRadioOuter : styles.unavailableRadioOuter)]}>
        {active ? <View style={[styles.radioInner, tone === 'available' ? styles.availableRadioInner : styles.unavailableRadioInner]} /> : null}
      </View>
      <Text style={[styles.dayAvailabilityOptionText, active && styles.activeDayAvailabilityOptionText]}>{label}</Text>
    </Pressable>
  );
}

function normalizeDateParam(value?: string | string[]) {
  const date = Array.isArray(value) ? value[0] : value;

  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getCurrentDateString();
}

function formatFigmaDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

function formatShortSlotStatus(slot: CalendarTimeSlot) {
  if (slot.status === 'booked') return 'Booked';
  if (slot.status === 'unavailable') return 'Unavailable';

  return 'Available';
}

function formatCompactSlotTimeRange(slot: CalendarTimeSlot) {
  const start = getCompactTimeParts(slot.startTime);
  const end = getCompactTimeParts(slot.endTime);

  if (start.period === end.period) {
    return `${start.time} - ${end.time} ${end.period}`;
  }

  return `${start.time} ${start.period} - ${end.time} ${end.period}`;
}

function getCompactTimeParts(value: string) {
  const [hourText = '0', minuteText = '0'] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return {
    period,
    time: `${displayHour}:${String(minute).padStart(2, '0')}`,
  };
}

function formatSlotDuration(slot: CalendarTimeSlot) {
  const start = getTimeMinutes(slot.startTime);
  const end = getTimeMinutes(slot.endTime);
  const totalMinutes = Math.max(0, end - start);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}.${minutes === 30 ? '5' : String(minutes).padStart(2, '0')} hours`;
  }

  if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `${minutes} minutes`;
}

function getTimeMinutes(value: string) {
  const [hour = '0', minute = '0'] = value.split(':');

  return Number(hour) * 60 + Number(minute);
}

function isFullDayUnavailableSlot(slot: Pick<CalendarTimeSlot, 'endTime' | 'startTime' | 'status'>) {
  return slot.status === 'unavailable' && slot.startTime === '00:00:00' && slot.endTime === '23:59:00';
}

function formatEditableTime(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function parseTimeInput(value: string) {
  const trimmedValue = value.trim().toUpperCase();
  const match = trimmedValue.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const period = match[3];

  if (minute > 59 || hour > 23 || hour < 0) {
    return null;
  }

  if (period) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    if (period === 'PM' && hour !== 12) {
      hour += 12;
    }

    if (period === 'AM' && hour === 12) {
      hour = 0;
    }
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function getSlotStatusPillStyle(status: CalendarTimeSlot['status']) {
  if (status === 'booked') return styles.bookedSlotPill;
  if (status === 'unavailable') return styles.unavailableSlotPill;

  return styles.availableSlotPill;
}

function getSlotStatusTextStyle(status: CalendarTimeSlot['status']) {
  if (status === 'booked') return styles.bookedSlotPillText;
  if (status === 'unavailable') return styles.unavailableSlotPillText;

  return styles.availableSlotPillText;
}

function getSlotStatusDotStyle(status: CalendarTimeSlot['status']) {
  if (status === 'booked') return styles.figmaBookedDot;
  if (status === 'unavailable') return styles.figmaUnavailableDot;

  return styles.figmaAvailableDot;
}

function BackIcon() {
  return (
    <Svg width={35} height={35} viewBox="0 0 35 35" fill="none">
      <Path d="M21.9 7.3L11.7 17.5L21.9 27.7" stroke="#083979" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
    </Svg>
  );
}

function CalendarIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path d="M7 3.5V6.5M17 3.5V6.5M4.5 9H19.5M6.5 5H17.5C18.6 5 19.5 5.9 19.5 7V18C19.5 19.1 18.6 20 17.5 20H6.5C5.4 20 4.5 19.1 4.5 18V7C4.5 5.9 5.4 5 6.5 5Z" stroke="#083979" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
      <Circle cx={24} cy={24} r={24} fill="#E4EEFC" />
      <Circle cx={24} cy={24} r={11} stroke="#536B86" strokeWidth={3.2} />
      <Path d="M24 16.4V24L29.2 27" stroke="#536B86" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.2} />
    </Svg>
  );
}

function PencilIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M4.4 17.9L5.5 13.5L16.6 2.4C17.6 1.4 19 1.4 20 2.4L21.6 4C22.6 5 22.6 6.4 21.6 7.4L10.5 18.5L6.1 19.6C5 19.9 4.1 19 4.4 17.9Z" fill="#ffffff" />
    </Svg>
  );
}

function ManageClockIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <Circle cx={20} cy={20} r={20} fill="#E4EEFC" />
      <Circle cx={20} cy={20} r={9.2} stroke="#536B86" strokeWidth={2.7} />
      <Path d="M20 13.7V20L24.3 22.5" stroke="#536B86" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.7} />
    </Svg>
  );
}

function SmallPencilIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M4.5 17.8L5.6 13.7L16 3.3C17 2.3 18.5 2.3 19.5 3.3L20.7 4.5C21.7 5.5 21.7 7 20.7 8L10.3 18.4L6.2 19.5C5.1 19.8 4.2 18.9 4.5 17.8Z" fill="#142C4C" />
    </Svg>
  );
}

function DeleteIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30" fill="none">
      <Path d="M8.8 10.3H21.2L20.2 24.2C20.1 25.2 19.3 26 18.2 26H11.8C10.7 26 9.9 25.2 9.8 24.2L8.8 10.3Z" fill="#D71920" />
      <Path d="M7 7.8H23" stroke="#D71920" strokeLinecap="round" strokeWidth={2.6} />
      <Path d="M12.3 7.8V5.8C12.3 4.8 13.1 4 14.1 4H15.9C16.9 4 17.7 4.8 17.7 5.8V7.8" stroke="#D71920" strokeLinecap="round" strokeWidth={2.6} />
      <Path d="M13.1 13.6V22M16.9 13.6V22" stroke="#ffffff" strokeLinecap="round" strokeWidth={1.9} />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={34} height={34} viewBox="0 0 34 34" fill="none">
      <Path d="M10.5 10.5L23.5 23.5M23.5 10.5L10.5 23.5" stroke="#142C4C" strokeLinecap="round" strokeWidth={4} />
    </Svg>
  );
}
