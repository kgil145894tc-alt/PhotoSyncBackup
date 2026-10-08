import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { subscribeToCalendarChanged } from '@/services/calendar-events';
import { getStudioSettings, type StudioSettings } from '@/services/studio-settings';

export function useClientStudioSettings() {
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [error, setError] = useState(false);
  const refreshRef = useRef<() => void>(() => {});

  useFocusEffect(useCallback(() => {
    let active = true;
    let request = 0;
    const refresh = async () => {
      const currentRequest = ++request;
      try {
        // Refetch on each visit/resume so changes from the admin's device
        // appear even when the local shared cache is still fresh.
        const next = await getStudioSettings({ force: true, throwOnError: true });
        if (active && currentRequest === request) {
          setSettings(next);
          setError(false);
        }
      } catch {
        if (active && currentRequest === request) setError(true);
      }
    };
    refreshRef.current = () => { void refresh(); };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const unsubscribe = subscribeToCalendarChanged((date) => {
      if (!date) void refresh();
    });
    return () => {
      active = false;
      refreshRef.current = () => {};
      subscription.remove();
      unsubscribe();
    };
  }, []));

  return { settings, error, refresh: () => refreshRef.current() };
}
