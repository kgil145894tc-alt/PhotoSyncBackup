import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);
  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}

function subscribeToHydration(callback: () => void) {
  const frame = requestAnimationFrame(callback);

  return () => {
    cancelAnimationFrame(frame);
  };
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}
