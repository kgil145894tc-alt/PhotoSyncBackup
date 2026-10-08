import { supabase } from '@/lib/supabase';
import { subscribeToCatalogChanged } from '@/services/catalog-events';
import { createClientServiceCatalogCache } from '@/services/client-service-catalog-cache';
import { getClientServiceCatalog } from '@/services/service-catalog';

export const clientServiceCatalogStore = createClientServiceCatalogCache(
  (isSessionCurrent) => getClientServiceCatalog({ isSessionCurrent }),
);

subscribeToCatalogChanged(clientServiceCatalogStore.invalidate);

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    clientServiceCatalogStore.setAccount(session?.user.id ?? null);
  });
} else {
  clientServiceCatalogStore.setAccount(null);
}
