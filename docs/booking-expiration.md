# Booking expiration checks

Expiration is still performed when bookings are read or acted on. The app now
uses one `expire_past_pending_bookings()` database RPC instead of two HTTP updates
and separate history/auth requests for each expired booking. PostgreSQL updates
due pending requests and records their history in one transaction; an audit
failure rolls back the status changes. Only rows returned by the conditional
update create history, so repeat/concurrent calls cannot double-record a transition.

The RPC uses the server clock in Asia/Manila. Clients can expire their own due
pending requests; admins can expire all due pending requests. It runs as the
caller, keeps row-level security active, pins its search path, and is granted
only to authenticated users. Future requests and confirmed bookings are preserved.
The existing expiration policy now uses the same studio time zone.

The shared coordinator reuses successful read checks, including no-op results,
for 30 seconds and joins unfinished read checks across lists/details. Failures
are not cached as success. Freshness starts when a request starts, and slower
older responses cannot extend a newer check’s freshness. Booking mutations
invalidate this metadata. An actual expiration invalidates booking data once
without invalidating the check that just completed.

Confirmation, rejection, completion, cancellation, reschedule preparation and
reschedule saving bypass this read throttle. Each action makes a fresh server
check, even if a presentation check is pending. A failed check stops the action
before any booking mutation, history or notification write. The existing owner,
status, notice, duration and overlap validation stays in place. Reads retain
their previous best-effort maintenance behavior; status presentation also follows
the booking caches’ existing refresh behavior.

Auth events restore the coordinator’s account scope without network work in the
callback. A cold call can share one local session lookup. Logout and account
switches clear recent success and queued work; obsolete responses cannot mark a
new account fresh or publish an expiration event. Same-account token refreshes
preserve recent checks.

The migration was applied to project `ywjlbiivyhedsephkhih` on October 7, 2026.
The SQL verifier exercises the installed function body and copied live RLS
policies with temporary bookings/history. It uses existing profiles only for
read-only identity/role checks and changes no real bookings or auth records.
It checks ownership, admin access, studio deadlines, repeat calls, history,
atomic rollback, signed-out calls and function permissions.

App regression checks cover coalescing, freshness, forced actions, failures,
invalidation, auth races, account switching, client owner/status filters and
admin conflict checks. Phone verification remains: open Requests and details,
cancel a pending booking, reschedule, and perform an admin status action.
