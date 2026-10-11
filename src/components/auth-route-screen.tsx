import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { AuthBrand } from '@/components/auth-brand';
import { AuthTextField } from '@/components/auth-text-field';
import { useMountedRef } from '@/hooks/use-mounted-ref';
import { signInWithGoogle } from '@/services/google-auth';
import {
  sendPasswordResetEmail,
  signInWithPhotoSync,
  signUpClientAccount,
} from '@/services/auth';
import { authRouteStyles as styles } from '@/styles/auth-route.styles';
import { authColors } from '@/styles/auth-theme';
type AuthRouteVariant = 'create' | 'login';
type AuthRouteScreenProps = { variant: AuthRouteVariant };
const screenConfig = {
  create: {
    actionLabel: 'Create Account',
    fields: ['Username', 'Email', 'Password', 'Confirm Password'],
    footerLabel: 'Already have an account? ',
    footerAction: 'Login',
    footerRoute: '/login',
  },
  login: {
    actionLabel: 'Login',
    fields: ['Email or Username', 'Password'],
    footerLabel: 'New to PhotoSync? ',
    footerAction: 'Create an account',
    footerRoute: '/create-account',
  },
} as const;
export function AuthRouteScreen({ variant }: AuthRouteScreenProps) {
  const mounted = useMountedRef();
  const submissionPending = useRef(false);
  const insets = useSafeAreaInsets();
  const [authMessage, setAuthMessage] = useState(() => {
    if (Platform.OS !== 'web' || variant !== 'login' || typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return params.has('error') || hash.has('error')
      ? 'Google sign-in was cancelled or could not finish. Please try again.'
      : '';
  });
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isForgotPasswordVisible, setIsForgotPasswordVisible] = useState(false);
  const [isPrivacyAccepted, setIsPrivacyAccepted] = useState(false);
  const [isResetEmailSending, setIsResetEmailSending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const config = screenConfig[variant];
  useEffect(() => {
    if (Platform.OS !== 'web' || variant !== 'login' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (params.has('error') || hash.has('error')) {
      // Remove the failed OAuth response so a refresh does not repeat it.
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, [variant]);
  const showAuthMessage = (message: string) => {
    setAuthMessage(message);
  };

  async function handleGoogleSignIn() {
    if (submissionPending.current) return;
    if (variant === 'create' && !isPrivacyAccepted) {
      showAuthMessage('Please agree to the Privacy Policy and Terms before continuing.');
      return;
    }
    submissionPending.current = true;
    setAuthMessage('');
    setIsSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (mounted.current && result.message) showAuthMessage(result.message);
    } catch {
      if (mounted.current) showAuthMessage('Google sign-in could not finish. Please try again.');
    } finally {
      submissionPending.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  }

  async function handleSendPasswordReset() {
    if (isResetEmailSending) {
      return;
    }

    setIsResetEmailSending(true);

    try {
      const result = await sendPasswordResetEmail(resetEmail, Platform.OS === 'web' ? 'web' : 'app');

      if (!mounted.current) return;

      if (result.message) {
        showAuthMessage(result.message);
      }

      if (
        result.message === 'Password reset email sent. Please check your inbox.'
      ) {
        setIsForgotPasswordVisible(false);
      }
    } catch (error) {
      if (!mounted.current) return;
      showAuthMessage(
        error instanceof Error
          ? error.message
          : 'We could not send the reset email. Please try again.',
      );
    } finally {
      if (mounted.current) setIsResetEmailSending(false);
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
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <View style={[styles.headerContent, { paddingTop: insets.top + 12,
              paddingLeft: Math.max(24, insets.left + 16), paddingRight: Math.max(24, insets.right + 16) }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back to intro"
                disabled={isSubmitting} onPress={() => router.replace('/')}
                style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path d="M14 5L7 12L14 19" stroke="#DAE6F6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={styles.backText}>Back</Text>
              </Pressable>
              <AuthBrand />
            </View>
          </View>
          <View style={[styles.body, { paddingBottom: insets.bottom + 20,
            paddingLeft: Math.max(20, insets.left + 12), paddingRight: Math.max(20, insets.right + 12) }]}>
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.formTitle}>{config.actionLabel}</Text>
            {config.fields.map((field) => (
                <AuthTextField key={field} label={field} creating={variant === 'create'} disabled={isSubmitting}
                  onChangeText={(text) => {
                    if (authMessage) setAuthMessage('');
                    setFieldValues((values) => ({ ...values, [field]: text }));
                  }}
                  value={fieldValues[field] ?? ''}
                />
            ))}
            {variant === 'login' && (
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={() => {
                  setAuthMessage('');
                  const loginValue = fieldValues['Email or Username'] ?? '';
                  setResetEmail(loginValue.includes('@') ? loginValue : '');
                  setIsForgotPasswordVisible(true);
                }}
                style={styles.forgotPasswordButton}
              >
                <Text
                  style={styles.forgotPasswordText}
                >
                  Forgot password?
                </Text>
              </Pressable>
            )}
            {Boolean(authMessage) && (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.authMessageText}>
                {authMessage}
              </Text>
            )}
            {variant === 'create' && (
              <Pressable
                accessibilityLabel="Agree to privacy policy"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isPrivacyAccepted }}
                disabled={isSubmitting}
                onPress={() => setIsPrivacyAccepted((value) => !value)}
                style={styles.privacyAgreementButton}
              >
                <View
                  style={[
                    styles.privacyCheckbox,
                    isPrivacyAccepted && styles.privacyCheckboxChecked,
                  ]}
                >
                  {isPrivacyAccepted ? <CheckIcon size={16} /> : null}
                </View>
                <Text style={styles.privacyAgreementText}>
                  I agree to the Privacy Policy and Terms.
                </Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
              disabled={isSubmitting}
              onPress={async () => {
                if (submissionPending.current) return;
                setAuthMessage('');

                if (variant === 'create' && !isPrivacyAccepted) {
                  showAuthMessage(
                    'Please agree to the Privacy Policy and Terms before continuing.',
                  );
                  return;
                }

                submissionPending.current = true;
                setIsSubmitting(true);

                try {
                  if (
                    variant === 'create' &&
                    fieldValues.Password !== fieldValues['Confirm Password']
                  ) {
                    showAuthMessage('Passwords do not match.');
                    return;
                  }

                  const result =
                    variant === 'login'
                      ? await signInWithPhotoSync(
                          fieldValues['Email or Username'] ?? '',
                          fieldValues.Password ?? '',
                        )
                      : await signUpClientAccount({
                          email: fieldValues.Email ?? '',
                          fullName: fieldValues.Username ?? '',
                          password: fieldValues.Password ?? '',
                          username: fieldValues.Username ?? '',
                        });

                  if (!mounted.current) return;

                  if (result.message) {
                    showAuthMessage(result.message);
                  }

                  // The root auth guard opens the role's navigator after sign-in.
                } catch (error) {
                  if (!mounted.current) return;
                  showAuthMessage(
                    error instanceof Error
                      ? error.message
                      : 'Something went wrong. Please try again.',
                  );
                } finally {
                  submissionPending.current = false;
                  if (mounted.current) setIsSubmitting(false);
                }
              }}
              style={({ pressed }) => [styles.actionButton, (isSubmitting || pressed) && styles.disabled]}
            >
              <Text style={styles.actionButtonText}>
                {isSubmitting ? 'Please wait...' : config.actionLabel}
              </Text>
            </Pressable>
            {(Platform.OS === 'android' || Platform.OS === 'web') && (
              <Pressable accessibilityRole="button" accessibilityLabel="Sign in with Google"
                accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
                disabled={isSubmitting} onPress={handleGoogleSignIn}
                style={({ pressed }) => [styles.googleButton, (isSubmitting || pressed) && styles.disabled]}>
                <Image source={require('@/assets/images/google-signin-button.png')}
                  style={styles.googleButtonImage} contentFit="contain" accessible={false} />
              </Pressable>
            )}
          </View>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => router.replace(config.footerRoute)}
              style={styles.footerButton}
            >
              <Text style={styles.footerText}>
                {config.footerLabel}<Text style={styles.linkText}>{config.footerAction}</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ForgotPasswordModal
        message={authMessage}
        email={resetEmail}
        isSending={isResetEmailSending}
        onChangeEmail={setResetEmail}
        onClose={() => setIsForgotPasswordVisible(false)}
        onSubmit={handleSendPasswordReset}
        visible={isForgotPasswordVisible}
      />
    </View>
  );
}
function ForgotPasswordModal({
  message,
  email,
  isSending,
  onChangeEmail,
  onClose,
  onSubmit,
  visible,
}: {
  message: string;
  email: string;
  isSending: boolean;
  onChangeEmail: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBackdrop}
      >
        <View style={styles.forgotModalCard}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.forgotModalContent}>
          <Text accessibilityRole="header" style={styles.forgotModalTitle}>Reset password</Text>
          <Text style={styles.forgotModalCopy}>
            Enter your email and we{"'"}ll send you a password reset link.
          </Text>
          <TextInput
            accessibilityLabel="Password reset email"
            autoCapitalize="none"
            autoComplete="email"
            editable={!isSending}
            keyboardType="email-address"
            onChangeText={onChangeEmail}
            placeholder="Email address"
            placeholderTextColor={authColors.placeholder}
            style={styles.forgotModalInput}
            value={email}
          />
          {Boolean(message) && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={[styles.authMessageText, { marginTop: 12 }]}>{message}</Text>}
          <View style={styles.forgotModalActions}>
            <Pressable
              accessibilityLabel="Cancel password reset"
              accessibilityRole="button"
              disabled={isSending}
              onPress={onClose}
              style={({ pressed }) => [
                styles.forgotModalCancelButton,
                pressed && { opacity: 0.78 },
              ]}
            >
              <Text style={styles.forgotModalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Send password reset email"
              accessibilityRole="button"
              disabled={isSending}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.forgotModalSendButton,
                (pressed || isSending) && { opacity: 0.78 },
              ]}
            >
              <Text style={styles.forgotModalSendText}>
                {isSending ? 'Sending...' : 'Send'}
              </Text>
            </Pressable>
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function CheckIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12.5L9.3 17L19 7"
        stroke={authColors.actionInk}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
      />
    </Svg>
  );
}
