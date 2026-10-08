# Client booking pages

My Bookings uses usePagedClientBookings and the client instance of the [booking paging cache](booking-pagination.md). The former unpaged hook, cache, store, full-list service reader and latest-booking wrapper have been retired. No screen can accidentally import those paths.

Thirty-row pages, server-side status/date filters, exact first-page counts and direct booking-ID reads preserve full results without downloading all bookings. Fresh filter pages are reused for 30 seconds. Native pull restarts at the newest page; Load more uses the next cursor. Focus, resume and booking/push events refresh stale data while retaining accepted cards. Errors remain distinct from empty results. Logout/account changes clear pages and discard queued or late work.

Cancellation still uses a conditional ID/owner/pending-status server write. Cached status cannot authorize it. Accepted writes patch the matching row and invalidate affected queries before reconciliation. Reschedule preparation and submission retain live package/service rules, ownership/status checks, duration, notice and conflicts. Studio-hours validation bypasses the browsing cache and stops the action if the read fails.

Automated action and screen coverage lives in scripts/client-booking-actions.test.cjs; paging and session-race coverage lives in scripts/booking-pagination.test.cjs. Device testing remains necessary for native scrolling, pull refresh, Load more, filters, notification links and cancellation/rescheduling.
