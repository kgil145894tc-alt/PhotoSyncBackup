import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';
import { useClientNavHidden } from '@/hooks/use-client-nav-scroll';

export function useClientNavAnimation(height: number, bottomInset: number) {
  const requestedHidden = useClientNavHidden();
  const [progress] = useState(() => new Animated.Value(0));
  const [screenReader, setScreenReader] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const hidden = requestedHidden && !screenReader;

  useEffect(() => {
    let mounted = true;
    let readerChanged = false;
    let motionChanged = false;
    // React Native Web reports screen-reader mode as true unconditionally.
    // Only native platforms expose the actual screen-reader setting.
    const reader = Platform.OS === 'web' ? null : AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      readerChanged = true;
      if (mounted) setScreenReader(enabled);
    });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      motionChanged = true;
      if (mounted) setReduceMotion(enabled);
    });
    if (Platform.OS !== 'web') {
      void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
        if (mounted && !readerChanged) setScreenReader(enabled);
      }).catch(() => {});
    }
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !motionChanged) setReduceMotion(enabled);
    }).catch(() => {});
    return () => { mounted = false; reader?.remove(); motion?.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(hidden ? 1 : 0);
      return;
    }
    const animation = Animated.timing(progress, { toValue: hidden ? 1 : 0,
      duration: hidden ? 180 : 220, useNativeDriver: Platform.OS !== 'web', isInteraction: false });
    animation.start();
    return () => { animation.stop(); };
  }, [hidden, progress, reduceMotion]);

  return { hidden, containerStyle: {
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height + bottomInset + 24] }) }],
  } };
}
