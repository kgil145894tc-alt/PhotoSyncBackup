import { supabase } from '@/lib/supabase';
import { mapBookingRow, type BookingRow } from '@/services/admin-bookings';
import { expirePastPendingBookings } from '@/services/booking-expiration';
import { type BookingCounts, type BookingCursor, type BookingPage, type BookingQuery } from '@/types/booking-pages';

export async function getBookingPage(scope: 'admin' | 'client', query: BookingQuery, cursor: BookingCursor | null,
  expectedAccountId: string, isCurrent: () => boolean): Promise<BookingPage> {
  if (!supabase) throw new Error('Bookings are not connected yet.');
  const verifySession = () => { if (!isCurrent()) throw new Error('Your booking session changed.'); };
  verifySession();
  const { data: session, error: authError } = await supabase.auth.getUser();
  verifySession();
  if (authError || session.user?.id !== expectedAccountId) throw new Error('Please sign in again to see bookings.');
  await expirePastPendingBookings({ expectedAccountId, isSessionCurrent: isCurrent });
  verifySession();
  const { data, error } = await supabase.rpc('get_booking_page', {
    p_scope: scope, p_status: query.status ?? 'all', p_date_filter: query.dateFilter ?? 'all',
    p_search: query.search?.trim() ?? '', p_booking_id: query.bookingId ?? null,
    p_dashboard: Boolean(query.dashboard), p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null, p_limit: 30,
  });
  verifySession();
  if (error) throw error;
  const page = data as { items: BookingRow[]; counts: BookingCounts | null; hasMore: boolean; nextCursor: BookingCursor | null } | null;
  if (!page || !Array.isArray(page.items)) throw new Error('Invalid booking page.');
  return { ...page, items: page.items.map(mapBookingRow) };
}
