import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { fallbackPortraitPackages } from '@/data/service-catalog';
import { setSelectedPackage } from '@/services/booking-draft';
import { getPackagesForService } from '@/services/service-catalog';
import { portraitPackageStyles as styles } from '@/styles/portrait-packages.styles';
import { type PackageCatalogItem } from '@/types/services';

const FIGMA_WIDTH = 412;

export default function PortraitPackagesScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [packages, setPackages] = useState<PackageCatalogItem[]>(fallbackPortraitPackages);
  const viewportWidth = Math.min(width, FIGMA_WIDTH);
  const scale = viewportWidth / FIGMA_WIDTH;
  const bottomPadding = insets.bottom;
  const contentHeight = Math.max(1, height - bottomPadding);
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;
  const listTop = 249;
  const listHeight = Math.max(1, contentHeight - y(listTop));
  const listContentHeight = px(packages[packages.length - 1].top + 19 + 103 - listTop + 20);

  useEffect(() => {
    let isMounted = true;

    getPackagesForService('portrait-photography').then((items) => {
      if (isMounted) {
        setPackages(items);
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
        <Image
          contentFit="cover"
          source={require('@/assets/services/portrait/portrait-detail-hero.png')}
          style={[styles.heroImage, { left: x(0), width: px(412), height: px(249) }]}
        />
        <View style={[styles.heroOverlay, { left: x(0), width: px(412), height: px(249) }]} />

        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.backButton, { left: x(20), top: y(39), width: px(35), height: px(35) }]}>
          <ChevronLeft size={px(26)} />
        </Pressable>
        <Text style={[styles.category, { left: x(18), top: y(95), width: px(146), fontSize: px(11), lineHeight: px(16) }]}>
          PORTRAIT PHOTOGRAPHY
        </Text>
        <Text style={[styles.headline, { left: x(19), top: y(107), width: px(237), fontSize: px(30), lineHeight: px(44) }]}>
          Show your{'\n'}
          <Text style={[styles.scriptHeadline, { fontSize: px(48), lineHeight: px(51) }]}>true self.</Text>
        </Text>
        <Text style={[styles.description, { left: x(24), top: y(195), width: px(139), fontSize: px(11), lineHeight: px(13) }]}>
          Individual, creative, and{'\n'}meaningful portraits.
        </Text>

        <ScrollView
          bounces={false}
          contentContainerStyle={[styles.listScrollContent, { height: listContentHeight }]}
          showsVerticalScrollIndicator={false}
          style={[styles.listScrollView, { left: 0, top: y(listTop), width, height: listHeight }]}>
          {packages.map((item) => (
            <PackageCard item={item} key={item.id} listTop={listTop} px={px} x={x} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function PackageCard({
  item,
  listTop,
  px,
  x,
}: {
  item: PackageCatalogItem;
  listTop: number;
  px: (value: number) => number;
  x: (value: number) => number;
}) {
  return (
    <View
      style={[
        styles.card,
        { left: x(18), top: px(item.top + 19 - listTop), width: px(376), height: px(103), borderRadius: px(10) },
      ]}>
      <Image
        contentFit="cover"
        source={item.image}
        style={[styles.packageImage, { left: px(6), top: px(item.name === 'Premium Portrait Package' ? 5 : 6), width: px(item.name === 'Premium Portrait Package' ? 92 : 91), height: px(item.name === 'Premium Portrait Package' ? 92 : 91), borderRadius: px(10) }]}
      />
      <Text style={[styles.packageName, { left: px(106), top: px(item.name.includes('Group') || item.name.includes('Premium') ? 2 : item.name.includes('Couple') ? 6 : 9), width: px(165), fontSize: px(13), lineHeight: px(19) }]}>
        {item.name}
      </Text>
      {item.badge && (
        <View style={[styles.badge, { left: px(295), top: px(6), width: px(69), height: px(13), borderRadius: px(10) }]}>
          <Text style={[styles.badgeText, { fontSize: px(8), lineHeight: px(10) }]}>{item.badge}</Text>
        </View>
      )}
      <Text style={[styles.price, { left: px(106), top: px(item.name.includes('Group') ? 23 : item.name.includes('Premium') ? 21 : item.name.includes('Couple') ? 25 : 31), fontSize: px(13), lineHeight: px(16) }]}>{item.price}</Text>
      <View style={[styles.detailsList, { left: px(107), top: px(detailTop(item.name)), width: px(124) }]}>
        {item.details.split('\n').map((detail) => (
          <View key={detail} style={[styles.detailRow, { minHeight: px(10) }]}>
            <View style={[styles.detailBullet, { width: px(4), height: px(4), borderRadius: px(2), marginTop: px(3) }]} />
            <Text style={[styles.details, { marginLeft: px(7), fontSize: px(8), lineHeight: px(10) }]}>
              {detail}
            </Text>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select ${item.name}`}
        onPress={() => {
          setSelectedPackage(item);
          router.push('/book/selected');
        }}
        style={({ pressed }) => [
          styles.selectButton,
          {
            left: px(271),
            top: px(35),
            width: px(96),
            height: px(34),
            borderRadius: px(15),
            opacity: pressed ? 0.82 : 1,
          },
        ]}>
        <Text style={[styles.selectButtonText, { fontSize: px(14), lineHeight: px(24) }]}>Select</Text>
      </Pressable>
    </View>
  );
}

function detailTop(name: string) {
  if (name.includes('Couple')) return 44;
  if (name.includes('Group')) return 44;
  if (name.includes('Premium')) return 37;
  return 50;
}

function ChevronLeft({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
