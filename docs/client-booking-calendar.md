# Client booking calendar loading

Month arrows and day selections change state immediately. The focused calendar
hook owns data loading: month summaries are keyed by month, while daily slots
are keyed by date, package duration and buffer. A month change loads each source
once; a day change loads only its slots. Concurrent effect replays share unfinished
presentation reads. Returning to the screen revalidates its displayed data.

Month summaries now use the shared `get_calendar_day_summaries` server aggregate
instead of downloading monthly booking/time-slot rows. At most one row per date
crosses the API, and existing RLS still controls which records affect a client's
flags. A successful empty month remains distinct from a failed read. Install
`supabase-calendar-summaries.sql` on other projects; it is already applied to the
linked project. Daily availability and Continue/Save checks are unchanged.

Each read has a version and a focus lifetime. Responses for an earlier date,
month, package configuration or focus cannot replace current data. Slots from a
previous key are hidden immediately, including before the new effect commits.
Loading and network failures are distinct from a successfully empty day, with
retry controls for the failed source. No persistent cache is introduced.

Continue and Save Schedule always make a separate, strict server availability
read. A pending presentation request cannot satisfy that check or overwrite its
result afterward. Duplicate submissions are blocked, selection controls remain
locked during the check/save, and retained handlers cannot submit an older
selection. Navigation away cancels completion UI and draft writes. Reschedules
still use the existing server mutation, ownership/status validation and booking
conflict checks.

The current day follows the studio clock in Asia/Manila. Minimum notice and the
selected month/day advance at midnight without refetching unchanged keys on
each clock tick. Minimum notice is checked again after confirmation finishes.

Validation covers request counts, rapid navigation, response ordering, failures
and retries, package changes, focus replay, unmounts, double taps, retained
handlers, fresh confirmation, reschedule success/rejection, studio midnight and
short months. Reload the app and verify on a phone: switch months quickly,
choose several days, return from the information screen, and reschedule a booking.
