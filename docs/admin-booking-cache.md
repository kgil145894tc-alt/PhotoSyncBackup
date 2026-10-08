# Admin booking pages and details

Requests and Dashboard use the [booking paging cache](booking-pagination.md). The former unpaged list hook, store and read adapter have been retired.

Booking details use useAdminBookingDetail, adminBookingDetailStore and createAdminBookingDetailCache. Fresh rows from the current session's paging cache can seed a detail entry for the remainder of its 30-second freshness window. Missing or stale entries fetch only the requested ID. Parallel visits to the same ID share a read. Missing bookings are distinct from failed reads; errors retain known content.

Details retain at most 24 idle entries, evicting least recently visited entries. Pending reads/writes are retained until they finish, then trimmed. Booking and notification events invalidate freshness even while the screen is closed. Logout/account changes clear entries and reject queued or late reads/writes. Same-account token refreshes preserve data.

Confirmation, rejection and completion still call the server service and retain conditional status checks, duration, notice and availability validation. Working hours are read fresh when needed. A failed check prevents a write. Only accepted writes patch the detail; failures or unavailable returning rows reconcile with a fresh single-booking read. Old responses cannot reverse a newer accepted write, including after an entry is evicted.

Automated coverage lives in scripts/admin-booking-detail.test.cjs, scripts/admin-dashboard.test.cjs and scripts/booking-pagination.test.cjs. Device testing should include detail links, stale/pull/offline refreshes, decisions and logout during requests.
