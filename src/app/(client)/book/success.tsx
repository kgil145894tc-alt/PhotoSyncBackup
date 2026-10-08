import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MobilePage } from '@/components/mobile-page';
import { MotionPressable } from '@/components/motion-pressable';
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion-preference';
import { responsiveStyles as styles } from '@/styles/responsive.styles';
export default function BookingSuccessScreen() {
  const reduceMotion = useReducedMotionPreference();
  const [iconScale] = useState(() => new Animated.Value(reduceMotion ? 1 : 0.92));
  const [iconOpacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [textOpacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const animatedOnce = useRef(false);

  useEffect(() => {
    if (reduceMotion || animatedOnce.current) {
      iconScale.setValue(1);
      iconOpacity.setValue(1);
      textOpacity.setValue(1);
      return;
    }
    animatedOnce.current = true;
    iconScale.setValue(0.92);
    iconOpacity.setValue(0);
    textOpacity.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(iconScale, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false,
      }),
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 380,
        delay: 40,
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [iconOpacity, iconScale, reduceMotion, textOpacity]);

  return (
    <MobilePage title="PhotoSync" back={false}>
      <View style={[styles.center, { paddingVertical: 32 }]}>
        <Animated.View
          style={[{
            width: 130,
            height: 130,
            borderRadius: 65,
            backgroundColor: '#142C4C',
            alignItems: 'center',
            justifyContent: 'center',
          }, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}
        >
          <CheckIcon size={70} />
        </Animated.View>
        <Animated.Text style={[styles.title, styles.centeredText, { opacity: textOpacity }]}>
          Booking Request Sent!
        </Animated.Text>
        <Animated.Text style={[styles.text, styles.centeredText, { opacity: textOpacity }]}>
          Thank you for choosing PhotoSync. We have received your booking
          request and will contact you soon using the information you provided.
        </Animated.Text>
      </View>
      <MotionPressable
        accessibilityRole="button"
        onPress={() => router.replace('/home')}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Back to Home</Text>
      </MotionPressable>
    </MobilePage>
  );
}
function CheckIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 70 70" fill="none">
      <Path
        d="M17 36L29 48L54 20"
        stroke="#BCD0EA"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
