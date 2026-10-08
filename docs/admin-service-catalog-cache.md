# Admin services and packages

The admin Services screen now shares an account-scoped, memory-only snapshot of
categories and packages. Successful data, including an empty catalog, stays fresh
for 60 seconds. Returning to the screen or switching between category and package
views displays cached content immediately. Focus and app resume reload stale
data, and pull-to-refresh forces a read while retaining previously loaded cards.

`getAdminServiceCatalog` reads services and packages with two parallel paged database
reads (200 records per page). The same returned package list supplies active package counts; package
rules come from its service row. Both reads must succeed before the cache accepts
the snapshot. Missing configuration and network errors are errors, and an empty
database returns empty lists instead of bundled sample records.

Successful category/package saves, activation and deletion emit catalog events.
The singleton store listens even while screens are closed. Events invalidate both
lists, so prices, rules and category counts reconcile together. Confirmed status
changes also patch visibility and package counts immediately; a failed follow-up
read cannot make a deleted item reappear. Failed writes and updates returning no
saved row report failure and do not emit an event.

Overlapping focus, resume, pull and post-save reads share one pending request.
A mutation during that request causes another read before its result is accepted.
Read failures preserve the previous snapshot with a visible error. Logout or
account changes clear data and reject older responses. The UI also resets forms,
pending confirmations and category selection when its account key changes, and
mounted guards prevent late asynchronous handlers updating closed forms.

Client catalog APIs, booking submission, availability validation and deletion
checks for existing bookings keep their server paths. This cache is used only by
the admin screen. Remote catalog edits without a local event appear on a stale
focus/resume or pull-to-refresh; there is no polling or persistent storage.

Categories and packages now share one FlatList with an initial render batch of
eight cards. Switching views changes its data and resets the list. The header,
loading/error/empty states and native pull refresh belong to the same vertical
scroll surface; form modals keep their own scroll views. Selection, editing,
deletion and form state stay in the screen, so recycling an offscreen card does
not discard an open edit. Counts still come from the complete cached snapshot.

Admin lists include inactive services and packages. Disabling an item does not
remove its management card or change the selected category. Inactive cards show
`Inactive · Edit to enable`; open Edit, turn Active on and save to reactivate the
same record. Inactive parent categories remain available to the package form.
The package-view header counts all displayed packages, including inactive ones.
The Active switch in Edit controls temporary availability. The trash action now
uses a separate, confirmed Delete operation: the server sets `archived_at`, makes
the item inactive, checks booking references and writes an audit entry atomically.
Deleting a service also archives its packages. Archived records are excluded
from both catalog queries and admin cache reconciliation. Confirmed archive
events remove the affected cards immediately, including if the next read fails.
Stale edit forms cannot match an archived record or clear its archive timestamp.
Client catalog reads still exclude inactive services/packages, and booking
submission continues to check both statuses and archive state on the server.
Rows and historical IDs remain stored; no database record is reactivated
automatically. See [catalog deletion](catalog-deletion.md) for SQL and legacy
removal recovery. The linked project already has this database change.

Validation covers reuse and expiry, empty/error states, request deduplication,
mutation races, account changes, confirmed deletion patches, inactive records,
server prices/rules/images, save failures, existing-booking deletion checks,
view switching, form reset, handler cleanup and 150-row virtualized lists with
offscreen selection/editing. Physical-device verification
remains: revisit Services, switch to packages, save an edit, delete an unused
package/category, pull down, and sign out/in while a read is pending.

Package counts and service/package indexing now process each package once, including confirmed activation/deactivation changes. See [the shared-service review](shared-service-optimization.md).
