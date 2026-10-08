import { type SupabaseClient } from '@supabase/supabase-js';

// Auth callbacks only change in-memory scope. No asynchronous auth/database
// work runs inside onAuthStateChange.
export function createAuthSessionScope(auth: SupabaseClient['auth'], setAccount: (id: string | null) => void) {
  let ready = false;
  let revision = 0;
  let pending: Promise<void> | null = null;
  auth.onAuthStateChange((_event, session) => {
    revision++; ready = true; setAccount(session?.user.id ?? null);
  });
  return async function ensureScope() {
    if (ready) return;
    if (!pending) {
      const requestRevision = revision;
      const task = Promise.resolve().then(async () => {
        const { data, error } = await auth.getSession();
        if (requestRevision !== revision) return;
        if (error) throw new Error('Could not restore your session. Please try again.');
        setAccount(data.session?.user.id ?? null); ready = true;
      }).finally(() => { if (pending === task) pending = null; });
      pending = task;
    }
    await pending;
  };
}
