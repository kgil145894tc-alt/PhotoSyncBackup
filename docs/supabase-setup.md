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
16. Copy `.env.example` to `.env`.
17. Fill in:

```text
EXPO_PUBLIC_SUPABASE_URL=your_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

18. Restart Expo after changing `.env`.

## Admin Account

After creating a real admin user in Supabase Auth, update that user's profile row:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_ID_FROM_AUTH_USERS';
```
