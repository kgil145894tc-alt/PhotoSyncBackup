-- Apply after supabase-calendar.sql, on existing and new projects.
-- Preserves historical rows. Uses the same studio timezone as calendar-date-guards.ts.
begin;

create or replace function public.guard_calendar_slot_date()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  studio_now timestamp := clock_timestamp() at time zone 'Asia/Manila';
  full_day_closure boolean;
begin
  -- Guard the original record too: an UPDATE cannot move a historical row forward.
  if tg_op in ('UPDATE', 'DELETE') then
    if old.slot_date < studio_now::date then
      raise exception using errcode = '23514', message = 'Past dates are read-only. Select today or a future date.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.slot_date < studio_now::date then
    raise exception using errcode = '23514', message = 'Past dates are read-only. Select today or a future date.';
  end if;
  if new.start_time >= new.end_time then
    raise exception using errcode = '23514', message = 'End time must be later than start time.';
  end if;

  -- This existing sentinel closes a whole day, including today's remaining time.
  full_day_closure := new.status = 'unavailable'
    and new.start_time = time '00:00:00' and new.end_time = time '23:59:00';
  if new.slot_date = studio_now::date and not full_day_closure
    and new.start_time <= studio_now::time then
    raise exception using errcode = '23514', message = 'This start time has already passed. Choose a later time.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_calendar_slot_date on public.time_slots;
create trigger guard_calendar_slot_date
before insert or update or delete on public.time_slots
for each row execute function public.guard_calendar_slot_date();

commit;
