import { useBookingPage } from '@/hooks/use-booking-page';
import { adminBookingPagesStore } from '@/services/booking-pages-store';
import { type BookingQuery } from '@/types/booking-pages';

export function usePagedAdminBookings(query: BookingQuery = {}) {
  const page = useBookingPage(adminBookingPagesStore, query);
  return { ...page, requests: page.bookings };
}
