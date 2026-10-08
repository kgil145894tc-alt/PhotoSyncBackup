import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { useReducedMotionPreference } from '@/hooks/use-reduced-motion-preference';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MotionPressable({ selected, style, onPressIn, onPressOut, onHoverIn, onHoverOut, disabled,
  ...props }: PressableProps & { selected?: boolean }) {
  const reduceMotion = useReducedMotionPreference();
  const [scale] = useState(() => new Animated.Value(1));
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const pressed = useRef(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const wasSelected = useRef(selected);

  const animateTo = (toValue: number, duration: number) => {
    animation.current?.stop();
    if (reduceMotion || disabled) { scale.setValue(1); return; }
    animation.current = Animated.timing(scale, { toValue, duration,
      easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web', isInteraction: false });
    animation.current.start();
  };

  useEffect(() => {
    animation.current?.stop();
    if (reduceMotion || disabled) { pressed.current = false; scale.setValue(1); }
    else if (selected && !wasSelected.current && !pressed.current) {
      scale.setValue(0.97);
      const settle = Animated.timing(scale, { toValue: 1, duration: 140,
        easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web', isInteraction: false });
      animation.current = settle;
      settle.start();
    } else { scale.setValue(1); }
    wasSelected.current = selected;
  }, [disabled, reduceMotion, scale, selected]);

  useEffect(() => () => { animation.current?.stop(); }, []);

  const resolvedStyle = typeof style === 'function' ? style({ pressed: !disabled && isPressed, hovered: isHovered }) : style;
  const existingTransform = StyleSheet.flatten(resolvedStyle)?.transform;
  return <AnimatedPressable {...props} disabled={disabled}
    style={[resolvedStyle, { transform: [...(Array.isArray(existingTransform) ? existingTransform : []), { scale }] }]}
    onPressIn={(event) => { pressed.current = true; setIsPressed(true); animateTo(0.98, 80); onPressIn?.(event); }}
    onPressOut={(event) => { pressed.current = false; setIsPressed(false); animateTo(1, 120); onPressOut?.(event); }}
    onHoverIn={(event) => { setIsHovered(true); onHoverIn?.(event); }}
    onHoverOut={(event) => { setIsHovered(false); onHoverOut?.(event); }} />;
}
