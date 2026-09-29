import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { showAppAlert } from '@/components/app-alert';
import { BookingStepIndicator } from '@/components/booking-step-indicator';
import { getSelectedPackage, setBookingSchedule } from '@/services/booking-draft';
import { rescheduleClientBooking } from '@/services/client-bookings';
import {
  addMonthsToMonthPrefix,
  buildCalendarGridDays,
  formatCalendarMonthLabel,
  getCalendarDaySummaries,
  getClientBookableSlotsForDate,
  formatSlotTimeRange,
  getClampedDateInMonth,
  getCurrentDateString,
  getMonthPrefix,
} from '@/services/calendar';
import { bookingScheduleStyles as styles } from '@/styles/booking-schedule.styles';
import { type CalendarDaySummary, type CalendarTimeSlot } from '@/types/calendar';

const FIGMA_WIDTH = 412;
const FIGMA_NAV_TOP = 844;

const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const todayDate = getCurrentDateString();

export default function BookingScheduleScreen() {
  const { bookingId, mode } = useLocalSearchParams<{ bookingId?: string; mode?: string }>();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isRescheduleMode = mode === 'reschedule' && Boolean(bookingId);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);
  const selectedPackage = getSelectedPackage();
  const requiredDurationMinutes = selectedPackage.durationMinutes ?? 0;
  const bufferMinutes = selectedPackage.bufferMinutes ?? 0;
  const minimumNoticeDays = selectedPackage.minimumNoticeDays ?? 1;
  const earliestBookableDate = addDaysToDateString(todayDate, Math.max(1, minimumNoticeDays));
  const [calendarMonth, setCalendarMonth] = useState(getMonthPrefix(earliestBookableDate));
  const [daySummaries, setDaySummaries] = useState<CalendarDaySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState(earliestBookableDate);
  const [selectedSlot, setSelectedSlot] = useState<CalendarTimeSlot | null>(null);
  const [timeSlots, setTimeSlots] = useState<CalendarTimeSlot[]>([]);
  const calendarDays = buildCalendarGridDays(calendarMonth, true);
  const summariesByDate = useMemo(() => {
    const map = new Map<string, CalendarDaySummary>();

    for (const summary of daySummaries) {
      map.set(summary.date, summary);
    }

    return map;
  }, [daySummaries]);
  const calendarRowCount = calendarDays.length / 7;
  const dayCellSize = calendarRowCount > 5 ? 34 : 40;
  const dayCellStep = calendarRowCount > 5 ? 33 : 41;
  const bottomPadding = insets.bottom;
  const availableContentHeight = Math.max(1, height - bottomPadding);
  const scale = Math.min(width / FIGMA_WIDTH, availableContentHeight / FIGMA_NAV_TOP);
  const contentHeight = FIGMA_NAV_TOP * scale;
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;
  const availableSlotCount = timeSlots.filter((slot) => isClientSelectableSlot(slot, requiredDurationMinutes)).length;
  const isSelectedDateBookable = isBookableDate(selectedDate, earliestBookableDate);
  const canContinue =
    isSelectedDateBookable &&
    selectedSlot?.status === 'available' &&
    doesSlotFitDuration(selectedSlot, requiredDurationMinutes);

  async function loadSlots(date: string, preferredSlotId = selectedSlot?.id) {
    if (!isBookableDate(date, earliestBookableDate)) {
      setTimeSlots([]);
      setSelectedSlot(null);
      return;
    }

    const slots = await getClientBookableSlotsForDate({
      bufferMinutes,
      date,
      durationMinutes: requiredDurationMinutes,
    });
    const preferredSlot =
      slots.find((slot) => slot.id === preferredSlotId && isClientSelectableSlot(slot, requiredDurationMinutes)) ?? null;
    const firstAvailableSlot = slots.find((slot) => isClientSelectableSlot(slot, requiredDurationMinutes)) ?? null;

    setTimeSlots(slots);
    setSelectedSlot(preferredSlot ?? firstAvailableSlot);
  }

  async function refreshSelectedSlotAvailability(slot: CalendarTimeSlot) {
    const slots = await getClientBookableSlotsForDate({
      bufferMinutes,
      date: selectedDate,
      durationMinutes: requiredDurationMinutes,
    });
    const availableSelectedSlot =
      slots.find((item) => item.id === slot.id && isClientSelectableSlot(item, requiredDurationMinutes)) ?? null;
    const firstAvailableSlot = slots.find((item) => isClientSelectableSlot(item, requiredDurationMinutes)) ?? null;

    setTimeSlots(slots);
    setSelectedSlot(availableSelectedSlot ?? firstAvailableSlot);

    return availableSelectedSlot;
  }

  async function changeMonth(monthOffset: number) {
    const nextMonth = addMonthsToMonthPrefix(calendarMonth, monthOffset);
    const preferredDay = Number(selectedDate.slice(-2));
    const clampedDate = getClampedDateInMonth(nextMonth, preferredDay);
    const nextSelectedDate = clampedDate < earliestBookableDate ? earliestBookableDate : clampedDate;
    const summaries = await getCalendarDaySummaries(nextMonth);

    setCalendarMonth(nextMonth);
    setDaySummaries(summaries);
    setSelectedDate(nextSelectedDate);
    await loadSlots(nextSelectedDate, undefined);
  }

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getCalendarDaySummaries(calendarMonth),
      getClientBookableSlotsForDate({
        bufferMinutes,
        date: earliestBookableDate,
        durationMinutes: requiredDurationMinutes,
      }),
    ]).then(([summaries, slots]) => {
      if (isMounted) {
        setDaySummaries(summaries);
        setTimeSlots(slots);
        setSelectedSlot(slots.find((slot) => isClientSelectableSlot(slot, requiredDurationMinutes)) ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [bufferMinutes, calendarMonth, earliestBookableDate, requiredDurationMinutes]);

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

          <Text style={[styles.heading, { left: x(23), top: y(155), width: px(180), fontSize: px(24), lineHeight: px(38) }]}>
            {isRescheduleMode ? 'New Date' : 'Select Date'}
          </Text>
          <Text style={[styles.helperText, { left: x(24), top: y(193), width: px(295), fontSize: px(12), lineHeight: px(17) }]}>
            {isRescheduleMode ? 'Choose a new date for your session' : 'Choose your preferred date for the session'}
          </Text>

          <View style={[styles.calendarCard, { left: x(48), top: y(220), width: px(318), height: px(309), borderRadius: px(16) }]}>
            <Pressable
              accessibilityLabel="Previous month"
              accessibilityRole="button"
              onPress={() => changeMonth(-1)}
              style={[styles.calendarArrow, { left: px(18), top: px(18), width: px(32), height: px(32) }]}>
              <ChevronLeft size={px(20)} stroke="#151515" />
            </Pressable>
            <SelectPill label={formatCalendarMonthLabel(calendarMonth, 'short')} left={67} px={px} top={19} width={88} />
            <SelectPill label={calendarMonth.slice(0, 4)} left={163} px={px} top={19} width={88} />
            <Pressable
              accessibilityLabel="Next month"
              accessibilityRole="button"
              onPress={() => changeMonth(1)}
              style={[styles.calendarArrow, { left: px(267), top: px(18), width: px(32), height: px(32) }]}>
              <ChevronRight size={px(20)} />
            </Pressable>

            {weekDays.map((day, index) => (
              <Text
                key={day}
                style={[
                  styles.weekLabel,
                  {
                    left: px(23 + index * 41),
                    top: px(73),
                    width: px(26),
                    fontSize: px(12),
                    lineHeight: px(17),
                  },
                ]}>
                {day}
              </Text>
            ))}

            {calendarDays.map((day, index) => {
              const row = Math.floor(index / 7);
              const column = index % 7;
              const isTooSoon = day.date < earliestBookableDate;
              const daySummary = day.isCurrentMonth ? summariesByDate.get(day.date) : undefined;
              const isFullDayUnavailable = Boolean(daySummary?.hasFullDayUnavailable);
              const isDisabled = !day.isCurrentMonth || isTooSoon || isFullDayUnavailable;
              const date = day.date;
              const isSelected = !isDisabled && date === selectedDate;

              return (
                <Pressable
                  accessibilityLabel={`${day.day} ${formatCalendarMonthLabel(calendarMonth)}`}
                  accessibilityRole="button"
                  disabled={isDisabled}
                  key={`${day.date}-${index}`}
                  onPress={() => {
                    setSelectedDate(date);
                    loadSlots(date, undefined);
                  }}
                  style={[
                    styles.dayButton,
                    isSelected && styles.selectedDay,
                  {
                    left: px(20 + column * 41),
                    top: px(98 + row * dayCellStep),
                    width: px(dayCellSize),
                    height: px(dayCellSize),
                    borderRadius: px(8),
                  },
                ]}>
                  <Text
                    style={[
                      styles.dayText,
                      isDisabled && styles.disabledDayText,
                      day.isCurrentMonth && isFullDayUnavailable && styles.unavailableDayText,
                      { fontSize: px(calendarRowCount > 5 ? 14 : 16), lineHeight: px(22) },
                  ]}>
                    {day.day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.heading, { left: x(35), top: y(538), width: px(142), fontSize: px(24), lineHeight: px(38) }]}>
            Select Time
          </Text>
          <Text style={[styles.timeAvailabilityText, { left: x(177), top: y(549), width: px(190), fontSize: px(11), lineHeight: px(15) }]}>
            {!isSelectedDateBookable
              ? 'Choose a future date'
              : availableSlotCount
                ? `${availableSlotCount} available ${availableSlotCount === 1 ? 'slot' : 'slots'}`
                : 'No slots fit duration'}
          </Text>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.timeSlotListContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={[styles.timeSlotList, { left: x(22), top: y(585), width: px(368), height: px(144) }]}>
            {timeSlots.map((slot) => {
              const isTooShort = slot.status === 'available' && !doesSlotFitDuration(slot, requiredDurationMinutes);
              const isDisabled = slot.status !== 'available' || isTooShort;
              const isSelected = selectedSlot?.id === slot.id && !isDisabled;

              return (
                <TimeSlotButton
                  isDisabled={isDisabled}
                  isSelected={isSelected}
                  isTooShort={isTooShort}
                  key={slot.id}
                  onPress={() => setSelectedSlot(slot)}
                  px={px}
                  requiredDurationMinutes={requiredDurationMinutes}
                  slot={slot}
                />
              );
            })}
            {!availableSlotCount ? (
              <View style={styles.noTimeCard}>
                <Text style={styles.noTimeTitle}>
                  {isSelectedDateBookable ? 'No time slots fit this service' : 'Choose a future date'}
                </Text>
                <Text style={styles.noTimeText}>
                  {isSelectedDateBookable
                    ? `${formatRequiredTimeMessage(requiredDurationMinutes, bufferMinutes)} Please choose another date or ask the admin to add a longer available time.`
                    : formatMinimumNoticeMessage(minimumNoticeDays)}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <Pressable
            accessibilityLabel="Continue"
            accessibilityRole="button"
            disabled={!canContinue || isCheckingAvailability || isSavingReschedule}
            onPress={async () => {
              const slotToConfirm = selectedSlot;

              if (!canContinue || !slotToConfirm) {
                showAppAlert('Select another time', 'Please choose an available time slot that fits this package duration.');
                return;
              }

              setIsCheckingAvailability(true);
              const availableSelectedSlot = await refreshSelectedSlotAvailability(slotToConfirm);
              setIsCheckingAvailability(false);

              if (!availableSelectedSlot) {
                showAppAlert('Slot already taken', 'That time was just booked. Please choose another available slot.');
                return;
              }

              const schedule = {
                bookingDate: selectedDate,
                displayDate: formatSelectedDate(selectedDate),
                displayTime: formatSlotTimeRange(availableSelectedSlot),
                endTime: availableSelectedSlot.endTime,
                startTime: availableSelectedSlot.startTime,
              };

              if (isRescheduleMode && bookingId) {
                setIsSavingReschedule(true);
                const result = await rescheduleClientBooking(bookingId, schedule);
                setIsSavingReschedule(false);

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
            }}
            style={({ pressed }) => [
              styles.continueButton,
              {
                left: x(33),
                top: y(759),
                width: px(346),
                height: px(64),
                borderRadius: px(30),
                opacity: pressed || !canContinue || isSavingReschedule ? 0.62 : 1,
              },
            ]}>
            <Text style={[styles.continueText, { fontSize: px(24), lineHeight: px(38) }]}>
              {isCheckingAvailability ? 'Checking...' : isSavingReschedule ? 'Saving...' : isRescheduleMode ? 'Save Schedule' : 'Continue'}
            </Text>
            <ArrowRight size={px(31)} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function TimeSlotButton({
  isDisabled,
  isSelected,
  isTooShort,
  onPress,
  px,
  requiredDurationMinutes,
  slot,
}: {
  isDisabled: boolean;
  isSelected: boolean;
  isTooShort: boolean;
  onPress: () => void;
  px: (value: number) => number;
  requiredDurationMinutes: number;
  slot: CalendarTimeSlot;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, selected: isSelected }}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.timeSlot,
        isSelected && styles.selectedTimeSlot,
        isDisabled && styles.disabledTimeSlot,
        {
          width: px(177),
          minHeight: px(62),
          borderRadius: px(10),
        },
      ]}>
      <Text
        style={[
          styles.timeText,
          isSelected && styles.selectedTimeText,
          isDisabled && styles.disabledTimeText,
          { fontSize: px(15), lineHeight: px(21) },
        ]}>
        {formatSlotTimeRange(slot)}
      </Text>
      <Text
        style={[
          isDisabled ? styles.slotStatusText : styles.slotHintText,
          isSelected && styles.selectedSlotHintText,
          { fontSize: px(9), lineHeight: px(12) },
        ]}>
        {formatClientSlotStatus(slot, requiredDurationMinutes, isTooShort)}
      </Text>
    </Pressable>
  );
}

function formatClientSlotStatus(slot: CalendarTimeSlot, requiredDurationMinutes: number, isTooShort: boolean) {
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

function isClientSelectableSlot(slot: CalendarTimeSlot, requiredDurationMinutes: number) {
  return slot.status === 'available' && doesSlotFitDuration(slot, requiredDurationMinutes);
}

function doesSlotFitDuration(slot: Pick<CalendarTimeSlot, 'endTime' | 'startTime'>, requiredDurationMinutes: number) {
  return requiredDurationMinutes <= 0 || getSlotDurationMinutes(slot) >= requiredDurationMinutes;
}

function getSlotDurationMinutes(slot: Pick<CalendarTimeSlot, 'endTime' | 'startTime'>) {
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

function formatRequiredTimeMessage(durationMinutes: number, bufferMinutes: number) {
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

function StepIndicator({
  px,
  x,
  y,
}: {
  px: (value: number) => number;
  x: (value: number) => number;
  y: (value: number) => number;
}) {
  return <BookingStepIndicator currentStep={1} px={px} x={x} y={y} />;
}

function SelectPill({
  label,
  left,
  px,
  top,
  width,
}: {
  label: string;
  left: number;
  px: (value: number) => number;
  top: number;
  width: number;
}) {
  return (
    <View style={[styles.selectPill, { left: px(left), top: px(top), width: px(width), height: px(28), borderRadius: px(8) }]}>
      <Text style={[styles.selectText, { fontSize: px(16), lineHeight: px(22) }]}>{label}</Text>
      <ChevronDown size={px(16)} />
    </View>
  );
}

function ChevronLeft({ size, stroke = '#142C4C' }: { size: number; stroke?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronRight({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5L16 12L9 19" stroke="#151515" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronDown({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 10L12 15L17 10" stroke="#151515" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
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
