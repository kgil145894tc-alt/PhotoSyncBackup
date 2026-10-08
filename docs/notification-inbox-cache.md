# Notification inbox cache

Admin and client Notifications use one in-memory store for the current authenticated account. All and Unread each retain their own list, errors, loaded page size, and 30-second freshness timestamp; the unread count is shared.

Returning to a loaded filter or reopening the inbox within 30 seconds reuses data. A stale focus or app resume refreshes in the background while keeping existing notifications visible. Pull to refresh bypasses freshness. Concurrent requests for a filter share one fetch.

“Show older updates” still requests 30 additional items. Subsequent refreshes retain that loaded depth; failed pagination keeps the previous list and limit. The full-inbox unread count continues to come from the server.

Read actions use the existing server APIs. Only successful writes mark cached items read, remove them from Unread, and adjust the count. Both filters are invalidated for later reconciliation. A focused inbox refreshes after the write to refill its visible list. Writes finishing after navigation still patch the shared cache. Responses started before a write cannot undo it, and failed writes retain existing data.

Booking change events and push arrival/tap events invalidate both filters, including while the inbox is closed. A focused inbox refreshes after these events. Session events clear lists, counts, pagination, and pending results on logout/account switching. Same-account token refreshes preserve data. No data is persisted to disk.

The admin dashboard uses the same unread count through `useNotificationUnreadCount`. Returning within 30 seconds shows the cached badge and statistic immediately. Stale focus/resume, booking changes, and notification arrival/tap events refresh the count without downloading notification messages. Overlapping dashboard and inbox count reads share one pending count query; fresh inbox counts are reused by the dashboard and vice versa. A slower page response cannot overwrite a newer count or extend an older count's freshness.

Successful read actions update the dashboard count immediately, including when the inbox has closed. Pre-write reads cannot undo confirmed changes. Count refresh errors retain the last known count and show a retry message; an unknown initial count is displayed as a dash instead of claiming zero. Dashboard pull to refresh forces both its bookings and notification count, and its refresh indicator stays active while either request is pending. Session changes clear the shared count and discard older pending results.

Client Home also uses `useNotificationUnreadCount`. Home and Notifications reuse the same account-scoped count for 30 seconds, share overlapping count requests, and reflect accepted individual/bulk read actions immediately. Home focus/resume, booking events and push arrival/tap refresh only the count. A known count remains visible during updates and failed reads. An unknown count has no numeric badge and never announces zero; a known zero has no badge and is announced as zero unread. The badge still caps at `99+`, while accessibility announces the actual count. Count errors show a temporary tap-to-retry control under the header; retry only forces the count, without reloading inbox messages or service highlights. Session changes clear Home's badge and discard older results.

The freshness window is not polling. Remote changes without a push/event appear on a stale focus/resume or manual refresh. This improvement requires no SQL, native configuration, or dependency changes.

## Verification

Run `npx expo lint`, `npx tsc --noEmit`, and:

```sh
node --test scripts/notification-unread-count.test.cjs scripts/notification-inbox-cache.test.cjs scripts/admin-dashboard.test.cjs scripts/auth-routing.test.cjs scripts/notifications.test.cjs
```

Device checks: reopen Notifications and switch between previously loaded filters within 30 seconds; mark one/all read; open a linked booking during a read action; load older updates; pull down to refresh; try a refresh while offline; receive a push; and sign out then sign in as a different account. Cached content should remain visible during refreshes, and account changes must show no previous-account content.

For the admin dashboard, note the badge and New Notification statistic, mark one/all read in Notifications, and return. Both should reflect the confirmed write immediately. Receive a push while the dashboard is open and verify the count updates. Pull down to refresh and test an offline refresh with a previously loaded badge; the previous count should remain visible. Physical-device validation is still required.

For client Home, note the badge, visit Notifications and mark one/all read, then return within 30 seconds. The badge should reflect the accepted write and reuse the shared count. Receive a push while Home is open, and test stale app resume. With a known badge, force a count read while offline and verify it is retained; tap the error message after reconnecting to retry. Sign out during a pending count read and sign in as another account; the previous count must not appear. Check the notification button still opens Notifications. Physical-device validation remains pending.
