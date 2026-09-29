import { Stack, usePathname } from 'expo-router';
import { View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { useProtectedRole } from '@/hooks/use-auth-routing';
import { isBottomNavVisible } from '@/navigation/tab-navigation';
import { bottomNavStyles } from '@/styles/navigation.styles';

export default function ClientLayout() {
  const pathname = usePathname();
  const isCheckingRole = useProtectedRole('client');
  const showBottomNav = isBottomNavVisible(pathname);

  if (isCheckingRole) {
    return null;
  }

  return (
    <View style={bottomNavStyles.appShell}>
      <Stack
        screenOptions={{
          animation: 'none',
          headerShown: false,
        }}
      />
      {showBottomNav ? <BottomNav /> : null}
    </View>
  );
}
