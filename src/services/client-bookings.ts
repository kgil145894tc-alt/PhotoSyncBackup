import { supabase } from '@/lib/supabase';
import { fallbackPortraitPackages } from '@/data/service-catalog';
import { getActiveBookingSlotsForDate } from '@/services/booking-availability';
import { expirePastPendingBookings } from '@/services/booking-expiration';
import { emitBookingsChanged } from '@/services/booking-events';
import { createBookingStatusHistory } from '@/services/booking-status-history';
import { createAdminBookingCancelledNotifications, createAdminBookingRescheduledNotifications } from '@/services/notifications';
import { getDefaultWorkingHoursWindow } from '@/services/studio-settings';
import { type BookingStatus } from '@/types/admin-bookings';
import { type BookingSchedule } from '@/types/booking';
import { type PackageCatalogItem } from '@/types/services';

type CancelBookingRow = {
  id: string;
  packages: {
    name: string;
  } | null;
  profiles: {
    full_name: string | null;
  } | null;
};

type ReschedulePackageRow = {
  client_id: string;
  id: string;
  package_id: string;
  packages: {
    badge: string | null;
    inclusions: string[] | null;
    image_url: string | null;
    is_active: boolean;
    name: string;
    price: number;
  } | null;
  service_id: string;
  services: {
    buffer_minutes: number | null;
    duration_minutes: number | null;
    minimum_notice_days: number | null;
    name: string;
  } | null;
  status: BookingStatus;
};

type RescheduleBookingRow = {
  id: string;
  packages: {
    name: string;
  } | null;
  profiles: {
    full_name: string | null;
  } | null;
};

type ClientBookingSessionOptions = {
  expectedAccountId?: string;
  isSessionCurrent?: () => boolean;
};

export async function cancelClientBooking(id: string, { expectedAccountId, isSessionCurrent }: ClientBookingSessionOptions = {}) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const sessionChanged = { success: false, message: 'Your session changed. Please sign in again before cancelling.' };
  if (isSessionCurrent?.() === false) return sessionChanged;
  const { data: userData } = await supabase.auth.getUser();
  if (isSessionCurrent?.() === false || (expectedAccountId && expectedAccountId !== userData.user?.id)) return sessionChanged;

  if (!userData.user) {
    return { message: 'Please log in again before cancelling your booking.', success: false };
  }

  const expiration = await expirePastPendingBookings({ force: true, expectedAccountId: userData.user.id, isSessionCurrent });
  if (isSessionCurrent?.() === false) return sessionChanged;
  if (!expiration.success) return { success: false, message: expiration.message };

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('client_id', userData.user.id)
    .eq('status', 'pending')
    .select('id, profiles:client_id(full_name), packages:package_id(name)')
    .maybeSingle();

  if (error) {
    return { message: error.message, success: false };
  }

  if (!data) {
    return {
      message: 'Only pending bookings can be cancelled. Confirmed bookings can be rescheduled instead.',
      success: false,
    };
  }

  const booking = data as unknown as CancelBookingRow;

  await createBookingStatusHistory({
    bookingId: booking.id,
    changedBy: userData.user.id,
    status: 'cancelled',
  });

  await createAdminBookingCancelledNotifications({
    bookingId: booking.id,
    clientName: booking.profiles?.full_name ?? 'A client',
    packageName: booking.packages?.name ?? 'package',
  });

  emitBookingsChanged();

  return { success: true };
}

export async function getClientReschedulePackage(id: string, { expectedAccountId, isSessionCurrent }: ClientBookingSessionOptions = {}): Promise<{ message?: string; packageItem?: PackageCatalogItem; success: boolean }> {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const sessionChanged = { success: false, message: 'Your session changed. Please sign in again before rescheduling.' };
  if (isSessionCurrent?.() === false) return sessionChanged;
  const { data: userData } = await supabase.auth.getUser();
  if (isSessionCurrent?.() === false || (expectedAccountId && expectedAccountId !== userData.user?.id)) return sessionChanged;

  if (!userData.user) {
    return { message: 'Please log in again before rescheduling your booking.', success: false };
  }

  const expiration = await expirePastPendingBookings({ force: true, expectedAccountId: userData.user.id, isSessionCurrent });
  if (isSessionCurrent?.() === false) return sessionChanged;
  if (!expiration.success) return { success: false, message: expiration.message };

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      client_id,
      service_id,
      package_id,
      status,
      services:service_id(name, duration_minutes, buffer_minutes, minimum_notice_days),
      packages:package_id(name, badge, price, inclusions, image_url, is_active)
    `)
    .eq('id', id)
    .eq('client_id', userData.user.id)
    .in('status', ['pending', 'confirmed'])
    .maybeSingle();

  if (error) {
    return { message: error.message, success: false };
  }

  if (!data) {
    return { message: 'This booking can no longer be rescheduled.', success: false };
  }

  const booking = data as unknown as ReschedulePackageRow;
  const fallback = fallbackPortraitPackages[0];
  const inclusions = booking.packages?.inclusions?.length ? booking.packages.inclusions : fallback.inclusions;

  return {
    packageItem: {
      ...fallback,
      badge: booking.packages?.badge ?? fallback.badge,
      bufferMinutes: booking.services?.buffer_minutes ?? fallback.bufferMinutes,
      details: inclusions.join('\n'),
      durationMinutes: booking.services?.duration_minutes ?? fallback.durationMinutes,
      id: booking.package_id,
      image: booking.packages?.image_url ? { uri: booking.packages.image_url } : fallback.image,
      imageUrl: booking.packages?.image_url,
      inclusions,
      isActive: booking.packages?.is_active ?? true,
      minimumNoticeDays: booking.services?.minimum_notice_days ?? fallback.minimumNoticeDays,
      name: booking.packages?.name ?? fallback.name,
      price: `₱${Number(booking.packages?.price ?? fallback.priceAmount).toLocaleString('en-PH')}`,
      priceAmount: Number(booking.packages?.price ?? fallback.priceAmount),
      serviceId: booking.service_id,
    },
    success: true,
  };
}

export async function rescheduleClientBooking(id: string, schedule: BookingSchedule) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return { message: 'Please log in again before rescheduling your booking.', success: false };
  }

  const expiration = await expirePastPendingBookings({ force: true, expectedAccountId: userData.user.id });
  if (!expiration.success) return { success: false, message: expiration.message };

  const { data: bookingData, error: bookingLoadError } = await supabase
    .from('bookings')
    .select(`
      id,
      client_id,
      service_id,
      package_id,
      status,
      services:service_id(name, duration_minutes, buffer_minutes, minimum_notice_days),
      packages:package_id(name)
    `)
    .eq('id', id)
    .eq('client_id', userData.user.id)
    .in('status', ['pending', 'confirmed'])
    .maybeSingle();

  if (bookingLoadError) {
    return { message: bookingLoadError.message, success: false };
  }

  if (!bookingData) {
    return { message: 'This booking can no longer be rescheduled.', success: false };
  }

  const booking = bookingData as unknown as ReschedulePackageRow;
  const durationMinutes = Number(booking.services?.duration_minutes ?? 0);
  const bufferMinutes = Number(booking.services?.buffer_minutes ?? 0);
  const minimumNoticeDays = Number(booking.services?.minimum_notice_days ?? 1);

  if (durationMinutes > 0 && getTimeRangeMinutes(schedule.startTime, schedule.endTime) < durationMinutes) {
    return { message: 'This time slot is too short for the selected service.', success: false };
  }

  if (!isDateAllowedByMinimumNotice(schedule.bookingDate, minimumNoticeDays)) {
    return { message: formatMinimumNoticeMessage(minimumNoticeDays), success: false };
  }

  const availability = await checkRescheduleAvailability({
    bookingDate: schedule.bookingDate,
    bufferMinutes,
    endTime: schedule.endTime,
    excludedBookingId: id,
    startTime: schedule.startTime,
  });

  if (!availability.success) {
    return availability;
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({
      booking_date: schedule.bookingDate,
      end_time: schedule.endTime,
      start_time: schedule.startTime,
      status: 'pending',
    })
    .eq('id', id)
    .eq('client_id', userData.user.id)
    .in('status', ['pending', 'confirmed'])
    .select('id, profiles:client_id(full_name), packages:package_id(name)')
    .maybeSingle();

  if (error) {
    return { message: error.message, success: false };
  }

  if (!data) {
    return { message: 'This booking can no longer be rescheduled.', success: false };
  }

  const rescheduledBooking = data as unknown as RescheduleBookingRow;

  await createBookingStatusHistory({
    bookingId: rescheduledBooking.id,
    changedBy: userData.user.id,
    metadata: {
      bookingDate: schedule.bookingDate,
      endTime: schedule.endTime,
      startTime: schedule.startTime,
    },
    reason: 'Client requested a new schedule',
    status: 'pending',
  });

  await createAdminBookingRescheduledNotifications({
    bookingId: rescheduledBooking.id,
    clientName: rescheduledBooking.profiles?.full_name ?? 'A client',
    packageName: rescheduledBooking.packages?.name ?? 'package',
  });

  emitBookingsChanged();

  return { success: true };
}

async function checkRescheduleAvailability({
  bookingDate,
  bufferMinutes,
  endTime,
  excludedBookingId,
  startTime,
}: {
  bookingDate: string;
  bufferMinutes: number;
  endTime: string;
  excludedBookingId: string;
  startTime: string;
}) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const [
    existingBookings,
    { data: unavailableSlots, error: unavailableSlotsError },
    { data: availableWindows, error: availableWindowsError },
  ] = await Promise.all([
    getActiveBookingSlotsForDate(bookingDate, excludedBookingId),
    supabase
      .from('time_slots')
      .select('id, start_time, end_time')
      .eq('slot_date', bookingDate)
      .eq('status', 'unavailable')
      .limit(100),
    supabase
      .from('time_slots')
      .select('id, start_time, end_time')
      .eq('slot_date', bookingDate)
      .eq('status', 'available')
      .limit(100),
  ]);

  if (!existingBookings.success) {
    return { message: `We could not check if the selected time is still available: ${existingBookings.message}`, success: false };
  }

  if (unavailableSlotsError) {
    return { message: `We could not check the admin calendar availability: ${unavailableSlotsError.message}`, success: false };
  }

  if (availableWindowsError) {
    return { message: `We could not check the admin available times: ${availableWindowsError.message}`, success: false };
  }

  const selectedAppointment = {
    end: getTimeMinutes(endTime),
    start: getTimeMinutes(startTime),
  };
  const selectedInterval = {
    end: selectedAppointment.end + bufferMinutes,
    start: Math.max(0, selectedAppointment.start - bufferMinutes),
  };
  let defaultAvailabilityWindow: Awaited<ReturnType<typeof getDefaultWorkingHoursWindow>>;
  try { defaultAvailabilityWindow = await getDefaultWorkingHoursWindow({ force: true, throwOnError: true }); }
  catch { return { message: 'Studio working hours could not be verified. Please try again.', success: false as const }; }
  const availabilityWindows = [
    defaultAvailabilityWindow,
    ...(availableWindows ?? []).map((slot) => ({
      endTime: slot.end_time as string,
      startTime: slot.start_time as string,
    })),
  ];
  const fitsAvailabilityWindow = availabilityWindows.some((window) => {
    const windowStart = getTimeMinutes(window.startTime);
    const windowEnd = getTimeMinutes(window.endTime);

    return selectedAppointment.start >= windowStart && selectedAppointment.end + bufferMinutes <= windowEnd;
  });

  if (!fitsAvailabilityWindow) {
    return { message: 'That time is outside the admin available time. Please choose another available slot.', success: false };
  }

  const hasBookingConflict = existingBookings.slots.some((booking) =>
    doIntervalsOverlap(selectedInterval, {
      end: getTimeMinutes(booking.end_time as string),
      start: getTimeMinutes(booking.start_time as string),
    }),
  );

  if (hasBookingConflict) {
    return { message: 'That date and time overlaps with an existing booking or its preparation time.', success: false };
  }

  const hasUnavailableConflict = unavailableSlots?.some((slot) =>
    doIntervalsOverlap(selectedInterval, {
      end: getTimeMinutes(slot.end_time as string),
      start: getTimeMinutes(slot.start_time as string),
    }),
  );

  if (hasUnavailableConflict) {
    return { message: 'That date and time is no longer available. Please choose another available slot.', success: false };
  }

  return { success: true };
}

function getTimeRangeMinutes(startTime: string, endTime: string) {
  return Math.max(0, getTimeMinutes(endTime) - getTimeMinutes(startTime));
}

function getTimeMinutes(value: string) {
  const [hour = '0', minute = '0'] = value.split(':');

  return Number(hour) * 60 + Number(minute);
}

function doIntervalsOverlap(first: { end: number; start: number }, second: { end: number; start: number }) {
  return first.start < second.end && second.start < first.end;
}

function isDateAllowedByMinimumNotice(bookingDate: string, minimumNoticeDays: number) {
  const earliestDate = addDaysToDateString(getCurrentDateString(), Math.max(1, minimumNoticeDays));

  return bookingDate >= earliestDate;
}

function formatMinimumNoticeMessage(minimumNoticeDays: number) {
  if (minimumNoticeDays <= 1) {
    return 'This service requires booking at least 1 day in advance.';
  }

  return `This service requires booking at least ${minimumNoticeDays} days in advance.`;
}

function getCurrentDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function addDaysToDateString(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);

  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
