# Shared-service optimization and final review

Implemented on 2026-10-07. The four shared-service findings from the pagination review and the four follow-up items below are complete. The initial application-only improvements required no new SQL. The follow-up installs calendar/reminder routines and an hourly database job; these are already applied to the linked PhotoSync project (`ywjlbiivyhedsephkhih`). No new dependency, native configuration or Edge Function is required.

## Reminder checks

The shared booking-reminders service coalesces concurrent inbox, unread-tab and badge maintenance. Successful checks stay fresh for 30 seconds from request start. Failures remain uncached, and optional maintenance failure does not prevent inbox reads. Booking changes invalidate the check. The Asia/Manila date is part of its cache scope so midnight always expires yesterday's result. Logout/account changes clear it and reject late results; same-account token refreshes preserve it. Notification next-page loading continues to skip reminder generation.

The auth callback updates memory synchronously; it does not perform asynchronous auth or database work. Cold session restoration is shared and cannot replace a newer auth event.

## Studio settings

Booking Information and availability browsing share a 60-second in-memory singleton read. Concurrent consumers share an unfinished request. Date-specific calendar changes preserve settings freshness; global calendar/working-hours changes invalidate it. A successful settings save supplies the returned database row to the cache, superseding older pending reads without another query. Logout also invalidates write ownership so late saves cannot populate the next session.

Admin Settings refreshes and booking submission, admin confirmation, rescheduling, calendar-slot saves and the client's Continue availability check bypass browsing freshness when they validate working hours. Failed validation prevents the write. Display-only defaults remain available on read failure but are never cached as a successful server response.

## Catalog processing

Admin/client snapshots fetch stable-ordered 200-row pages for both tables. Small catalogs still need only two queries; larger catalogs no longer silently stop at the API row cap. An error on any page rejects the whole snapshot. Login-generation guards prevent further pages after logout or an account change.

Package counts use one pass instead of filtering every package for every service. Confirmed activation/deactivation patches also count packages once. These changes preserve complete counts, client filtering and server validation of selectable packages. The former synchronous cache mirror was subsequently removed with its unused getters.

Home highlights read narrow 12-row pages and stop after three valid published photos. Invalid whitespace rows cannot hide valid photos on a later page. Cached highlights also stop processing after three valid cards.

Catalog snapshots still load the complete catalog. These are bounded database reads, not lazy loading of visible cards.

## Legacy booking cleanup

Removed the former unpaged admin/client list hooks and stores, client full-list cache, full-list service readers, latest-client-booking wrapper and duplicated client row mapper. Admin detail reads and mutations now use a dedicated detail cache/store. It retains at most 24 idle detail entries and protects pending reads/writes from eviction. Unique request epochs prevent an evicted old response from resurrecting data. The paged list caches remain the sole list path.

Tests tied solely to the retired full-list implementation were replaced by current paging/detail coverage. Dashboard, action, screen and live-validation tests remain in admin-dashboard.test.cjs, admin-booking-detail.test.cjs and client-booking-actions.test.cjs.

## Completed follow-up items

1. **Calendar month summaries:** `get_calendar_day_summaries(p_month)` aggregates confirmed bookings and time slots in Postgres and returns at most one row per date (31 maximum). It preserves existing RLS through SECURITY INVOKER, requires authentication and a first-of-month date, and avoids omissions from the API row cap. Existing daily availability reads, strict server validation, cache invalidation and failure handling remain in place. SQL: `supabase-calendar-summaries.sql`.
2. **Virtualized catalog screens:** client Services, client Packages and admin Services use a single FlatList instead of mapping all cards into a ScrollView. Initial/batch rendering is eight items with a seven-viewport window. Hero/header content, error/empty states, pull refresh, package selection and admin forms/actions are preserved. These screens still use complete cached snapshots for counts and editing; server pagination of screen data was not added. Booking validation still bypasses browsing caches.
3. **Scheduled server reminders:** the named `photosync-booking-reminders` job runs hourly at minute zero. The worker selects tomorrow's confirmed bookings using Asia/Manila dates and generates reminders for clients and admins without waiting for an app visit. The authenticated app RPC still generates only its own recipient's reminders. A partial unique index and ON CONFLICT prevent duplicate reminder inserts across devices and job/app overlap. Existing rows and the push delivery path are preserved. Only the owner/service role can invoke the all-recipient entry point. SQL: `supabase-scheduled-booking-reminders.sql`, then `supabase-reminder-schedule.sql` after fixture verification.
4. **Unused catalog cleanup:** removed unused full/fallback catalog readers, legacy synchronous getters, old caches and the client snapshot mirror. Strict paged snapshot readers, narrow Home highlights, fresh selectable-package checks and catalog CRUD/event paths remain active. Existing per-row image defaults remain for real published records.

No additional item from this optimization review remains unimplemented. This is not a guarantee that future data growth cannot reveal another bottleneck. Measure on a physical phone before adding more caching or complexity; full catalog snapshots remain a deliberate tradeoff for accurate counts and forms.

## Verification

Final checks passed: Expo lint (zero errors/warnings), TypeScript typecheck, all 403 automated tests and Git diff whitespace checks. Live database fixtures passed for calendar aggregation (including 2,005-row inputs, ownership/admin RLS, empty/leap months and authentication) and reminder generation (recipient scope, repeat inserts, the atomic duplicate constraint, Manila midnight, status/date filters and restricted grants). Fixtures use temporary tables and roll back without creating real notifications or sending pushes. The hourly job is verified active with the expected schedule and command; its next real scheduled execution and push delivery still need observation.

Run `npx expo lint`, `npx tsc --noEmit` and `node --test scripts/*.test.cjs`. Shared-service regression coverage includes TTL boundaries, forced reads, failure retries, invalidation during reads, saves superseding reads, logout/relogin, concurrent consumers and Manila midnight. Catalog tests include 1,005-record fixtures, later-page failure, session cancellation, invalid highlight rows across page boundaries, and 150-row screen fixtures with offscreen selection/editing. Booking and calendar tests assert that strict working-hours reads still prevent writes on failure. Database checks: `scripts/calendar-summaries.verify.sql` and `scripts/scheduled-reminders.verify.sql`.

Physical-device testing remains necessary for screen transitions, native pull refresh, Load more, filters, setting edits reflected in availability, offline recovery, notification links, booking decisions and logout during pending work.
