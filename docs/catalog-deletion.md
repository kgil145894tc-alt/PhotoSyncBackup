# Catalog deactivation and deletion

Temporary availability and deletion are now separate states. Turning Active off
in Edit sets `is_active = false` and keeps the item visible to admins. Turning it
back on updates the same record. Clients see only active, unarchived services and
packages belonging to those services.

The trash/Delete action calls `archive_catalog_item(entity, id)`. Its server
transaction verifies admin access, locks the record, checks booking references,
sets `archived_at`, makes the record inactive and writes the archive audit entry.
Deleting a service archives its packages as well. Records with existing bookings
cannot be deleted through this operation, including references through a child
package. No rows, booking history or historical IDs are physically removed.

Admin and client reads exclude archived rows. A confirmed archive event removes
admin cards and a deleted category's packages immediately. Failure during the
next reconciliation cannot restore the old cards. A rejected or unconfirmed
archive emits no event. Edits filter on `archived_at IS NULL`; database guards
also prevent clearing an archive timestamp or activating an archived record.
Reference guards reject new bookings/packages pointing at archived records and
hold share locks through commit to coordinate with archive updates. Booking
status updates retain their existing path. Slugs and package names can be reused
for new records after deletion through partial unique indexes; existing live
names remain unique.

The legacy trash handler wrote `service.deactivated` / `package.deactivated`,
including the short-lived version whose confirmation said Deactivate. Changes
from the Active switch instead wrote `*.updated` with an `isActive` value. The
recovery script archives only currently inactive, unarchived records whose
latest catalog-changing audit entry identifies that old removal handler (or an
explicit `*.deleted` action), and only when booking references are absent.
Later edits/reactivations and inactive rows with no usable audit history remain
unarchived. It never classifies every inactive record as deleted. The recovery
is idempotent; later archive entries and timestamps prevent repeats.

## Setup and verification

1. Run `docs/supabase-catalog-archives.sql` after the core schema/catalog setup.
2. Generate the rollback fixture using the actual canonical recovery script:
   `node scripts/catalog-archives.verify.cjs`.
3. Run the generated `.codex-catalog-archives.verify.sql` through the linked CLI
   (`npx --no-install supabase db query --linked --project-ref ywjlbiivyhedsephkhih --file .codex-catalog-archives.verify.sql --output json`).
4. After the fixture passes, run `docs/supabase-catalog-legacy-deletions.sql` for
   an existing project. Fresh projects have no legacy removals to recover.

Fixtures copy installed routines, checks and triggers onto temporary tables and
run the canonical recovery script against those copies in a rollback transaction.
They verify client/signed-out denial, repeated archives, cascades, booking
protection, stale editors, reference guards, reusable names and the distinction
between old removal, switch-off, later edits and missing audit history. They do
not create real bookings/notifications or send pushes.

The linked PhotoSync project was updated on 2026-10-07. Recovery archived four
services and six packages. Portrait Photography remained inactive and
unarchived, with its booking references intact. Final checks passed: Expo lint,
TypeScript typecheck, all 410 automated tests, Git whitespace checks and the live
rollback database fixture. Reload the app to use the new catalog queries.
Phone testing remains: disable/re-enable a service, delete
an unused service/package, revisit after refresh, try a stale editor and confirm
that a booked service cannot be deleted. Check that client screens exclude both
disabled and deleted offerings.
