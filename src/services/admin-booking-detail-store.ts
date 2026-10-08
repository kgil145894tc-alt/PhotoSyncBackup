import { supabase } from '@/lib/supabase';
import { createAdminBookingDetailCache } from '@/services/admin-booking-detail-cache';
import { getAdminBookingRequest, updateAdminBookingStatus } from '@/services/admin-bookings';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { subscribeToNotificationsChanged } from '@/services/notification-events';

export const adminBookingDetailStore = createAdminBookingDetailCache(
  { load: (id) => getAdminBookingRequest(id, { throwOnError: true }), update: updateAdminBookingStatus },
);

// Keep invalidation active even when booking lists and details are unmounted.
subscribeToBookingsChanged(adminBookingDetailStore.invalidate);
subscribeToNotificationsChanged(adminBookingDetailStore.invalidate);

if (supabase) {
  // INITIAL_SESSION restores the scope. Token refreshes for the same account
  // preserve data; logout and account switching clear it synchronously.
  supabase.auth.onAuthStateChange((_event, session) => {
    adminBookingDetailStore.setAccount(session?.user.id ?? null);
  });
} else {
  adminBookingDetailStore.setAccount(null);
}
