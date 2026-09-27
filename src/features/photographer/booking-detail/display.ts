import { formatBookingDate, formatBookingTimeRange } from '@/services/admin-bookings';
import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

export function formatStatusLabel(status: BookingStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getUpdateSuccessMessage(status: Extract<BookingStatus, 'completed' | 'confirmed' | 'rejected'>) {
  if (status === 'completed') {
    return 'Booking marked completed. The client has been notified.';
  }

  return status === 'confirmed'
    ? 'Booking request confirmed. The client has been notified and the time slot is now booked.'
    : 'Booking request rejected. The client has been notified.';
}

export function getResolvedStatusTitle(status: BookingStatus) {
  if (status === 'completed') {
    return 'This booking is completed';
  }

  if (status === 'confirmed') {
    return 'This request is confirmed';
  }

  if (status === 'rejected') {
    return 'This request is rejected';
  }

  if (status === 'expired') {
    return 'This request expired';
  }

  return 'This request is cancelled';
}

export function getResolvedStatusMessage(status: BookingStatus) {
  if (status === 'completed') {
    return 'The session has been marked finished.';
  }

  if (status === 'confirmed') {
    return 'The selected date and time appears as booked on the calendar.';
  }

  if (status === 'rejected') {
    return 'No further action is needed unless the client submits a new request.';
  }

  if (status === 'expired') {
    return 'The requested time has already passed, so this request can no longer be confirmed.';
  }

  return 'No further action is available for this booking.';
}

export function getBookingDateLabel(booking: AdminBookingRequest) {
  return formatBookingDate(booking.bookingDate);
}

export function getBookingWeekday(booking: AdminBookingRequest) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(`${booking.bookingDate}T00:00:00`));
}

export function getBookingTimeLabel(booking: AdminBookingRequest) {
  return formatBookingTimeRange(booking.startTime, booking.endTime);
}

export function getBookingDurationLabel(booking: AdminBookingRequest) {
  const minutes = getTimeMinutes(booking.endTime) - getTimeMinutes(booking.startTime);

  if (minutes <= 0) {
    return '';
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;

    return `(${hours} ${hours === 1 ? 'hour' : 'hours'})`;
  }

  if (minutes < 60) {
    return `(${minutes} minutes)`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `(${hours} hr ${remainingMinutes} min)`;
}

export function getBookingInclusions(booking: AdminBookingRequest) {
  return booking.packageInclusions.length ? booking.packageInclusions : [booking.serviceName];
}

export function getAdditionalNotes(booking: AdminBookingRequest) {
  if (booking.specialRequests) {
    return booking.specialRequests;
  }

  if (booking.sessionTheme) {
    return `Theme / Concept: ${booking.sessionTheme}`;
  }

  if (booking.shootLocation || booking.peopleCount) {
    return [booking.shootLocation ? `Shoot location: ${booking.shootLocation}` : '', booking.peopleCount ? `People: ${booking.peopleCount}` : '']
      .filter(Boolean)
      .join('\n');
  }

  return 'No additional notes provided.';
}

export function hasSessionDetails(booking: AdminBookingRequest) {
  return Boolean(booking.shootLocation || booking.sessionTheme || booking.peopleCount || booking.specialRequests);
}

function getTimeMinutes(value: string) {
  const [hour = '0', minute = '0'] = value.split(':');

  return Number(hour) * 60 + Number(minute);
}
