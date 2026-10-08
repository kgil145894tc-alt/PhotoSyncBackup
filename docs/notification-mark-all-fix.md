# Mark all notifications as read

The live notifications table had SELECT and INSERT policies but no UPDATE policy.
The direct table update therefore changed no rows without returning an error.
Individual reads worked because `mark_my_notification_read` uses an explicit
`auth.uid()` ownership check inside a database function.

`markAllNotificationsRead` now calls `mark_all_my_notifications_read`. This
function marks the signed-in user's unread notifications in a single statement
and returns the number changed. Zero is a successful already-read inbox.
Notifications arriving after the statement remain unread and are picked up by
the existing inbox reconciliation; they do not turn a saved update into an error.

The bulk function was installed in project `ywjlbiivyhedsephkhih`. Its definition
is included in `docs/supabase-mark-notification-read.sql` for other installations.
It accepts no account argument, rejects missing authentication, has an empty
search path, and grants execution only to authenticated callers. The deployment
added this function without changing the existing table policies or read states.

Older installations missing the bulk function use a compatibility path: fetch
all unread IDs with keyset pagination, verify returned IDs from direct batch
updates, and repair skipped updates using the existing individual function.
These repair calls run at most five at a time. Actual server failures stay errors.

Validation:

- `npx expo lint` and `npx tsc --noEmit` passed.
- All 78 existing and updated Node tests passed, including 16 notification service
  cases for bulk saves, legacy policies, pagination, failures and account changes.
- `scripts/notification-mark-all.verify.sql` passed against the live database.
  It checks own-inbox writes, other-account protection, repeated reads,
  authentication and function grants inside a transaction that rolls back every
  notification change. It creates no notifications or push messages.

Reload the development app to pick up the updated service. The mobile button
itself has not been verified on a connected device in this session.
