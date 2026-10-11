import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthBrand } from '@/components/auth-brand';
import { AuthTextField } from '@/components/auth-text-field';
import { authRouteStyles as styles } from '@/styles/auth-route.styles';
import { showAppAlert } from '@/components/app-alert';
import { useAuthRoutingState } from '@/hooks/use-auth-routing';
import { createPasswordRecoverySession, endPasswordRecoverySession, updatePasswordFromRecovery } from '@/services/auth';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const linkingUrl = Linking.useLinkingURL();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const requestedFromApp = source === 'app';
  const auth = useAuthRoutingState();
  const [returnToLogin, setReturnToLogin] = useState(false);
  const [isPreparing, setIsPreparing] = useState(true);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('Checking your reset link...');
  const [password, setPassword] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function prepareRecoverySession() {
      if (!linkingUrl) {
        setMessage('Open the reset link from your email to set a new password.');
        return;
      }

      const result = await createPasswordRecoverySession(linkingUrl);

      if (!isMounted) {
        return;
      }

      if (result.message) {
        setMessage(result.message);
        setIsReady(false);
        return;
      }

      setMessage('Enter a new password for your PhotoSync account.');
      setIsReady(true);
    }

    void prepareRecoverySession().catch((error: unknown) => {
      if (isMounted) setMessage(error instanceof Error ? error.message : 'Could not verify your reset link. Please try again.');
    }).finally(() => {
      if (isMounted) setIsPreparing(false);
    });

    return () => {
      isMounted = false;
    };
  }, [linkingUrl]);

  useEffect(() => {
    // Wait for the signed-out render so Stack.Protected allows Login again.
    if (returnToLogin && !auth.isLoading && auth.role === null) router.replace('/login');
  }, [returnToLogin, auth.isLoading, auth.role]);

  async function handleBackToLogin() {
    if (isPreparing || isSaving || returnToLogin) return;
    setIsSaving(true);
    try {
      await endPasswordRecoverySession();
      setReturnToLogin(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not return to login. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdatePassword() {
    if (isSaving) return;
    if (password !== confirmPassword) {
      showAppAlert('Passwords do not match', 'Please confirm your new password.');
      return;
    }
    setIsSaving(true);
    try {
      const result = await updatePasswordFromRecovery(password);
      if (result.route) {
        setIsReady(false);
        setIsComplete(true);
        setPassword('');
        setConfirmPassword('');
        setMessage('Password updated successfully. You can now log in with your new password.');
        await endPasswordRecoverySession();
      } else if (result.message) {
        setMessage(result.message);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not finish resetting your password. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image contentFit="cover" source={require('@/assets/images/splash-background.png')}
        accessible={false} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.scrim} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={Platform.OS !== 'web'} style={styles.keyboardAvoidingView}>
        <ScrollView contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={[styles.headerContent, {
              paddingTop: insets.top + 28,
              paddingLeft: Math.max(24, insets.left + 16),
              paddingRight: Math.max(24, insets.right + 16),
            }]}>
              <AuthBrand />
            </View>
          </View>
          <View style={[styles.body, {
            paddingBottom: insets.bottom + 20,
            paddingLeft: Math.max(20, insets.left + 12),
            paddingRight: Math.max(20, insets.right + 12),
          }]}>
            <View style={styles.panel}>
              <Text accessibilityRole="header" style={styles.formTitle}>{isComplete ? 'Password Updated' : 'Set New Password'}</Text>
              <Text accessibilityLiveRegion="polite" style={styles.authMessageText}>{message}</Text>
              {isComplete && requestedFromApp && (
                <Text style={styles.footerText}>Return to PhotoSync and log in with your new password. You can close this page.</Text>
              )}
              {!isComplete && <>
              <AuthTextField label="New Password" creating disabled={!isReady || isSaving || returnToLogin}
                value={password} onChangeText={setPassword} />
              <AuthTextField label="Confirm Password" creating disabled={!isReady || isSaving || returnToLogin}
                value={confirmPassword} onChangeText={setConfirmPassword} />
              <Pressable accessibilityLabel="Update password" accessibilityRole="button"
                accessibilityState={{ busy: isSaving, disabled: !isReady || isSaving || returnToLogin }}
                disabled={!isReady || isSaving || returnToLogin} onPress={handleUpdatePassword}
                style={({ pressed }) => [styles.actionButton,
                  (!isReady || isSaving || returnToLogin || pressed) && styles.disabled]}>
                <Text style={styles.actionButtonText}>{isSaving ? 'Please wait...' : 'Update Password'}</Text>
              </Pressable>
              </>}
            </View>
            {!(isComplete && requestedFromApp) && (
            <Pressable accessibilityLabel="Back to login" accessibilityRole="button"
              accessibilityState={{ disabled: isPreparing || isSaving || returnToLogin }}
              disabled={isPreparing || isSaving || returnToLogin} onPress={handleBackToLogin}
              style={({ pressed }) => [styles.footerButton,
                (isPreparing || isSaving || returnToLogin || pressed) && styles.disabled]}>
              <Text style={styles.footerText}><Text style={styles.linkText}>Back to Login</Text></Text>
            </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
