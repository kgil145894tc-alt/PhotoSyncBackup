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

alter table public.time_slots enable row level security;

drop policy if exists "Time slots are readable by signed-in users" on public.time_slots;
create policy "Time slots are readable by signed-in users"
on public.time_slots for select
to authenticated
using (true);

drop policy if exists "Admins can manage time slots" on public.time_slots;
create policy "Admins can manage time slots"
on public.time_slots for all
to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
