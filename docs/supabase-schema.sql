create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('client', 'admin')),
  avatar_url text,
  email text,
  full_name text,
  phone text,
  username text,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  description text,
  duration_minutes integer,
  buffer_minutes integer not null default 30,
  minimum_notice_days integer not null default 1,
  price numeric(10, 2),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null,
  badge text,
  price numeric(10, 2) not null,
  inclusions text[] not null default '{}',
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid references public.services(id),
  package_id uuid references public.packages(id),
  contact_name text,
  contact_email text,
  contact_phone text,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired')),
  notes text,
  people_count text,
  shoot_location text,
  session_theme text,
  special_requests text,
  created_at timestamptz not null default now()
);

create table if not exists public.time_slots (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'available' check (status in ('available', 'unavailable')),
  reason text,
  created_at timestamptz not null default now(),
  unique (slot_date, start_time, end_time)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  status text not null check (status in ('pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired')),
  changed_by uuid references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.booking_status_history (booking_id, status, changed_by, reason, metadata, created_at)
select
  b.id,
  b.status,
  null,
  b.rejection_reason,
  jsonb_build_object(
    'bookingDate', b.booking_date,
    'startTime', b.start_time,
    'endTime', b.end_time,
    'backfilled', true
  ),
  b.created_at
from public.bookings b
where not exists (
  select 1
  from public.booking_status_history h
  where h.booking_id = b.id
);

create extension if not exists btree_gist;

alter table public.bookings
drop constraint if exists no_overlapping_confirmed_bookings;

alter table public.bookings
add constraint no_overlapping_confirmed_bookings
exclude using gist (
  tsrange(
    (booking_date + start_time)::timestamp,
    (booking_date + end_time)::timestamp,
    '[)'
  ) with &&
)
where (status = 'confirmed');

create table if not exists public.studio_settings (
  id boolean primary key default true,
  studio_name text not null default 'PhotoSync Studio',
  studio_address text,
  contact_phone text,
  contact_email text,
  default_shoot_location text,
  business_hours text,
  updated_at timestamptz not null default now(),
  constraint studio_settings_singleton check (id)
);

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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

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

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.packages enable row level security;
alter table public.bookings enable row level security;
alter table public.time_slots enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.studio_settings enable row level security;

create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "Admins can read all profiles"
on public.profiles for select
to authenticated
using (public.is_admin());

create policy "Users can update their own profile without changing role"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and role = (select role from public.profiles where id = auth.uid())
);

create policy "Users can insert their own client profile"
on public.profiles for insert
to authenticated
with check (
  auth.uid() = id
  and role = 'client'
);

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(username))
where username is not null and username <> '';

create policy "Active services are public"
on public.services for select
to anon, authenticated
using (is_active = true);

create policy "Active packages are public"
on public.packages for select
to anon, authenticated
using (is_active = true);

create policy "Admins can manage services"
on public.services for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage packages"
on public.packages for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Clients can create their own bookings"
on public.bookings for insert
to authenticated
with check (auth.uid() = client_id);

create policy "Clients can read their own bookings"
on public.bookings for select
to authenticated
using (auth.uid() = client_id);

create policy "Admins can read all bookings"
on public.bookings for select
to authenticated
using (public.is_admin());

create policy "Admins can update booking status"
on public.bookings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

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

create policy "Clients can expire their own pending bookings"
on public.bookings for update
to authenticated
using (
  auth.uid() = client_id
  and status = 'pending'
  and (booking_date + start_time) < (clock_timestamp() at time zone 'Asia/Manila')
)
with check (
  auth.uid() = client_id
  and status = 'expired'
);

create policy "Time slots are readable by signed-in users"
on public.time_slots for select
to authenticated
using (true);

create policy "Admins can manage time slots"
on public.time_slots for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Users can read their own notifications"
on public.notifications for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can update their own notifications"
on public.notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

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

create policy "Admins can read audit logs"
on public.audit_logs for select
to authenticated
using (public.is_admin());

create policy "Admins can create audit logs"
on public.audit_logs for insert
to authenticated
with check (public.is_admin());

create policy "Clients can read their own booking status history"
on public.booking_status_history for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_status_history.booking_id
      and b.client_id = auth.uid()
  )
);

create policy "Admins can read booking status history"
on public.booking_status_history for select
to authenticated
using (public.is_admin());

create policy "Users can create status history for their own bookings"
on public.booking_status_history for insert
to authenticated
with check (
  changed_by = auth.uid()
  and exists (
    select 1
    from public.bookings b
    where b.id = booking_status_history.booking_id
      and b.client_id = auth.uid()
  )
);

create policy "Admins can create booking status history"
on public.booking_status_history for insert
to authenticated
with check (
  public.is_admin()
  and changed_by = auth.uid()
);

create policy "Admins can manage studio settings"
on public.studio_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Signed in users can read studio settings"
on public.studio_settings for select
to authenticated
using (true);
