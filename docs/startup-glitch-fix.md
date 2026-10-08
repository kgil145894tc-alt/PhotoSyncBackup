# Startup Glitch Fix Notes

Date fixed: 2026-09-29

## Problem

The app glitched or flickered repeatedly as soon as it opened, especially around login. The issue was not the login form itself. The root app startup was doing too many side effects at once:

- font and splash-screen loading gate
- Supabase auth state listener
- protected-route role checks
- automatic redirects between client/admin screens
- bottom navigation rendering from the root layout
- push notification startup work

Those pieces can be added back later, but combining them in the root layout made startup unstable.

## Stabilizing Patch Applied

### `src/app/_layout.tsx`

The root layout was simplified to a plain Expo Router stack:

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
```

Removed from root startup for now:

- `useFonts`
- `SplashScreen.preventAutoHideAsync`
- `ThemeProvider`
- `BottomNav`
- `supabase.auth.onAuthStateChange`
- `getSignedInUserRole` route guard
- `syncPushNotificationToken`
- `observePushNotificationResponses`

### `src/services/auth.ts`

Push notification code is no longer imported during app startup. It is lazy-loaded only during sign out:

```ts
const { removeCurrentPushNotificationToken } = await import('@/services/push-notifications');
```

This prevents `expo-notifications` startup work from running while opening the app or logging in.

## Verified

- Opening the app no longer glitches.
- `npx tsc --noEmit` passed.
- `npx expo lint` passed.

## Safe Restore Step 1

Bottom navigation was restored only inside the confirmed signed-in landing screens:

- `src/app/home.tsx`
- `src/app/photographer/index.tsx`

It was not restored in `src/app/_layout.tsx`, so it cannot run during app startup or before login.

The notification badge rendering was also changed from `condition && <View />` to `condition ? <View /> : null`, and dashboard notification queries now fall back to `0` on error.

## Safe Restore Step 2

Client bottom navigation was first restored inside the remaining client tab screens:

- `src/app/services.tsx`
- `src/app/book.tsx`
- `src/app/about.tsx`
- `src/app/profile.tsx`

The bottom nav is still intentionally not in `src/app/_layout.tsx`.

## Safe Restore Step 3

Admin bottom navigation was restored inside the admin tab screens:

- `src/app/photographer/requests.tsx`
- `src/app/photographer/calendar.tsx`
- `src/app/photographer/services.tsx`
- `src/app/photographer/profile.tsx`

Together with `src/app/photographer/index.tsx`, all main admin tabs now render the nav at the screen level.

## Safe Restore Step 4

Bottom navigation was moved from individual screens into shared signed-in layouts:

- `src/app/(client)/_layout.tsx` owns the client bottom nav.
- `src/app/photographer/_layout.tsx` owns the admin bottom nav.
- `src/app/_layout.tsx` remains a minimal root stack and still does not run auth, push notification, font/splash, or bottom-nav startup logic.

Client tab route files were moved into the pathless `(client)` route group. Their URLs did not change:

- `/home`
- `/services`
- `/book`
- `/about`
- `/profile`

Do not duplicate `BottomNav` inside these individual screens unless debugging a layout regression.

## Safe Restore Step 5

Route protection was restored in the shared signed-in layouts, not in the root layout:

- `src/app/(client)/_layout.tsx` protects client routes and redirects admins to `/photographer`.
- `src/app/photographer/_layout.tsx` protects admin routes and redirects non-admin users away.
- `src/app/index.tsx`, `src/app/login.tsx`, and `src/app/create-account.tsx` redirect already signed-in users to the correct home screen.

Nested client routes were moved into the pathless `(client)` group so their URLs remain the same while sharing client protection:

- `src/app/(client)/book`
- `src/app/(client)/profile`
- `src/app/(client)/services`
- `src/app/(client)/notifications.tsx`

Push notification startup is still intentionally delayed.

## Safe Restore Step 6

Logout/session cleanup was checked after route guards:

- Client logout in `src/app/(client)/profile.tsx` signs out and redirects to `/`.
- Admin logout in `src/app/photographer/profile.tsx` signs out and redirects to `/`.
- `signOutPhotoSync` now only calls `supabase.auth.signOut()` while push notifications are delayed.
- The app no longer imports `push-notifications` during startup or logout.

## Safe Restore Step 7

Date started: 2026-10-06

Push notifications are being restored carefully after the login flicker fix:

- `src/app/_layout.tsx` must stay minimal. Do not add push, auth listeners, bottom navigation, font loading, or splash gating back into the root layout.
- `src/components/push-notification-bootstrap.tsx` lazy-loads `src/services/push-notifications.ts` only after a signed-in route group is mounted.
- `src/app/(client)/_layout.tsx` mounts `PushNotificationBootstrap` only after `useProtectedRole('client')` has finished.
- `src/app/photographer/_layout.tsx` mounts `PushNotificationBootstrap` only after `useProtectedRole('admin')` has finished.
- The bootstrap waits briefly before importing `expo-notifications` so login route replacement can settle before permission/token work starts.
- If the login flicker returns, remove `PushNotificationBootstrap` from the two signed-in layouts first. Do not change root layout as a first response.

Baseline before this step:

- `npx tsc --noEmit` passed.
- `npx expo lint` passed.
- `npx expo-doctor` passed 20/21 checks, but reported SDK patch mismatches for `@expo/ui`, `expo`, `expo-constants`, and `expo-router`. Handle those separately with `npx expo install --check` or `npx expo install --fix`.

Verification after the signed-in push bootstrap was added:

- `npx tsc --noEmit` passed.
- `npx expo lint` passed.
- `npx expo-doctor` still passed 20/21 checks with the same SDK patch mismatches only. No new doctor issue appeared from this push change.

Follow-up after first device test:

- The notification permission prompt appeared, so the signed-in bootstrap is running.
- No row appeared in `public.push_tokens`, so `src/services/push-notifications.ts` now returns explicit sync results for permission, Expo token, signed-in user, and Supabase save failures.
- In development, `src/components/push-notification-bootstrap.tsx` shows a "Push setup needs attention" alert when token creation or Supabase saving fails. Use that message to decide the next fix instead of moving push setup back into root startup.
- The first alert said Android could not create an Expo push token because Firebase Messaging was not initialized and `googleServicesFile` was missing. Next fix is Firebase Android setup, not a login/router change: create or open a Firebase project, add Android package `com.kirl123.PhotoSync`, download `google-services.json`, add `expo.android.googleServicesFile`, then rebuild the development app.
- `google-services.json` was added at the project root and matched Android package `com.kirl123.PhotoSync`. `app.json` now points `expo.android.googleServicesFile` to `./google-services.json`.
- A plain `npx expo run:android` still showed the old Firebase error because the existing generated `android/` folder had not picked up the new config. Running `npx expo prebuild --platform android --no-install` regenerated Android from app config and produced `android/app/google-services.json`, `com.google.gms:google-services`, and `apply plugin: 'com.google.gms.google-services'`.
- After reinstalling the regenerated Android build, `public.push_tokens` received the device Expo push token. The client-side push registration path is now confirmed working.
- Logging in as client, logging out, then logging in as admin on the same phone reused the same Expo push token and hit RLS because the row still belonged to the previous user. `signOutPhotoSync` now removes the current device token before sign-out, and `docs/supabase-push-notifications.sql` defines `register_my_push_token` so a signed-in user can safely claim the current device token during account switches.

Remaining push setup outside the app code:

- Run `docs/supabase-push-notifications.sql` in Supabase if it has not been applied yet.
- Deploy `supabase/functions/send-push-notification`.
- Configure the insert webhook for `public.notifications`, or call the Edge Function after creating a notification row.
- Test push delivery in a development or production build, not plain Expo Go.
- If notification rows and admin push tokens exist but no push arrives, check the webhook URL and function logs first. The linked Supabase project ref is `ywjlbiivyhedsephkhih`, so the webhook URL must be `https://ywjlbiivyhedsephkhih.supabase.co/functions/v1/send-push-notification`. `supabase/config.toml` disables JWT verification for this webhook function because database webhooks may not send a user JWT.

## Slide Animations Removed

Slide-specific navigation behavior was removed from client and admin navigation:

- `src/app/_layout.tsx` sets `animation: 'none'` on the root stack to disable native iOS push transitions.
- `src/navigation/tab-navigation.ts` no longer stores `slide_from_left` or `slide_from_right`.
- `src/components/bottom-nav.tsx` now only pushes the selected route.
- Package selection screens no longer set a stack slide direction before opening booking.
- Slide modal animations were changed to `animationType="none"` where they were used for booking cancellation and admin service/package forms.

## What To Restore Next

Add features back one at a time, testing after each step:

1. Login routing only: keep `signInWithPhotoSync` redirecting admin to `/photographer` and clients to `/home`.
2. Add screen-level logout buttons if needed.
3. Add bottom navigation inside stable signed-in screens, not as a root startup dependency.
4. Add role protection per screen or route group after login is stable.
5. Add push notifications last.
6. Add font/splash polish last, with a fallback timeout so the app cannot stay blank.

Do not put auth redirects, bottom nav, push setup, and font/splash gating back into `_layout.tsx` all at once.
