import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { subscribeToCatalogChanged } from '@/services/catalog-events';
import { clientHomeHighlightsStore as store } from '@/services/client-home-highlights-store';
import { type ServiceHighlight } from '@/types/services';

export function useClientHomeHighlights() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const isCurrentSession = useCallback(() => store.getSnapshot().sessionKey === snapshot.sessionKey, [snapshot.sessionKey]);

  useFocusEffect(useCallback(() => {
    if (!snapshot.isSessionReady || !snapshot.accountId || !isCurrentSession()) return;
    let active = true;
    const refresh = () => { if (active && isCurrentSession()) void store.refresh(); };
    refresh();
    const unsubscribe = subscribeToCatalogChanged((change) => {
      if (change?.entity !== 'package') refresh();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { active = false; unsubscribe(); subscription.remove(); };
  }, [isCurrentSession, snapshot.accountId, snapshot.isSessionReady]));

  const refresh = useCallback(() => isCurrentSession() ? store.refresh(true) : Promise.resolve(), [isCurrentSession]);
  const getHighlight = useCallback((id: string) => isCurrentSession() ? store.getHighlight(id) : null, [isCurrentSession]);
  const error = snapshot.isSessionReady && !snapshot.accountId ? 'Please sign in again to view highlights.' : snapshot.error;

  return {
    highlights: snapshot.data ?? EMPTY_HIGHLIGHTS, error,
    isLoading: !snapshot.isSessionReady || (snapshot.data === null && !error),
    isRefreshing: snapshot.isFetching, refresh, getHighlight,
  };
}

const EMPTY_HIGHLIGHTS: ServiceHighlight[] = [];
