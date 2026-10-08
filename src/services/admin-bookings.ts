import { supabase } from '@/lib/supabase';
import { createAuditLog } from '@/services/audit-log';
import { expirePastPendingBookings } from '@/services/booking-expiration';
import { emitBookingsChanged } from '@/services/booking-events';
import { createBookingStatusHistory } from '@/services/booking-status-history';
import { createClientBookingStatusNotification } from '@/services/notifications';
import { getDefaultWorkingHoursWindow } from '@/services/studio-settings';
import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

export type BookingRow = {
  booking_date: string;
  client_id: string;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  end_time: string;
  id: string;
  notes: string | null;
  packages: {
    image_url: string | null;
    inclusions: string[] | null;
    name: string;
    price: number;
  } | null;
  profiles: {
    avatar_url: string | null;
    email: string | null;
    full_name: string | null;
    phone: string | null;
  } | null;
  services: {
    name: string;
  } | null;
  people_count: string | null;
  rejection_reason: string | null;
  session_theme: string | null;
  shoot_location: string | null;
  special_requests: string | null;
  start_time: string;
  status: BookingStatus;
};

type BookingConfirmationRow = {
  booking_date: string;
  end_time: string;
  id: string;
  services: {
    buffer_minutes: number | null;
    duration_minutes: number | null;
    minimum_notice_days: number | null;
  } | null;
  start_time: string;
};

export async function getAdminBookingRequest(
  id: string,
  { throwOnError = false }: { throwOnError?: boolean } = {},
): Promise<AdminBookingRequest | null> {
  if (!supabase) {
    if (throwOnError) throw new Error('Bookings are not connected yet.');
    return null;
  }

  await expirePastPendingBookings();

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      client_id,
      contact_name,
      contact_email,
      contact_phone,
      booking_date,
      start_time,
      end_time,
      status,
      notes,
      people_count,
      shoot_location,
      session_theme,
      special_requests,
      rejection_reason,
      profiles:client_id(avatar_url, full_name, phone, email),
      services:service_id(name),
      packages:package_id(name, price, inclusions, image_url)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error && throwOnError) throw error;
  if (error || !data) {
    return null;
  }

  return mapBookingRow(data as unknown as BookingRow);
}

export async function updateAdminBookingStatus(
  id: string,
  status: Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'>,
  rejectionReason?: string | null,
) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const expiration = await expirePastPendingBookings({ force: true });
  if (!expiration.success) return { success: false, message: expiration.message };

  if (status === 'confirmed') {
    const availability = await validateAdminConfirmationAvailability(id);

    if (!availability.success) {
      return availability;
    }
  }

  const payload =
    status === 'rejected'
      ? { rejection_reason: rejectionReason?.trim() || null, status }
      : { rejection_reason: null, status };

  const { data, error } = await supabase
    .from('bookings')
    .update(payload)
    .eq('id', id)
    .eq('status', status === 'completed' ? 'confirmed' : 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23P01' || error.message.includes('no_overlapping_confirmed_bookings')) {
      return {
        message: 'This request now overlaps with another confirmed booking. Please refresh the request details before confirming.',
        success: false,
      };
    }

    return { message: error.message, success: false };
  }

  if (!data) {
    return {
      message:
        status === 'completed'
          ? 'This booking is no longer confirmed. Please refresh the request details.'
          : 'This request is no longer pending. Please refresh the request details.',
      success: false,
    };
  }

  const booking = await getAdminBookingRequest(id);

  if (booking) {
    await createBookingStatusHistory({
      bookingId: booking.id,
      metadata: {
        bookingDate: booking.bookingDate,
        endTime: booking.endTime,
        packageName: booking.packageName,
        startTime: booking.startTime,
      },
      reason: status === 'rejected' ? booking.rejectionReason : null,
      status,
    });

    await createAuditLog({
      action: `booking.${status}`,
      entityId: booking.id,
      entityType: 'booking',
      metadata: {
        bookingDate: booking.bookingDate,
        clientId: booking.clientId,
        endTime: booking.endTime,
        packageName: booking.packageName,
        rejectionReason: booking.rejectionReason,
        startTime: booking.startTime,
      },
    });

    await createClientBookingStatusNotification({
      bookingDate: booking.bookingDate,
      bookingId: booking.id,
      clientId: booking.clientId,
      endTime: booking.endTime,
      notes: booking.notes,
      packageName: booking.packageName,
      rejectionReason: booking.rejectionReason,
      startTime: booking.startTime,
      status,
    });
  }

  emitBookingsChanged();

  return { success: true, booking };
}

async function validateAdminConfirmationAvailability(id: string) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_date,
      start_time,
      end_time,
      services:service_id(duration_minutes, buffer_minutes, minimum_notice_days)
    `)
    .eq('id', id)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
    return { message: `We could not verify this request before confirming: ${error.message}`, success: false };
  }

  if (!data) {
    return { message: 'This request is no longer pending. Please refresh the request details.', success: false };
  }

  const booking = data as unknown as BookingConfirmationRow;
  const durationMinutes = Number(booking.services?.duration_minutes ?? 0);
  const bufferMinutes = Number(booking.services?.buffer_minutes ?? 0);
  const minimumNoticeDays = Number(booking.services?.minimum_notice_days ?? 1);

  if (durationMinutes > 0 && getTimeRangeMinutes(booking.start_time, booking.end_time) < durationMinutes) {
    return {
      message: `This time slot is too short for the selected service. It needs ${formatDurationForMessage(durationMinutes)}.`,
      success: false,
    };
  }

  if (!isDateAllowedByMinimumNotice(booking.booking_date, minimumNoticeDays)) {
    return {
      message: formatMinimumNoticeMessage(minimumNoticeDays),
      success: false,
    };
  }

  return checkAdminConfirmationAvailability({
    bookingDate: booking.booking_date,
    bufferMinutes,
    endTime: booking.end_time,
    excludedBookingId: booking.id,
    startTime: booking.start_time,
  });
}

async function checkAdminConfirmationAvailability({
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
    { data: existingBookings, error: bookingsError },
    { data: unavailableSlots, error: unavailableSlotsError },
    { data: availableWindows, error: availableWindowsError },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, start_time, end_time')
      .eq('booking_date', bookingDate)
      .in('status', ['pending', 'confirmed'])
      .neq('id', excludedBookingId)
      .limit(100),
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

  if (bookingsError) {
    return { message: `We could not check booking conflicts: ${bookingsError.message}`, success: false };
  }

  if (unavailableSlotsError) {
    return { message: `We could not check unavailable calendar times: ${unavailableSlotsError.message}`, success: false };
  }

  if (availableWindowsError) {
    return { message: `We could not check available calendar times: ${availableWindowsError.message}`, success: false };
  }

  const selectedAppointment = {
    end: getTimeMinutes(endTime),
    start: getTimeMinutes(startTime),
  };
  const selectedInterval = {
    end: selectedAppointment.end + bufferMinutes,
    start: Math.max(0, selectedAppointment.start - bufferMinutes),
  };
  const customAvailabilityWindows = (availableWindows ?? []).map((slot) => ({
    endTime: slot.end_time as string,
    startTime: slot.start_time as string,
  }));
  let availabilityWindowsToCheck = customAvailabilityWindows;
  if (!availabilityWindowsToCheck.length) {
    try { availabilityWindowsToCheck = [await getDefaultWorkingHoursWindow({ force: true, throwOnError: true })]; }
    catch { return { message: 'Studio working hours could not be verified. Please try again.', success: false }; }
  }
  const fitsAvailabilityWindow = availabilityWindowsToCheck.some((window) => {
    const windowStart = getTimeMinutes(window.startTime);
    const windowEnd = getTimeMinutes(window.endTime);

    return selectedAppointment.start >= windowStart && selectedAppointment.end + bufferMinutes <= windowEnd;
  });

  if (!fitsAvailabilityWindow) {
    return { message: 'This request is outside the admin available time and cannot be confirmed.', success: false };
  }

  const hasBookingConflict = existingBookings?.some((booking) =>
    doIntervalsOverlap(selectedInterval, {
      end: getTimeMinutes(booking.end_time as string),
      start: getTimeMinutes(booking.start_time as string),
    }),
  );

  if (hasBookingConflict) {
    return {
      message: 'This request overlaps with another pending or confirmed booking, including preparation time.',
      success: false,
    };
  }

  const hasUnavailableConflict = unavailableSlots?.some((slot) =>
    doIntervalsOverlap(selectedInterval, {
      end: getTimeMinutes(slot.end_time as string),
      start: getTimeMinutes(slot.start_time as string),
    }),
  );

  if (hasUnavailableConflict) {
    return { message: 'This request overlaps with an unavailable calendar time or closed day.', success: false };
  }

  return { success: true };
}

export function formatBookingDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

export function formatShortBookingDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

export function formatBookingTimeRange(startTime: string, endTime: string) {
  return `${formatBookingTime(startTime)} - ${formatBookingTime(endTime)}`;
}

export function mapBookingRow(row: BookingRow): AdminBookingRequest {
  const notesDetails = parseBookingNotes(row.notes);

  return {
    bookingDate: row.booking_date,
    clientAvatarUrl: row.profiles?.avatar_url ?? null,
    clientEmail: row.contact_email ?? row.profiles?.email ?? 'No email provided',
    clientId: row.client_id,
    clientName: row.contact_name ?? row.profiles?.full_name ?? 'Client',
    clientPhone: row.contact_phone ?? row.profiles?.phone ?? 'No phone provided',
    contactEmail: row.contact_email ?? row.profiles?.email ?? '',
    contactName: row.contact_name ?? row.profiles?.full_name ?? '',
    contactPhone: row.contact_phone ?? row.profiles?.phone ?? '',
    endTime: row.end_time,
    id: row.id,
    notes: row.notes,
    packageInclusions: row.packages?.inclusions ?? [],
    packageImageUrl: row.packages?.image_url ?? null,
    packageName: row.packages?.name ?? 'Package',
    packagePrice: Number(row.packages?.price ?? 0),
    peopleCount: row.people_count ?? notesDetails.peopleCount,
    rejectionReason: row.rejection_reason,
    serviceName: row.services?.name ?? 'Service',
    sessionTheme: row.session_theme ?? notesDetails.sessionTheme,
    shootLocation: row.shoot_location ?? notesDetails.shootLocation,
    specialRequests: row.special_requests ?? notesDetails.specialRequests,
    startTime: row.start_time,
    status: row.status,
  };
}

function parseBookingNotes(notes: string | null) {
  const details = {
    peopleCount: '',
    sessionTheme: '',
    shootLocation: '',
    specialRequests: '',
  };

  if (!notes?.trim()) {
    return details;
  }

  notes.split('\n').forEach((line) => {
    const [rawLabel, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    const label = rawLabel.trim().toLowerCase();

    if (label === 'shoot location') {
      details.shootLocation = value;
    }

    if (label === 'theme / concept') {
      details.sessionTheme = value;
    }

    if (label === 'number of people') {
      details.peopleCount = value;
    }

    if (label === 'special requests') {
      details.specialRequests = value;
    }
  });

  return details;
}

function formatBookingTime(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
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

function formatDurationForMessage(minutes: number) {
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
