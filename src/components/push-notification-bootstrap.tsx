import { useEffect } from 'react';
import { Alert } from 'react-native';

const PUSH_BOOTSTRAP_DELAY_MS = 750;

export function PushNotificationBootstrap() {
  useEffect(() => {
    let isActive = true;
    let cleanup: (() => void) | undefined;

    const timeoutId = setTimeout(() => {
      void startPushNotifications();
    }, PUSH_BOOTSTRAP_DELAY_MS);

    async function startPushNotifications() {
      try {
        const { observePushNotificationResponses, syncPushNotificationToken } = await import(
          '@/services/push-notifications'
        );

        if (!isActive) {
          return;
        }

        cleanup = observePushNotificationResponses();
        void syncPushNotificationToken()
          .then((result) => {
            if (!isActive) return;
            if (result.status === 'saved') {
              return;
            }

            console.warn('Push notification setup did not finish:', result.message);

            if (__DEV__ && result.status === 'failed') {
              Alert.alert('Push setup needs attention', result.message);
            }
          })
          .catch((error: unknown) => {
            if (!isActive) return;
            const message = getErrorMessage(error);
            console.warn('Unable to sync push token:', message);

            if (__DEV__) {
              Alert.alert('Push setup needs attention', message);
            }
          });
      } catch (error) {
        if (!isActive) return;
        const message = getErrorMessage(error);
        console.warn('Unable to start push notifications:', message);

        if (__DEV__) {
          Alert.alert('Push setup needs attention', message);
        }
      }
    }

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      cleanup?.();
    };
  }, []);

  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
