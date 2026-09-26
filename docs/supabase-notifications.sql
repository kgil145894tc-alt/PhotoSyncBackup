drop policy if exists "Signed-in users can create notifications" on public.notifications;
drop policy if exists "Clients can create admin booking notifications" on public.notifications;
create policy "Clients can create admin booking notifications"
on public.notifications for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    join public.profiles recipient on recipient.id = notifications.user_id
    where b.id = notifications.booking_id
      and b.client_id = auth.uid()
      and recipient.role = 'admin'
  )
);

drop policy if exists "Admins can create client booking notifications" on public.notifications;
create policy "Admins can create client booking notifications"
on public.notifications for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = notifications.booking_id
      and b.client_id = notifications.user_id
  )
  and public.is_admin()
);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
on public.notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
