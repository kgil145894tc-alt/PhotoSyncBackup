import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { isBottomNavVisible, useStackSlideAnimation } from '@/navigation/tab-navigation';
import { bottomNavStyles } from '@/styles/navigation.styles';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const stackSlideAnimation = useStackSlideAnimation();
  const showBottomNav = isBottomNavVisible(pathname);
  const [fontsLoaded, fontError] = useFonts({
    Inter: require('@/assets/fonts/Inter/static/Inter_18pt-Regular.ttf'),
    InterBold: require('@/assets/fonts/Inter/static/Inter_18pt-Bold.ttf'),
    Italianno: require('@/assets/fonts/Italianno/Italianno-Regular.ttf'),
    Jomolhari: require('@/assets/fonts/jomolhari-3/Jomolhari-Regular.ttf'),
    Jomhuria: require('@/assets/fonts/jomhuria/Jomhuria-Regular.ttf'),
    JosefinSlab: require('@/assets/fonts/Josefin_Slab/static/JosefinSlab-Regular.ttf'),
    JosefinSlabBold: require('@/assets/fonts/Josefin_Slab/static/JosefinSlab-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={bottomNavStyles.appShell}>
        <Stack screenOptions={{ animation: stackSlideAnimation, headerShown: false }} />
        {showBottomNav && <BottomNav />}
      </View>
    </ThemeProvider>
  );
}
