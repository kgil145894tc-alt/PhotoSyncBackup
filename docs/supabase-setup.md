# Supabase Setup

1. Create a Supabase project.
2. Open the SQL Editor and run `docs/supabase-schema.sql`.
3. Run `docs/supabase-services-packages.sql` to add the service/package sample records.
   Then run `docs/supabase-catalog-archives.sql` to separate temporary Active-switch changes from Delete. On an existing project, verify the migration with the temporary fixture described in `docs/catalog-deletion.md`, then run `docs/supabase-catalog-legacy-deletions.sql` to recover old removals using audit history. Run the archive setup after the service/package tables and indexes exist. Booking records and related catalog IDs are retained.
4. Run `docs/supabase-booking-flow.sql` to add the client contact field used by bookings.
5. Run `docs/supabase-calendar.sql` to add admin-managed time slots.
   Then run `docs/supabase-calendar-date-guards.sql` to make past calendar dates read-only and reject elapsed start times today in Philippine studio time. Run this guard on existing projects too; it preserves historical records. Verify it with `scripts/calendar-date-guards.verify.sql` (temporary test data, rolled back).
   Then run `docs/supabase-calendar-summaries.sql` for authenticated, RLS-preserving month aggregates. Verify with `scripts/calendar-summaries.verify.sql`; its temporary data is rolled back.
6. Run `docs/supabase-service-buffer.sql` to add service preparation time for smarter booking availability.
7. Run `docs/supabase-minimum-notice.sql` to add minimum booking notice per service.
8. Run `docs/supabase-client-cancel-booking.sql` to allow clients to cancel their own pending bookings.
9. Run `docs/supabase-client-reschedule-booking.sql` to allow clients to request a new booking date/time.
10. Run `docs/supabase-completed-bookings.sql` to allow admins to mark finished sessions as completed.
11. Run `docs/supabase-expired-bookings.sql` to allow old pending requests to expire automatically.
    Then run `docs/supabase-booking-expiration.sql` to install the atomic expiration/history RPC used by the app and align its expiration policy with Philippine studio time. Apply it to existing projects too. Verify with `scripts/booking-expiration.verify.sql`; it uses temporary tables and rolls back its probes.
12. Run `docs/supabase-studio-settings.sql` to add editable studio/business profile settings.
13. Run `docs/supabase-allow-multiple-active-bookings.sql` to allow clients to create multiple non-conflicting pending or confirmed bookings.
14. Run `docs/supabase-profile-images.sql` to allow profile avatar uploads.
15. Run `docs/supabase-notifications.sql` to allow booking notification records.
16. Run `docs/supabase-admin-notification-rpc.sql` so client booking actions can create admin notifications without reading admin profiles.
17. Run `docs/supabase-scheduled-booking-reminders.sql` to install Manila-time reminder routines and the duplicate-prevention index. Verify with `scripts/scheduled-reminders.verify.sql` (temporary tables, no real notification inserts), then run `docs/supabase-reminder-schedule.sql` to enable the named hourly server job. The existing authenticated app RPC remains available and generates only that caller's reminders. The legacy `supabase-booking-reminders.sql` file now points to this replacement.
18. Run `docs/supabase-mark-notification-read.sql` so users and admins can mark individual notifications or their whole inbox as read. Re-run this file on existing projects to add the bulk function; the app supports the earlier single-notification function while this is being applied.
19. Run `docs/supabase-usernames.sql` so users can save usernames and log in with them.
20. Run `docs/supabase-push-notifications.sql` so devices can save Expo push tokens.
21. Copy `.env.example` to `.env`.
22. Fill in:

```text
EXPO_PUBLIC_SUPABASE_URL=your_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

23. Restart Expo after changing `.env`.

## Push Notifications

Calendar summaries and the hourly reminder job were applied to the linked
PhotoSync project (`ywjlbiivyhedsephkhih`) on 2026-10-07. No manual SQL is needed
for that project. On another project, follow the setup order above. Reminder
generation inserts normal notification rows and uses the existing push webhook;
it does not require a new Edge Function. The job checks each hour at minute zero
in UTC and selects tomorrow's confirmed bookings using Asia/Manila dates.

Push notifications require a development or production build. Expo Go is not enough for reliable push testing on current Expo SDKs.

1. Install EAS CLI when needed: `npx eas-cli@latest --version`.
2. Initialize/link an EAS project so `extra.eas.projectId` is added to `app.json`: `npx eas-cli@latest init`.
3. For Android, create or open a Firebase project and add an Android app with package name `com.kirl123.PhotoSync`.
4. Download `google-services.json` from Firebase and place it at the project root as `google-services.json`.
5. Add this to the existing `expo.android` object in `app.json`:

```json
"googleServicesFile": "./google-services.json"
```

This file is required for Android devices to create an Expo push token. If it is missing, the app can still ask for notification permission but will fail with a Firebase Messaging error before saving a row in `public.push_tokens`.

6. Upload an FCM V1 service account key to EAS credentials so Expo can send Android push notifications:

```bash
npx eas-cli@latest credentials
```

Choose `Android` > the build profile/application identifier > `Google Service Account` > `Manage your Google Service Account Key for Push Notifications (FCM V1)`.

Do not commit the private service account key JSON file. It is different from `google-services.json`.

7. Rebuild a development version after adding `google-services.json`: `npx eas-cli@latest build --profile development --platform android`, or run a local development build with `npx expo run:android`.
8. Deploy the Supabase Edge Function in `supabase/functions/send-push-notification`. The project ref currently linked for this repo is `ywjlbiivyhedsephkhih`, so the function URL should be `https://ywjlbiivyhedsephkhih.supabase.co/functions/v1/send-push-notification`.
9. Optional but recommended: set a `PUSH_WEBHOOK_SECRET` environment variable on the Edge Function. Send the same value in an `x-photosync-webhook-secret` header from your webhook so only trusted callers can trigger push sends.
10. Configure a Supabase Database Webhook for inserts on `public.notifications`, or call the Edge Function after creating a notification row. Send this JSON body:

```json
{
  "notification_id": "NOTIFICATION_ROW_ID"
}
```

The mobile app registers the signed-in device in `public.push_tokens`. The Edge Function reads the notification row, finds the recipient's tokens, sends through Expo Push Service, and includes a route URL so tapping the push opens the matching client or admin screen.

## Admin Account

For paged booking lists and exact dashboard/filter counts, run
`docs/supabase-booking-pagination.sql` after the schema and booking expiration setup.
The linked PhotoSync project already has this change. Verification and remaining
performance findings are recorded in `docs/booking-pagination.md`.

After creating a real admin user in Supabase Auth, update that user's profile row:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_ID_FROM_AUTH_USERS';
```
