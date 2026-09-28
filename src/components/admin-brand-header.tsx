import { Image } from 'expo-image';
import { Pressable, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { photographerStyles as styles } from '@/styles/photographer.styles';

export const ADMIN_BRAND_HEADER_HEIGHT = 156;

type AdminBrandHeaderProps = {
  backAccessibilityLabel?: string;
  elevated?: boolean;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
  textureSource: number;
  textureStyle?: StyleProp<ImageStyle>;
  topInset: number;
};

export function AdminBrandHeader({
  backAccessibilityLabel = 'Back',
  elevated = false,
  onBack,
  style,
  textureSource,
  textureStyle,
  topInset,
}: AdminBrandHeaderProps) {
  return (
    <View style={[styles.adminBrandHeader, elevated && styles.adminBrandHeaderElevated, { paddingTop: topInset }, style]}>
      <Image
        contentFit="cover"
        source={textureSource}
        style={[styles.adminBrandHeaderTexture, textureStyle]}
      />
      {onBack ? (
        <Pressable
          accessibilityLabel={backAccessibilityLabel}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.adminBrandHeaderBackButton, pressed && { opacity: 0.78 }]}>
          <BackIcon />
        </Pressable>
      ) : null}
      <View style={styles.adminBrandHeaderBrand}>
        <Text style={styles.adminBrandHeaderBrandText}>PhotoSync</Text>
        <Image
          contentFit="contain"
          source={require('@/assets/images/admin-calendar-logo.png')}
          style={styles.adminBrandHeaderLogo}
        />
      </View>
    </View>
  );
}

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5L8 12L15 19"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.8}
      />
    </Svg>
  );
}
