import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { getMyNotifications } from '@/services/notifications';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { homeStyles as styles } from '@/styles/home.styles';
import { type PhotoSyncNotification } from '@/types/notifications';

const FIGMA_WIDTH = 412;
const FIGMA_HEIGHT = 917;
const FIGMA_NAV_TOP = 844;

const highlights = [
  {
    image: require('@/assets/images/highlight-weddings.png'),
    imageStyle: { height: 162, left: 28, top: 629, width: 110 },
    label: 'Weddings',
    labelStyle: { left: 51, top: 801, width: 66 },
  },
  {
    image: require('@/assets/images/highlight-group-photos.png'),
    imageStyle: { height: 164, left: 151, top: 629, width: 112 },
    label: 'Group Photos',
    labelStyle: { left: 161, top: 801, width: 92 },
  },
  {
    image: require('@/assets/images/highlight-portrait.png'),
    imageStyle: { height: 164, left: 279, top: 629, width: 110 },
    label: 'Portrait',
    labelStyle: { left: 314, top: 801, width: 50 },
  },
];

export default function HomePageScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<PhotoSyncNotification[]>([]);
  const navTop = height - bottomNavMetrics.height - insets.bottom;
  const scale = Math.min(width / FIGMA_WIDTH, height / FIGMA_HEIGHT, navTop / FIGMA_NAV_TOP);
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;
  const unreadNotifications = notifications.filter((notification) => !notification.isRead);

  useFocusEffect(
    useCallback(() => {
    let isMounted = true;

    getMyNotifications(4).then((items) => {
      if (isMounted) {
        setNotifications(items);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Image
        contentFit="cover"
        source={require('@/assets/images/Home.png')}
        style={[
          styles.heroImage,
          {
            left: x(-46),
            width: px(504),
            height: px(669),
          },
        ]}
      />

      <View style={[styles.contentPanel, { top: y(550), left: x(0), width: px(412), borderTopLeftRadius: px(30), borderTopRightRadius: px(30) }]} />

      <Text style={[styles.brandTitle, { left: x(129), top: y(27), width: px(181), fontSize: px(32), lineHeight: px(58) }]}>
        PhotoSync
      </Text>

      <Pressable
        accessibilityLabel="Open notifications"
        accessibilityRole="button"
        onPress={() => router.push('/notifications' as never)}
        style={({ pressed }) => [
          styles.notificationButton,
          {
            left: x(350),
            top: y(39),
            width: px(38),
            height: px(38),
            borderRadius: px(19),
            opacity: pressed ? 0.82 : 1,
          },
        ]}>
        <BellIcon color="#4C77A5" size={px(31)} />
        {unreadNotifications.length > 0 && (
          <View style={[styles.notificationDot, { width: px(9), height: px(9), borderRadius: px(5) }]} />
        )}
      </Pressable>

      <Image
        contentFit="contain"
        source={require('@/assets/icons/home-camera-white.png')}
        style={[styles.cameraIcon, { left: x(73), top: y(191), width: px(44), height: px(29) }]}
      />

      <Text style={[styles.photographerName, { left: x(30), top: y(217), width: px(148), fontSize: px(32), lineHeight: px(34) }]}>
        Brian Cainglet
      </Text>

      <View style={[styles.photographyRow, { left: x(23), top: y(258), width: px(139), height: px(16) }]}>
        <View style={[styles.photographyLine, { width: px(25) }]} />
        <Text style={[styles.photographyText, { fontSize: px(10), lineHeight: px(16) }]}>PHOTOGRAPHY</Text>
        <View style={[styles.photographyLine, { width: px(25) }]} />
      </View>

      <Text style={[styles.headline, { left: x(23), top: y(281), width: px(177), fontSize: px(30), lineHeight: px(39) }]}>
        Capture a{'\n'}Brighter{'\n'}Tomorrow.
      </Text>

      <Text style={[styles.subtitle, { left: x(27), top: y(422), width: px(187), fontSize: px(13), lineHeight: px(16) }]}>
        Professional photography{'\n'}for life&apos;s meaningful moments.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Book a session"
        style={({ pressed }) => [
          styles.bookButton,
          {
            left: x(23),
            top: y(466),
            width: px(369),
            height: px(64),
            borderRadius: px(15),
            opacity: pressed ? 0.82 : 1,
          },
        ]}>
        <Text style={[styles.bookButtonText, { fontSize: px(22), lineHeight: px(29) }]}>Book a session</Text>
      </Pressable>

      <Text style={[styles.highlightsTitle, { left: x(33), top: y(581), fontSize: px(24), lineHeight: px(29) }]}>
        Our Highlights
      </Text>
      <View style={[styles.panelDot, { left: x(380), top: y(566), width: px(14), height: px(13), borderRadius: px(7) }]} />

      {highlights.map((item) => (
        <View key={item.label}>
          <Image
            contentFit="cover"
            source={item.image}
            style={[
              styles.highlightImage,
              {
                left: x(item.imageStyle.left),
                top: y(item.imageStyle.top),
                width: px(item.imageStyle.width),
                height: px(item.imageStyle.height),
                borderRadius: px(10),
              },
            ]}
          />
          <Text
            style={[
              styles.highlightLabel,
              {
                left: x(item.labelStyle.left),
                top: y(item.labelStyle.top),
                width: px(item.labelStyle.width),
                fontSize: px(13),
                lineHeight: px(16),
              },
            ]}>
            {item.label}
          </Text>
        </View>
      ))}

    </View>
  );
}

function BellIcon({ color = '#142C4C', size }: { color?: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 16V11C18 7.7 16 5.2 13 4.4V3.8C13 3.1 12.5 2.6 11.8 2.6C11.1 2.6 10.6 3.1 10.6 3.8V4.4C7.7 5.1 5.8 7.7 5.8 11V16L4.4 18H19.4L18 16Z" fill={color} />
      <Path d="M9.8 19.4C10.2 20.3 11 20.8 12 20.8C13 20.8 13.8 20.3 14.2 19.4" stroke={color} strokeLinecap="round" strokeWidth={1.8} />
    </Svg>
  );
}
