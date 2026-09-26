import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  addMonthsToMonthPrefix,
  buildCalendarGridDays,
  deleteCalendarSlot,
  formatCalendarMonthLabel,
  formatSlotTimeRange,
  getCalendarDaySummaries,
  getClampedDateInMonth,
  getCalendarSlotsForDate,
  getCurrentDateString,
  getMonthPrefix,
  markCalendarDayUnavailable,
  markCalendarSlot,
  reopenCalendarDay,
  saveCalendarSlot,
} from '@/services/calendar';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type CalendarDaySummary, type CalendarTimeSlot } from '@/types/calendar';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const initialSelectedDate = getCurrentDateString();

export default function PhotographerCalendarScreen() {
  const insets = useSafeAreaInsets();
  const [calendarMonth, setCalendarMonth] = useState(getMonthPrefix(initialSelectedDate));
  const [daySummaries, setDaySummaries] = useState<CalendarDaySummary[]>([]);
  const [editingSlot, setEditingSlot] = useState<CalendarTimeSlot | null>(null);
  const [endTimeInput, setEndTimeInput] = useState('');
  const [fullDayAction, setFullDayAction] = useState<'close' | 'reopen' | null>(null);
  const [fullDayError, setFullDayError] = useState('');
  const [isSlotModalVisible, setIsSlotModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [selectedSlots, setSelectedSlots] = useState<CalendarTimeSlot[]>([]);
  const [startTimeInput, setStartTimeInput] = useState('');
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const calendarDays = useMemo(() => buildCalendarGridDays(calendarMonth, false), [calendarMonth]);
  const isSelectedDayClosed = selectedSlots.some(isFullDayUnavailableSlot);
  const summariesByDate = useMemo(() => {
    const map = new Map<string, CalendarDaySummary>();

    for (const summary of daySummaries) {
      map.set(summary.date, summary);
    }

    return map;
  }, [daySummaries]);

  async function refreshCalendar(date = selectedDate, monthPrefix = calendarMonth) {
    const { slots, summaries } = await loadCalendarData(date, monthPrefix);

    setDaySummaries(summaries);
    setSelectedSlots(slots);
  }

  async function changeMonth(monthOffset: number) {
    const nextMonth = addMonthsToMonthPrefix(calendarMonth, monthOffset);
    const preferredDay = Number(selectedDate.slice(-2));
    const nextSelectedDate = getClampedDateInMonth(nextMonth, preferredDay);
    const { slots, summaries } = await loadCalendarData(nextSelectedDate, nextMonth);

    setCalendarMonth(nextMonth);
    setSelectedDate(nextSelectedDate);
    setDaySummaries(summaries);
    setSelectedSlots(slots);
  }

  async function updateSlot(slot: CalendarTimeSlot, status: 'available' | 'unavailable') {
    if (slot.status === 'booked') {
      Alert.alert('Booked slot', 'Confirmed bookings cannot be marked available or unavailable here.');
      return;
    }

    const result = await markCalendarSlot({
      date: selectedDate,
      endTime: slot.endTime,
      startTime: slot.startTime,
      status,
    });

    if (!result.success) {
      Alert.alert('Slot not updated', result.message ?? 'Please try again.');
      return;
    }

    await refreshCalendar(selectedDate);
  }

  function openAddSlotModal() {
    setEditingSlot(null);
    setStartTimeInput('');
    setEndTimeInput('');
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
    await refreshCalendar(selectedDate);
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

    await refreshCalendar(selectedDate);
  }

  function handleFullDayToggle() {
    setFullDayError('');
    setFullDayAction(isSelectedDayClosed ? 'reopen' : 'close');
  }

  async function confirmFullDayAction() {
    const action = fullDayAction;

    if (!action) {
      return;
    }

    const result = action === 'close' ? await markCalendarDayUnavailable(selectedDate) : await reopenCalendarDay(selectedDate);

    if (!result.success) {
      setFullDayError(result.message ?? 'Please try again.');
      return;
    }

    setFullDayError('');
    setFullDayAction(null);
    await refreshCalendar(selectedDate);
  }

  useFocusEffect(
    useCallback(() => {
    let isMounted = true;

    loadCalendarData(selectedDate, calendarMonth).then(({ slots, summaries }) => {
      if (isMounted) {
        setDaySummaries(summaries);
        setSelectedSlots(slots);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [calendarMonth, selectedDate]));

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.adminCalendarContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.calendarHeaderRow}>
          <View>
            <Text style={styles.adminPageTitle}>Calendar</Text>
            <Text style={styles.adminPageSubtitle}>Manage your schedule.</Text>
          </View>
          <Pressable accessibilityLabel="Add available time" accessibilityRole="button" onPress={openAddSlotModal} style={styles.calendarAddButton}>
            <PlusIcon />
          </Pressable>
        </View>

        <View style={styles.calendarMonthCard}>
          <View style={styles.calendarMonthHeader}>
            <Pressable accessibilityLabel="Previous month" accessibilityRole="button" onPress={() => changeMonth(-1)}>
              <ChevronLeft />
            </Pressable>
            <Text style={styles.calendarMonthText}>{formatCalendarMonthLabel(calendarMonth)}</Text>
            <Pressable accessibilityLabel="Next month" accessibilityRole="button" onPress={() => changeMonth(1)}>
              <ChevronRight />
            </Pressable>
          </View>

          <View style={styles.calendarGrid}>
            {weekDays.map((day) => (
              <Text key={day} style={styles.calendarWeekText}>{day}</Text>
            ))}
            {calendarDays.map((calendarDay, index) => {
              const date = calendarDay.isCurrentMonth ? calendarDay.date : '';
              const isSelected = date === selectedDate;
              const daySummary = calendarDay.isCurrentMonth ? summariesByDate.get(calendarDay.date) : undefined;
              const isUnavailable = Boolean(daySummary?.hasUnavailable);
              const isAvailable = Boolean(daySummary?.hasAvailable);
              const isBooked = Boolean(daySummary?.hasBooked);

              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={!calendarDay.isCurrentMonth}
                  key={`${calendarDay.date}-${index}`}
                  onPress={async () => {
                    if (!calendarDay.isCurrentMonth) return;

                    setSelectedDate(date);
                    setSelectedSlots(await getCalendarSlotsForDate(date));
                  }}
                  style={[styles.calendarDayCell, isSelected && styles.selectedCalendarDay]}>
                  {calendarDay.isCurrentMonth && (
                    <>
                      <Text style={[styles.calendarDayText, isUnavailable && styles.unavailableDayText, isSelected && styles.selectedDayText]}>
                        {calendarDay.day}
                      </Text>
                      <View style={styles.calendarDots}>
                        {isAvailable && <View style={[styles.calendarDot, styles.availableDot]} />}
                        {isBooked && <View style={[styles.calendarDot, styles.bookedDot]} />}
                        {isUnavailable && <View style={[styles.calendarDot, styles.unavailableDot]} />}
                      </View>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.calendarLegendRow}>
          <LegendItem color="#4FB69F" label="Available" />
          <LegendItem color="#142C4C" label="Booked" />
          <LegendItem color="#F37C7E" label="Unavailable" />
        </View>

        <View style={styles.timeSlotPanel}>
          <View style={styles.timeSlotPanelHeaderRow}>
            <View style={styles.timeSlotPanelCopy}>
              <Text style={styles.timeSlotPanelTitle}>{formatSelectedDate(selectedDate)}</Text>
              <Text style={styles.timeSlotPanelSubtitle}>
                {isSelectedDayClosed
                  ? 'This full day is closed. Clients cannot choose any time on this date.'
                  : 'Set the time range when you are open for bookings. Client booking times will be created automatically based on service duration.'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={handleFullDayToggle}
              style={[styles.fullDayButton, isSelectedDayClosed && styles.reopenDayButton]}>
              <Text style={[styles.fullDayButtonText, isSelectedDayClosed && styles.reopenDayButtonText]}>
                {isSelectedDayClosed ? 'Reopen Day' : 'Close Day'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.timeSlotList}>
            {selectedSlots.map((slot) => (
              <View key={slot.id} style={styles.timeSlotCard}>
                <View style={styles.timeSlotCopy}>
                  <Text style={styles.timeSlotTime}>{formatSlotTimeRange(slot)}</Text>
                  <Text style={styles.timeSlotStatus}>
                    {formatSlotStatus(slot)}
                  </Text>
                </View>
                {!isFullDayUnavailableSlot(slot) ? (
                  <View style={styles.timeSlotActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={slot.status === 'booked'}
                      onPress={() => updateSlot(slot, 'available')}
                      style={[styles.slotAvailableButton, slot.status === 'available' && styles.activeSlotButton]}>
                      <Text style={styles.slotAvailableText}>Available</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={slot.status === 'booked'}
                      onPress={() => updateSlot(slot, 'unavailable')}
                      style={[styles.slotUnavailableButton, slot.status === 'unavailable' && styles.activeUnavailableButton]}>
                      <Text style={styles.slotUnavailableText}>Unavailable</Text>
                    </Pressable>
                  </View>
                ) : null}
                {slot.isCustom && slot.isSaved && slot.status !== 'booked' && !isFullDayUnavailableSlot(slot) ? (
                  <View style={styles.timeSlotManageRow}>
                    <Pressable accessibilityRole="button" onPress={() => openEditSlotModal(slot)} style={styles.slotEditButton}>
                      <Text style={styles.slotEditText}>Edit</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => deleteSlot(slot)} style={styles.slotDeleteButton}>
                      <Text style={styles.slotDeleteText}>Delete</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <Modal animationType="fade" onRequestClose={() => setIsSlotModalVisible(false)} transparent visible={isSlotModalVisible}>
        <View style={styles.rejectModalOverlay}>
          <View style={styles.rejectModalCard}>
            <Text style={styles.rejectModalTitle}>{editingSlot ? 'Edit Available Time' : 'Add Available Time'}</Text>
            <Text style={styles.rejectModalMessage}>{formatSelectedDate(selectedDate)}</Text>
            <View style={styles.calendarSlotFieldRow}>
              <View style={styles.calendarSlotField}>
                <Text style={styles.formLabel}>Start Time</Text>
                <TextInput
                  accessibilityLabel="Start time"
                  onChangeText={setStartTimeInput}
                  placeholder="8:00 AM"
                  placeholderTextColor="#8AA3C3"
                  style={styles.calendarSlotInput}
                  value={startTimeInput}
                />
              </View>
              <View style={styles.calendarSlotField}>
                <Text style={styles.formLabel}>End Time</Text>
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
            <View style={styles.rejectModalActions}>
              <Pressable accessibilityRole="button" onPress={() => setIsSlotModalVisible(false)} style={styles.rejectModalCancelButton}>
                <Text style={styles.rejectModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={saveSlotFromModal} style={styles.formSaveButton}>
                <Text style={styles.formSaveText}>{editingSlot ? 'Save' : 'Add Time'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => {
          setFullDayError('');
          setFullDayAction(null);
        }}
        transparent
        visible={Boolean(fullDayAction)}>
        <View style={styles.rejectModalOverlay}>
          <View style={styles.rejectModalCard}>
            <Text style={styles.rejectModalTitle}>
              {fullDayError ? 'Day not closed' : fullDayAction === 'reopen' ? 'Reopen this day?' : 'Close this full day?'}
            </Text>
            <Text style={styles.rejectModalMessage}>
              {fullDayError ||
                (fullDayAction === 'reopen'
                  ? 'This will remove the full-day unavailable marker and restore normal available times.'
                  : 'Clients will not be able to choose any time on this date.')}
            </Text>
            <View style={styles.rejectModalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFullDayError('');
                  setFullDayAction(null);
                }}
                style={styles.rejectModalCancelButton}>
                <Text style={styles.rejectModalCancelText}>
                  {fullDayError ? 'OK' : fullDayAction === 'reopen' ? 'Keep Closed' : 'Cancel'}
                </Text>
              </Pressable>
              {!fullDayError ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={confirmFullDayAction}
                  style={fullDayAction === 'close' ? styles.rejectModalSubmitButton : styles.formSaveButton}>
                  <Text style={fullDayAction === 'close' ? styles.rejectModalSubmitText : styles.formSaveText}>
                    {fullDayAction === 'reopen' ? 'Reopen Day' : 'Close Day'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatSelectedDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

function formatSlotStatus(slot: CalendarTimeSlot) {
  if (isFullDayUnavailableSlot(slot)) {
    return 'Full day unavailable';
  }

  if (slot.status === 'booked') {
    return `Booked${slot.clientName ? ` by ${slot.clientName}` : ''}`;
  }

  const source = slot.isCustom ? 'Custom available time' : 'Default available time';

  return slot.status === 'available' ? `${source} | Available for booking` : `${source} | Unavailable`;
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

async function loadCalendarData(date: string, monthPrefix: string) {
  const [summaries, slots] = await Promise.all([
    getCalendarDaySummaries(monthPrefix),
    getCalendarSlotsForDate(date),
  ]);

  return { slots, summaries };
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function PlusIcon() {
  return (
    <Svg width={27} height={27} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5V19M5 12H19" stroke="#ffffff" strokeLinecap="round" strokeWidth={2.5} />
    </Svg>
  );
}

function ChevronLeft() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#4C77A5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5L16 12L9 19" stroke="#4C77A5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />
    </Svg>
  );
}
