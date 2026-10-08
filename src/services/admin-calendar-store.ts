import { supabase } from '@/lib/supabase';
import { createAdminCalendarCache } from '@/services/admin-calendar-cache';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { getCalendarDaySummaries, getCalendarSlotsForDate } from '@/services/calendar';
import { subscribeToCalendarChanged } from '@/services/calendar-events';
import { subscribeToNotificationsChanged } from '@/services/notification-events';

export const adminCalendarMonthStore = createAdminCalendarCache(
  (month) => getCalendarDaySummaries(month, { throwOnError: true }), Date.now, 12,
);
export const adminCalendarDayStore = createAdminCalendarCache(
  (date) => getCalendarSlotsForDate(date, { throwOnError: true }), Date.now, 32,
);

function invalidateAll() {
  adminCalendarMonthStore.invalidate();
  adminCalendarDayStore.invalidate();
}

// These listeners outlive screens. Booking events carry no old/new dates, so
// invalidate all visited months/days to cover cancellations and reschedules.
subscribeToBookingsChanged(invalidateAll);
subscribeToNotificationsChanged(invalidateAll);
subscribeToCalendarChanged((date) => {
  adminCalendarMonthStore.invalidate(date?.slice(0, 7));
  adminCalendarDayStore.invalidate(date);
});

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    adminCalendarMonthStore.setAccount(session?.user.id ?? null);
    adminCalendarDayStore.setAccount(session?.user.id ?? null);
  });
} else {
  adminCalendarMonthStore.setAccount(null);
  adminCalendarDayStore.setAccount(null);
}
