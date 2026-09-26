alter table public.services
add column if not exists buffer_minutes integer not null default 30;

update public.services
set buffer_minutes = 30
where buffer_minutes is null;
