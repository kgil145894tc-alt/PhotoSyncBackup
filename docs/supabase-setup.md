# Supabase Setup

1. Create a Supabase project.
2. Open the SQL Editor and run `docs/supabase-schema.sql`.
3. Run `docs/supabase-services-packages.sql` to add the service/package sample records.
4. Run `docs/supabase-booking-flow.sql` to add the client contact field used by bookings.
5. Run `docs/supabase-calendar.sql` to add admin-managed time slots.
6. Run `docs/supabase-service-buffer.sql` to add service preparation time for smarter booking availability.
7. Run `docs/supabase-minimum-notice.sql` to add minimum booking notice per service.
8. Run `docs/supabase-client-cancel-booking.sql` to allow clients to cancel their own pending bookings.
9. Run `docs/supabase-client-reschedule-booking.sql` to allow clients to request a new booking date/time.
10. Run `docs/supabase-completed-bookings.sql` to allow admins to mark finished sessions as completed.
11. Run `docs/supabase-expired-bookings.sql` to allow old pending requests to expire automatically.
12. Run `docs/supabase-studio-settings.sql` to add editable studio/business profile settings.
13. Run `docs/supabase-allow-multiple-active-bookings.sql` to allow clients to create multiple non-conflicting pending or confirmed bookings.
14. Run `docs/supabase-profile-images.sql` to allow profile avatar uploads.
15. Run `docs/supabase-notifications.sql` to allow booking notification records.
16. Run `docs/supabase-admin-notification-rpc.sql` so client booking actions can create admin notifications without reading admin profiles.
17. Run `docs/supabase-booking-reminders.sql` so confirmed bookings can create one-day reminder notifications.
18. Run `docs/supabase-mark-notification-read.sql` so users and admins can mark their notifications as read.
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

Push notifications require a development or production build. Expo Go is not enough for reliable push testing on current Expo SDKs.

1. Install EAS CLI when needed: `npx eas-cli@latest --version`.
2. Initialize/link an EAS project so `extra.eas.projectId` is added to `app.json`: `npx eas-cli@latest init`.
3. Build a development version for testers: `npx eas-cli@latest build --profile development --platform android` or `npx eas-cli@latest build --profile development --platform ios`.
4. Deploy the Supabase Edge Function in `supabase/functions/send-push-notification`.
5. Configure a Supabase Database Webhook for inserts on `public.notifications`, or call the Edge Function after creating a notification row. Send this JSON body:

```json
{
  "notification_id": "NOTIFICATION_ROW_ID"
}
```

The mobile app registers the signed-in device in `public.push_tokens`. The Edge Function reads the notification row, finds the recipient's tokens, sends through Expo Push Service, and includes a route URL so tapping the push opens the matching client or admin screen.

## Admin Account

After creating a real admin user in Supabase Auth, update that user's profile row:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_ID_FROM_AUTH_USERS';
```
