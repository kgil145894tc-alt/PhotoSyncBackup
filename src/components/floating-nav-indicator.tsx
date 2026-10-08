import { useEffect, useState } from 'react';
import { Animated, Platform, View } from 'react-native';

import { useReducedMotionPreference } from '@/hooks/use-reduced-motion-preference';
import { bottomNavStyles as styles } from '@/styles/navigation.styles';

export function FloatingNavIndicator({ currentIndex, count }: { currentIndex: number; count: number }) {
  const reduceMotion = useReducedMotionPreference();
  const [width, setWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(currentIndex));

  useEffect(() => {
    if (reduceMotion) {
      position.setValue(currentIndex);
      return;
    }
    const animation = Animated.spring(position, {
      toValue: currentIndex,
      stiffness: 240,
      damping: 28,
      mass: 1,
      overshootClamping: true,
      useNativeDriver: Platform.OS !== 'web',
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [currentIndex, position, reduceMotion]);

  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" aria-hidden
      style={styles.floatingIndicatorTrack}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && currentIndex >= 0 ? (
        <Animated.View testID="floating-nav-active-indicator" style={[
          styles.floatingIndicator,
          { width: width / count, transform: [{ translateX: Animated.multiply(position, width / count) }] },
        ]} />
      ) : null}
    </View>
  );
}
