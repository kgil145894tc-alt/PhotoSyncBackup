begin;
-- Install the reminder routines first, then verify before enabling the job.
do $$ begin
  if to_regprocedure('public.run_scheduled_booking_reminders()') is null then
    raise exception 'Install supabase-scheduled-booking-reminders.sql first';
  end if;
end; $$;
create extension if not exists pg_cron with schema pg_catalog;
-- Named scheduling is idempotent. Already-generated rows neither duplicate
-- notifications nor retrigger push delivery. pg_cron schedules use UTC.
select cron.schedule('photosync-booking-reminders', '0 * * * *', 'select public.run_scheduled_booking_reminders();');
commit;
