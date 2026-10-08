import { supabase } from '@/lib/supabase';
import { createAdminStudioSettingsCache } from '@/services/admin-studio-settings-cache';
import { getStudioSettings, saveStudioSettings } from '@/services/studio-settings';

export const adminStudioSettingsStore = createAdminStudioSettingsCache(
  () => getStudioSettings({ throwOnError: true, force: true }),
  saveStudioSettings,
);

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    adminStudioSettingsStore.setAccount(session?.user.id ?? null);
  });
} else {
  adminStudioSettingsStore.setAccount(null);
}
