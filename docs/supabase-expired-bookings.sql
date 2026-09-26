alter table public.bookings
drop constraint if exists bookings_status_check;

alter table public.bookings
add constraint bookings_status_check
check (status in ('pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired'));

alter table public.booking_status_history
drop constraint if exists booking_status_history_status_check;

alter table public.booking_status_history
add constraint booking_status_history_status_check
check (status in ('pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired'));

drop policy if exists "Clients can expire their own pending bookings" on public.bookings;
create policy "Clients can expire their own pending bookings"
on public.bookings for update
to authenticated
using (
  auth.uid() = client_id
  and status = 'pending'
  and (
    booking_date < current_date
    or (
      booking_date = current_date
      and start_time < localtime
    )
  )
)
with check (
  auth.uid() = client_id
  and status = 'expired'
);

update public.bookings
set status = 'expired'
where status = 'pending'
  and (
    booking_date < current_date
    or (
      booking_date = current_date
      and start_time < localtime
    )
  );
