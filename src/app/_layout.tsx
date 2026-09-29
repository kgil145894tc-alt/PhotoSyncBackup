import { Stack } from 'expo-router';

import { AppAlertProvider } from '@/components/app-alert';

export default function RootLayout() {
  return (
    <AppAlertProvider>
      <Stack
        screenOptions={{
          animation: 'none',
          headerShown: false,
        }}
      />
    </AppAlertProvider>
  );
}
