# Admin Profile and Studio Settings

Admin Profile contains the Studio Information editor. Both use one account-scoped, in-memory settings snapshot with a 60-second freshness window. Returning to the screen displays saved settings immediately. Focus and foreground resume fetch only stale data; pulling down forces a read. Concurrent reads share one request. No fetching starts during render.

The admin store uses strict settings reads: database errors show an error instead of editable defaults. An actual missing singleton row still supplies the existing initial-setup defaults. Failed background reads retain saved information, and initial loading/errors prevent saving. Other booking and notification callers retain their existing settings-read behavior.

Edited fields live in a separate form draft. A background read or pull updates untouched fields and preserves typed text. Fields and Save are disabled during a save. A failed save retains the draft for retry. Successful saves return and cache the database row directly, clear the draft, and invalidate calendar working hours through the existing calendar event. Unchanged values avoid a write. Older reads cannot overwrite a confirmed save, so saving needs no follow-up settings read. The working-hours parser now ignores the weekday prefix before splitting the time range; the hyphen in `Mon-Sat` previously caused saved hours to revert to default hours on reads.

Sign-out and account changes clear the snapshot and advance a session key. The editor resets its draft and notices on that key, including a new login with the same account. Pending reads/writes from an earlier session cannot update the current cache; async screen handlers check mounting before updating local state. The cache is not persisted to disk.

Validation: `node --test scripts/admin-studio-settings-cache.test.cjs scripts/studio-settings.test.cjs scripts/calendar-service.test.cjs`, then the full script test suite, `npx expo lint`, and `npx tsc --noEmit`.

Device checks: revisit Profile within a minute, pull with an unsaved name, background and resume after a minute, save new working hours and reopen Calendar, retry after a network failure, and sign out/in. Automated tests do not replace these physical-device checks.
