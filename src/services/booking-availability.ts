import { supabase } from '@/lib/supabase';

export type ActiveBookingSlot = {
  end_time: string;
  id: string;
  start_time: string;
};

type ActiveBookingSlotsResult =
  | {
      slots: ActiveBookingSlot[];
      success: true;
    }
  | {
      message: string;
      success: false;
    };

export async function getActiveBookingSlotsForDate(
  bookingDate: string,
  excludedBookingId?: string,
): Promise<ActiveBookingSlotsResult> {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data, error } = await supabase.rpc('get_active_booking_slots', {
    p_booking_date: bookingDate,
    p_excluded_booking_id: excludedBookingId ?? null,
  });

  if (error) {
    return {
      message:
        error.code === '42883'
          ? 'The active booking availability function is missing. Please run docs/supabase-booking-conflicts.sql in Supabase.'
          : error.message,
      success: false,
    };
  }

  return { slots: (data ?? []) as ActiveBookingSlot[], success: true };
}
