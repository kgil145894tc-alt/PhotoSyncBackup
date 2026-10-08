import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// Keep screens visible and motion off until the device preference is known.
let reduceMotion = true;
let revision = 0;
const listeners = new Set<() => void>();
let subscription: ReturnType<typeof AccessibilityInfo.addEventListener> | undefined;

function publish(enabled: boolean) {
  if (reduceMotion === enabled) return;
  reduceMotion = enabled;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      revision++;
      publish(enabled);
    });
    const readRevision = ++revision;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (revision === readRevision && listeners.size) publish(enabled);
    }).catch(() => {});
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      revision++;
      subscription?.remove();
      subscription = undefined;
      reduceMotion = true;
    }
  };
}

export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, () => reduceMotion, () => true);
}
