import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { adminStudioSettingsStore as store } from '@/services/admin-studio-settings-store';

export function useAdminStudioSettings() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useFocusEffect(useCallback(() => {
    if (!snapshot.isSessionReady || !snapshot.accountId) return;
    const refresh = () => {
      if (store.getSnapshot().sessionKey === snapshot.sessionKey) void store.refresh();
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { subscription.remove(); };
  }, [snapshot.accountId, snapshot.isSessionReady, snapshot.sessionKey]));

  const error = snapshot.isSessionReady && !snapshot.accountId
    ? 'Please sign in again to manage studio information.' : snapshot.error;
  const refresh = useCallback(() => store.refresh(true), []);
  return {
    accountId: snapshot.accountId,
    sessionKey: snapshot.sessionKey,
    settings: snapshot.data,
    error,
    isLoading: !snapshot.isSessionReady || (!snapshot.data && !error),
    isRefreshing: snapshot.isFetching,
    isSaving: snapshot.isSaving,
    refresh,
    save: store.save,
  };
}
