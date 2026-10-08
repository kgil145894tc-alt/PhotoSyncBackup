import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll as useNavScroll } from '@/hooks/use-client-nav-scroll';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { showAppAlert } from '@/components/app-alert';
import { useAdminCalendarDay } from '@/hooks/use-admin-calendar';
import { useStudioCalendarClock } from '@/hooks/use-studio-calendar-clock';
import { getCalendarDayValidationError, getCalendarSlotValidationError, getStudioDateTime, isValidCalendarDate } from '@/services/calendar-date-guards';
import {
  deleteCalendarSlot,
  markCalendarDayUnavailable,
  reopenCalendarDay,
  saveCalendarSlot,
} from '@/services/calendar';
import { adminCalendarSlotsStyles as styles } from '@/styles/admin-calendar-slots.styles';
import { adminColors } from '@/styles/admin-theme';
import { type CalendarTimeSlot } from '@/types/calendar';

type TimeSlotNotice = {
  message: string;
  title: string;
};

export default function PhotographerCalendarSlotsScreen() {
  const navHeight = useBottomNavHeight('admin');
  const navScroll = useNavScroll();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const compactCards = width / fontScale < 440;
  const { date } = useLocalSearchParams<{ date?: string }>();
  const selectedDate = normalizeDateParam(date);
  const now = useStudioCalendarClock();
  const dayError = getCalendarDayValidationError(selectedDate, now);
  const [editingSlot, setEditingSlot] = useState<CalendarTimeSlot | null>(null);
  const [endTimeInput, setEndTimeInput] = useState('');
  const [isManageModalVisible, setIsManageModalVisible] = useState(false);
  const [isDeletingSlot, setIsDeletingSlot] = useState(false);
  const [isSlotModalVisible, setIsSlotModalVisible] = useState(false);
  const [pendingDeleteSlot, setPendingDeleteSlot] = useState<CalendarTimeSlot | null>(null);
  const { items: selectedSlots, error, isLoading, isRefreshing, refresh, reconcile: refreshSlots } = useAdminCalendarDay(selectedDate);
  const [startTimeInput, setStartTimeInput] = useState('');
  const [timeSlotNotice, setTimeSlotNotice] = useState<TimeSlotNotice | null>(null);
  const bottomPadding = navHeight + insets.bottom + 24;
  const isSelectedDayClosed = selectedSlots.some(isFullDayUnavailableSlot);
  const visibleSlots = useMemo(
    () => selectedSlots.filter((slot) => !isFullDayUnavailableSlot(slot)),
    [selectedSlots],
  );

  function canManageDay() {
    const message = getCalendarDayValidationError(selectedDate);
    if (!message) return true;
    showAppAlert('Date is read-only', message);
    return false;
  }

  async function updateDayAvailability(status: 'available' | 'unavailable') {
    if (!canManageDay()) return;
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
      showAppAlert(status === 'unavailable' ? 'Day not closed' : 'Day not reopened', result.message ?? 'Please try again.');
      return;
    }

    await refreshSlots();
  }

  function openAddSlotModal() {
    if (!canManageDay()) return;
    setEditingSlot(null);
    setStartTimeInput('');
    setEndTimeInput('');
    setIsSlotModalVisible(true);
  }

  function openEditSlotModal(slot: CalendarTimeSlot) {
    if (!canManageDay()) return;
    if (slot.status === 'booked') {
      setTimeSlotNotice({
        message: 'Confirmed bookings cannot be edited here.',
        title: 'Booked slot',
      });
      return;
    }

    if (!slot.isCustom || !slot.isSaved) {
      setTimeSlotNotice({
        message: 'Default available times can only be marked available or unavailable.',
        title: 'Default available time',
      });
      return;
    }

    setEditingSlot(slot);
    setStartTimeInput(formatEditableTime(slot.startTime));
    setEndTimeInput(formatEditableTime(slot.endTime));
    setIsSlotModalVisible(true);
  }

  async function saveSlotFromModal() {
    if (!canManageDay()) return;
    const parsedStart = parseTimeInput(startTimeInput);
    const parsedEnd = parseTimeInput(endTimeInput);

    if (!parsedStart || !parsedEnd) {
      setTimeSlotNotice({
        message: 'Please enter times like 8:00 AM, 1:30 PM, or 18:00.',
        title: 'Check time format',
      });
      return;
    }

    if (parsedStart >= parsedEnd) {
      setTimeSlotNotice({
        message: 'End time must be later than start time.',
        title: 'Check time range',
      });
      return;
    }

    const validationError = getCalendarSlotValidationError(selectedDate, parsedStart, parsedEnd);
    if (validationError) {
      setTimeSlotNotice({ title: 'Slot not saved', message: validationError });
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
      setTimeSlotNotice({
        message: result.message ?? 'Please try again.',
        title: 'Slot not saved',
      });
      return;
    }

    setIsSlotModalVisible(false);
    setEditingSlot(null);
    setStartTimeInput('');
    setEndTimeInput('');
    await refreshSlots();
  }

  function openDeleteSlotModal(slot: CalendarTimeSlot) {
    if (!canManageDay()) return;
    if (slot.status === 'booked') {
      setTimeSlotNotice({
        message: 'Confirmed booking slots cannot be deleted.',
        title: 'Booked slot',
      });
      return;
    }

    if (!slot.isCustom || !slot.isSaved) {
      setTimeSlotNotice({
        message: 'Default available times cannot be deleted. Mark them unavailable instead.',
        title: 'Default available time',
      });
      return;
    }

    setPendingDeleteSlot(slot);
  }

  async function deletePendingSlot() {
    if (!pendingDeleteSlot || isDeletingSlot) {
      return;
    }
    if (!canManageDay()) return;

    setIsDeletingSlot(true);
    const result = await deleteCalendarSlot(pendingDeleteSlot.id, selectedDate);
    setIsDeletingSlot(false);

    if (!result.success) {
      showAppAlert('Slot not deleted', result.message ?? 'Please try again.');
      return;
    }

    setPendingDeleteSlot(null);
    await refreshSlots();
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        {...navScroll}
        alwaysBounceVertical
        contentContainerStyle={[styles.timeSlotFigmaContent, { paddingBottom: bottomPadding, paddingTop: insets.top + 4 }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { void refresh(); }} />}
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
            accessibilityLabel="Manage time slots"
            disabled={isLoading || Boolean(error) || Boolean(dayError)}
            onPress={() => { if (canManageDay()) setIsManageModalVisible(true); }}
            style={({ pressed }) => [styles.figmaEditButton, dayError && { opacity: 0.45 }, pressed && { opacity: 0.82 }]}>
            <PencilIcon />
            <Text style={styles.figmaEditButtonText}>Edit</Text>
          </Pressable>
        </View>

        {dayError ? <Text accessibilityLiveRegion="polite" style={styles.adminPageSubtitle}>{dayError}</Text> : null}

        {isLoading || error ? (
          <Text accessibilityLiveRegion="polite" style={styles.adminPageSubtitle}>
            {error ?? 'Loading time slots...'}
          </Text>
        ) : null}

        <View style={styles.figmaTimeSlotList}>
          {isSelectedDayClosed ? (
            <View style={styles.figmaSlotCard}>
              <View style={[styles.figmaSlotCardTop, compactCards && styles.slotCardCompact]}>
                <View style={[styles.slotIdentity, compactCards && styles.slotIdentityCompact]}>
                  <ClockIcon />
                  <View style={styles.figmaSlotCopy}>
                    <Text style={styles.figmaSlotTime}>Unavailable</Text>
                    <Text style={styles.figmaSlotDuration}>Full day</Text>
                  </View>
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
                <View style={[styles.figmaSlotCardTop, compactCards && styles.slotCardCompact]}>
                  <View style={[styles.slotIdentity, compactCards && styles.slotIdentityCompact]}>
                    <ClockIcon />
                    <View style={styles.figmaSlotCopy}>
                      <Text style={styles.figmaSlotTime}>{formatCompactSlotTimeRange(slot)}</Text>
                      <Text style={styles.figmaSlotDuration}>{formatSlotDuration(slot)}</Text>
                    </View>
                  </View>
                  <View style={[styles.figmaStatusPill, getSlotStatusPillStyle(slot.status)]}>
                    <View style={[styles.figmaStatusPillDot, getSlotStatusDotStyle(slot.status)]} />
                    <Text style={[styles.figmaStatusPillText, getSlotStatusTextStyle(slot.status)]}>{formatShortSlotStatus(slot)}</Text>
                  </View>
                </View>
                {slot.status === 'booked' ? (
                  <View style={styles.figmaBookedInfoBox}>
                    <Text style={styles.figmaBookedClient}>{slot.clientName ?? 'Client'}</Text>
                    <Text style={styles.figmaBookedPackage}>Booked session</Text>
                  </View>
                ) : null}
              </View>
            ))
          ) : !isLoading && !error ? (
            <View style={styles.figmaSlotCard}>
              <View style={styles.figmaSlotCardTop}>
                <ClockIcon />
                <View style={styles.figmaSlotCopy}>
                  <Text style={styles.figmaSlotTime}>No time slots</Text>
                  <Text style={styles.figmaSlotDuration}>{dayError ? 'Past dates are view only' : 'Use Edit to add time'}</Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          setIsManageModalVisible(false);
          setIsSlotModalVisible(false);
          setPendingDeleteSlot(null);
          setTimeSlotNotice(null);
        }}
        transparent
        visible={isManageModalVisible}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.manageDateScreen}>
          <StatusBar style="dark" />
          <ScrollView
            accessibilityElementsHidden={isSlotModalVisible || Boolean(pendingDeleteSlot) || Boolean(timeSlotNotice)}
            bounces={false}
            contentContainerStyle={[styles.manageDateContent, { paddingBottom: bottomPadding, paddingTop: insets.top + 4 }]}
            importantForAccessibility={isSlotModalVisible || pendingDeleteSlot || timeSlotNotice ? 'no-hide-descendants' : 'auto'}
            showsVerticalScrollIndicator={false}>
            <View style={styles.manageDateHeader}>
              <Pressable
                accessibilityLabel="Close manage date"
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => {
                  setIsManageModalVisible(false);
                  setIsSlotModalVisible(false);
                  setPendingDeleteSlot(null);
                  setTimeSlotNotice(null);
                }}
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
                  disabled={Boolean(dayError)}
                  label="Available"
                  onPress={() => updateDayAvailability('available')}
                  tone="available"
                />
                <AvailabilityOption
                  active={isSelectedDayClosed}
                  disabled={Boolean(dayError)}
                  label="Unavailable"
                  onPress={() => updateDayAvailability('unavailable')}
                  tone="unavailable"
                />
              </View>

              <View style={styles.manageTimeSlotsHeader}>
                <Text style={styles.manageDateSectionLabel}>Time Slots</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSelectedDayClosed || Boolean(dayError)}
                  onPress={openAddSlotModal}
                  style={({ pressed }) => [
                    styles.manageAddTimeButton,
                    (isSelectedDayClosed || dayError) && styles.disabledAddTimeButton,
                    pressed && !isSelectedDayClosed && { opacity: 0.84 },
                  ]}>
                  <Text style={styles.manageAddTimeText}>+ Add Time Slot</Text>
                </Pressable>
              </View>

              <View style={styles.manageSlotList}>
                {visibleSlots.length ? (
                  visibleSlots.map((slot) => (
                    <View key={slot.id} style={[styles.manageSlotCard, compactCards && styles.slotCardCompact]}>
                      <View style={[styles.slotIdentity, compactCards && styles.slotIdentityCompact]}>
                        <ManageClockIcon />
                        <View style={styles.manageSlotCopy}>
                          <Text style={styles.manageSlotTime}>{formatCompactSlotTimeRange(slot)}</Text>
                          <View style={[styles.figmaStatusPill, getSlotStatusPillStyle(slot.status)]}>
                            <View style={[styles.figmaStatusPillDot, getSlotStatusDotStyle(slot.status)]} />
                            <Text style={[styles.figmaStatusPillText, getSlotStatusTextStyle(slot.status)]}>{formatShortSlotStatus(slot)}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.manageSlotActions}>
                        <Pressable accessibilityLabel="Edit time slot" accessibilityRole="button" disabled={Boolean(dayError)} hitSlop={8} onPress={() => openEditSlotModal(slot)} style={({ pressed }) => [styles.manageSlotActionButton, dayError && { opacity: 0.45 }, pressed && { opacity: 0.72 }]}>
                          <SmallPencilIcon />
                        </Pressable>
                        <Pressable accessibilityLabel="Delete time slot" accessibilityRole="button" disabled={Boolean(dayError)} hitSlop={8} onPress={() => openDeleteSlotModal(slot)} style={({ pressed }) => [styles.manageSlotActionButton, styles.manageSlotDeleteButton, dayError && { opacity: 0.45 }, pressed && { opacity: 0.72 }]}>
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
                onPress={() => {
                  setIsManageModalVisible(false);
                  setIsSlotModalVisible(false);
                  setPendingDeleteSlot(null);
                  setTimeSlotNotice(null);
                }}
                style={({ pressed }) => [styles.manageSaveButton, pressed && { opacity: 0.86 }]}>
                <Text style={styles.manageSaveText}>Save</Text>
              </Pressable>
            </View>
          </ScrollView>

          {isSlotModalVisible ? (
            <View
              accessibilityElementsHidden={Boolean(pendingDeleteSlot) || Boolean(timeSlotNotice)}
              accessibilityViewIsModal={!pendingDeleteSlot && !timeSlotNotice}
              importantForAccessibility={pendingDeleteSlot || timeSlotNotice ? 'no-hide-descendants' : 'auto'}
              style={[styles.timeEntryOverlay, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
              <View style={styles.timeEntryCard}><ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%', flexShrink: 1 }} contentContainerStyle={styles.timeEntryScrollContent}>
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
                <Text style={styles.timeEntryDate}>{formatFigmaDate(selectedDate)}</Text>
                <View style={styles.timeEntryFields}>
                  <View style={styles.timeEntryField}>
                    <Text style={[styles.formLabel, styles.timeEntryLabel]}>Start Time</Text>
                    <TextInput
                      accessibilityLabel="Start time"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      onChangeText={setStartTimeInput}
                      placeholder="8:00 AM"
                      placeholderTextColor="#65758B"
                      style={styles.calendarSlotInput}
                      value={startTimeInput}
                    />
                  </View>
                  <View style={styles.timeEntryField}>
                    <Text style={[styles.formLabel, styles.timeEntryLabel]}>End Time</Text>
                    <TextInput
                      accessibilityLabel="End time"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      onChangeText={setEndTimeInput}
                      placeholder="10:00 AM"
                      placeholderTextColor="#65758B"
                      style={styles.calendarSlotInput}
                      value={endTimeInput}
                    />
                  </View>
                </View>
                <View style={styles.timeEntryActions}>
                  <Pressable accessibilityRole="button" onPress={() => setIsSlotModalVisible(false)} style={({ pressed }) => [styles.timeEntryCancelButton, pressed && { opacity: 0.72 }]}>
                    <Text style={styles.timeEntryCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={Boolean(dayError)} onPress={saveSlotFromModal} style={({ pressed }) => [styles.timeEntrySubmitButton, dayError && { opacity: 0.45 }, pressed && { opacity: 0.82 }]}>
                    <Text style={styles.timeEntrySubmitText}>{editingSlot ? 'Update' : 'Add'}</Text>
                  </Pressable>
                </View>
              </ScrollView></View>
            </View>
          ) : null}

          {pendingDeleteSlot ? (
            <View accessibilityViewIsModal style={[styles.deleteTimeSlotOverlay, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
              <View style={styles.deleteTimeSlotCard}><ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%', flexShrink: 1 }} contentContainerStyle={styles.noticeScrollContent}>
                <Pressable
                  accessibilityLabel="Close delete time slot confirmation"
                  accessibilityRole="button"
                  disabled={isDeletingSlot}
                  hitSlop={10}
                  onPress={() => setPendingDeleteSlot(null)}
                  style={({ pressed }) => [styles.deleteTimeSlotCloseButton, pressed && !isDeletingSlot && { opacity: 0.72 }]}>
                  <CloseIcon />
                </Pressable>
                <DeleteTimeSlotIcon />
                <Text style={styles.deleteTimeSlotTitle}>Delete this time slot?</Text>
                <Text style={styles.deleteTimeSlotMessage}>This action cannot be undone.</Text>
                <View style={styles.deleteTimeSlotActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isDeletingSlot}
                    onPress={() => setPendingDeleteSlot(null)}
                    style={({ pressed }) => [styles.deleteTimeSlotCancelButton, pressed && !isDeletingSlot && { opacity: 0.82 }]}>
                    <Text style={styles.deleteTimeSlotCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isDeletingSlot || Boolean(dayError)}
                    onPress={deletePendingSlot}
                    style={({ pressed }) => [styles.deleteTimeSlotDeleteButton, pressed && !isDeletingSlot && { opacity: 0.82 }]}>
                    <Text style={styles.deleteTimeSlotDeleteText}>{isDeletingSlot ? 'Deleting' : 'Delete'}</Text>
                  </Pressable>
                </View>
              </ScrollView></View>
            </View>
          ) : null}

          {timeSlotNotice ? (
            <View accessibilityViewIsModal style={[styles.deleteTimeSlotOverlay, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
              <View style={styles.deleteTimeSlotCard}><ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%', flexShrink: 1 }} contentContainerStyle={styles.noticeScrollContent}>
                <Pressable
                  accessibilityLabel="Close time slot notice"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setTimeSlotNotice(null)}
                  style={({ pressed }) => [styles.deleteTimeSlotCloseButton, pressed && { opacity: 0.72 }]}>
                  <CloseIcon />
                </Pressable>
                <TimeSlotNoticeIcon />
                <Text style={styles.deleteTimeSlotTitle}>{timeSlotNotice.title}</Text>
                <Text style={styles.deleteTimeSlotMessage}>{timeSlotNotice.message}</Text>
                <View style={styles.deleteTimeSlotActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setTimeSlotNotice(null)}
                    style={({ pressed }) => [styles.timeSlotNoticeOkButton, pressed && { opacity: 0.82 }]}>
                    <Text style={styles.timeSlotNoticeOkText}>OK</Text>
                  </Pressable>
                </View>
              </ScrollView></View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function AvailabilityOption({
  active,
  disabled,
  label,
  onPress,
  tone,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
  tone: 'available' | 'unavailable';
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayAvailabilityOption,
        disabled && { opacity: 0.45 },
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

  return date && isValidCalendarDate(date) ? date : getStudioDateTime().date;
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
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke={adminColors.ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}

function CalendarIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M7 3.5V6.5M17 3.5V6.5M4.5 9H19.5M6.5 5H17.5C18.6 5 19.5 5.9 19.5 7V18C19.5 19.1 18.6 20 17.5 20H6.5C5.4 20 4.5 19.1 4.5 18V7C4.5 5.9 5.4 5 6.5 5Z" stroke={adminColors.blue} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 48 48" fill="none">
      <Circle cx={24} cy={24} r={24} fill={adminColors.blueSoft} />
      <Circle cx={24} cy={24} r={11} stroke={adminColors.blue} strokeWidth={2.2} />
      <Path d="M24 16.4V24L29.2 27" stroke={adminColors.blue} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}

function PencilIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 5.5L18.5 9.5M4.5 19.5L5.5 15.5L16.5 4.5C17.6 3.4 19.4 3.4 20.5 4.5C21.6 5.6 21.6 7.4 20.5 8.5L9.5 19.5L4.5 20.5V19.5Z" stroke={adminColors.surface} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </Svg>
  );
}

function ManageClockIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <Circle cx={20} cy={20} r={20} fill={adminColors.blueSoft} />
      <Circle cx={20} cy={20} r={9.2} stroke={adminColors.blue} strokeWidth={1.8} />
      <Path d="M20 13.7V20L24.3 22.5" stroke={adminColors.blue} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </Svg>
  );
}

function SmallPencilIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 5.5L18.5 9.5M4.5 19.5L5.5 15.5L16.5 4.5C17.6 3.4 19.4 3.4 20.5 4.5C21.6 5.6 21.6 7.4 20.5 8.5L9.5 19.5L4.5 20.5V19.5Z" stroke={adminColors.blue} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </Svg>
  );
}

function DeleteIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7H20M9 7V4H15V7M6 7L7 20H17L18 7M10 10V17M14 10V17" stroke={adminColors.red} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </Svg>
  );
}

function DeleteTimeSlotIcon() {
  return (
    <Svg width={72} height={72} viewBox="0 0 100 100" fill="none">
      <Circle cx={50} cy={50} r={50} fill={adminColors.redSoft} />
      <Path d="M36 41H64L61.8 72.5C61.6 74.4 60 76 58 76H42C40 76 38.4 74.4 38.2 72.5L36 41Z" fill="#C92228" />
      <Path d="M32 35H68" stroke="#C92228" strokeLinecap="round" strokeWidth={5} />
      <Path d="M44 35V30.5C44 28.5 45.6 27 47.6 27H52.4C54.4 27 56 28.5 56 30.5V35" stroke="#C92228" strokeLinecap="round" strokeWidth={5} />
      <Path d="M46 47V68M54 47V68" stroke="#ffffff" strokeLinecap="round" strokeWidth={3.8} />
    </Svg>
  );
}

function TimeSlotNoticeIcon() {
  return (
    <Svg width={72} height={72} viewBox="0 0 100 100" fill="none">
      <Circle cx={50} cy={50} r={50} fill={adminColors.blueSoft} />
      <Path d="M50 28V56" stroke={adminColors.blue} strokeLinecap="round" strokeWidth={7} />
      <Circle cx={50} cy={70} r={4.5} fill={adminColors.blue} />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6L18 18M18 6L6 18" stroke={adminColors.ink} strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}
