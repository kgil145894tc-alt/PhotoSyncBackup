import { Image } from 'expo-image';
import {
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { photographerStyles as styles } from '@/styles/photographer.styles';

export const ADMIN_BRAND_HEADER_HEIGHT = 104;

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
  const { fontScale, width } = useWindowDimensions();
  const copyWidth = Math.max(60, width - (onBack ? 128 + 28 : 44 + 38) - 12);
  const brandLines = Math.max(1, Math.ceil(150 * fontScale / copyWidth));
  const eyebrowLines = Math.max(1, Math.ceil((70 * fontScale + 22) / copyWidth));
  const height = Math.max(
    ADMIN_BRAND_HEADER_HEIGHT,
    topInset + (30 * brandLines + 15 * eyebrowLines) * fontScale + 28,
  );
  return (
    <View
      style={[
        styles.adminBrandHeader,
        elevated && styles.adminBrandHeaderElevated,
        { height },
        style,
      ]}
    >
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
          style={({ pressed }) => [
            styles.adminBrandHeaderBackButton,
            { top: topInset + 22 },
            pressed && { opacity: 0.78 },
          ]}
        >
          <BackIcon />
        </Pressable>
      ) : null}
      <View
        style={[
          styles.adminBrandHeaderBrand,
          { paddingHorizontal: onBack ? 64 : 22, paddingTop: topInset },
        ]}
      >
        <Image
          contentFit="contain"
          source={require('@/assets/images/admin-calendar-logo.png')}
          style={[
            styles.adminBrandHeaderLogo,
            onBack && { width: 28, height: 28 },
          ]}
        />
        <View style={styles.adminBrandHeaderCopy}>
          <Text style={styles.adminBrandHeaderBrandText}>PhotoSync</Text>
          <Text style={styles.adminBrandHeaderEyebrow}>STUDIO ADMIN</Text>
        </View>
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
