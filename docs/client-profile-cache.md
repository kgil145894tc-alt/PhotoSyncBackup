# Client Profile and Edit Profile

Both screens share an account-scoped, in-memory profile snapshot with a 60-second freshness window. Revisiting either screen shows known details immediately. Focus and foreground resume only read stale data; pull to refresh forces a read. Concurrent reads share one request, and no fetching starts during render. The cache is not persisted to disk.

The cache uses strict profile reads. Database/auth failures show an error rather than replacing known information with metadata-based defaults. An actually missing database row retains the existing account-based setup defaults. Booking Information continues to use its existing profile-read behavior. Initial loading/errors without a profile disable Edit Profile and saving, while navigation and logout remain available. Failed background reads retain loaded details and offer an error-only retry control. There is no permanent refresh button.

Edit Profile keeps only edited fields in a separate local draft. Background reads and pulls update untouched fields, including the reference email, without overwriting typed names, usernames, phone numbers, passwords, or the selected photo. Editing, saving, back/cancel, and manual refresh are blocked during a save. Failed saves preserve the draft. A successfully uploaded photo is reused on a failed profile-write retry, avoiding a second upload in that editor session.

Profile saves keep the existing server validation and return the database row from the write. The cache uses that row without a follow-up profile read. Older reads cannot undo the save. A failed role check prevents a write instead of guessing a client role. Profile database writes, account metadata updates, and password changes remain separate server operations: if a later step fails, the confirmed profile row remains cached and the message explains that the profile was saved while the later step failed.

Logout and account switches clear the cache, pending results, and keyed editor/overview state. Same-account token updates retain cached information and drafts. Old-session handlers cannot refresh/save, delayed responses cannot populate another account, and service guards check the expected account/session before starting later writes after authentication, role checks, or photo preparation. A server request already sent can finish for its original account; it cannot update a newer local session. Async screen handlers check mounting and session identity before showing notices, navigating, or changing local state. Password and selected-photo drafts remain in the editor only.

No SQL, dependency, native configuration, or deployment changes are required.

## Verification

Run `node --test scripts/client-profile-cache.test.cjs scripts/logout.test.cjs`, the complete script test suite, `npx expo lint`, and `npx tsc --noEmit`.

Physical-device checks remain pending:

- Open Profile, Edit Profile, and return within a minute; saved details should appear immediately without repeat reads.
- Type a name/password and choose a photo, then pull or background/resume after a minute. Draft fields and the photo must remain; untouched fields may update.
- Save a name, username, phone, and photo; return to Profile and verify the confirmed values. Test a taken username, offline reads/writes, and password-update failure.
- Sign out during a delayed read/upload/save, then sign in as another account. No old profile or draft should appear. Logout should still reach Login.
- Test pull to refresh on Android and iOS, including short content, and verify error-only retry plus back/cancel behavior.
