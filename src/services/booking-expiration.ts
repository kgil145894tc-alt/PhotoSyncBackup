import { supabase } from '@/lib/supabase';
import { createBookingStatusHistory } from '@/services/booking-status-history';

type ExpiredBookingRow = {
  booking_date: string;
  end_time: string;
  id: string;
  start_time: string;
};

export async function expirePastPendingBookings() {
  if (!supabase) {
    return;
  }

  const today = getCurrentDateString();
  const currentTime = getCurrentTimeString();
  const [pastDateResult, todayResult] = await Promise.all([
    supabase
      .from('bookings')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('booking_date', today)
      .select('id, booking_date, start_time, end_time'),
    supabase
      .from('bookings')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .eq('booking_date', today)
      .lt('start_time', currentTime)
      .select('id, booking_date, start_time, end_time'),
  ]);

  const expiredBookings = [
    ...((pastDateResult.data ?? []) as ExpiredBookingRow[]),
    ...((todayResult.data ?? []) as ExpiredBookingRow[]),
  ];

  if (pastDateResult.error || todayResult.error || expiredBookings.length === 0) {
    return;
  }

  await Promise.all(
    expiredBookings.map((booking) =>
      createBookingStatusHistory({
        bookingId: booking.id,
        metadata: {
          bookingDate: booking.booking_date,
          endTime: booking.end_time,
          expiredAt: new Date().toISOString(),
          startTime: booking.start_time,
        },
        reason: 'Booking request expired after the scheduled start time passed.',
        status: 'expired',
      }),
    ),
  );
}

function getCurrentDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getCurrentTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}
