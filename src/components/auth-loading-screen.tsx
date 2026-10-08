import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function AuthLoadingScreen() {
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
        style={styles.logo}
      />
      <ActivityIndicator color="#FFFFFF" size="large" />
      <Text accessibilityLiveRegion="polite" style={styles.message}>
        Loading PhotoSync…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#021526',
    padding: 32,
    gap: 20,
  },
  logo: { width: 120, height: 100 },
  message: {
    color: '#FFFFFF',
    fontFamily: 'Inter',
    fontSize: 16,
    textAlign: 'center',
  },
});
