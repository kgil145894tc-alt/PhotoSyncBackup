# Booking and notification pagination

Admin Requests and My Bookings fetch 30 rows at a time. Server filters run before the limit, and a `(created_at, id)` cursor keeps equal timestamps and new arrivals from shifting later pages. Each page uses one lookahead row to decide whether Load more is available. Pull-to-refresh restarts at the newest page; returning to a fresh filter retains its loaded pages.

`get_booking_page` supplies exact status counts on the first page, independent of page size and Supabase's API row cap. Client Approved includes confirmed/completed; client Cancelled includes cancelled/rejected/expired. Admin statuses retain their exact meanings. The dashboard uses exact pending/today/upcoming totals and returns only three appointment cards. Date filters use Asia/Manila.

Both lists use FlatList as their vertical scrolling surface. My Bookings disables MobilePage's outer ScrollView in collection mode. Detail mode retains its existing native pull-to-refresh. IDs outside loaded pages are fetched directly; fresh visible rows can seed details. Confirmation, rejection, completion, cancellation and rescheduling still use their existing server checks.

The paging cache is scoped to the login generation, shares pending reads per query, rejects obsolete responses after invalidation, retains cards on failures, deduplicates page overlaps, and bounds retained search/filter entries to twelve. Booking and push events invalidate caches even while screens are closed. Logout clears rows, cursors and pending results.

Notification Load more now always requests the next 30 rows, preserving its cursor when unread items are marked read. It reuses the shared unread-count request. Reminder maintenance runs on the initial notification page rather than every Load more. A pull resets to the first page. Existing marking and account-safety behavior is preserved.

## Database setup and verification

Run `docs/supabase-booking-pagination.sql` after the existing schema and booking expiration setup. It adds a read-only SECURITY INVOKER RPC and paging indexes; existing RLS policies and mutation routines stay in force. The function pins its search path and uses a custom query plan for each combination of scope, filter and dashboard ordering. This SQL was applied to the linked PhotoSync project on 2026-10-07.

`scripts/booking-pagination.verify.sql` copies the installed routine and SELECT policies onto temporary fixture tables, checks 2,005 bookings, and rolls everything back. It covers exact totals above the API cap, equal timestamps, all pages, ownership, admin authorization, direct detail links, grouped filters, search/date filtering, literal wildcard input, concurrent head insertion, dashboard fallback, grants and cursor validation. No real business rows are modified.

## Shared-service improvements completed on 2026-10-07

The four findings from the earlier review are implemented. [Shared-service optimization and final review](shared-service-optimization.md) describes reminder coordination, studio-settings reuse, catalog processing and legacy booking cleanup, including remaining opportunities.

Phone testing is still needed for scrolling, pull refresh, Load more, filter changes, notification detail links and booking actions.
