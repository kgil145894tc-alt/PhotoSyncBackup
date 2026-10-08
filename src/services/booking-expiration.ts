import { supabase } from '@/lib/supabase';
import { createBookingExpirationCoordinator, type BookingExpirationOptions, type BookingExpirationResult } from '@/services/booking-expiration-coordinator';
import { emitBookingsChanged, subscribeToBookingsChanged } from '@/services/booking-events';

let publishingExpiration = false;
let isSessionReady = false;
let authRevision = 0;
let initialSession: Promise<void> | null = null;

const coordinator = createBookingExpirationCoordinator(async (_accountId, isCurrent) => {
  if (!supabase || !isCurrent()) throw new Error('Your booking session changed. Please sign in again.');
  const { data, error } = await supabase.rpc('expire_past_pending_bookings');
  if (error) throw new Error('Couldn’t verify booking status. Please try again.');
  return data as number;
}, Date.now, () => {
  // Invalidate booking data once without invalidating our just-finished check.
  publishingExpiration = true;
  try { emitBookingsChanged(); } finally { publishingExpiration = false; }
});

subscribeToBookingsChanged(() => { if (!publishingExpiration) coordinator.invalidate(); });

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    authRevision += 1;
    isSessionReady = true;
    coordinator.setAccount(session?.user.id ?? null);
  });
}

async function ensureSessionScope() {
  if (isSessionReady || !supabase) return;
  if (!initialSession) {
    const version = authRevision;
    const task = Promise.resolve().then(async () => {
      const { data, error } = await supabase!.auth.getSession();
      if (version !== authRevision) return;
      if (error) throw new Error('Please sign in again before checking bookings.');
      coordinator.setAccount(data.session?.user.id ?? null);
      isSessionReady = true;
    }).finally(() => { if (initialSession === task) initialSession = null; });
    initialSession = task;
  }
  await initialSession;
}

export async function expirePastPendingBookings(options: BookingExpirationOptions = {}): Promise<BookingExpirationResult> {
  if (!supabase) return { success: false, message: 'Bookings are not connected yet.' };
  if (options.isSessionCurrent?.() === false) return { success: false, message: 'Your booking session changed. Please sign in again.' };
  try {
    await ensureSessionScope();
    return await coordinator.run(options);
  } catch {
    return { success: false, message: 'Couldn’t verify booking status. Please try again.' };
  }
}
