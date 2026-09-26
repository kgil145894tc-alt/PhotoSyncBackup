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

alter table public.studio_settings enable row level security;

drop policy if exists "Admins can manage studio settings" on public.studio_settings;
create policy "Admins can manage studio settings"
on public.studio_settings for all
to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Signed in users can read studio settings" on public.studio_settings;
create policy "Signed in users can read studio settings"
on public.studio_settings for select
to authenticated
using (true);

insert into public.studio_settings (id, studio_name)
values (true, 'PhotoSync Studio')
on conflict (id) do nothing;
