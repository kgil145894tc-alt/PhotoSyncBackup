begin;

-- Keep the existing client/owner scope, using the studio clock for due requests.
alter policy "Clients can expire their own pending bookings" on public.bookings
using (
  auth.uid() = client_id
  and status = 'pending'
  and (booking_date + start_time) < (clock_timestamp() at time zone 'Asia/Manila')
);

create or replace function public.expire_past_pending_bookings()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  expired_at timestamptz := clock_timestamp();
  studio_now timestamp := expired_at at time zone 'Asia/Manila';
  expired_count integer;
begin
  if actor_id is null then
    raise exception 'Please sign in before checking bookings.' using errcode = '42501';
  end if;

  -- UPDATE/RETURNING is the only source of history rows. Concurrent calls cannot
  -- write history twice; a history failure rolls the status updates back too.
  with expired as (
    update public.bookings
    set status = 'expired'
    where status = 'pending'
      and (booking_date, start_time) < (studio_now::date, studio_now::time)
      and (client_id = actor_id or (select public.is_admin()))
    returning id, booking_date, start_time, end_time
  )
  insert into public.booking_status_history (booking_id, status, changed_by, reason, metadata, created_at)
  select id, 'expired', actor_id,
    'Booking request expired after the scheduled start time passed.',
    jsonb_build_object('bookingDate', booking_date, 'startTime', start_time,
      'endTime', end_time, 'expiredAt', expired_at), expired_at
  from expired;

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.expire_past_pending_bookings() from public, anon;
grant execute on function public.expire_past_pending_bookings() to authenticated;

commit;
