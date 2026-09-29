-- RLS hardening for PhotoSync.
-- Run this after the main schema and feature migrations.

alter table public.profiles
add column if not exists username text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, email, full_name, username)
  values (
    new.id,
    'client',
    lower(new.email),
    new.raw_user_meta_data ->> 'full_name',
    lower(nullif(trim(new.raw_user_meta_data ->> 'username'), ''))
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    username = coalesce(excluded.username, public.profiles.username);

  return new;
end;
$$;

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
$$;

drop policy if exists "Profiles are readable by signed-in users" on public.profiles;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles for select
to authenticated
using (public.is_admin());

drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can update their own profile without changing role" on public.profiles;
create policy "Users can update their own profile without changing role"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and role = (select role from public.profiles where id = auth.uid())
);

drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can insert their own client profile" on public.profiles;
create policy "Users can insert their own client profile"
on public.profiles for insert
to authenticated
with check (
  auth.uid() = id
  and role = 'client'
);

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
