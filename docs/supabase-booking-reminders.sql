-- Legacy setup entry point retained for old links.
-- Run docs/supabase-scheduled-booking-reminders.sql instead, then verify with
-- scripts/scheduled-reminders.verify.sql and enable docs/supabase-reminder-schedule.sql.
-- Do not recreate the old current_date/check-then-insert implementation: it
-- would replace the Manila-time, duplicate-safe authenticated app wrapper.
do $$ begin
  if to_regprocedure('public.generate_booking_reminders(uuid,timestamptz)') is null then
    raise exception 'Run docs/supabase-scheduled-booking-reminders.sql, then docs/supabase-reminder-schedule.sql. See docs/supabase-setup.md.';
  end if;
end; $$;
