import { supabase } from '@/lib/supabase';
import { subscribeToCatalogChanged } from '@/services/catalog-events';
import { createClientHomeHighlightsCache } from '@/services/client-home-highlights-cache';
import { getServiceHighlights } from '@/services/service-catalog';

export const clientHomeHighlightsStore = createClientHomeHighlightsCache(getServiceHighlights);

subscribeToCatalogChanged(clientHomeHighlightsStore.invalidate);

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    clientHomeHighlightsStore.setAccount(session?.user.id ?? null);
  });
} else {
  clientHomeHighlightsStore.setAccount(null);
}
