import { supabase } from '@/lib/supabase';
import { createBookingPagesCache } from '@/services/booking-pages-cache';
import { getBookingPage } from '@/services/booking-pages';
import { cancelClientBooking } from '@/services/client-bookings';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { subscribeToNotificationsChanged } from '@/services/notification-events';

export const adminBookingPagesStore = createBookingPagesCache({
  load: (query, cursor, accountId, isCurrent) => getBookingPage('admin', query, cursor, accountId, isCurrent),
});
export const clientBookingPagesStore = createBookingPagesCache({
  load: (query, cursor, accountId, isCurrent) => getBookingPage('client', query, cursor, accountId, isCurrent),
  ownBookingsOnly: true,
  cancel: (id, expectedAccountId, isSessionCurrent) => cancelClientBooking(id, { expectedAccountId, isSessionCurrent }),
});
for (const store of [adminBookingPagesStore, clientBookingPagesStore]) {
  subscribeToBookingsChanged(store.invalidate);
  subscribeToNotificationsChanged(store.invalidate);
}
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    adminBookingPagesStore.setAccount(session?.user.id ?? null);
    clientBookingPagesStore.setAccount(session?.user.id ?? null);
  });
} else {
  adminBookingPagesStore.setAccount(null);
  clientBookingPagesStore.setAccount(null);
}
