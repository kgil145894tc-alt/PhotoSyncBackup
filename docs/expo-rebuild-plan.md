# PhotoSync Expo Rebuild Plan

Use this when rebuilding PhotoSync into a fresh Expo project. The goal is to copy the app carefully, not all at once, so broken auth/navigation state does not follow us unnoticed.

## 1. Create a Fresh Expo App

From `C:\Users\kirlg`, create a new project folder:

```bash
npx create-expo-app@latest PhotoSyncFresh
cd PhotoSyncFresh
```

Choose a TypeScript Expo Router template if prompted.

## 2. Match the Current App Setup

Copy or recreate these project config files from the old app:

- `app.json`
- `tsconfig.json`
- `eslint.config.js`
- `.env.example`
- `eas.json` if you still use EAS builds

Do not copy `.expo`, `node_modules`, or any cache folders.

Install dependencies using Expo-compatible versions:

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated
npx expo install expo-image expo-font expo-status-bar expo-notifications expo-device expo-constants expo-linking expo-system-ui expo-web-browser
npm install @supabase/supabase-js react-native-url-polyfill react-native-svg @react-native-async-storage/async-storage
```

If package versions conflict, run:

```bash
npx expo install --fix
```

## 3. Copy Assets First

Copy these folders:

- `assets/fonts`
- `assets/images`

Then run:

```bash
npx tsc --noEmit
npx expo lint
```

## 4. Copy Shared Non-Screen Code

Copy these folders next:

- `src/lib`
- `src/types`
- `src/styles`
- `src/navigation`
- `src/services`
- `src/components`

Do not copy `src/app` yet.

Then run:

```bash
npx tsc --noEmit
npx expo lint
```

Fix errors before continuing.

## 5. Rebuild Routes Slowly

Create `src/app` fresh and copy screens in this order:

1. `src/app/_layout.tsx`
2. `src/app/index.tsx`
3. `src/app/login.tsx`
4. `src/app/create-account.tsx`
5. `src/app/home.tsx`
6. `src/app/photographer/index.tsx`

Test login before copying booking screens.

Expected auth behavior:

- Logged-out users can see `/`, `/login`, and `/create-account`.
- Client login goes to `/home`.
- Admin login goes to `/photographer`.
- Admin users should not stay on `/book`, `/home`, `/notifications`, or `/profile`.
- Client users should not stay on `/photographer`.

## 6. Add Client Booking Screens

Copy these after auth is confirmed:

- `src/app/services.tsx`
- `src/app/services`
- `src/app/book.tsx`
- `src/app/book`
- `src/app/notifications.tsx`
- `src/app/profile.tsx`
- `src/app/profile`

After copying, test:

- Service details open.
- Book flow reaches selected package, schedule, information, review, success.
- Admin login still redirects away from booking screens.

## 7. Add Admin Screens

Copy:

- `src/app/photographer`

Then test:

- Admin dashboard loads.
- Admin calendar loads.
- Admin profile loads.
- Admin service management loads.
- Client login still cannot open admin screens.

## 8. Supabase Setup

Use the existing Supabase project unless intentionally resetting the database.

Required SQL files to keep:

- `docs/supabase-schema.sql`
- `docs/supabase-rls-hardening.sql`
- `docs/supabase-usernames.sql`
- `docs/supabase-setup.md`

Do not rerun the full schema on a production database unless resetting intentionally.

## 9. Environment Variables

Create `.env` in the fresh app:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Never commit `.env`.

## 10. Final Checks

Before considering the rebuild done:

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
npx expo start --clear
```

Manual tests:

- Fresh app open shows intro/login choice.
- Login button opens the form, not calendar.
- Admin login goes to admin dashboard.
- Client login goes to client home.
- Logout returns to intro/login.
- Web does not show `Unexpected text node: . A text node cannot be a child of a <View>.`
- Phone test matches web routing.

## Important Rule

Do not copy everything at once. If a bug appears, stop at that step and fix it before adding more screens.
