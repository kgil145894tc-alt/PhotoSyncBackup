import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { authRouteStyles as styles } from '@/styles/auth-route.styles';

export function AuthBrand({ intro = false }: { intro?: boolean }) {
  return (
    <View style={[styles.brandRow, intro && styles.introBrand]}>
      <Image source={require('@/assets/images/photosync-logo.png')} contentFit="contain"
        accessible={false} style={[styles.brandLogo, intro && styles.introLogo]} />
      <View style={[styles.brandCopy, intro && styles.introBrandCopy]}>
        <Text style={[styles.wordmark, intro && styles.introWordmark]}>Photo<Text style={styles.wordmarkAccent}>Sync</Text></Text>
        <Text style={styles.tagline}>CAPTURE · BOOK · RELIVE</Text>
      </View>
    </View>
  );
}
