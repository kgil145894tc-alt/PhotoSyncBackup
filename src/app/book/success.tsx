import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { bookingSuccessStyles as styles } from '@/styles/booking-success.styles';

const FIGMA_WIDTH = 412;
const FIGMA_NAV_TOP = 844;

export default function BookingSuccessScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom;
  const availableContentHeight = Math.max(1, height - bottomPadding);
  const scale = Math.min(width / FIGMA_WIDTH, availableContentHeight / FIGMA_NAV_TOP);
  const contentHeight = availableContentHeight;
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={[styles.canvas, { height: contentHeight }]}>
        <Image
          contentFit="cover"
          source={require('@/assets/images/booking-success-background.png')}
          style={[styles.backgroundImage, { left: 0, width, height: contentHeight }]}
        />

        <View style={[styles.checkOuter, { left: x(116), top: y(162), width: px(180), height: px(180), borderRadius: px(90) }]}>
          <View style={[styles.checkInner, { width: px(130), height: px(130), borderRadius: px(65) }]}>
            <CheckIcon size={px(70)} />
          </View>
        </View>

        <Text style={[styles.title, { left: x(79), top: y(359), width: px(254), fontSize: px(32), lineHeight: px(49) }]}>
          Booking Request{'\n'}Sent!
        </Text>

        <Text style={[styles.message, { left: x(36), top: y(488), width: px(340), fontSize: px(20), lineHeight: px(26) }]}>
          Thank you for choosing PhotoSync.{'\n'}We have received your booking{'\n'}request and will contact you soon{'\n'}using the information you provided.
        </Text>

        <CameraIcon left={x(187)} size={px(38)} top={y(605)} />

        <Pressable
          accessibilityLabel="Back to Home"
          accessibilityRole="button"
          onPress={() => router.replace('/home')}
          style={({ pressed }) => [
            styles.homeButton,
            {
              left: x(33),
              top: y(669),
              width: px(346),
              height: px(64),
              borderRadius: px(30),
              opacity: pressed ? 0.82 : 1,
            },
          ]}>
          <Text style={[styles.homeButtonText, { fontSize: px(24), lineHeight: px(38) }]}>Back to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 70 70" fill="none">
      <Path d="M17 36L29 48L54 20" stroke="#BCD0EA" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CameraIcon({ left, size, top }: { left: number; size: number; top: number }) {
  return (
    <View style={[styles.cameraIcon, { left, top }]}>
      <Svg width={size} height={size * 0.82} viewBox="0 0 38 31" fill="none">
        <Path
          d="M34.1 6H28.2L26.7 2.4C26.4 1.7 25.8 1.2 25 1.2H13C12.2 1.2 11.6 1.7 11.3 2.4L9.8 6H3.9C2.3 6 1 7.3 1 8.9V27.1C1 28.7 2.3 30 3.9 30H34.1C35.7 30 37 28.7 37 27.1V8.9C37 7.3 35.7 6 34.1 6Z"
          stroke="#142C4C"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <Path
          d="M19 24C22.3 24 25 21.3 25 18C25 14.7 22.3 12 19 12C15.7 12 13 14.7 13 18C13 21.3 15.7 24 19 24Z"
          stroke="#142C4C"
          strokeWidth={3}
        />
      </Svg>
    </View>
  );
}
