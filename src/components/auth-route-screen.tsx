import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { sendPasswordResetEmail, signInWithPhotoSync, signUpClientAccount } from '@/services/auth';
import { authRouteStyles as styles } from '@/styles/auth-route.styles';

const FIGMA_WIDTH = 412;
const FIGMA_HEIGHT = 918;
const PASSWORD_RESET_REDIRECT_URL = Linking.createURL('reset-password', { scheme: 'photosync' });

type AuthRouteVariant = 'create' | 'login';

type AuthRouteScreenProps = {
  variant: AuthRouteVariant;
};

const screenConfig = {
  create: {
    actionLabel: 'CREATE ACCOUNT',
    fields: ['Username', 'Email', 'Password', 'Confirm Password'],
    footerLabel: 'Already have an account? Login',
    footerRoute: '/login',
    logo: { height: 110.833, left: 139, top: 94, width: 133 },
    panel: { height: 576, left: 29, top: 284, width: 354 },
    tagline: { fontSize: 23.368, height: 37, left: 97, lineHeight: 37, top: 247, width: 231.088 },
    wordmark: { fontSize: 62.81, height: 36.639, left: 125, lineHeight: 47, top: 187, width: 176 },
  },
  login: {
    actionLabel: 'LOGIN',
    fields: ['Email or Username', 'Password'],
    footerLabel: "Don’t have an account? Create One",
    footerRoute: '/create-account',
    logo: { height: 147, left: 118, top: 90, width: 176.4 },
    panel: { height: 420, left: 29, top: 374, width: 354 },
    tagline: { fontSize: 32.211, height: 51, left: 54, lineHeight: 51, top: 299, width: 318.526 },
    wordmark: { fontSize: 85.714, height: 50, left: 100, lineHeight: 64, top: 221, width: 240.179 },
  },
} as const;

export function AuthRouteScreen({ variant }: AuthRouteScreenProps) {
  const { height, width } = useWindowDimensions();
  const [authMessage, setAuthMessage] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isForgotPasswordVisible, setIsForgotPasswordVisible] = useState(false);
  const [isPrivacyAccepted, setIsPrivacyAccepted] = useState(false);
  const [isResetEmailSending, setIsResetEmailSending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const config = screenConfig[variant];
  const scale = Math.min(width / FIGMA_WIDTH, height / FIGMA_HEIGHT);
  const frameWidth = FIGMA_WIDTH * scale;
  const frameHeight = FIGMA_HEIGHT * scale;
  const left = (width - frameWidth) / 2;
  const top = (height - frameHeight) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => top + px(value);
  const fieldTopStart = variant === 'create' ? 349 : 445;
  const buttonTop = variant === 'create' ? 760 : 663;
  const footerTop = variant === 'create' ? 830 : 743;
  const footerLeft = variant === 'create' ? 89 : 72;
  const footerWidth = variant === 'create' ? 237 : 268;
  const forgotPasswordTop = 634;
  const forgotPasswordLeft = 207;
  const forgotPasswordWidth = 145;
  const showAuthMessage = (message: string) => {
    setAuthMessage(message);
  };

  async function handleSendPasswordReset() {
    if (isResetEmailSending) {
      return;
    }

    setIsResetEmailSending(true);

    try {
      const result = await sendPasswordResetEmail(
        resetEmail,
        PASSWORD_RESET_REDIRECT_URL,
      );

      if (result.message) {
        showAuthMessage(result.message);
      }

      if (result.message === 'Password reset email sent. Please check your inbox.') {
        setIsForgotPasswordVisible(false);
      }
    } catch (error) {
      showAuthMessage(error instanceof Error ? error.message : 'We could not send the reset email. Please try again.');
    } finally {
      setIsResetEmailSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image
        contentFit="cover"
        source={require('@/assets/images/splash-background.png')}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}>
        <ScrollView
          bounces={false}
          contentContainerStyle={[styles.scrollContent, { minHeight: height }]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={{ height, width }}>
            <Image
              contentFit="contain"
              source={require('@/assets/images/photosync-logo.png')}
              style={[
                styles.logo,
                {
                  height: px(config.logo.height),
                  left: x(config.logo.left),
                  top: y(config.logo.top),
                  width: px(config.logo.width),
                },
              ]}
            />

            <Text
              style={[
                styles.wordmark,
                {
                  fontSize: px(config.wordmark.fontSize),
                  height: px(config.wordmark.height),
                  left: x(config.wordmark.left),
                  lineHeight: px(config.wordmark.lineHeight),
                  top: y(config.wordmark.top),
                  width: px(config.wordmark.width),
                },
              ]}>
              Photo<Text style={styles.wordmarkAccent}>Sync</Text>
            </Text>

            <View
              style={[
                styles.tagline,
                {
                  height: px(config.tagline.height),
                  left: x(config.tagline.left),
                  top: y(config.tagline.top),
                  width: px(config.tagline.width),
                },
              ]}>
              <Text style={[styles.taglineText, { fontSize: px(config.tagline.fontSize), lineHeight: px(config.tagline.lineHeight) }]}>Capture</Text>
              <View style={[styles.dot, { width: px(4), height: px(4), borderRadius: px(2) }]} />
              <Text style={[styles.taglineText, { fontSize: px(config.tagline.fontSize), lineHeight: px(config.tagline.lineHeight) }]}>Book</Text>
              <View style={[styles.dot, { width: px(4), height: px(4), borderRadius: px(2) }]} />
              <Text style={[styles.taglineText, { fontSize: px(config.tagline.fontSize), lineHeight: px(config.tagline.lineHeight) }]}>Relive</Text>
            </View>

            <View
              style={[
                styles.panel,
                {
                  borderRadius: px(20),
                  height: px(config.panel.height),
                  left: x(config.panel.left),
                  top: y(config.panel.top),
                  width: px(config.panel.width),
                },
              ]}
            />

            {config.fields.map((field, index) => {
              const fieldTop = fieldTopStart + index * 90;

              return (
                <View key={field}>
                  <Text
                    style={[
                      styles.label,
                      {
                        fontSize: px(20),
                        height: px(28),
                        left: x(63),
                        lineHeight: px(28),
                        top: y(fieldTop),
                        width: px(field === 'Confirm Password' ? 209 : field === 'Email or Username' ? 210 : 117),
                      },
                    ]}>
                    {field}
                  </Text>
                  <TextInput
                    autoCapitalize="none"
                    keyboardType={field.includes('Email') ? 'email-address' : 'default'}
                    onChangeText={(text) => {
                      if (authMessage) {
                        setAuthMessage('');
                      }

                      setFieldValues((values) => ({ ...values, [field]: text }));
                    }}
                    placeholderTextColor="rgba(255, 255, 255, 0.72)"
                    secureTextEntry={field.includes('Password')}
                    style={[
                      styles.input,
                      {
                        borderRadius: px(10),
                        fontSize: px(18),
                        height: px(46),
                        left: x(60),
                        paddingHorizontal: px(12),
                        top: y(fieldTop + 28),
                        width: px(292),
                      },
                    ]}
                    textContentType={field.includes('Password') ? 'password' : field.includes('Email') ? 'emailAddress' : 'username'}
                    value={fieldValues[field] ?? ''}
                  />
                </View>
              );
            })}

            {variant === 'login' && (
              <Pressable
                accessibilityLabel="Forgot password"
                accessibilityRole="button"
                onPress={() => {
                  const loginValue = fieldValues['Email or Username'] ?? '';
                  setResetEmail(loginValue.includes('@') ? loginValue : '');
                  setIsForgotPasswordVisible(true);
                }}
                style={({ pressed }) => [
                  styles.forgotPasswordButton,
                  {
                    height: px(24),
                    left: x(forgotPasswordLeft),
                    opacity: pressed ? 0.72 : 1,
                    top: y(forgotPasswordTop),
                    width: px(forgotPasswordWidth),
                  },
                ]}>
                <Text style={[styles.forgotPasswordText, { fontSize: px(13), lineHeight: px(18) }]}>Forgot password?</Text>
              </Pressable>
            )}

            {authMessage && (
              <Text
                style={[
                  styles.authMessageText,
                  {
                    fontSize: px(12),
                    left: x(63),
                    lineHeight: px(16),
                    top: y(variant === 'create' ? 710 : 610),
                    width: px(289),
                  },
                ]}>
                {authMessage}
              </Text>
            )}

            {variant === 'create' && (
              <Pressable
                accessibilityLabel="Agree to privacy policy"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isPrivacyAccepted }}
                onPress={() => setIsPrivacyAccepted((value) => !value)}
                style={({ pressed }) => [
                  styles.privacyAgreementButton,
                  {
                    height: px(34),
                    left: x(63),
                    opacity: pressed ? 0.72 : 1,
                    top: y(724),
                    width: px(282),
                  },
                ]}>
                <View
                  style={[
                    styles.privacyCheckbox,
                    {
                      width: px(18),
                      height: px(18),
                      borderRadius: px(5),
                    },
                    isPrivacyAccepted && styles.privacyCheckboxChecked,
                  ]}>
                  {isPrivacyAccepted ? <CheckIcon size={px(13)} /> : null}
                </View>
                <Text style={[styles.privacyAgreementText, { fontSize: px(11), lineHeight: px(15), marginLeft: px(8) }]}>
                  I agree to the Privacy Policy and Terms.
                </Text>
              </Pressable>
            )}

            <Pressable
              accessibilityLabel={config.actionLabel}
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={async () => {
                setAuthMessage('');

                if (variant === 'create' && !isPrivacyAccepted) {
                  showAuthMessage('Please agree to the Privacy Policy and Terms before continuing.');
                  return;
                }

                setIsSubmitting(true);

                try {
                  if (variant === 'create' && fieldValues.Password !== fieldValues['Confirm Password']) {
                    showAuthMessage('Passwords do not match.');
                    return;
                  }

                  const result =
                    variant === 'login'
                      ? await signInWithPhotoSync(fieldValues['Email or Username'] ?? '', fieldValues.Password ?? '')
                      : await signUpClientAccount({
                          email: fieldValues.Email ?? '',
                          fullName: fieldValues.Username ?? '',
                          password: fieldValues.Password ?? '',
                          username: fieldValues.Username ?? '',
                        });

                  if (result.message) {
                    showAuthMessage(result.message);
                  }

                  if (result.route) {
                    router.replace(result.route as never);
                  }
                } catch (error) {
                  showAuthMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  borderRadius: px(10),
                  height: px(50),
                  left: x(63),
                  opacity: pressed || isSubmitting ? 0.82 : 1,
                  top: y(buttonTop),
                  width: px(289),
                },
              ]}>
              <Text style={[styles.actionButtonText, { fontSize: px(22), lineHeight: px(29) }]}>
                {isSubmitting ? 'PLEASE WAIT...' : config.actionLabel}
              </Text>
            </Pressable>

            <Pressable
              accessibilityLabel={config.footerLabel}
              accessibilityRole="button"
              onPress={() => router.replace(config.footerRoute)}
              style={({ pressed }) => [
                styles.footerButton,
                {
                  height: px(28),
                  left: x(footerLeft),
                  opacity: pressed ? 0.72 : 1,
                  top: y(footerTop),
                  width: px(footerWidth),
                },
              ]}>
              <Text style={[styles.footerButtonText, { fontSize: px(15), lineHeight: px(21) }]}>
                {config.footerLabel}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ForgotPasswordModal
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
  email,
  isSending,
  onChangeEmail,
  onClose,
  onSubmit,
  visible,
}: {
  email: string;
  isSending: boolean;
  onChangeEmail: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
        <View style={styles.forgotModalCard}>
          <Text style={styles.forgotModalTitle}>Reset password</Text>
          <Text style={styles.forgotModalCopy}>Enter your email and we{'\''}ll send you a password reset link.</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            editable={!isSending}
            keyboardType="email-address"
            onChangeText={onChangeEmail}
            placeholder="Email address"
            placeholderTextColor="#8AA3C3"
            style={styles.forgotModalInput}
            textContentType="emailAddress"
            value={email}
          />
          <View style={styles.forgotModalActions}>
            <Pressable
              accessibilityLabel="Cancel password reset"
              accessibilityRole="button"
              disabled={isSending}
              onPress={onClose}
              style={({ pressed }) => [styles.forgotModalCancelButton, pressed && { opacity: 0.78 }]}>
              <Text style={styles.forgotModalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Send password reset email"
              accessibilityRole="button"
              disabled={isSending}
              onPress={onSubmit}
              style={({ pressed }) => [styles.forgotModalSendButton, (pressed || isSending) && { opacity: 0.78 }]}>
              <Text style={styles.forgotModalSendText}>{isSending ? 'Sending...' : 'Send'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5L9.3 17L19 7" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    </Svg>
  );
}
