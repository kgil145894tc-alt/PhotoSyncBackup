begin;

create index if not exists time_slots_summary_date_idx on public.time_slots(slot_date);

-- Aggregate before PostgREST's row limit; preserve each caller's existing RLS.
create or replace function public.get_calendar_day_summaries(p_month date)
returns table(date date, has_available boolean, has_booked boolean, has_full_day_unavailable boolean, has_unavailable boolean)
language plpgsql stable security invoker set search_path = pg_catalog as $$
declare month_end date;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'A month must start on its first day' using errcode = '22023';
  end if;
  month_end := (p_month + interval '1 month')::date;
  return query
  select flags.day, bool_or(flags.available), bool_or(flags.booked), bool_or(flags.closed), bool_or(flags.unavailable)
  from (
    select b.booking_date as day, false as available, true as booked, false as closed, false as unavailable
    from public.bookings b where b.status = 'confirmed' and b.booking_date >= p_month and b.booking_date < month_end
    union all
    select s.slot_date, s.status = 'available', false,
      s.status = 'unavailable' and s.start_time = time '00:00' and s.end_time = time '23:59', s.status = 'unavailable'
    from public.time_slots s where s.slot_date >= p_month and s.slot_date < month_end
  ) flags
  group by flags.day order by flags.day;
end;
$$;
revoke all on function public.get_calendar_day_summaries(date) from public, anon;
grant execute on function public.get_calendar_day_summaries(date) to authenticated;
commit;
