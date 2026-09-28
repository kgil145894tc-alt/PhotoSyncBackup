import { supabase } from '@/lib/supabase';
import { emitBookingsChanged } from '@/services/booking-events';
import { createBookingStatusHistory } from '@/services/booking-status-history';
import { getBookingDraft } from '@/services/booking-draft';
import { createAdminBookingSubmittedNotifications } from '@/services/notifications';
import { getDefaultWorkingHoursWindow } from '@/services/studio-settings';

type SubmitBookingResult = {
  message?: string;
  success: boolean;
};

type ServiceBookingRulesResult =
  | {
      bufferMinutes: number;
      durationMinutes: number;
      minimumNoticeDays: number;
      success: true;
    }
  | {
      message?: string;
      success: false;
    };

export async function submitBookingRequest(): Promise<SubmitBookingResult> {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const draft = getBookingDraft();

  const draftError = getDraftValidationMessage(draft);

  if (draftError) {
    return { message: draftError, success: false };
  }

  const { package: selectedPackage, schedule, information } = draft;

  if (!selectedPackage || !schedule || !information) {
    return { message: 'Please complete all booking steps before confirming.', success: false };
  }

  if (!isUuid(selectedPackage.id) || !isUuid(selectedPackage.serviceId)) {
    return {
      message: 'Services and packages are still using sample data. Please run the Supabase services/packages SQL first.',
      success: false,
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { message: 'Please log in again before submitting your booking request.', success: false };
  }

  const serviceRules = await getServiceBookingRules(selectedPackage.serviceId);

  if (!serviceRules.success) {
    return serviceRules;
  }

  if (serviceRules.durationMinutes > 0 && getTimeRangeMinutes(schedule.startTime, schedule.endTime) < serviceRules.durationMinutes) {
    return {
      message: `This time slot is too short for the selected service. Please choose a slot that can fit ${formatDurationForMessage(serviceRules.durationMinutes)}.`,
      success: false,
    };
  }

  if (!isDateAllowedByMinimumNotice(schedule.bookingDate, serviceRules.minimumNoticeDays)) {
    return {
      message: formatMinimumNoticeMessage(serviceRules.minimumNoticeDays),
      success: false,
    };
  }

  const slotAvailability = await checkSlotAvailability({
    bufferMinutes: serviceRules.bufferMinutes,
    bookingDate: schedule.bookingDate,
    endTime: schedule.endTime,
    startTime: schedule.startTime,
  });

  if (!slotAvailability.success) {
    return slotAvailability;
  }

  const { error: profileError } = await supabase.from('profiles').upsert({
    email: information.email.trim(),
    full_name: information.fullName.trim(),
    id: userData.user.id,
    phone: information.phone.trim(),
    role: 'client',
  });

  if (profileError) {
    return { message: `We could not save your contact details: ${profileError.message}`, success: false };
  }

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      booking_date: schedule.bookingDate,
      client_id: userData.user.id,
      contact_email: information.email.trim(),
      contact_name: information.fullName.trim(),
      contact_phone: information.phone.trim(),
      end_time: schedule.endTime,
      notes: information.notes.trim() || null,
      package_id: selectedPackage.id,
      people_count: information.peopleCount?.trim() || null,
      service_id: selectedPackage.serviceId,
      session_theme: information.sessionTheme?.trim() || null,
      shoot_location: information.sessionLocation?.trim() || null,
      special_requests: getSpecialRequestsFromNotes(information.notes),
      start_time: schedule.startTime,
      status: 'pending',
    })
    .select('id')
    .single();

  if (bookingError) {
    if (bookingError.code === '23505') {
      if (bookingError.message.includes('one_active_booking_per_client')) {
        return {
          message:
            'The database is still using the old one-active-booking rule. Please run docs/supabase-allow-multiple-active-bookings.sql, then try again.',
          success: false,
        };
      }

      return {
        message: 'That date and time was just taken. Please go back and choose another available slot.',
        success: false,
      };
    }

    return { message: `We could not submit your booking: ${bookingError.message}`, success: false };
  }

  if (booking?.id) {
    await createBookingStatusHistory({
      bookingId: booking.id,
      changedBy: userData.user.id,
      metadata: {
        bookingDate: schedule.bookingDate,
        endTime: schedule.endTime,
        packageId: selectedPackage.id,
        packageName: selectedPackage.name,
        serviceId: selectedPackage.serviceId,
        startTime: schedule.startTime,
      },
      status: 'pending',
    });

    await createAdminBookingSubmittedNotifications({
      bookingId: booking.id,
      clientName: information.fullName.trim(),
      packageName: selectedPackage.name,
    });

    emitBookingsChanged();
  }

  return { success: true };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getSpecialRequestsFromNotes(notes: string) {
  const specialRequests = notes
    .split('\n')
    .find((line) => line.trim().toLowerCase().startsWith('special requests:'));

  if (specialRequests) {
    return specialRequests.split(':').slice(1).join(':').trim() || null;
  }

  return null;
}

function getDraftValidationMessage(draft: ReturnType<typeof getBookingDraft>) {
  if (!draft.package) {
    return 'Please choose a package before confirming your booking.';
  }

  if (!draft.schedule) {
    return 'Please choose an available date and time before confirming your booking.';
  }

  if (!draft.information) {
    return 'Please enter your name, email, and phone number before confirming your booking.';
  }

  if (!draft.information.fullName.trim()) {
    return 'Please enter your full name.';
  }

  if (!isValidEmail(draft.information.email)) {
    return 'Please enter a valid email address.';
  }

  if (!isValidPhone(draft.information.phone)) {
    return 'Please enter a valid phone number.';
  }

  return null;
}

async function checkSlotAvailability({
  bufferMinutes,
  bookingDate,
  endTime,
  startTime,
}: {
  bufferMinutes: number;
  bookingDate: string;
  endTime: string;
  startTime: string;
}): Promise<SubmitBookingResult> {
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
    return { message: `We could not check if the selected time is still available: ${bookingsError.message}`, success: false };
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
  const customAvailabilityWindows = (availableWindows ?? []).map((slot) => ({
    endTime: slot.end_time as string,
    startTime: slot.start_time as string,
  }));
  const availabilityWindowsToCheck = customAvailabilityWindows.length
    ? customAvailabilityWindows
    : [await getDefaultWorkingHoursWindow()];
  const fitsAvailabilityWindow = availabilityWindowsToCheck.some((window) => {
    const windowStart = getTimeMinutes(window.startTime);
    const windowEnd = getTimeMinutes(window.endTime);

    return selectedAppointment.start >= windowStart && selectedAppointment.end + bufferMinutes <= windowEnd;
  });

  if (!fitsAvailabilityWindow) {
    return {
      message: 'That time is outside the admin available time. Please choose another available slot.',
      success: false,
    };
  }

  const hasBookingConflict = existingBookings?.some((booking) =>
    doIntervalsOverlap(selectedInterval, {
      end: getTimeMinutes(booking.end_time as string),
      start: getTimeMinutes(booking.start_time as string),
    }),
  );

  if (hasBookingConflict) {
    return {
      message: 'That date and time overlaps with an existing booking or its preparation time. Please choose another available slot.',
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
    return {
      message: 'That date and time is no longer available. Please choose another available slot.',
      success: false,
    };
  }

  return { success: true };
}

async function getServiceBookingRules(serviceId: string): Promise<ServiceBookingRulesResult> {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data, error } = await supabase
    .from('services')
    .select('duration_minutes, buffer_minutes, minimum_notice_days')
    .eq('id', serviceId)
    .maybeSingle();

  if (error) {
    return { message: `We could not verify the selected service duration: ${error.message}`, success: false };
  }

  return {
    bufferMinutes: Number(data?.buffer_minutes ?? 0),
    durationMinutes: Number(data?.duration_minutes ?? 0),
    minimumNoticeDays: Number(data?.minimum_notice_days ?? 1),
    success: true,
  };
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  return value.replace(/\D/g, '').length >= 7;
}
