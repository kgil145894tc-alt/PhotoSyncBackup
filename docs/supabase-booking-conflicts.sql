create unique index if not exists bookings_active_slot_key
on public.bookings (booking_date, start_time, end_time)
where status in ('pending', 'confirmed');

create or replace function public.get_active_booking_slots(
  p_booking_date date,
  p_excluded_booking_id uuid default null
)
returns table (
  id uuid,
  start_time time,
  end_time time
)
language sql
security definer
set search_path = public
as $$
  select bookings.id, bookings.start_time, bookings.end_time
  from public.bookings
  where bookings.booking_date = p_booking_date
    and bookings.status in ('pending', 'confirmed')
    and (
      p_excluded_booking_id is null
      or bookings.id <> p_excluded_booking_id
    );
$$;

revoke all on function public.get_active_booking_slots(date, uuid) from public;
grant execute on function public.get_active_booking_slots(date, uuid) to authenticated;
