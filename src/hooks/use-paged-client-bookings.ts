import { useBookingPage } from '@/hooks/use-booking-page';
import { clientBookingPagesStore } from '@/services/booking-pages-store';
import { type BookingQuery } from '@/types/booking-pages';

export function usePagedClientBookings(query: BookingQuery = {}) {
  return useBookingPage(clientBookingPagesStore, query);
}
