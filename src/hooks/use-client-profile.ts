import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { clientProfileStore as store } from '@/services/client-profile-store';
import { type ProfileFormValues, type ProfileSaveResult } from '@/services/profile';

export function useClientProfile() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const isCurrentSession = useCallback(() => store.getSnapshot().sessionKey === snapshot.sessionKey, [snapshot.sessionKey]);

  useFocusEffect(useCallback(() => {
    if (!snapshot.isSessionReady || !snapshot.accountId) return;
    const refresh = () => { if (isCurrentSession()) void store.refresh(); };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { subscription.remove(); };
  }, [isCurrentSession, snapshot.accountId, snapshot.isSessionReady]));

  const refresh = useCallback(() => isCurrentSession() ? store.refresh(true) : Promise.resolve(), [isCurrentSession]);
  const save = useCallback((values: ProfileFormValues): Promise<ProfileSaveResult> => isCurrentSession() ? store.save(values)
    : Promise.resolve({ success: false, message: 'Your session changed. Please sign in again before saving.' }), [isCurrentSession]);
  const error = snapshot.isSessionReady && !snapshot.accountId ? 'Please sign in again to see your profile.' : snapshot.error;
  return {
    accountId: snapshot.accountId, sessionKey: snapshot.sessionKey,
    profile: snapshot.data, error,
    isLoading: !snapshot.isSessionReady || (!snapshot.data && !error),
    isRefreshing: snapshot.isFetching, isSaving: snapshot.isSaving,
    refresh, save, isCurrentSession,
  };
}
