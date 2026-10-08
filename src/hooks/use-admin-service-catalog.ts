import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { adminServiceCatalogStore as store } from '@/services/admin-service-catalog-store';
import { subscribeToCatalogChanged } from '@/services/catalog-events';
import { type PackageCatalogItem, type ServiceCatalogItem } from '@/types/services';

export function useAdminServiceCatalog() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useFocusEffect(useCallback(() => {
    if (!snapshot.isSessionReady || !snapshot.accountId) return;
    const refresh = () => { void store.refresh(); };
    refresh();
    const unsubscribe = subscribeToCatalogChanged(refresh);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [snapshot.accountId, snapshot.isSessionReady]));

  const error = snapshot.isSessionReady && !snapshot.accountId
    ? 'Please sign in again to manage services.' : snapshot.error;
  const refresh = useCallback(() => store.refresh(true), []);
  const reconcile = useCallback(() => store.refresh(), []);
  return {
    accountId: snapshot.accountId,
    services: snapshot.data?.services ?? EMPTY_SERVICES,
    packages: snapshot.data?.packages ?? EMPTY_PACKAGES,
    error,
    isLoading: !snapshot.isSessionReady || (!snapshot.data && !error),
    isRefreshing: snapshot.isFetching,
    refresh, reconcile,
  };
}

const EMPTY_SERVICES: ServiceCatalogItem[] = [];
const EMPTY_PACKAGES: PackageCatalogItem[] = [];
