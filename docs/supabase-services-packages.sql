alter table public.services
add column if not exists slug text;

alter table public.services add column if not exists archived_at timestamptz;
alter table public.packages add column if not exists archived_at timestamptz;

alter table public.packages
add column if not exists badge text;

alter table public.services
add column if not exists buffer_minutes integer not null default 30;

alter table public.services
add column if not exists minimum_notice_days integer not null default 1;

create unique index if not exists services_slug_key
on public.services (slug);

create unique index if not exists packages_service_name_key
on public.packages (service_id, name);

drop policy if exists "Admins can manage services" on public.services;
create policy "Admins can manage services"
on public.services for all
to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Admins can manage packages" on public.packages;
create policy "Admins can manage packages"
on public.packages for all
to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

update public.services
set slug = case name
  when 'Portrait Photography' then 'portrait-photography'
  when 'Wedding Photography' then 'wedding-photography'
  when 'Event Photography' then 'event-photography'
  when 'Graduation Photography' then 'graduation-photography'
  when 'Family Photography' then 'family-photography'
  when 'Videography' then 'videography'
  else slug
end
where slug is null
  and name in (
    'Portrait Photography',
    'Wedding Photography',
    'Event Photography',
    'Graduation Photography',
    'Family Photography',
    'Videography'
  );

insert into public.services (slug, name, description, duration_minutes, buffer_minutes, minimum_notice_days, price, is_active)
values
  ('portrait-photography', 'Portrait Photography', 'Individual, family and creative portraits.', 60, 30, 1, 500, true),
  ('wedding-photography', 'Wedding Photography', 'Timeless photos for your love story.', 180, 30, 7, 800, true),
  ('event-photography', 'Event Photography', 'Birthdays, debuts, corporate events, and more.', 120, 30, 3, 700, true),
  ('graduation-photography', 'Graduation Photography', 'Capture the moments behind your achievement.', 90, 30, 3, 1000, true),
  ('family-photography', 'Family Photography', 'Meaningful portraits with the people you love.', 90, 30, 2, 900, true),
  ('videography', 'Videography', 'Relive your special moments through film.', 120, 30, 3, 1200, true)
on conflict (slug) where archived_at is null do update set
  name = excluded.name,
  description = excluded.description,
  duration_minutes = excluded.duration_minutes,
  buffer_minutes = excluded.buffer_minutes,
  minimum_notice_days = excluded.minimum_notice_days,
  price = excluded.price,
  is_active = excluded.is_active;

with portrait_service as (
  select id from public.services where slug = 'portrait-photography' and archived_at is null
)
insert into public.packages (service_id, name, badge, price, inclusions, is_active)
select
  portrait_service.id,
  package_data.name,
  package_data.badge,
  package_data.price,
  package_data.inclusions,
  true
from portrait_service
cross join (
  values
    ('Basic Portrait Package', 'Most Preferred', 500::numeric, array['1 hour session', '3 hard copies', '15 edited photos', 'Soft copy (high resolution)']),
    ('Couple Portrait Package', null, 800::numeric, array['1 hour session', '2 outfit', '10 edited photos', 'Soft copy high-resolution']),
    ('Standard Portrait Package', null, 1000::numeric, array['1-2 hours session', '10 hard copies', '20 edited photos', 'Soft copy (high resolution)']),
    ('Group Portrait Package', null, 1850::numeric, array['1-2 hours session', 'Individual Shots', '10 printed photos', '20 edited photos', 'Soft copy (high resolution)']),
    ('Premium Portrait Package', null, 2000::numeric, array['2-3 hours session', '30 edited photos', '20 printed photos', '1 album', '15 poses', 'Soft copy (high resolution)'])
) as package_data(name, badge, price, inclusions)
on conflict (service_id, name) where archived_at is null do update set
  badge = excluded.badge,
  price = excluded.price,
  inclusions = excluded.inclusions,
  is_active = excluded.is_active;
