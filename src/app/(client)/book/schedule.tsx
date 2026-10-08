import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { showAppAlert } from '@/components/app-alert';
import { FlowSteps, MobilePage } from '@/components/mobile-page';
import { MotionPressable } from '@/components/motion-pressable';
import { useClientBookingCalendar } from '@/hooks/use-client-booking-calendar';
import { useMountedRef } from '@/hooks/use-mounted-ref';
import { useStudioCalendarClock } from '@/hooks/use-studio-calendar-clock';
import {
  getSelectedPackage,
  setBookingSchedule,
} from '@/services/booking-draft';
import { rescheduleClientBooking } from '@/services/client-bookings';
import {
  addMonthsToMonthPrefix,
  buildCalendarGridDays,
  formatCalendarMonthLabel,
  formatSlotTimeRange,
  getClampedDateInMonth,
  getMonthPrefix,
} from '@/services/calendar';
import { getStudioDateTime } from '@/services/calendar-date-guards';
import { responsiveStyles as styles } from '@/styles/responsive.styles';
import { type CalendarDaySummary, type CalendarTimeSlot } from '@/types/calendar';
const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export default function BookingScheduleScreen() {
  const { bookingId, mode } = useLocalSearchParams<{
    bookingId?: string;
    mode?: string;
  }>();
  const isRescheduleMode = mode === 'reschedule' && Boolean(bookingId);
  const mounted = useMountedRef();
  const focused = useRef(false);
  const focusVersion = useRef(0);
  const selectionVersion = useRef(0);
  const acting = useRef(false);
  const now = useStudioCalendarClock();
  const todayDate = getStudioDateTime(now).date;
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);
  const selectedPackage = getSelectedPackage();
  const requiredDurationMinutes = selectedPackage.durationMinutes ?? 0;
  const bufferMinutes = selectedPackage.bufferMinutes ?? 0;
  const minimumNoticeDays = selectedPackage.minimumNoticeDays ?? 1;
  const earliestBookableDate = addDaysToDateString(
    todayDate,
    Math.max(1, minimumNoticeDays),
  );
  const earliestMonth = getMonthPrefix(earliestBookableDate);
  const [selection, setSelection] = useState(() => ({ month: earliestMonth, date: earliestBookableDate, version: 0 }));
  const calendarMonth = selection.month < earliestMonth ? earliestMonth : selection.month;
  const selectedDate = selection.date < earliestBookableDate ? earliestBookableDate : selection.date;
  const [preferredSlot, setPreferredSlot] = useState<{ key: string; id: string } | null>(null);
  const calendar = useClientBookingCalendar({ month: calendarMonth, date: selectedDate,
    durationMinutes: requiredDurationMinutes, bufferMinutes });
  const { daySummaries, timeSlots } = calendar;
  const selectedSlot = timeSlots.find((slot) => preferredSlot?.key === calendar.slotKey &&
    slot.id === preferredSlot.id && isClientSelectableSlot(slot, requiredDurationMinutes)) ??
    timeSlots.find((slot) => isClientSelectableSlot(slot, requiredDurationMinutes)) ?? null;
  const isBusy = isCheckingAvailability || isSavingReschedule;

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; focusVersion.current += 1; };
  }, []));
  const calendarDays = useMemo(() => buildCalendarGridDays(calendarMonth, true), [calendarMonth]);
  const summariesByDate = useMemo(() => {
    const map = new Map<string, CalendarDaySummary>();

    for (const summary of daySummaries) {
      map.set(summary.date, summary);
    }

    return map;
  }, [daySummaries]);
  const availableSlotCount = timeSlots.filter((slot) =>
    isClientSelectableSlot(slot, requiredDurationMinutes),
  ).length;
  const isSelectedDateBookable = isBookableDate(
    selectedDate,
    earliestBookableDate,
  );
  const canContinue =
    !calendar.isSlotsLoading && !calendar.slotsError &&
    isSelectedDateBookable &&
    selectedSlot?.status === 'available' &&
    doesSlotFitDuration(selectedSlot, requiredDurationMinutes);

  function changeMonth(monthOffset: number) {
    if (acting.current || !focused.current) return;
    if (monthOffset < 0 && calendarMonth <= earliestMonth) return;
    const version = ++selectionVersion.current;
    setSelection((current) => {
      const month = current.month < earliestMonth ? earliestMonth : current.month;
      const nextMonth = addMonthsToMonthPrefix(month, monthOffset);
      if (nextMonth < earliestMonth) return { ...current, version };
      const date = current.date < earliestBookableDate ? earliestBookableDate : current.date;
      const clampedDate = getClampedDateInMonth(nextMonth, Number(date.slice(-2)));
      return { month: nextMonth, date: clampedDate < earliestBookableDate ? earliestBookableDate : clampedDate, version };
    });
  }

  async function handleContinue() {
    if (acting.current || !mounted.current || !focused.current) return;
    if (selection.version !== selectionVersion.current) return;
    const slotToConfirm = selectedSlot;
    if (!canContinue || !slotToConfirm) return;
    const version = focusVersion.current;
    const isCurrent = () => mounted.current && focused.current && focusVersion.current === version &&
      selection.version === selectionVersion.current;
    const dateToConfirm = selectedDate;
    let savingReschedule = false;
    acting.current = true;
    setIsCheckingAvailability(true);
    try {
      const slots = await calendar.refreshSlots();
      if (!isCurrent() || !slots) return;
      const currentEarliestDate = addDaysToDateString(getStudioDateTime().date, Math.max(1, minimumNoticeDays));
      if (!isBookableDate(dateToConfirm, currentEarliestDate)) {
        showAppAlert('Select another date', formatMinimumNoticeMessage(minimumNoticeDays));
        return;
      }
      const availableSelectedSlot = slots.find((slot) => slot.id === slotToConfirm.id &&
        isClientSelectableSlot(slot, requiredDurationMinutes));
      if (!availableSelectedSlot) {
        showAppAlert('Slot already taken', 'That time was just booked. Please choose another available slot.');
        return;
      }
      const schedule = { bookingDate: dateToConfirm, displayDate: formatSelectedDate(dateToConfirm),
        displayTime: formatSlotTimeRange(availableSelectedSlot), endTime: availableSelectedSlot.endTime,
        startTime: availableSelectedSlot.startTime };
      if (isRescheduleMode && bookingId) {
        savingReschedule = true;
        setIsCheckingAvailability(false);
        setIsSavingReschedule(true);
        const result = await rescheduleClientBooking(bookingId, schedule);
        if (!isCurrent()) return;
        if (!result.success) {
          showAppAlert('Booking not rescheduled', result.message ?? 'Please try again.');
          return;
        }
        showAppAlert('Reschedule sent', 'Your new schedule was sent to the admin for confirmation.');
        router.replace('/book');
        return;
      }
      setBookingSchedule(schedule);
      router.push('/book/information');
    } catch {
      if (isCurrent()) showAppAlert(savingReschedule ? 'Booking not rescheduled' : 'Availability not checked',
        'Couldn’t reach the studio. Please try again.');
    } finally {
      acting.current = false;
      if (mounted.current) {
        setIsCheckingAvailability(false);
        setIsSavingReschedule(false);
      }
    }
  }

  return (
    <MobilePage title="PhotoSync">
      <FlowSteps step={1} />
      <Text style={styles.title}>
        {isRescheduleMode ? 'New Date' : 'Select Date'}
      </Text>
      <Text style={styles.text}>
        Choose your preferred date for the session.{' '}
        {formatMinimumNoticeMessage(minimumNoticeDays)}
      </Text>
      {calendar.monthError ? (
        <View style={styles.row}>
          <Text accessibilityRole="alert" style={styles.text}>{calendar.monthError}</Text>
          <Pressable accessibilityRole="button" disabled={isBusy} onPress={calendar.retryMonth}>
            <Text style={styles.label}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.card}>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            disabled={isBusy || calendarMonth <= earliestMonth}
            onPress={() => changeMonth(-1)}
            style={[styles.iconButton, (isBusy || calendarMonth <= earliestMonth) && styles.disabled]}
          >
            <Text style={styles.heading}>‹</Text>
          </Pressable>
          <Text style={[styles.label, { flex: 1, textAlign: 'center' }]}>
            {formatCalendarMonthLabel(calendarMonth, 'long')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            disabled={isBusy}
            onPress={() => changeMonth(1)}
            style={[styles.iconButton, isBusy && styles.disabled]}
          >
            <Text style={styles.heading}>›</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {weekDays.map((day) => (
            <Text
              key={day}
              style={[styles.text, { flex: 1, textAlign: 'center' }]}
            >
              {day}
            </Text>
          ))}
        </View>
        {Array.from({ length: calendarDays.length / 7 }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row' }}>
            {calendarDays.slice(row * 7, row * 7 + 7).map((day) => {
              const tooSoon = day.date < earliestBookableDate;
              const unavailable = Boolean(
                summariesByDate.get(day.date)?.hasFullDayUnavailable,
              );
              const disabled = !day.isCurrentMonth || tooSoon || isBusy;
              const selected = day.date === selectedDate;
              return (
                <MotionPressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityLabel={formatSelectedDate(day.date)}
                  accessibilityState={{ disabled, selected }}
                  disabled={disabled}
                  selected={selected && !disabled && !unavailable}
                  onPress={() => {
                    if (acting.current || !focused.current || tooSoon) return;
                    if (unavailable) {
                      showAppAlert(
                        'Date unavailable',
                        'The studio is unavailable on this date. Please choose another day.',
                      );
                      return;
                    }
                    const version = ++selectionVersion.current;
                    setSelection({ month: getMonthPrefix(day.date), date: day.date, version });
                  }}
                  style={[
                    {
                      flex: 1,
                      minHeight: 44,
                      paddingVertical: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 10,
                    },
                    selected && styles.selectedChip,
                    (disabled || unavailable) && styles.disabled,
                  ]}
                >
                  <Text style={styles.text}>{Number(day.date.slice(-2))}</Text>
                </MotionPressable>
              );
            })}
          </View>
        ))}
      </View>
      <Text style={styles.heading}>Available Time</Text>
      <Text style={styles.text}>
        {formatSelectedDate(selectedDate)}
        {!calendar.isSlotsLoading && !calendar.slotsError ? ` · ${availableSlotCount} available slots.` : ''}{' '}
        {formatRequiredTimeMessage(requiredDurationMinutes, bufferMinutes)}
      </Text>
      {calendar.isSlotsLoading ? (
        <Text accessibilityRole="progressbar" style={styles.text}>Checking available times...</Text>
      ) : calendar.slotsError ? (
        <View style={styles.row}>
          <Text accessibilityRole="alert" style={styles.text}>{calendar.slotsError}</Text>
          <Pressable accessibilityRole="button" disabled={isBusy} onPress={calendar.retrySlots}>
            <Text style={styles.label}>Try again</Text>
          </Pressable>
        </View>
      ) : timeSlots.length === 0 && (
        <Text style={styles.text}>
          No available times for this date. Please select another day.
        </Text>
      )}
      <View style={styles.wrapRow}>
        {timeSlots.map((slot) => {
          const tooShort = !doesSlotFitDuration(slot, requiredDurationMinutes);
          const disabled = isBusy || !isClientSelectableSlot(
            slot,
            requiredDurationMinutes,
          );
          return (
            <MotionPressable
              key={slot.id}
              accessibilityRole="button"
              accessibilityState={{
                selected: selectedSlot?.id === slot.id,
                disabled,
              }}
              disabled={disabled}
              selected={selectedSlot?.id === slot.id && !disabled}
              onPress={() => {
                if (!acting.current && focused.current && !disabled) {
                  const version = ++selectionVersion.current;
                  setSelection((current) => ({ ...current, version }));
                  setPreferredSlot({ key: calendar.slotKey, id: slot.id });
                }
              }}
              style={[
                styles.chip,
                { flexBasis: 140, flexGrow: 1, gap: 4 },
                selectedSlot?.id === slot.id && styles.selectedChip,
                disabled && styles.disabled,
              ]}
            >
              <Text style={[styles.label, styles.centeredText]}>
                {formatSlotTimeRange(slot)}
              </Text>
              <Text style={[styles.text, styles.centeredText]}>
                {formatClientSlotStatus(
                  slot,
                  requiredDurationMinutes,
                  tooShort,
                )}
              </Text>
            </MotionPressable>
          );
        })}
      </View>
      <MotionPressable
        accessibilityRole="button"
        disabled={!canContinue || isBusy}
        onPress={handleContinue}
        style={[
          styles.button,
          (!canContinue || isBusy) &&
            styles.disabled,
        ]}
      >
        <Text style={styles.buttonText}>
          {isCheckingAvailability
            ? 'Checking...'
            : isSavingReschedule
              ? 'Saving...'
              : isRescheduleMode
                ? 'Save Schedule'
                : 'Continue'}
        </Text>
      </MotionPressable>
    </MobilePage>
  );
}
function formatClientSlotStatus(
  slot: CalendarTimeSlot,
  requiredDurationMinutes: number,
  isTooShort: boolean,
) {
  if (slot.status === 'booked') {
    return 'Booked';
  }

  if (slot.status === 'unavailable') {
    return 'Unavailable';
  }

  if (isTooShort) {
    return `Needs ${formatDurationLabel(requiredDurationMinutes)}`;
  }

  return 'Available';
}

function isClientSelectableSlot(
  slot: CalendarTimeSlot,
  requiredDurationMinutes: number,
) {
  return (
    slot.status === 'available' &&
    doesSlotFitDuration(slot, requiredDurationMinutes)
  );
}

function doesSlotFitDuration(
  slot: Pick<CalendarTimeSlot, 'endTime' | 'startTime'>,
  requiredDurationMinutes: number,
) {
  return (
    requiredDurationMinutes <= 0 ||
    getSlotDurationMinutes(slot) >= requiredDurationMinutes
  );
}

function getSlotDurationMinutes(
  slot: Pick<CalendarTimeSlot, 'endTime' | 'startTime'>,
) {
  const start = getTimeMinutes(slot.startTime);
  const end = getTimeMinutes(slot.endTime);

  return Math.max(0, end - start);
}

function getTimeMinutes(value: string) {
  const [hour = '0', minute = '0'] = value.split(':');

  return Number(hour) * 60 + Number(minute);
}

function formatDurationLabel(minutes: number) {
  if (minutes <= 0) {
    return 'the service duration';
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;

    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  if (minutes < 60) {
    return `${minutes} minutes`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours} hr ${remainingMinutes} min`;
}

function formatRequiredTimeMessage(
  durationMinutes: number,
  bufferMinutes: number,
) {
  if (bufferMinutes <= 0) {
    return `This package needs ${formatDurationLabel(durationMinutes)}.`;
  }

  return `This package needs ${formatDurationLabel(durationMinutes)} plus ${formatDurationLabel(bufferMinutes)} preparation time.`;
}

function formatMinimumNoticeMessage(minimumNoticeDays: number) {
  if (minimumNoticeDays <= 1) {
    return 'This service requires booking at least 1 day in advance.';
  }

  return `This service requires booking at least ${minimumNoticeDays} days in advance.`;
}

function formatSelectedDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

function addDaysToDateString(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);

  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function isBookableDate(date: string, earliestBookableDate: string) {
  return date >= earliestBookableDate;
}
