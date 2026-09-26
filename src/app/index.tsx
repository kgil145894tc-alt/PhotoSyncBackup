import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { introStyles as styles } from '@/styles/intro.styles';

const FIGMA_WIDTH = 412;
const FIGMA_HEIGHT = 918;

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / FIGMA_WIDTH, height / FIGMA_HEIGHT);
  const frameWidth = FIGMA_WIDTH * scale;
  const frameHeight = FIGMA_HEIGHT * scale;
  const left = (width - frameWidth) / 2;
  const top = (height - frameHeight) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => top + px(value);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image
        contentFit="cover"
        source={require('@/assets/images/splash-background.png')}
        style={StyleSheet.absoluteFill}
      />

      <Image
        contentFit="contain"
        source={require('@/assets/images/photosync-logo.png')}
        style={[
          styles.logo,
          {
            left: x(78),
            top: y(175),
            width: px(255),
            height: px(213),
          },
        ]}
      />

      <Text
        style={[
          styles.wordmark,
          {
            left: x(83),
            top: y(379),
            width: px(269),
            fontSize: px(96),
            lineHeight: px(72),
          },
        ]}>
        Photo<Text style={styles.wordmarkAccent}>Sync</Text>
      </Text>

      <View
        style={[
          styles.tagline,
          {
            left: x(33),
            top: y(459),
            width: px(356),
            height: px(57),
          },
        ]}>
        <Text style={[styles.taglineText, { fontSize: px(36), lineHeight: px(57) }]}>Capture</Text>
        <View style={[styles.dot, { width: px(4), height: px(4), borderRadius: px(2) }]} />
        <Text style={[styles.taglineText, { fontSize: px(36), lineHeight: px(57) }]}>Book</Text>
        <View style={[styles.dot, { width: px(4), height: px(4), borderRadius: px(2) }]} />
        <Text style={[styles.taglineText, { fontSize: px(36), lineHeight: px(57) }]}>Relive</Text>
      </View>

      <View style={[styles.authActions, { left: x(42), top: y(719), width: px(337), gap: px(14) }]}>
        <Pressable
          accessibilityLabel="Login"
          accessibilityRole="button"
          onPress={() => router.push('/login')}
          style={({ pressed }) => [
            styles.authButton,
            {
              height: px(64),
              borderRadius: px(15),
              opacity: pressed ? 0.82 : 1,
            },
          ]}>
          <Text style={[styles.authButtonText, { fontSize: px(22), lineHeight: px(29) }]}>
            Login
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Create account"
          accessibilityRole="button"
          onPress={() => router.push('/create-account')}
          style={({ pressed }) => [
            styles.authButton,
            {
              height: px(64),
              borderRadius: px(15),
              opacity: pressed ? 0.82 : 1,
            },
          ]}>
          <Text style={[styles.authButtonText, { fontSize: px(22), lineHeight: px(29) }]}>
            Create Account
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
