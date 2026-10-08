import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthBrand } from '@/components/auth-brand';
import { introStyles as styles } from '@/styles/intro.styles';

export function IntroScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Image contentFit="cover" source={require('@/assets/images/splash-background.png')}
        accessible={false} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.scrim} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, { paddingTop: insets.top + 28,
          paddingLeft: Math.max(28, insets.left + 20), paddingRight: Math.max(28, insets.right + 20) }]}>
          <AuthBrand intro />
        </View>
        <View style={[styles.actions, { paddingBottom: insets.bottom + 28,
            paddingLeft: Math.max(24, insets.left + 16), paddingRight: Math.max(24, insets.right + 16) }]}>
          <View style={styles.panel}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/login')}
              style={({ pressed }) => [styles.button, pressed && { opacity: 0.82 }]}>
              <Text style={styles.buttonText}>Login</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/create-account')}
              style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && { opacity: 0.75 }]}>
              <Text style={[styles.buttonText, styles.secondaryText]}>Create Account</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
