import { type AdminBookingRequest, type BookingStatus } from '@/types/admin-bookings';

export type BookingCursor = { createdAt: string; id: string };
export type BookingQuery = {
  status?: 'all' | 'approved' | BookingStatus;
  dateFilter?: 'all' | 'today' | 'tomorrow' | 'thisWeek' | 'upcoming';
  search?: string;
  bookingId?: string;
  dashboard?: boolean;
};
export type BookingCounts = Record<'all' | 'approved' | 'closed' | 'today' | 'upcoming' | BookingStatus, number>;
export type BookingPage = {
  items: AdminBookingRequest[];
  counts: BookingCounts | null;
  hasMore: boolean;
  nextCursor: BookingCursor | null;
};

export function bookingQueryKey(query: BookingQuery) {
  return JSON.stringify([query.status ?? 'all', query.dateFilter ?? 'all', query.search?.trim() ?? '',
    query.bookingId ?? '', Boolean(query.dashboard)]);
}
