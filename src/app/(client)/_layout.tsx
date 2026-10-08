import { Stack, usePathname } from 'expo-router';
import { Platform, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { ClientNavScrollProvider } from '@/components/client-nav-scroll-provider';
import { PushNotificationBootstrap } from '@/components/push-notification-bootstrap';
import { isBottomNavVisible } from '@/navigation/tab-navigation';
import { bottomNavStyles } from '@/styles/navigation.styles';
import { TabScreenMotion } from '@/components/tab-screen-motion';
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion-preference';
import { getScreenMotionOptions, isMainTabScreen } from '@/navigation/screen-motion';

export const unstable_settings = { initialRouteName: 'home' };

export default function ClientLayout() {
  const pathname = usePathname();
  const showBottomNav = isBottomNavVisible(pathname);
  const reduceMotion = useReducedMotionPreference();

  return (
    <ClientNavScrollProvider><View style={bottomNavStyles.appShell}>
      <PushNotificationBootstrap />
      <Stack
        screenOptions={({ route }) => getScreenMotionOptions(route.name, 'client', reduceMotion, Platform.OS)}
        screenLayout={({ route, children }) => <TabScreenMotion
          enabled={!reduceMotion && isMainTabScreen(route.name, 'client')}>{children}</TabScreenMotion>}
      />
      {showBottomNav ? <BottomNav /> : null}
    </View></ClientNavScrollProvider>
  );
}
