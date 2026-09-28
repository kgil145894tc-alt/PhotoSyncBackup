import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { supabase } from '@/lib/supabase';
import { isBottomNavVisible, useStackSlideAnimation } from '@/navigation/tab-navigation';
import { observePushNotificationResponses, syncPushNotificationToken } from '@/services/push-notifications';
import { bottomNavStyles } from '@/styles/navigation.styles';

SplashScreen.preventAutoHideAsync();

const STACK_SLIDE_ANIMATION_DURATION_MS = 180;

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const stackSlideAnimation = useStackSlideAnimation();
  const showBottomNav = isBottomNavVisible(pathname);
  const [fontsLoaded, fontError] = useFonts({
    Inter: require('@/assets/fonts/Inter/static/Inter_18pt-Regular.ttf'),
    InterBold: require('@/assets/fonts/Inter/static/Inter_18pt-Bold.ttf'),
    InterMedium: require('@/assets/fonts/Inter/static/Inter_18pt-Medium.ttf'),
    InterSemiBold: require('@/assets/fonts/Inter/static/Inter_18pt-SemiBold.ttf'),
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

  useEffect(() => {
    if (!fontsLoaded && !fontError) {
      return;
    }

    syncPushNotificationToken();

    const unsubscribeFromNotifications = observePushNotificationResponses();
    const { data: authListener } =
      supabase?.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          syncPushNotificationToken();
        }
      }) ?? {};

    return () => {
      unsubscribeFromNotifications();
      authListener?.subscription.unsubscribe();
    };
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={bottomNavStyles.appShell}>
        <Stack
          screenOptions={{
            animation: stackSlideAnimation,
            animationDuration: STACK_SLIDE_ANIMATION_DURATION_MS,
            headerShown: false,
          }}>
          <Stack.Screen name="book/schedule" options={{ animation: 'none' }} />
          <Stack.Screen name="book/information" options={{ animation: 'none' }} />
          <Stack.Screen name="book/review" options={{ animation: 'none' }} />
        </Stack>
        {showBottomNav && <BottomNav />}
      </View>
    </ThemeProvider>
  );
}
