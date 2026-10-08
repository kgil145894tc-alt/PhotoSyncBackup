import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { emitNotificationsChanged } from '@/services/notification-events';

const ANDROID_BOOKING_CHANNEL_ID = 'photosync-bookings';
let currentPushAccountId: string | null = null;
let pushAccountGeneration = 0;

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    const accountId = session?.user.id ?? null;
    if (accountId !== currentPushAccountId || event === 'SIGNED_OUT') pushAccountGeneration += 1;
    currentPushAccountId = accountId;
    if (event === 'SIGNED_OUT' && Platform.OS !== 'web') {
      // Clear already-presented notifications and old tap destinations locally.
      try {
        Notifications.clearLastNotificationResponse();
        void Notifications.dismissAllNotificationsAsync().catch(() => {
          console.warn('Could not dismiss notifications after sign-out.');
        });
      } catch {
        console.warn('Could not dismiss notifications after sign-out.');
      }
    }
  });
}

type PushNotificationSyncReason =
  | 'permission-denied'
  | 'push-token-unavailable'
  | 'signed-out'
  | 'supabase-error'
  | 'supabase-unconfigured'
  | 'web';

type PushNotificationSyncResult =
  | {
      status: 'saved';
      token: string;
    }
  | {
      message: string;
      reason: PushNotificationSyncReason;
      status: 'failed' | 'skipped';
    };

type PushTokenResult =
  | {
      ok: true;
      token: string;
    }
  | {
      message: string;
      ok: false;
      reason: PushNotificationSyncReason;
      status: 'failed' | 'skipped';
    };

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const belongsToAccount = isCurrentAccountNotification(notification);
    return {
      shouldPlaySound: belongsToAccount,
      shouldSetBadge: belongsToAccount,
      shouldShowBanner: belongsToAccount,
      shouldShowList: belongsToAccount,
    };
  },
});

export async function syncPushNotificationToken() {
  if (!supabase || Platform.OS === 'web') {
    return Platform.OS === 'web'
      ? skippedPushSync('web', 'Push notifications are skipped on web.')
      : skippedPushSync('supabase-unconfigured', 'Supabase is not configured, so the push token cannot be saved.');
  }

  const { data: sessionData, error: userError } = await supabase.auth.getSession();

  if (userError) {
    return failedPushSync('supabase-error', `Unable to read the signed-in user: ${userError.message}`);
  }

  if (!sessionData.session) {
    return skippedPushSync('signed-out', 'No signed-in user was found while saving the push token.');
  }
  const session = sessionData.session;
  const generation = pushAccountGeneration;

  const token = await getExpoPushToken();

  if (!token.ok) {
    return {
      message: token.message,
      reason: token.reason,
      status: token.status,
    } satisfies PushNotificationSyncResult;
  }

  if (generation !== pushAccountGeneration || currentPushAccountId !== session.user.id) {
    return skippedPushSync('signed-out', 'The login changed before its push token could be saved.');
  }

  const { error } = await supabase.rpc('register_my_push_token', {
    p_expo_push_token: token.token,
    p_platform: Platform.OS,
  }).setHeader('Authorization', `Bearer ${session.access_token}`);

  if (generation !== pushAccountGeneration) {
    return skippedPushSync('signed-out', 'The login changed while saving its push token.');
  }

  if (error) {
    console.warn('Unable to save push token:', error.message);
    return failedPushSync('supabase-error', `Unable to save push token in Supabase: ${error.message}`);
  }

  return {
    status: 'saved',
    token: token.token,
  } satisfies PushNotificationSyncResult;
}

export async function removeCurrentPushNotificationToken({ signal }: { signal?: AbortSignal } = {}) {
  if (!supabase || Platform.OS === 'web') {
    return;
  }

  // Use the existing login session, without asking Expo for a token or permission.
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (signal?.aborted) return;
  if (sessionError) throw new Error(sessionError.message);
  if (!data.session) return;

  // Pin credentials before waiting for the network. A late cleanup must never
  // unregister the next account (or a new login of the same account).
  const request = supabase.rpc('unregister_my_push_session')
    .setHeader('Authorization', `Bearer ${data.session.access_token}`);
  const { error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw new Error(error.message);
}

export function observePushNotificationResponses() {
  if (Platform.OS === 'web') {
    return () => {};
  }

  const lastResponse = Notifications.getLastNotificationResponse();

  if (lastResponse?.notification && isCurrentAccountNotification(lastResponse.notification)) {
    emitNotificationsChanged();
    redirectFromNotification(lastResponse.notification);
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (!isCurrentAccountNotification(response.notification)) return;
    emitNotificationsChanged();
    redirectFromNotification(response.notification);
  });

  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    if (!isCurrentAccountNotification(notification)) return;
    emitNotificationsChanged();
  });

  return () => {
    subscription.remove();
    receivedSubscription.remove();
  };
}

async function getExpoPushToken({ requestPermission = true } = {}): Promise<PushTokenResult> {
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
    return skippedPushToken(
      'permission-denied',
      'Notification permission was not granted, so no Expo push token was created.',
    );
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    return failedPushToken(
      'push-token-unavailable',
      'Expo EAS projectId is missing. Run `npx eas-cli@latest init` before testing push notifications.',
    );
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });

    return {
      ok: true,
      token: token.data,
    };
  } catch (error) {
    return failedPushToken(
      'push-token-unavailable',
      `Expo could not create a push token: ${getErrorMessage(error)}`,
    );
  }
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

function isCurrentAccountNotification(notification: Notifications.Notification) {
  return currentPushAccountId !== null && notification.request.content.data?.userId === currentPushAccountId;
}

function failedPushSync(
  reason: PushNotificationSyncReason,
  message: string,
): PushNotificationSyncResult {
  return {
    message,
    reason,
    status: 'failed',
  };
}

function skippedPushSync(
  reason: PushNotificationSyncReason,
  message: string,
): PushNotificationSyncResult {
  return {
    message,
    reason,
    status: 'skipped',
  };
}

function failedPushToken(
  reason: PushNotificationSyncReason,
  message: string,
): PushTokenResult {
  return {
    message,
    ok: false,
    reason,
    status: 'failed',
  };
}

function skippedPushToken(
  reason: PushNotificationSyncReason,
  message: string,
): PushTokenResult {
  return {
    message,
    ok: false,
    reason,
    status: 'skipped',
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
