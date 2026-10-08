# Android Google sign-in

Android login and registration use the native Google account chooser and exchange the ID token with Supabase. Each attempt uses a fresh nonce: Google receives SHA-256 and Supabase receives the original nonce. New users receive the existing database trigger's client role; existing roles remain unchanged. Root auth routing owns navigation, including login after logout.

The public OAuth IDs are in `src/services/google-config.ts`. The Web ID is the native SDK's token audience. The Android OAuth client associates `com.kirl123.PhotoSync` with the signing certificate SHA-1 in Google Cloud; it is not passed as the SDK's Web ID. Never put the Web client secret in the app.

In Supabase Authentication → Sign In / Providers → Google, enable Google and use these comma-separated client IDs (Web first):

```
230946839621-rtp2medt3n765g4gmhs3dg8fje7g60o1.apps.googleusercontent.com,230946839621-vgtfmi3pfg5v5kinep5u7tvdrep193vu.apps.googleusercontent.com
```

Save the Web client secret only in that provider. The Web OAuth authorized redirect URI is `https://ywjlbiivyhedsephkhih.supabase.co/auth/v1/callback`. Keep nonce checking enabled.

Build and install a new native Android development binary:

```powershell
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

Expo Go cannot run the native Google module. The SHA-1 must match this build's signing key. For Play Store releases, register the Play App Signing certificate too. If Google's consent screen is in testing, add the accounts used for testing.

On a real Android device, verify cancellation, first Google signup, existing Google login, and login → logout → login, including switching Google accounts. Confirm new profiles are clients and existing photographer roles are preserved. Automated checks mock the native chooser; they do not verify Google Cloud credentials or the device's signing certificate.

The button asset is Google's pre-approved light button, displayed at its original aspect ratio: https://developers.google.com/identity/branding-guidelines.
