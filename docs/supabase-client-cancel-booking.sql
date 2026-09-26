drop policy if exists "Clients can cancel their own bookings" on public.bookings;

create policy "Clients can cancel their own bookings"
on public.bookings for update
to authenticated
using (
  auth.uid() = client_id
  and status = 'pending'
)
with check (
  auth.uid() = client_id
  and status = 'cancelled'
);
