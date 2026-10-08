import { supabase } from '@/lib/supabase';
import { createAdminServiceCatalogCache } from '@/services/admin-service-catalog-cache';
import { subscribeToCatalogChanged } from '@/services/catalog-events';
import { getAdminServiceCatalog } from '@/services/service-catalog';

export const adminServiceCatalogStore = createAdminServiceCatalogCache(
  (isSessionCurrent) => getAdminServiceCatalog({ isSessionCurrent }),
);

// Keep successful mutations synchronized even while this screen is absent.
subscribeToCatalogChanged(adminServiceCatalogStore.invalidate);

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    adminServiceCatalogStore.setAccount(session?.user.id ?? null);
  });
} else {
  adminServiceCatalogStore.setAccount(null);
}
