import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform } from 'react-native';

export function TabScreenMotion({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [opacity] = useState(() => new Animated.Value(1));
  useFocusEffect(useCallback(() => {
    if (!enabled) { opacity.setValue(1); return; }
    // The destination stays visible and interactive throughout the fade.
    opacity.setValue(0.9);
    const fade = Animated.timing(opacity, { toValue: 1, duration: 140,
      easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web', isInteraction: false });
    fade.start();
    return () => { fade.stop(); opacity.setValue(1); };
  }, [enabled, opacity]));
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}
