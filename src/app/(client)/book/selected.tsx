import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { getSelectedPackage } from '@/services/booking-draft';
import { bookStyles as styles } from '@/styles/book.styles';

const FIGMA_WIDTH = 412;
const FIGMA_NAV_TOP = 844;
const INCLUSION_CARD_TOP = 484;
const INCLUSION_ROW_HEIGHT = 21;
const INCLUSION_ROW_GAP = 10;
const INCLUSION_CARD_VERTICAL_PADDING = 37;
const INCLUSION_NOTE_HEIGHT = 50;
const INCLUSION_CARD_MIN_HEIGHT = 218;
const PRICE_GAP = 16;
const BOOK_BUTTON_GAP = 9;

const inclusionIcons = ['clock', 'image', 'photos', 'copy', 'copy', 'copy'] as const;

export default function BookScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selectedPackage = getSelectedPackage();
  const inclusions = selectedPackage.inclusions.slice(0, 6).map((label, index) => ({
    icon: inclusionIcons[index] ?? 'copy',
    label,
  }));
  const inclusionRowsHeight =
    inclusions.length * INCLUSION_ROW_HEIGHT + Math.max(0, inclusions.length - 1) * INCLUSION_ROW_GAP;
  const inclusionCardHeight = Math.max(
    INCLUSION_CARD_MIN_HEIGHT,
    INCLUSION_CARD_VERTICAL_PADDING + inclusionRowsHeight + INCLUSION_NOTE_HEIGHT,
  );
  const priceTop = INCLUSION_CARD_TOP + inclusionCardHeight + PRICE_GAP;
  const bookButtonTop = priceTop + 38 + BOOK_BUTTON_GAP;
  const bottomPadding = insets.bottom;
  const availableContentHeight = Math.max(1, height - bottomPadding);
  const designContentHeight = Math.max(FIGMA_NAV_TOP, bookButtonTop + 64 + 21);
  const scale = Math.min(width / FIGMA_WIDTH, availableContentHeight / FIGMA_NAV_TOP);
  const contentHeight = designContentHeight * scale;
  const frameWidth = FIGMA_WIDTH * scale;
  const left = (width - frameWidth) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => value * scale;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.scrollContent,
          { minHeight: contentHeight + bottomPadding, paddingBottom: bottomPadding },
        ]}
        scrollEnabled={contentHeight + bottomPadding > height}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={[styles.canvas, { height: contentHeight }]}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={[styles.backButton, { left: x(28), top: y(59), width: px(35), height: px(35) }]}>
            <ChevronLeft size={px(26)} />
          </Pressable>

          <Text style={[styles.brandTitle, { left: x(131), top: y(58), width: px(125), fontSize: px(24), lineHeight: px(38) }]}>
            PhotoSync
          </Text>
          <Image
            contentFit="contain"
            source={require('@/assets/images/photosync-logo.png')}
            style={[styles.logo, { left: x(253), top: y(54), width: px(54), height: px(45) }]}
          />

          <View style={[styles.heroCard, { left: x(33), top: y(111), width: px(346), height: px(356), borderRadius: px(20) }]}>
            <Image
              contentFit="cover"
              source={selectedPackage.image}
              style={[styles.heroImage, { left: 0, top: y(-99), width: px(373), height: px(560) }]}
            />
            <View style={[styles.heroOverlay, { left: 0, top: 0, width: px(346), height: px(356), borderRadius: px(20) }]} />
          </View>
          {selectedPackage.badge && (
            <View style={[styles.badge, { left: x(256), top: y(126), width: px(108), height: px(20), borderRadius: px(10) }]}>
              <Text style={[styles.badgeText, { fontSize: px(10), lineHeight: px(15) }]}>{selectedPackage.badge}</Text>
            </View>
          )}
          <Text style={[styles.packageTitle, { left: x(51), top: y(336), width: px(237), fontSize: px(32), lineHeight: px(39) }]}>
            {formatPackageTitle(selectedPackage.name)}
          </Text>
          <Text style={[styles.packageSubtitle, { left: x(51), top: y(428), width: px(205), fontSize: px(16), lineHeight: px(22) }]}>
            Your moment, your story.
          </Text>

          <View style={[styles.inclusionCard, { left: x(33), top: y(INCLUSION_CARD_TOP), width: px(346), minHeight: px(inclusionCardHeight), borderRadius: px(10), paddingHorizontal: px(28), paddingTop: px(21), paddingBottom: px(16) }]}>
            <View style={[styles.inclusionList, { gap: px(10) }]}>
              {inclusions.map((item) => (
                <View key={item.label} style={styles.inclusionRow}>
                  <View style={[styles.inclusionIconWrap, { width: px(21), marginRight: px(21) }]}>
                    <InclusionIcon name={item.icon} size={px(21)} />
                  </View>
                  <Text style={[styles.inclusionText, { fontSize: px(16), lineHeight: px(21) }]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={[styles.note, { fontSize: px(14), lineHeight: px(18), marginTop: px(14) }]}>
              Inclusions may vary. You can discuss custom requests after booking.
            </Text>
          </View>

          <Text style={[styles.price, { left: x(37), top: y(priceTop), width: px(133), fontSize: px(32), lineHeight: px(38) }]}>
            {selectedPackage.price}
          </Text>
          <Pressable
            accessibilityLabel="Book now"
            accessibilityRole="button"
            onPress={() => router.push('/book/schedule')}
            style={({ pressed }) => [
              styles.bookButton,
              {
                left: x(33),
                top: y(bookButtonTop),
                width: px(346),
                height: px(64),
                borderRadius: px(30),
                opacity: pressed ? 0.82 : 1,
              },
            ]}>
            <Text style={[styles.bookButtonText, { fontSize: px(24), lineHeight: px(38) }]}>Book Now</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function ChevronLeft({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#142C4C" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function formatPackageTitle(name: string) {
  return name.replace(' Package', '\nPackage');
}

function InclusionIcon({ name, size }: { name: (typeof inclusionIcons)[number]; size: number }) {
  const stroke = '#142C4C';

  if (name === 'clock') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={stroke} strokeWidth={2.3} />
        <Path d="M12 7V12L15.5 14" stroke={stroke} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'image') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={5} width={16} height={14} rx={1.5} stroke={stroke} strokeWidth={2.3} />
        <Circle cx={9} cy={10} r={1.5} fill={stroke} />
        <Path d="M5.5 18L10 13.5L13 16.5L15 14L20 19" stroke={stroke} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'photos') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={7} y={6} width={12} height={10} rx={1.2} stroke={stroke} strokeWidth={2.2} />
        <Path d="M5 9H4.5C3.7 9 3 9.7 3 10.5V18C3 18.8 3.7 19.5 4.5 19.5H15.5C16.3 19.5 17 18.8 17 18V18" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
        <Circle cx={11} cy={10} r={1.2} fill={stroke} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={8} y={4} width={11} height={13} rx={1.2} stroke={stroke} strokeWidth={2.2} />
      <Path d="M5 8V19C5 19.6 5.4 20 6 20H15" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M11 8H16M11 12H16" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
