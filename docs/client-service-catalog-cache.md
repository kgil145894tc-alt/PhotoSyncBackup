# Client Services and Packages

Services and every package-detail route share one account-scoped, in-memory catalog snapshot with a 60-second freshness window. The first read uses two parallel paged reads for active services and active packages, with 200 rows per page. That snapshot supplies cards, package counts, prices, inclusions, images, and service scheduling rules, so opening a package route after Services needs no additional catalog read while fresh. Deep links load the same complete snapshot. It is not persisted to disk.

Focus and foreground resume refresh stale data in the background. Pull to refresh forces a read, and concurrent focus, resume, deep-link, and pull requests share a pending fetch. Known cards remain visible while refreshing or after a failed read. Initial errors remain errors, successful empty lists show real empty states, and absent/inactive services show an unavailable state. These browsing screens no longer substitute bundled sample services or packages on failed or empty reads. Existing per-row image placeholders remain for published rows without an image. Home owns a separate account-scoped cache and reads only published highlight photos. Unused catalog fetch/cache getters and the obsolete snapshot mirror have been removed.

Both screens use a single FlatList for their hero, notices and cards. They start with eight cards and render additional cards as the viewport advances. Pull to refresh, error/empty states and current-session package selection are preserved. The cached snapshot still includes the complete catalog; virtualization reduces mounted views, not the snapshot's data. Package-route changes reset the list for the selected service.

Catalog write events invalidate both lists even while the screens are closed. Confirmed deactivation/deletion removes the relevant service/package and adjusts package counts immediately; a failed reconciliation cannot resurrect those cards. A change during a pending read discards the older success/error and reads again. Activation waits for server data rather than inventing a row. Remote edits without a local event are picked up on a stale focus/resume or manual pull; there is no polling.

Package selection uses the latest shared row, verifies its current service, and ignores old-session taps. A slug change derives its own service and packages from the snapshot without carrying the prior route's local state. Logout/account switching clears the snapshot and rejects older pending results; same-account token refreshes retain it. No requests start during render.

Booking confirmation bypasses this cache. One fresh package query checks package/service identity and activation, current price, and current duration/preparation/notice rules. An unavailable package or failed check prevents writes. If the price changed, the draft receives the server price and the review screen asks the client to review and confirm again; the first attempt inserts no booking. Discovered catalog changes invalidate browsing data. Existing fresh time-slot checks and database conflict handling remain in the submission path. This is a server read before submission, not a database transaction that locks catalog prices; no booking-price snapshot or schema changes are introduced.

The original browsing-cache change required no SQL. Catalog deletion now also
uses `archived_at` filters and a server archive operation; install
`supabase-catalog-archives.sql` on other projects. The linked PhotoSync project
is already updated. No dependency or native configuration change is required.

## Verification

Run `node --test scripts/client-service-catalog-cache.test.cjs scripts/booking-package-validation.test.cjs scripts/service-catalog.test.cjs scripts/admin-service-catalog-cache.test.cjs`, the complete script test suite, `npx expo lint`, and `npx tsc --noEmit`.

Physical-device checks remain pending:

- Visit Services, open two package routes, go back, and revisit within a minute. Loaded content should display immediately and reuse the catalog.
- Test initial offline failure, retry, an offline pull with loaded cards, a real empty catalog, and a deep link to an absent/inactive service.
- Edit/deactivate a service/package, return to the client screens, and check updated cards/counts. Test stale foreground resume and pull to refresh on Android/iOS.
- Change a package price after selection but before confirmation. The first confirmation must show the updated price without submitting; the next tap must recheck the server before submitting.
- Deactivate the selected package/service and confirm; submission must be refused. Check that duration/notice changes and booking conflicts are still enforced.
- Sign out during a pending catalog read, then sign in as another account. No previous-session data or old card tap should affect the new session.

Package counts and service/package indexing now process each package once, including confirmed activation/deactivation changes. See [the shared-service review](shared-service-optimization.md).
