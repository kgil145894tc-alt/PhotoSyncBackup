# Admin calendar cache

The admin month grid and time-slot screen now use independent, account-scoped
memory caches. Month keys are `YYYY-MM`; day keys are `YYYY-MM-DD`. Returning to
a successfully loaded key within 30 seconds reuses its data, including empty
results. Focus and app resume fetch stale keys while keeping their previous data
visible. Pull-to-refresh forces the current key to reload.

Month flags now come from `get_calendar_day_summaries(p_month)`, which groups
bookings and availability inside Postgres and returns at most 31 rows. The
SECURITY INVOKER routine preserves booking/time-slot RLS and requires an
authenticated caller and a first-of-month date. It no longer downloads all
monthly records or loses flags at the API row cap. Day availability and mutation
validation retain their separate server reads. Install details and temporary
database fixtures are in `supabase-calendar-summaries.sql` and
`../scripts/calendar-summaries.verify.sql`; the linked project is already updated.

Month arrows change selection immediately and let the focused hook load the new
key. There is no preliminary fetch followed by a second focus fetch. Responses
for other months cannot change the selected month or its grid.

Concurrent reads of the same key share a request. Booking changes or availability
edits during a read discard that result and read again before accepting data.
Logout and account switching clear all entries and ignore previous responses.
Token refreshes for the same account preserve cached data.

Availability saves, day closures/reopens and deletions emit calendar events after
the database accepts their write. A known date invalidates its day details and
month summary even when the screens are closed. Updates that may move a saved
slot, unknown-date deletions, and studio working-hour edits invalidate all keys.
Booking events carry no old/new date information, so they invalidate all keys to
cover reschedules and cancellations. Push notification arrival/tap does the same.
Focused screens then reconcile; post-save reconciliation shares the event read.

The stores retain up to 12 months and 32 day entries after requests settle, using
least-recently-used eviction. Pending entries temporarily defer eviction so a
slow response cannot evict the most recently visited screen. Data is not written
to persistent storage.

Admin reads request strict error handling for bookings, availability and working
hours. Failures preserve cached content and show an error, or show an initial
error rather than claiming no slots exist. Existing client callers keep their
fallback behavior. A day detail read now reuses its working-hours result instead
of fetching it again to construct default slots.

Client bookable-slot generation and booking conflict validation still query the
server directly. The cache is for admin presentation. Remote changes without an
event become visible on a stale focus/resume or manual pull; there is no polling
or new database subscription.

Validation: the calendar tests cover cache reuse, empty results, overlapping
reads, rapid month navigation, request ordering, mutation invalidation, failures,
account changes, retention, focus listener cleanup, date bounds, slot mapping,
working hours and uncached client booking checks. Physical-device behavior must
still be checked after reloading the app: visit a month twice, open and return
from time slots, save/delete availability, close/reopen a day, confirm/reschedule
a booking, and pull down to reload.
