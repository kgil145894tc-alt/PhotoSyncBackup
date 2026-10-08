import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { subscribeToCatalogChanged } from '@/services/catalog-events';
import { clientServiceCatalogStore as store } from '@/services/client-service-catalog-store';
import { type PackageCatalogItem, type ServiceCatalogItem } from '@/types/services';

export function useClientServiceCatalog() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const isCurrentSession = useCallback(() => store.getSnapshot().sessionKey === snapshot.sessionKey, [snapshot.sessionKey]);
  useFocusEffect(useCallback(() => {
    if (!snapshot.isSessionReady || !snapshot.accountId) return;
    const refresh = () => { if (isCurrentSession()) void store.refresh(); };
    refresh();
    const unsubscribe = subscribeToCatalogChanged(refresh);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { unsubscribe(); subscription.remove(); };
  }, [isCurrentSession, snapshot.accountId, snapshot.isSessionReady]));

  const refresh = useCallback(() => isCurrentSession() ? store.refresh(true) : Promise.resolve(), [isCurrentSession]);
  const getPackage = useCallback((id: string, serviceId: string) => isCurrentSession()
    ? store.getPackage(id, serviceId) : null, [isCurrentSession]);
  const error = snapshot.isSessionReady && !snapshot.accountId ? 'Please sign in again to view services.' : snapshot.error;
  return {
    accountId: snapshot.accountId, sessionKey: snapshot.sessionKey,
    services: snapshot.data?.services ?? EMPTY_SERVICES,
    packages: snapshot.data?.packages ?? EMPTY_PACKAGES,
    hasLoaded: snapshot.data !== null, error,
    isLoading: !snapshot.isSessionReady || (!snapshot.data && !error),
    isRefreshing: snapshot.isFetching, refresh, getPackage, isCurrentSession,
  };
}

const EMPTY_SERVICES: ServiceCatalogItem[] = [];
const EMPTY_PACKAGES: PackageCatalogItem[] = [];
