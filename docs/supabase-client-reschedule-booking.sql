drop policy if exists "Clients can reschedule their own bookings" on public.bookings;

create policy "Clients can reschedule their own bookings"
on public.bookings for update
to authenticated
using (
  auth.uid() = client_id
  and status in ('pending', 'confirmed')
)
with check (
  auth.uid() = client_id
  and status = 'pending'
);
