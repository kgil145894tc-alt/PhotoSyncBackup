# Calendar date protection

Admin calendar history stays visible. Past dates are read-only: add/edit/delete slot and close/reopen day controls are blocked. For today, an individual slot's start must be later than the current studio time. Closing/reopening today still works through the existing full-day unavailable marker and retains its booking checks.

The studio timezone is `Asia/Manila`, shared by the app date helpers and SQL trigger. There is no timezone setting in the current studio schema. This change does not alter client booking notice/availability logic or its existing server checks.

Calendar controls update on focus, every 30 seconds while focused, and on app resume, without issuing network requests for clock updates. Handlers use a fresh clock, and the service checks again immediately before writing after conflict reads. Invalid dates, invalid times and reversed ranges are rejected. Existing records are looked up before update/delete so a false or omitted caller date cannot bypass historical protection.

## Database step

Run `docs/supabase-calendar-date-guards.sql` after the calendar table exists. This installs an INSERT/UPDATE/DELETE trigger; it does not modify old records or change RLS permissions. Both the original and proposed dates are checked on updates. The full-day unavailable marker is the only exception to today's elapsed start rule.

Run `scripts/calendar-date-guards.verify.sql` afterward. It checks the installed trigger and exercises the same function on a temporary table, then rolls back. No existing calendar records are edited or deleted by the verification.

The database guard must be installed for server enforcement against older app versions, direct API writes, incorrect device clocks, and requests crossing a time boundary. App-only checks cannot provide that guarantee.

## Verification

Automated app regressions cover past days/months/years, Philippine midnight and device timezone independence, elapsed/equal/future times today, malformed dates/times, original-record lookups, async writes crossing the start time or midnight, booking overlap checks, today close/reopen, disabled UI controls and stale handlers.

Physical phone checks: open a past month/day and verify history is visible and Edit is disabled; try a past start time today and a future time today; leave the form open across a time boundary or resume from background; verify future slot saves and today's day availability controls still work.

## Current verification

On October 7, 2026, all 347 automated tests passed, Expo lint and TypeScript checks passed, and the trigger was applied to the existing Supabase project `ywjlbiivyhedsephkhih`. The rollback staging check and installed-trigger SQL verification both passed. Verification used temporary rows; existing time-slot records were preserved. No manual SQL step is required for this project. Physical phone verification of this date protection remains pending.
