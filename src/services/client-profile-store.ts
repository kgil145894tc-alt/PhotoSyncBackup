import { supabase } from '@/lib/supabase';
import { createClientProfileCache } from '@/services/client-profile-cache';
import { getMyProfile, updateMyProfile } from '@/services/profile';

export const clientProfileStore = createClientProfileCache({
  load: (options) => getMyProfile({ ...options, throwOnError: true }),
  persist: updateMyProfile,
});

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    clientProfileStore.setAccount(session?.user.id ?? null);
  });
} else {
  clientProfileStore.setAccount(null);
}
