begin;

alter table public.services add column if not exists archived_at timestamptz;
alter table public.packages add column if not exists archived_at timestamptz;

-- Names/slugs can be reused after deletion, without touching historical IDs.
do $$ begin
  if exists (select 1 from pg_index where indexrelid = to_regclass('public.services_slug_key') and indpred is null) then
    alter table public.services drop constraint if exists services_slug_key;
    drop index if exists public.services_slug_key;
  end if;
  if exists (select 1 from pg_index where indexrelid = to_regclass('public.packages_service_name_key') and indpred is null) then
    alter table public.packages drop constraint if exists packages_service_name_key;
    drop index if exists public.packages_service_name_key;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.services'::regclass and conname = 'services_archive_inactive') then
    alter table public.services add constraint services_archive_inactive check (archived_at is null or not is_active);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.packages'::regclass and conname = 'packages_archive_inactive') then
    alter table public.packages add constraint packages_archive_inactive check (archived_at is null or not is_active);
  end if;
end; $$;
create unique index if not exists services_slug_key on public.services(slug) where archived_at is null;
create unique index if not exists packages_service_name_key on public.packages(service_id, name) where archived_at is null;

-- Deleted records keep their IDs and history. A stale edit cannot restore them.
create or replace function public.guard_catalog_archive()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if old.archived_at is not null and
    (new.archived_at is distinct from old.archived_at or new.is_active) then
    raise exception 'This item has been deleted. Create a new item instead.' using errcode = '23514';
  end if;
  if old.archived_at is null and new.archived_at is not null then
    if tg_table_name = 'services' then
      if exists (select 1 from public.bookings b where b.service_id = old.id
        or b.package_id in (select p.id from public.packages p where p.service_id = old.id)) then
        raise exception 'This service has existing bookings and cannot be deleted.' using errcode = '23514';
      end if;
      -- Lock parent before children, also protecting concurrent booking inserts.
      perform p.id from public.packages p where p.service_id = old.id order by p.id for update;
      update public.packages set archived_at = new.archived_at, is_active = false
        where service_id = old.id and archived_at is null;
    elsif exists (select 1 from public.bookings b where b.package_id = old.id) then
      raise exception 'This package has existing bookings and cannot be deleted.' using errcode = '23514';
    end if;
    new.is_active := false;
  end if;
  return new;
end; $$;
revoke all on function public.guard_catalog_archive() from public, anon, authenticated;
drop trigger if exists services_archive_guard on public.services;
create trigger services_archive_guard before update on public.services
for each row execute function public.guard_catalog_archive();
drop trigger if exists packages_archive_guard on public.packages;
create trigger packages_archive_guard before update on public.packages
for each row execute function public.guard_catalog_archive();

-- Share locks conflict with archival updates and are held through commit.
-- Historical booking status updates do not run this trigger.
create or replace function public.guard_archived_catalog_reference()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare archived timestamptz; parent_id uuid;
begin
  parent_id := new.service_id;
  if parent_id is not null then
    select s.archived_at into archived from public.services s where s.id = parent_id for share;
    if archived is not null then
      raise exception 'This service has been deleted. Choose another service.' using errcode = '23514';
    end if;
  end if;
  if tg_table_name = 'bookings' then
    if new.package_id is not null then
      -- Also check the package's parent if a booking omitted/mismatched service_id.
      select p.service_id into parent_id from public.packages p where p.id = new.package_id;
      if parent_id is distinct from new.service_id then
        select s.archived_at into archived from public.services s where s.id = parent_id for share;
        if archived is not null then
          raise exception 'This service has been deleted. Choose another service.' using errcode = '23514';
        end if;
      end if;
      select p.archived_at into archived from public.packages p where p.id = new.package_id for share;
      if archived is not null then
        raise exception 'This package has been deleted. Choose another package.' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_archived_catalog_reference() from public, anon, authenticated;
drop trigger if exists bookings_archived_catalog_guard on public.bookings;
create trigger bookings_archived_catalog_guard before insert or update of service_id, package_id on public.bookings
for each row execute function public.guard_archived_catalog_reference();
drop trigger if exists packages_archived_parent_guard on public.packages;
create trigger packages_archived_parent_guard before insert or update of service_id on public.packages
for each row execute function public.guard_archived_catalog_reference();

create or replace function public.archive_catalog_item(p_entity text, p_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare archived timestamptz; parent_id uuid; archive_time timestamptz := statement_timestamp();
begin
  if auth.uid() is null or not exists
    (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_entity = 'service' then
    select s.archived_at into archived from public.services s where s.id = p_id for update;
    if not found then return false; end if;
    if archived is not null then return true; end if;
    update public.services set archived_at = archive_time, is_active = false where id = p_id;
  elsif p_entity = 'package' then
    select p.service_id into parent_id from public.packages p where p.id = p_id;
    perform s.id from public.services s where s.id = parent_id for share;
    select p.archived_at into archived from public.packages p where p.id = p_id for update;
    if not found then return false; end if;
    if archived is not null then return true; end if;
    update public.packages set archived_at = archive_time, is_active = false where id = p_id;
  else
    raise exception 'Invalid catalog entity' using errcode = '22023';
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values(auth.uid(), p_entity || '.archived', p_entity, p_id::text,
      jsonb_build_object('archivedAt', archive_time, 'isActive', false));
  return true;
end; $$;
revoke all on function public.archive_catalog_item(text, uuid) from public, anon;
grant execute on function public.archive_catalog_item(text, uuid) to authenticated;

commit;
