import { Image, type ImageSource } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { setStackSlideAnimation } from '@/navigation/tab-navigation';
import { setSelectedPackage } from '@/services/booking-draft';
import {
  getCachedPackagesForService,
  getCachedServiceCatalogBySlug,
  getPackagesForService,
  getServiceCatalogBySlug,
} from '@/services/service-catalog';
import { portraitPackageStyles as styles } from '@/styles/portrait-packages.styles';
import { type PackageCatalogItem, type ServiceCatalogItem, type ServiceSlug } from '@/types/services';

const FIGMA_WIDTH = 412;
const HERO_HEIGHT = 249;
const PACKAGE_CARD_HEIGHT = 118;
const PACKAGE_CARD_GAP = 14;
const PACKAGE_LIST_TOP = 22;
const PACKAGE_SKELETON_COUNT = 3;

export default function ServicePackagesScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const serviceSlug = normalizeSlug(slug);
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [packages, setPackages] = useState<PackageCatalogItem[]>(() => getCachedPackagesForService(serviceSlug) ?? []);
  const [service, setService] = useState<ServiceCatalogItem | null>(() => getCachedServiceCatalogBySlug(serviceSlug));
  const [isLoading, setIsLoading] = useState(() => !getCachedServiceCatalogBySlug(serviceSlug) || !getCachedPackagesForService(serviceSlug));
  const viewportWidth = Math.min(width, FIGMA_WIDTH);
  const scale = viewportWidth / FIGMA_WIDTH;
  const bottomPadding = insets.bottom;
  const contentHeight = Math.max(1, height - bottomPadding);
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;
  const listTop = HERO_HEIGHT;
  const listHeight = Math.max(1, contentHeight - y(listTop));
  const listContentHeight = packages.length
    ? px(PACKAGE_LIST_TOP + packages.length * (PACKAGE_CARD_HEIGHT + PACKAGE_CARD_GAP) + 18)
    : px(PACKAGE_LIST_TOP + PACKAGE_SKELETON_COUNT * (PACKAGE_CARD_HEIGHT + PACKAGE_CARD_GAP) + 18);
  const heroSource = getHeroSource(service);
  const heroTitle = service?.name ?? 'Photography Service';
  const heroTagline = service?.cardTitle ?? 'Choose your package';
  const heroDescription = service?.description ?? 'Choose the package that fits your story.';
  const heroTitleSize = heroTitle.length > 26 ? 25 : heroTitle.length > 20 ? 28 : 31;

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getServiceCatalogBySlug(serviceSlug),
      getPackagesForService(serviceSlug),
    ]).then(([serviceItem, packageItems]) => {
      if (isMounted) {
        setService(serviceItem);
        setPackages(packageItems);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [serviceSlug]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.canvas, { height: contentHeight }]}>
        {heroSource ? (
          <Image
            contentFit="cover"
            source={heroSource}
            style={[styles.heroImage, { left: x(0), width: px(412), height: px(HERO_HEIGHT) }]}
          />
        ) : null}
        <View style={[styles.heroOverlay, { left: x(0), width: px(412), height: px(HERO_HEIGHT) }]} />

        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.backButton, { left: x(20), top: y(39), width: px(35), height: px(35) }]}>
          <ChevronLeft size={px(26)} />
        </Pressable>
        <Text
          numberOfLines={2}
          style={[styles.headline, { left: x(19), top: y(108), width: px(318), fontSize: px(heroTitleSize), lineHeight: px(36) }]}>
          {heroTitle}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.heroTagline, { left: x(23), top: y(164), width: px(270), fontSize: px(18), lineHeight: px(24) }]}>
          {heroTagline}
        </Text>
        <Text
          numberOfLines={3}
          style={[styles.description, { left: x(24), top: y(197), width: px(280), fontSize: px(11), lineHeight: px(14) }]}>
          {heroDescription}
        </Text>

        <ScrollView
          bounces={false}
          contentContainerStyle={[styles.listScrollContent, { height: listContentHeight }]}
          showsVerticalScrollIndicator={false}
          style={[styles.listScrollView, { left: 0, top: y(listTop), width, height: listHeight }]}>
          {packages.length ? (
            packages.map((item, index) => (
              <PackageCard index={index} item={item} key={item.id} px={px} x={x} />
            ))
          ) : isLoading ? (
            <PackageSkeletonList px={px} x={x} />
          ) : (
            <View style={[styles.emptyPackagesCard, { left: x(18), top: px(38), width: px(376), borderRadius: px(14) }]}>
              <Text style={styles.emptyPackagesTitle}>No packages yet</Text>
              <Text style={styles.emptyPackagesText}>The admin can add packages for this service in the Services tab.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function PackageCard({
  index,
  item,
  px,
  x,
}: {
  index: number;
  item: PackageCatalogItem;
  px: (value: number) => number;
  x: (value: number) => number;
}) {
  const [intro] = useState(() => new Animated.Value(0));
  const cardTop = PACKAGE_LIST_TOP + index * (PACKAGE_CARD_HEIGHT + PACKAGE_CARD_GAP);
  const titleTop = getPackageTitleTop(index, item.name);
  const priceTop = item.name.length > 28 ? titleTop + 36 : titleTop + 24;
  const detailsTop = priceTop + 19;
  const details = item.details.split('\n').filter(Boolean);
  const visibleDetails = details.slice(0, 4);
  const hiddenDetailCount = Math.max(0, details.length - visibleDetails.length);

  useEffect(() => {
    intro.setValue(0);
    Animated.timing(intro, {
      delay: Math.min(index, 6) * 18,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [index, intro, item.id]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          left: x(18),
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
          width: px(376),
          height: px(PACKAGE_CARD_HEIGHT),
          borderRadius: px(12),
        },
      ]}>
      <Image
        contentFit="cover"
        source={item.image}
        style={[styles.packageImage, { left: px(8), top: px(11), width: px(96), height: px(96), borderRadius: px(10) }]}
      />
      <Text
        numberOfLines={2}
        style={[styles.packageName, { left: px(116), top: px(titleTop), width: px(154), fontSize: px(13), lineHeight: px(17) }]}>
        {item.name}
      </Text>
      {item.badge && (
        <View style={[styles.badge, { left: px(280), top: px(9), width: px(82), height: px(15), borderRadius: px(10) }]}>
          <Text style={[styles.badgeText, { fontSize: px(8), lineHeight: px(10) }]}>{item.badge}</Text>
        </View>
      )}
      <Text style={[styles.price, { left: px(116), top: px(priceTop), fontSize: px(13), lineHeight: px(16) }]}>{item.price}</Text>
      <View style={[styles.detailsList, { left: px(117), top: px(detailsTop), width: px(142) }]}>
        {visibleDetails.map((detail) => (
          <View key={detail} style={[styles.detailRow, { minHeight: px(10) }]}>
            <View style={[styles.detailBullet, { width: px(4), height: px(4), borderRadius: px(2), marginTop: px(3) }]} />
            <Text style={[styles.details, { marginLeft: px(7), fontSize: px(8), lineHeight: px(10) }]}>
              {detail}
            </Text>
          </View>
        ))}
        {hiddenDetailCount > 0 && (
          <Text style={[styles.moreDetails, { fontSize: px(8), lineHeight: px(10), marginTop: px(1) }]}>
            + {hiddenDetailCount} more
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select ${item.name}`}
        onPress={() => {
          setSelectedPackage(item);
          setStackSlideAnimation('slide_from_right');
          router.push('/book/selected');
        }}
        style={({ pressed }) => [
          styles.selectButton,
          {
            left: px(276),
            opacity: pressed ? 0.86 : 1,
            top: px(48),
            transform: [{ scale: pressed ? 0.96 : 1 }],
            width: px(86),
            height: px(34),
            borderRadius: px(15),
          },
        ]}>
        <Text style={[styles.selectButtonText, { fontSize: px(14), lineHeight: px(24) }]}>Select</Text>
      </Pressable>
    </Animated.View>
  );
}

function PackageSkeletonList({
  px,
  x,
}: {
  px: (value: number) => number;
  x: (value: number) => number;
}) {
  const pulse = useSkeletonPulse();

  return (
    <>
      {Array.from({ length: PACKAGE_SKELETON_COUNT }).map((_, index) => {
        const cardTop = PACKAGE_LIST_TOP + index * (PACKAGE_CARD_HEIGHT + PACKAGE_CARD_GAP);

        return (
          <Animated.View
            accessibilityLabel="Loading package"
            accessibilityRole="progressbar"
            key={cardTop}
            style={[
              styles.skeletonCard,
              {
                left: x(18),
                opacity: pulse,
                top: px(cardTop),
                width: px(376),
                height: px(PACKAGE_CARD_HEIGHT),
                borderRadius: px(12),
              },
            ]}>
            <View style={[styles.skeletonImage, { left: px(8), top: px(11), width: px(96), height: px(96), borderRadius: px(10) }]} />
            <View style={[styles.skeletonLineStrong, { left: px(116), top: px(16), width: px(136), height: px(15), borderRadius: px(8) }]} />
            <View style={[styles.skeletonLine, { left: px(116), top: px(40), width: px(70), height: px(10), borderRadius: px(5) }]} />
            <View style={[styles.skeletonLine, { left: px(117), top: px(63), width: px(132), height: px(8), borderRadius: px(4) }]} />
            <View style={[styles.skeletonLine, { left: px(117), top: px(78), width: px(116), height: px(8), borderRadius: px(4) }]} />
            <View style={[styles.skeletonButton, { left: px(276), top: px(48), width: px(86), height: px(34), borderRadius: px(15) }]} />
          </Animated.View>
        );
      })}
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

function getPackageTitleTop(index: number, name: string) {
  if (name.length > 28) {
    return 8;
  }

  if (index % 2 === 1) {
    return 11;
  }

  return 14;
}

function getHeroSource(service: ServiceCatalogItem | null): ImageSource | null {
  if (!service) {
    return null;
  }

  if (service.slug === 'portrait-photography' && !service.imageUrl) {
    return require('@/assets/services/portrait/portrait-detail-hero.png');
  }

  return service.image;
}

function normalizeSlug(slug?: string | string[]): ServiceSlug {
  if (Array.isArray(slug)) {
    return slug[0] ?? 'portrait-photography';
  }

  return slug ?? 'portrait-photography';
}

function ChevronLeft({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
