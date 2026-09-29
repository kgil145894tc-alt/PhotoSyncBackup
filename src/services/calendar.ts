import { supabase } from '@/lib/supabase';
import { getActiveBookingSlotsForDate, type ActiveBookingSlot } from '@/services/booking-availability';
import { createAuditLog } from '@/services/audit-log';
import { formatBookingTimeRange } from '@/services/admin-bookings';
import { fallbackWorkingHoursWindow, getDefaultWorkingHoursWindow } from '@/services/studio-settings';
import { type CalendarDaySummary, type CalendarGridDay, type CalendarSlotStatus, type CalendarTimeSlot } from '@/types/calendar';

const fullDayUnavailableSlot = { endTime: '23:59:00', startTime: '00:00:00' };
const clientSlotStepMinutes = 30;

type BookingSlotRow = {
  booking_date: string;
  client_id: string;
  end_time: string;
  id: string;
  profiles: {
    full_name: string | null;
  } | null;
  start_time: string;
};

type BookingSlotSource = ActiveBookingSlot | BookingSlotRow;

type AdminTimeSlotRow = {
  end_time: string;
  id: string;
  reason: string | null;
  slot_date: string;
  start_time: string;
  status: Extract<CalendarSlotStatus, 'available' | 'unavailable'>;
};

export async function getCalendarDaySummaries(monthPrefix = getCurrentDateString().slice(0, 7)): Promise<CalendarDaySummary[]> {
  if (!supabase) {
    return [];
  }

  const startDate = `${monthPrefix}-01`;
  const endDate = `${monthPrefix}-${String(getDaysInMonth(monthPrefix)).padStart(2, '0')}`;

  const [{ data: bookings }, { data: timeSlots }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, booking_date')
      .eq('status', 'confirmed')
      .gte('booking_date', startDate)
      .lte('booking_date', endDate),
    supabase
      .from('time_slots')
      .select('slot_date, start_time, end_time, status')
      .gte('slot_date', startDate)
      .lte('slot_date', endDate),
  ]);

  const summaries = new Map<string, CalendarDaySummary>();

  for (const item of bookings ?? []) {
    const summary = getOrCreateSummary(summaries, item.booking_date as string);
    summary.hasBooked = true;
  }

  for (const item of timeSlots ?? []) {
    const summary = getOrCreateSummary(summaries, item.slot_date as string);

    if (item.status === 'available') {
      summary.hasAvailable = true;
    }

    if (item.status === 'unavailable') {
      summary.hasUnavailable = true;

      if (item.start_time === fullDayUnavailableSlot.startTime && item.end_time === fullDayUnavailableSlot.endTime) {
        summary.hasFullDayUnavailable = true;
      }
    }
  }

  return Array.from(summaries.values());
}

export async function getClosedDayCount(monthPrefix = getCurrentDateString().slice(0, 7)) {
  if (!supabase) {
    return 0;
  }

  const startDate = `${monthPrefix}-01`;
  const endDate = `${monthPrefix}-${String(getDaysInMonth(monthPrefix)).padStart(2, '0')}`;
  const { count, error } = await supabase
    .from('time_slots')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'unavailable')
    .eq('start_time', fullDayUnavailableSlot.startTime)
    .eq('end_time', fullDayUnavailableSlot.endTime)
    .gte('slot_date', startDate)
    .lte('slot_date', endDate);

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export async function getCalendarSlotsForDate(date: string): Promise<CalendarTimeSlot[]> {
  return getCalendarSlotsForDateByBookingStatus(date, 'confirmed');
}

async function getCalendarSlotsForDateByBookingStatus(
  date: string,
  bookingStatusMode: 'active' | 'confirmed',
): Promise<CalendarTimeSlot[]> {
  if (!supabase) {
    return getDefaultSlots([]);
  }

  const [bookedRows, { data: adminRows }] = await Promise.all([
    getBookingRowsForCalendar(date, bookingStatusMode),
    supabase
      .from('time_slots')
      .select('id, slot_date, start_time, end_time, status, reason')
      .eq('slot_date', date)
      .order('start_time', { ascending: true }),
  ]);

  const bookedSlots = bookedRows.map((booking) => ({
    bookingId: booking.id,
    clientName: 'profiles' in booking ? booking.profiles?.full_name ?? 'Client' : 'Client',
    endTime: booking.end_time,
    id: `booking-${booking.id}`,
    isCustom: true,
    isSaved: false,
    startTime: booking.start_time,
    status: 'booked' as const,
  }));

  const defaultSlotKey = getSlotKeyFromWindow(await getDefaultWorkingHoursWindow());
  const adminSlots = ((adminRows ?? []) as AdminTimeSlotRow[]).map((slot) => ({
    endTime: slot.end_time,
    id: slot.id,
    isCustom: getSlotKey(slot.start_time, slot.end_time) !== defaultSlotKey,
    isSaved: true,
    reason: slot.reason,
    startTime: slot.start_time,
    status: slot.status,
  }));
  const hasFullDayUnavailable = adminSlots.some(isFullDayUnavailableSlot);

  if (hasFullDayUnavailable) {
    return [...bookedSlots, ...adminSlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return getDefaultSlots([...bookedSlots, ...adminSlots]);
}

async function getBookingRowsForCalendar(
  date: string,
  bookingStatusMode: 'active' | 'confirmed',
): Promise<BookingSlotSource[]> {
  if (bookingStatusMode === 'active') {
    const result = await getActiveBookingSlotsForDate(date);

    if (result.success) {
      return result.slots;
    }

    return [{ end_time: '23:59:00', id: 'availability-check-failed', start_time: '00:00:00' }];
  }

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from('bookings')
    .select('id, client_id, booking_date, start_time, end_time, profiles:client_id(full_name)')
    .eq('booking_date', date)
    .eq('status', 'confirmed');

  return (data ?? []) as unknown as BookingSlotRow[];
}

export async function getClientBookableSlotsForDate({
  bufferMinutes = 0,
  date,
  durationMinutes,
}: {
  bufferMinutes?: number | null;
  date: string;
  durationMinutes: number;
}): Promise<CalendarTimeSlot[]> {
  const calendarSlots = await getCalendarSlotsForDateByBookingStatus(date, 'active');
  const requiredDuration = Math.max(0, Math.round(durationMinutes));
  const requiredBuffer = Math.max(0, Math.round(bufferMinutes ?? 0));

  if (requiredDuration <= 0) {
    return calendarSlots;
  }

  const availableWindows = calendarSlots.filter((slot) => slot.status === 'available');
  const blockedIntervals = calendarSlots
    .filter((slot) => slot.status === 'booked' || slot.status === 'unavailable')
    .map((slot) => ({
      end: getTimeMinutes(slot.endTime),
      start: getTimeMinutes(slot.startTime),
    }));
  const generatedSlots = new Map<string, CalendarTimeSlot>();

  for (const window of availableWindows) {
    const windowStart = getTimeMinutes(window.startTime);
    const windowEnd = getTimeMinutes(window.endTime);
    const latestStart = windowEnd - requiredDuration - requiredBuffer;

    for (let start = windowStart; start <= latestStart; start += clientSlotStepMinutes) {
      const end = start + requiredDuration;
      const bufferedCandidate = {
        end: end + requiredBuffer,
        start: Math.max(windowStart, start - requiredBuffer),
      };
      const hasConflict = blockedIntervals.some((blocked) => doIntervalsOverlap(bufferedCandidate, blocked));

      if (!hasConflict) {
        const startTime = formatTimeFromMinutes(start);
        const endTime = formatTimeFromMinutes(end);
        const key = getSlotKey(startTime, endTime);

        generatedSlots.set(key, {
          endTime,
          id: `client-${date}-${key}`,
          isCustom: true,
          isSaved: false,
          startTime,
          status: 'available',
        });
      }
    }
  }

  return Array.from(generatedSlots.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export async function saveCalendarSlot({
  date,
  endTime,
  slotId,
  startTime,
  status,
}: {
  date: string;
  endTime: string;
  slotId?: string;
  startTime: string;
  status: Extract<CalendarSlotStatus, 'available' | 'unavailable'>;
}) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data: bookedSlot, error: bookedSlotError } = await supabase
    .from('bookings')
    .select('id, start_time, end_time')
    .eq('booking_date', date)
    .eq('status', 'confirmed')
    .limit(100);

  if (bookedSlotError) {
    return { message: bookedSlotError.message, success: false };
  }

  const requestedInterval = getIntervalFromTimeRange(startTime, endTime);
  const overlappingBooking = bookedSlot?.find((booking) =>
    doIntervalsOverlap(requestedInterval, getIntervalFromTimeRange(booking.start_time as string, booking.end_time as string)),
  );

  if (overlappingBooking) {
    return { message: 'This time slot overlaps with a confirmed booking.', success: false };
  }

  const overlappingSlot = await findOverlappingSavedTimeSlot({
    date,
    endTime,
    ignoredSlotId: slotId,
    startTime,
  });

  if (!overlappingSlot.success) {
    return overlappingSlot;
  }

  if (overlappingSlot.slot) {
    const conflictText = overlappingSlot.conflictType === 'duplicate' ? 'already exists' : 'overlaps with';

    return {
      message: `This time slot ${conflictText} ${formatBookingTimeRange(overlappingSlot.slot.startTime, overlappingSlot.slot.endTime)}.`,
      success: false,
    };
  }

  const payload = {
    end_time: endTime,
    slot_date: date,
    start_time: startTime,
    status,
  };
  const query = slotId
    ? supabase.from('time_slots').update(payload).eq('id', slotId)
    : supabase.from('time_slots').upsert(payload, { onConflict: 'slot_date,start_time,end_time' });
  const { error } = await query;

  if (error) {
    return { message: error.message, success: false };
  }

  await createAuditLog({
    action: slotId ? 'calendar.slot_updated' : 'calendar.slot_created',
    entityId: slotId,
    entityType: 'time_slot',
    metadata: {
      date,
      endTime,
      startTime,
      status,
    },
  });

  return { success: true };
}

export async function deleteCalendarSlot(id: string) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { error } = await supabase.from('time_slots').delete().eq('id', id);

  if (error) {
    return { message: error.message, success: false };
  }

  await createAuditLog({
    action: 'calendar.slot_deleted',
    entityId: id,
    entityType: 'time_slot',
  });

  return { success: true };
}

export async function markCalendarDayUnavailable(date: string) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data: bookedSlots, error: bookedSlotError } = await supabase
    .from('bookings')
    .select('id')
    .eq('booking_date', date)
    .in('status', ['pending', 'confirmed'])
    .limit(1);

  if (bookedSlotError) {
    return { message: bookedSlotError.message, success: false };
  }

  if (bookedSlots?.length) {
    return {
      message: 'This day has pending or confirmed bookings. Please handle those booking requests before closing the day.',
      success: false,
    };
  }

  const { error } = await supabase.from('time_slots').upsert(
    {
      end_time: fullDayUnavailableSlot.endTime,
      reason: 'Full day unavailable',
      slot_date: date,
      start_time: fullDayUnavailableSlot.startTime,
      status: 'unavailable',
    },
    { onConflict: 'slot_date,start_time,end_time' },
  );

  if (error) {
    return { message: error.message, success: false };
  }

  await createAuditLog({
    action: 'calendar.day_closed',
    entityType: 'calendar_day',
    entityId: date,
    metadata: {
      date,
      endTime: fullDayUnavailableSlot.endTime,
      startTime: fullDayUnavailableSlot.startTime,
    },
  });

  return { success: true };
}

export async function reopenCalendarDay(date: string) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { error } = await supabase
    .from('time_slots')
    .delete()
    .eq('slot_date', date)
    .eq('start_time', fullDayUnavailableSlot.startTime)
    .eq('end_time', fullDayUnavailableSlot.endTime)
    .eq('status', 'unavailable');

  if (error) {
    return { message: error.message, success: false };
  }

  await createAuditLog({
    action: 'calendar.day_reopened',
    entityId: date,
    entityType: 'calendar_day',
    metadata: { date },
  });

  return { success: true };
}

export async function markCalendarSlot({
  date,
  endTime,
  startTime,
  status,
}: {
  date: string;
  endTime: string;
  startTime: string;
  status: Extract<CalendarSlotStatus, 'available' | 'unavailable'>;
}) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const overlappingSlot = await findOverlappingSavedTimeSlot({
    date,
    endTime,
    startTime,
  });

  if (!overlappingSlot.success) {
    return overlappingSlot;
  }

  if (overlappingSlot.slot) {
    const conflictText = overlappingSlot.conflictType === 'duplicate' ? 'already exists' : 'overlaps with';

    return {
      message: `This time slot ${conflictText} ${formatBookingTimeRange(overlappingSlot.slot.startTime, overlappingSlot.slot.endTime)}.`,
      success: false,
    };
  }

  const { error } = await supabase
    .from('time_slots')
    .upsert(
      {
        end_time: endTime,
        slot_date: date,
        start_time: startTime,
        status,
      },
      { onConflict: 'slot_date,start_time,end_time' },
    );

  if (error) {
    return { message: error.message, success: false };
  }

  await createAuditLog({
    action: 'calendar.slot_marked',
    entityType: 'time_slot',
    entityId: `${date}-${startTime}-${endTime}`,
    metadata: {
      date,
      endTime,
      startTime,
      status,
    },
  });

  return { success: true };
}

export function formatSlotTimeRange(slot: Pick<CalendarTimeSlot, 'endTime' | 'startTime'>) {
  return formatBookingTimeRange(slot.startTime, slot.endTime);
}

export function addMonthsToMonthPrefix(monthPrefix: string, monthOffset: number) {
  const { monthIndex, year } = parseMonthPrefix(monthPrefix);
  const nextDate = new Date(year, monthIndex + monthOffset, 1);

  return getMonthPrefix(nextDate);
}

export function buildCalendarGridDays(monthPrefix: string, includeOutsideDays: boolean): CalendarGridDay[] {
  const { monthIndex, year } = parseMonthPrefix(monthPrefix);
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = getDaysInMonth(monthPrefix);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const previousMonthPrefix = addMonthsToMonthPrefix(monthPrefix, -1);
  const nextMonthPrefix = addMonthsToMonthPrefix(monthPrefix, 1);
  const daysInPreviousMonth = getDaysInMonth(previousMonthPrefix);

  return Array.from({ length: totalCells }, (_, index) => {
    const calendarDay = index - firstDay + 1;

    if (calendarDay < 1) {
      const day = daysInPreviousMonth + calendarDay;

      return {
        date: `${previousMonthPrefix}-${String(day).padStart(2, '0')}`,
        day: includeOutsideDays ? day : 0,
        isCurrentMonth: false,
      };
    }

    if (calendarDay > daysInMonth) {
      const day = calendarDay - daysInMonth;

      return {
        date: `${nextMonthPrefix}-${String(day).padStart(2, '0')}`,
        day: includeOutsideDays ? day : 0,
        isCurrentMonth: false,
      };
    }

    return {
      date: `${monthPrefix}-${String(calendarDay).padStart(2, '0')}`,
      day: calendarDay,
      isCurrentMonth: true,
    };
  });
}

export function formatCalendarMonthLabel(monthPrefix: string, month: 'long' | 'short' = 'long') {
  const { monthIndex, year } = parseMonthPrefix(monthPrefix);

  return new Intl.DateTimeFormat('en-US', {
    month,
    year: month === 'long' ? 'numeric' : undefined,
  }).format(new Date(year, monthIndex, 1));
}

export function getClampedDateInMonth(monthPrefix: string, preferredDay: number) {
  const day = Math.min(Math.max(preferredDay, 1), getDaysInMonth(monthPrefix));

  return `${monthPrefix}-${String(day).padStart(2, '0')}`;
}

export function getCurrentDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getMonthPrefix(date: Date | string) {
  if (typeof date === 'string') {
    return date.slice(0, 7);
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function getDefaultSlots(savedSlots: CalendarTimeSlot[]) {
  const slotsByTime = new Map<string, CalendarTimeSlot>();
  const defaultWindow = supabase ? await getDefaultWorkingHoursWindow() : fallbackWorkingHoursWindow;
  const hasCustomAvailableSlots = savedSlots.some((slot) => slot.status === 'available' && slot.isCustom);

  if (!hasCustomAvailableSlots) {
    const key = getSlotKey(defaultWindow.startTime, defaultWindow.endTime);
    slotsByTime.set(key, {
      endTime: defaultWindow.endTime,
      id: key,
      isCustom: false,
      isSaved: false,
      startTime: defaultWindow.startTime,
      status: 'available',
    });
  }

  for (const slot of savedSlots) {
    const key = getSlotKey(slot.startTime, slot.endTime);
    const existingSlot = slotsByTime.get(key);

    if (existingSlot?.status === 'booked') {
      continue;
    }

    slotsByTime.set(key, slot);
  }

  return Array.from(slotsByTime.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function getSlotKeyFromWindow(window: { endTime: string; startTime: string }) {
  return getSlotKey(window.startTime, window.endTime);
}

function getOrCreateSummary(summaries: Map<string, CalendarDaySummary>, date: string) {
  const existing = summaries.get(date);

  if (existing) {
    return existing;
  }

  const summary = {
    date,
    hasAvailable: false,
    hasBooked: false,
    hasFullDayUnavailable: false,
    hasUnavailable: false,
  };

  summaries.set(date, summary);

  return summary;
}

function getSlotKey(startTime: string, endTime: string) {
  return `${startTime}-${endTime}`;
}

function isFullDayUnavailableSlot(slot: Pick<CalendarTimeSlot, 'endTime' | 'startTime' | 'status'>) {
  return (
    slot.status === 'unavailable' &&
    slot.startTime === fullDayUnavailableSlot.startTime &&
    slot.endTime === fullDayUnavailableSlot.endTime
  );
}

function doIntervalsOverlap(first: { end: number; start: number }, second: { end: number; start: number }) {
  return first.start < second.end && second.start < first.end;
}

function getIntervalFromTimeRange(startTime: string, endTime: string) {
  return {
    end: getTimeMinutes(endTime),
    start: getTimeMinutes(startTime),
  };
}

async function findOverlappingSavedTimeSlot({
  date,
  endTime,
  ignoredSlotId,
  startTime,
}: {
  date: string;
  endTime: string;
  ignoredSlotId?: string;
  startTime: string;
}) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false as const };
  }

  const { data: savedSlots, error } = await supabase
    .from('time_slots')
    .select('id, start_time, end_time, status')
    .eq('slot_date', date)
    .limit(100);

  if (error) {
    return { message: error.message, success: false as const };
  }

  const requestedInterval = getIntervalFromTimeRange(startTime, endTime);
  const defaultWindow = await getDefaultWorkingHoursWindow();
  const duplicateSlot = savedSlots?.find((savedSlot) => {
    if (savedSlot.id === ignoredSlotId) {
      return false;
    }

    return savedSlot.start_time === startTime && savedSlot.end_time === endTime;
  });

  if (duplicateSlot) {
    return {
      conflictType: 'duplicate' as const,
      slot: {
        endTime: duplicateSlot.end_time as string,
        startTime: duplicateSlot.start_time as string,
      },
      success: true as const,
    };
  }

  const slot = savedSlots?.find((savedSlot) => {
    if (savedSlot.id === ignoredSlotId) {
      return false;
    }

    if (
      savedSlot.status === 'available' &&
      isDefaultWorkingHoursSlot({
        endTime: savedSlot.end_time as string,
        startTime: savedSlot.start_time as string,
      }, defaultWindow)
    ) {
      return false;
    }

    return doIntervalsOverlap(
      requestedInterval,
      getIntervalFromTimeRange(savedSlot.start_time as string, savedSlot.end_time as string),
    );
  });

  if (!slot) {
    return { slot: null, success: true as const };
  }

  return {
    conflictType: 'overlap' as const,
    slot: {
      endTime: slot.end_time as string,
      startTime: slot.start_time as string,
    },
    success: true as const,
  };
}

function isDefaultWorkingHoursSlot(
  slot: { endTime: string; startTime: string },
  defaultWindow: { endTime: string; startTime: string },
) {
  return slot.startTime === defaultWindow.startTime && slot.endTime === defaultWindow.endTime;
}

function getTimeMinutes(value: string) {
  const [hour = '0', minute = '0'] = value.split(':');

  return Number(hour) * 60 + Number(minute);
}

function formatTimeFromMinutes(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function getDaysInMonth(monthPrefix: string) {
  const { monthIndex, year } = parseMonthPrefix(monthPrefix);

  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseMonthPrefix(monthPrefix: string) {
  const [year, month] = monthPrefix.split('-').map(Number);

  return {
    monthIndex: month - 1,
    year,
  };
}
