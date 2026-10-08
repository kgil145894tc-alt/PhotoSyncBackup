import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { appFonts } from '@/styles/fonts';
import { Stack } from 'expo-router';

import { AppAlertProvider } from '@/components/app-alert';
import { AuthLoadingScreen } from '@/components/auth-loading-screen';
import { useAuthRoutingState } from '@/hooks/use-auth-routing';

export const unstable_settings = { initialRouteName: 'login' };

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const { isLoading, role } = useAuthRoutingState();
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  if (isLoading) return <AuthLoadingScreen />;

  return (
    <AppAlertProvider>
      <Stack
        screenOptions={{
          animation: 'none',
          headerShown: false,
        }}
      >
        <Stack.Protected guard={role === null}>
          <Stack.Screen name="login" />
          <Stack.Screen name="index" />
          <Stack.Screen name="create-account" />
        </Stack.Protected>
        <Stack.Protected guard={role === 'client'}>
          <Stack.Screen name="(client)" />
        </Stack.Protected>
        <Stack.Protected guard={role === 'admin'}>
          <Stack.Screen name="photographer" />
        </Stack.Protected>
        <Stack.Screen name="reset-password" />
      </Stack>
    </AppAlertProvider>
  );
}
