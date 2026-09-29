import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { getCachedServicesCatalog, getServicesCatalog } from '@/services/service-catalog';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { servicesStyles as styles } from '@/styles/services.styles';
import { ServiceCatalogItem } from '@/types/services';

const FIGMA_WIDTH = 412;
const SERVICE_SKELETON_TOPS = [264, 364, 464, 564];
const SERVICE_LIST_START = 15;
const SERVICE_CARD_HEIGHT = 92;
const SERVICE_CARD_GAP = 8;
const SERVICE_LIST_BOTTOM_PADDING = 28;

export default function ServicesScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState<ServiceCatalogItem[]>(() => getCachedServicesCatalog() ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedServicesCatalog());
  const viewportWidth = Math.min(width, FIGMA_WIDTH);
  const scale = viewportWidth / FIGMA_WIDTH;
  const bottomPadding = bottomNavMetrics.height + insets.bottom;
  const contentHeight = Math.max(1, height - bottomPadding);
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;
  const heroHeight = 249;
  const listTop = heroHeight;
  const listHeight = Math.max(1, contentHeight - y(listTop));
  const listItemCount = services.length || SERVICE_SKELETON_TOPS.length;
  const listContentHeight = Math.max(
    listHeight + 1,
    px(SERVICE_LIST_START + listItemCount * SERVICE_CARD_HEIGHT + Math.max(0, listItemCount - 1) * SERVICE_CARD_GAP + SERVICE_LIST_BOTTOM_PADDING),
  );

  useEffect(() => {
    let isMounted = true;

    getServicesCatalog().then((items) => {
      if (isMounted) {
        setServices(items);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.canvas, { height: contentHeight }]}>
        <View style={[styles.backgroundPanel, { left: 0, top: y(heroHeight), width }]} />

        <Image
          contentFit="cover"
          source={require('@/assets/services/services-hero.png')}
          style={[styles.heroImage, { left: 0, width, height: y(heroHeight) }]}
        />
        <View style={[styles.heroOverlay, { left: 0, width, height: y(heroHeight) }]} />

        <Text
          style={[
            styles.brandTitle,
            { left: x(152), top: y(40), width: px(107), fontSize: px(20), lineHeight: px(38) },
          ]}>
          PhotoSync
        </Text>
        <Text style={[styles.eyebrow, { left: x(18), top: y(95), width: px(88), fontSize: px(11), lineHeight: px(16) }]}>
          OUR SERVICES
        </Text>
        <Text style={[styles.title, { left: x(19), top: y(107), width: px(237), fontSize: px(30), lineHeight: px(44) }]}>
          Different Stories.
        </Text>
        <View style={[styles.titlePhraseRow, { left: x(18), top: y(144), width: px(376), height: px(51) }]}>
          <Text style={[styles.scriptTitle, { fontSize: px(48), lineHeight: px(51) }]}>
            Beautifully
          </Text>
          <Text
            style={[
              styles.capturedTitle,
              { marginLeft: px(18), fontSize: px(30), lineHeight: px(42) },
            ]}>
            Captured
          </Text>
          <Image
            contentFit="contain"
            source={require('@/assets/icons/home-camera-white.png')}
            style={[styles.titleCameraIcon, { marginLeft: px(15), width: px(44), height: px(29) }]}
          />
        </View>
        <Text style={[styles.subtitle, { left: x(24), top: y(195), width: px(286), fontSize: px(11), lineHeight: px(15) }]}>
          From milestones to once-in-a-lifetime moments,{'\n'}we&apos;re here to capture what matters the most.
        </Text>

        <ScrollView
          bounces={false}
          contentContainerStyle={[styles.listScrollContent, { minHeight: listContentHeight }]}
          showsVerticalScrollIndicator={false}
          style={[styles.listScrollView, { left: 0, top: y(listTop), width, height: listHeight }]}>
          {services.length ? (
            services.map((service, index) => (
              <ServiceCard index={index} key={service.id} service={service} px={px} x={x} />
            ))
          ) : isLoading ? (
            <ServiceSkeletonList px={px} x={x} />
          ) : (
            <Text style={[styles.cardDescription, { left: x(149), top: px(38), width: px(160), fontSize: px(10), lineHeight: px(14) }]}>
              No services available yet.
            </Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function ServiceCard({
  index,
  service,
  px,
  x,
}: {
  index: number;
  service: ServiceCatalogItem;
  px: (value: number) => number;
  x: (value: number) => number;
}) {
  const titleSize = service.titleSize ?? 13;
  const [intro] = useState(() => new Animated.Value(0));
  const cardTop = SERVICE_LIST_START + index * (SERVICE_CARD_HEIGHT + SERVICE_CARD_GAP);

  useEffect(() => {
    intro.setValue(0);
    Animated.timing(intro, {
      delay: Math.min(index, 6) * 18,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [index, intro, service.id]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          left: x(28),
          opacity: intro,
          top: px(cardTop),
          transform: [
            {
              translateY: intro.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
          width: px(356),
          height: px(92),
          borderRadius: px(10),
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={service.cardTitle}
        onPress={() => {
          router.push(`/services/${service.slug}` as never);
        }}
        style={({ pressed }) => [styles.cardPressable, { opacity: pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
        <Image
          contentFit="cover"
          source={service.image}
          style={[
            styles.cardImage,
            {
              left: px(3),
              top: px(service.imageHeight === 84 ? 4 : 3),
              width: px(133),
              height: px(service.imageHeight),
              borderRadius: px(10),
            },
          ]}
        />
        <Text style={[styles.cardCategory, { left: px(149), top: px(18), width: px(138), fontSize: px(8), lineHeight: px(13) }]}>
          {service.category}
        </Text>
        <Text
          style={[
            styles.cardTitle,
            {
              left: px(service.titleSize ? 148 : 149),
              top: px(service.titleSize ? 30 : 31),
              width: px(160),
              fontSize: px(titleSize),
              lineHeight: px(19),
            },
          ]}>
          {service.cardTitle}
        </Text>
        <Text style={[styles.cardDescription, { left: px(149), top: px(54), width: px(143), fontSize: px(9), lineHeight: px(12) }]}>
          {service.cardDescription}
        </Text>
        <View style={[styles.arrowButton, { left: px(306), top: px(47), width: px(32), height: px(32), borderRadius: px(16) }]}>
          <Svg width={px(15)} height={px(11)} viewBox="0 0 15 11" fill="none">
            <Path
              d="M9.146 0.646a.5.5 0 0 1 .708 0l4.5 4.5a.5.5 0 0 1 0 .708l-4.5 4.5a.5.5 0 0 1-.708-.708L12.793 6H.5a.5.5 0 0 1 0-1h12.293L9.146 1.354a.5.5 0 0 1 0-.708Z"
              fill="#142C4C"
            />
          </Svg>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ServiceSkeletonList({
  px,
  x,
}: {
  px: (value: number) => number;
  x: (value: number) => number;
}) {
  const pulse = useSkeletonPulse();

  return (
    <>
      {SERVICE_SKELETON_TOPS.map((top, index) => (
        <Animated.View
          accessibilityLabel="Loading service"
          accessibilityRole="progressbar"
          key={top}
          style={[
            styles.skeletonCard,
            {
              left: x(28),
              opacity: pulse,
              top: px(SERVICE_LIST_START + index * (SERVICE_CARD_HEIGHT + SERVICE_CARD_GAP)),
              width: px(356),
              height: px(92),
              borderRadius: px(10),
            },
          ]}>
          <View style={[styles.skeletonImage, { left: px(3), top: px(3), width: px(133), height: px(85), borderRadius: px(10) }]} />
          <View style={[styles.skeletonLine, { left: px(149), top: px(18), width: px(112), height: px(9), borderRadius: px(5) }]} />
          <View style={[styles.skeletonLineStrong, { left: px(149), top: px(35), width: px(152), height: px(15), borderRadius: px(8) }]} />
          <View style={[styles.skeletonLine, { left: px(149), top: px(58), width: px(120), height: px(9), borderRadius: px(5) }]} />
          <View style={[styles.skeletonCircle, { left: px(306), top: px(47), width: px(32), height: px(32), borderRadius: px(16) }]} />
        </Animated.View>
      ))}
    </>
  );
}

function useSkeletonPulse() {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [pulse]);

  return pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.62, 1],
  });
}
