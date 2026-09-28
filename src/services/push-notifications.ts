import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const ANDROID_BOOKING_CHANNEL_ID = 'photosync-bookings';

type PushTokenRow = {
  expo_push_token: string;
  platform: string;
  user_id: string;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function syncPushNotificationToken() {
  if (!supabase || Platform.OS === 'web') {
    return null;
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const token = await getExpoPushToken();

  if (!token) {
    return null;
  }

  const row: PushTokenRow = {
    expo_push_token: token,
    platform: Platform.OS,
    user_id: userData.user.id,
  };

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        ...row,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'expo_push_token' },
    );

  if (error) {
    console.warn('Unable to save push token:', error.message);
    return null;
  }

  return token;
}

export async function removeCurrentPushNotificationToken() {
  if (!supabase || Platform.OS === 'web') {
    return;
  }

  const token = await getExpoPushToken({ requestPermission: false });

  if (!token) {
    return;
  }

  const { error } = await supabase.from('push_tokens').delete().eq('expo_push_token', token);

  if (error) {
    console.warn('Unable to remove push token:', error.message);
  }
}

export function observePushNotificationResponses() {
  const lastResponse = Notifications.getLastNotificationResponse();

  if (lastResponse?.notification) {
    redirectFromNotification(lastResponse.notification);
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    redirectFromNotification(response.notification);
  });

  return () => subscription.remove();
}

async function getExpoPushToken({ requestPermission = true } = {}) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_BOOKING_CHANNEL_ID, {
      importance: Notifications.AndroidImportance.HIGH,
      name: 'Booking updates',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const permission = await Notifications.getPermissionsAsync();
  let finalStatus = getPermissionStatus(permission);

  if (finalStatus !== 'granted' && requestPermission) {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = getPermissionStatus(requestedPermission);
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    console.warn('Expo EAS projectId is missing. Run `npx eas-cli@latest init` before testing push notifications.');
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });

  return token.data;
}

function getPermissionStatus(permission: Notifications.NotificationPermissionsStatus) {
  if (Platform.OS !== 'ios') {
    return permission.status;
  }

  const iosStatus = permission.ios?.status;

  if (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }

  return permission.status;
}

function redirectFromNotification(notification: Notifications.Notification) {
  const url = notification.request.content.data?.url;

  if (typeof url === 'string' && url.startsWith('/')) {
    router.push(url as never);
  }
}
