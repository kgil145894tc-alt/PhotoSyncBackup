import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createPasswordRecoverySession, updatePasswordFromRecovery } from '@/services/auth';

export default function ResetPasswordScreen() {
  const linkingUrl = Linking.useLinkingURL();
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('Checking your reset link...');
  const [password, setPassword] = useState('');

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

    prepareRecoverySession();

    return () => {
      isMounted = false;
    };
  }, [linkingUrl]);

  async function handleUpdatePassword() {
    if (isSaving) {
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please confirm your new password.');
      return;
    }

    setIsSaving(true);
    const result = await updatePasswordFromRecovery(password);
    setIsSaving(false);

    if (result.message) {
      Alert.alert('PhotoSync', result.message);
    }

    if (result.route) {
      router.replace(result.route as never);
    }
  }

  return (
    <View style={resetStyles.container}>
      <StatusBar style="light" />
      <Image
        contentFit="cover"
        source={require('@/assets/images/splash-background.png')}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={resetStyles.keyboard}>
        <ScrollView
          contentContainerStyle={resetStyles.scrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={resetStyles.card}>
            <Image
              contentFit="contain"
              source={require('@/assets/images/photosync-logo.png')}
              style={resetStyles.logo}
            />
            <Text style={resetStyles.brand}>Photo<Text style={resetStyles.brandAccent}>Sync</Text></Text>
            <Text style={resetStyles.title}>Reset Password</Text>
            <Text style={resetStyles.message}>{message}</Text>

            <TextInput
              autoCapitalize="none"
              editable={isReady && !isSaving}
              onChangeText={setPassword}
              placeholder="New password"
              placeholderTextColor="#8AA3C3"
              secureTextEntry
              style={[resetStyles.input, !isReady && resetStyles.inputDisabled]}
              textContentType="newPassword"
              value={password}
            />
            <TextInput
              autoCapitalize="none"
              editable={isReady && !isSaving}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor="#8AA3C3"
              secureTextEntry
              style={[resetStyles.input, !isReady && resetStyles.inputDisabled]}
              textContentType="newPassword"
              value={confirmPassword}
            />

            <Pressable
              accessibilityLabel="Update password"
              accessibilityRole="button"
              disabled={!isReady || isSaving}
              onPress={handleUpdatePassword}
              style={({ pressed }) => [
                resetStyles.primaryButton,
                (!isReady || pressed || isSaving) && { opacity: 0.78 },
              ]}>
              <Text style={resetStyles.primaryButtonText}>{isSaving ? 'Saving...' : 'Update Password'}</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Back to login"
              accessibilityRole="button"
              onPress={() => router.replace('/login')}
              style={({ pressed }) => [resetStyles.secondaryButton, pressed && { opacity: 0.72 }]}>
              <Text style={resetStyles.secondaryButtonText}>Back to Login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const resetStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#021526',
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  logo: {
    alignSelf: 'center',
    height: 104,
    width: 124,
  },
  brand: {
    alignSelf: 'center',
    color: '#FFFFFF',
    fontFamily: 'Jomhuria',
    fontSize: 62,
    includeFontPadding: false,
    lineHeight: 48,
    marginTop: 6,
  },
  brandAccent: {
    color: '#70A2E3',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Jomolhari',
    fontSize: 28,
    includeFontPadding: false,
    lineHeight: 38,
    marginTop: 18,
    textAlign: 'center',
  },
  message: {
    color: '#FFFFFF',
    fontFamily: 'Inter',
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 20,
    marginTop: 10,
    minHeight: 40,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    color: '#142C4C',
    fontFamily: 'Inter',
    fontSize: 17,
    height: 48,
    marginTop: 16,
    paddingHorizontal: 14,
  },
  inputDisabled: {
    opacity: 0.72,
  },
  primaryButton: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    marginTop: 22,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '500',
    includeFontPadding: false,
    lineHeight: 28,
  },
  secondaryButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter',
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 21,
    textDecorationLine: 'underline',
  },
});
