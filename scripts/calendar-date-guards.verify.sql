-- Run after docs/supabase-calendar-date-guards.sql in Supabase SQL Editor.
-- Exercises the installed function on a temporary table, never business records.
begin;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.time_slots'::regclass
      and tgname = 'guard_calendar_slot_date' and tgenabled = 'O'
      and tgfoid = 'public.guard_calendar_slot_date()'::regprocedure
  ) then
    raise exception 'Calendar date guard is not installed/enabled on public.time_slots';
  end if;
end;
$$;

create temporary table calendar_guard_probe (
  id integer primary key,
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null
);
-- Existing historical records must remain readable after adding the guard.
insert into calendar_guard_probe values
  (1, (clock_timestamp() at time zone 'Asia/Manila')::date - 1, '09:00', '10:00', 'available');
create trigger guard_probe_date before insert or update or delete on calendar_guard_probe
for each row execute function public.guard_calendar_slot_date();

do $$
declare
  studio_now timestamp := clock_timestamp() at time zone 'Asia/Manila';
  today date := studio_now::date;
begin
  if (select count(*) from calendar_guard_probe where id = 1) <> 1 then
    raise exception 'Historical record disappeared';
  end if;
  begin
    insert into calendar_guard_probe values (2, today - 1, '11:00', '12:00', 'available');
    raise exception 'Past date insert was accepted';
  exception when check_violation then null;
  end;
  begin
    update calendar_guard_probe set slot_date = today + 1 where id = 1;
    raise exception 'Historical row was moved to a future date';
  exception when check_violation then null;
  end;
  begin
    delete from calendar_guard_probe where id = 1;
    raise exception 'Historical row was deleted';
  exception when check_violation then null;
  end;
  begin
    insert into calendar_guard_probe values (3, today, '00:00', '23:59', 'available');
    raise exception 'Elapsed start today was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into calendar_guard_probe values (4, today + 1, '10:00', '09:00', 'available');
    raise exception 'Reversed time range was accepted';
  exception when check_violation then null;
  end;
  insert into calendar_guard_probe values (5, today + 1, '09:00', '10:00', 'available');
  update calendar_guard_probe set start_time = '09:30' where id = 5;
  begin
    update calendar_guard_probe set slot_date = today - 1 where id = 5;
    raise exception 'Future row was moved to a past date';
  exception when check_violation then null;
  end;
  delete from calendar_guard_probe where id = 5;
  -- Closing and reopening today remain allowed even though midnight has passed.
  insert into calendar_guard_probe values (6, today, '00:00', '23:59', 'unavailable');
  delete from calendar_guard_probe where id = 6;
  if studio_now::time < time '23:57:00' then
    insert into calendar_guard_probe values (7, today,
      (studio_now + interval '1 minute')::time, (studio_now + interval '2 minutes')::time, 'available');
    begin
      update calendar_guard_probe set start_time = '00:00' where id = 7;
      raise exception 'Today update to an elapsed start was accepted';
    exception when check_violation then null;
    end;
    delete from calendar_guard_probe where id = 7;
  end if;
end;
$$;

select 'PASS: historical reads, rejected past insert/update/delete and elapsed start, future edits, and today closure/reopen' as result;
rollback;
