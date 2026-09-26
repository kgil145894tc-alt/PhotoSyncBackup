import { supabase } from '@/lib/supabase';
import { type BookingStatus } from '@/types/admin-bookings';

type BookingStatusHistoryInput = {
  bookingId: string;
  changedBy?: string | null;
  metadata?: Record<string, unknown>;
  reason?: string | null;
  status: BookingStatus;
};

export async function createBookingStatusHistory({
  bookingId,
  changedBy,
  metadata = {},
  reason,
  status,
}: BookingStatusHistoryInput) {
  if (!supabase) {
    return;
  }

  const actorId = changedBy ?? (await getCurrentUserId());

  await supabase.from('booking_status_history').insert({
    booking_id: bookingId,
    changed_by: actorId,
    metadata,
    reason: reason?.trim() || null,
    status,
  });
}

async function getCurrentUserId() {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getUser();

  return data?.user?.id ?? null;
}
