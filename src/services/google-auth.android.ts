import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { GOOGLE_WEB_CLIENT_ID } from '@/services/google-config';

let pendingSignIn: Promise<{ message?: string }> | null = null;

export function signInWithGoogle(): Promise<{ message?: string }> {
  // Share one attempt even if two handlers run before React disables controls.
  if (pendingSignIn) return pendingSignIn;
  const attempt = performSignIn().finally(() => {
    if (pendingSignIn === attempt) pendingSignIn = null;
  });
  pendingSignIn = attempt;
  return attempt;
}

async function performSignIn(): Promise<{ message?: string }> {
  if (!supabase) return { message: 'Sign-in is unavailable. Please try again later.' };

  let google: typeof import('react-native-nitro-google-signin');
  try {
    // Loading only on a button press keeps older binaries/Expo Go usable.
    google = await import('react-native-nitro-google-signin');
  } catch {
    return { message: 'Please install the latest Android build to use Google sign-in.' };
  }

  try {
    const bytes = await Crypto.getRandomBytesAsync(32);
    const nonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
    google.GoogleOneTapSignIn.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, nonce: hashedNonce });
    await google.GoogleOneTapSignIn.checkPlayServices();
    // Explicit selection supports new accounts and switching after logout.
    const response = await google.GoogleOneTapSignIn.presentExplicitSignIn();
    if (google.isCancelledResponse(response)) return {};
    if (!google.isSuccessResponse(response) || !response.data.idToken) {
      return { message: 'No Google account was selected. Please try again.' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google', token: response.data.idToken, nonce,
    });
    if (error || !data.session || !data.user) {
      return { message: 'We could not sign in with Google. Please try again.' };
    }
    // The database creates new client profiles; existing roles are preserved.
    // The root auth subscription owns navigation, including late completions.
    return {};
  } catch (error) {
    if (google.isErrorWithCode(error)) {
      if (error.code === google.statusCodes.SIGN_IN_CANCELLED) return {};
      if (error.code === google.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { message: 'Update Google Play services, then try again.' };
      }
      if (error.code === google.statusCodes.IN_PROGRESS) return {};
    }
    return { message: 'Google sign-in could not finish. Please try again.' };
  }
}
