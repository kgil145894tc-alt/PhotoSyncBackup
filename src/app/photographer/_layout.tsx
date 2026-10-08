import { Stack, usePathname } from 'expo-router';
import { Platform, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { ClientNavScrollProvider as NavScrollProvider } from '@/components/client-nav-scroll-provider';
import { PushNotificationBootstrap } from '@/components/push-notification-bootstrap';
import { useAdminPendingCount } from '@/hooks/use-admin-pending-count';
import { isBottomNavVisible } from '@/navigation/tab-navigation';
import { bottomNavStyles } from '@/styles/navigation.styles';
import { TabScreenMotion } from '@/components/tab-screen-motion';
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion-preference';
import { getScreenMotionOptions, isMainTabScreen } from '@/navigation/screen-motion';

export default function PhotographerLayout() {
  const pathname = usePathname();
  const showBottomNav = isBottomNavVisible(pathname);
  const reduceMotion = useReducedMotionPreference();

  return (
    <NavScrollProvider><View style={bottomNavStyles.appShell}>
      <PushNotificationBootstrap />
      <Stack
        screenOptions={({ route }) => getScreenMotionOptions(route.name, 'photographer', reduceMotion, Platform.OS)}
        screenLayout={({ route, children }) => <TabScreenMotion
          enabled={!reduceMotion && isMainTabScreen(route.name, 'photographer')}>{children}</TabScreenMotion>}
      />
      {showBottomNav ? <AdminNavigation /> : null}
    </View></NavScrollProvider>
  );
}

function AdminNavigation() {
  const pendingCount = useAdminPendingCount();
  return <BottomNav pendingCount={pendingCount} />;
}
