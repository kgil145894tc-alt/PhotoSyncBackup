alter table public.profiles
add column if not exists email text;

drop policy if exists "Admins can read all bookings" on public.bookings;
create policy "Admins can read all bookings"
on public.bookings for select
to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Admins can update booking status" on public.bookings;
create policy "Admins can update booking status"
on public.bookings for update
to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
