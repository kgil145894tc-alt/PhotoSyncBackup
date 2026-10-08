import { supabase } from '@/lib/supabase';
import { createAuthSessionScope } from '@/services/auth-session-scope';
import { subscribeToBookingsChanged } from '@/services/booking-events';
import { createSessionReadCache, type SessionReadOptions } from '@/services/session-read-cache';

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
const reminders = createSessionReadCache(async (_owner, isCurrent) => {
  if (!supabase || !isCurrent()) throw new Error('Reminder check cancelled.');
  const { error } = await supabase.rpc('ensure_booking_reminder_notifications');
  if (error) throw error;
  return true;
}, { freshnessMs: 30_000, cacheKey: () => dateFormatter.format(new Date()) });
const ensureScope = supabase ? createAuthSessionScope(supabase.auth, reminders.setAccount) : async () => {};
subscribeToBookingsChanged(reminders.invalidate);

export async function ensureBookingReminderNotifications(options: SessionReadOptions = {}): Promise<boolean> {
  if (!supabase || options.isSessionCurrent?.() === false) return false;
  try {
    await ensureScope();
    return await reminders.read(options);
  } catch {
    // Notification browsing continues if optional reminder generation fails.
    // Failed checks stay uncached and the next read can retry them.
    return false;
  }
}
