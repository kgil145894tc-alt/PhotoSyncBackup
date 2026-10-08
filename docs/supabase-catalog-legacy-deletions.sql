-- Run only after supabase-catalog-archives.sql and its fixture verification.
-- The former trash/Delete handler emitted *.deactivated. The Active switch
-- saved through *.updated. Never classify every inactive row as deleted.
begin;
lock table public.services, public.packages in share row exclusive mode;
create temporary table catalog_archive_before as
  select 'service'::text as entity, id from public.services where archived_at is null
  union all select 'package', id from public.packages where archived_at is null;

with latest as (
  select distinct on (entity_id) entity_id, id
  from public.audit_logs
  where entity_type = 'service' and action in
    ('service.created','service.updated','service.activated','service.deactivated','service.deleted','service.archived')
  order by entity_id, created_at desc, id desc
), removed as (
  update public.services s set archived_at = statement_timestamp(), is_active = false
  from latest l join public.audit_logs a on a.id = l.id
  where l.entity_id = s.id::text and a.action in ('service.deactivated','service.deleted')
    and not s.is_active and s.archived_at is null
    and not exists (select 1 from public.bookings b where b.service_id = s.id
      or b.package_id in (select p.id from public.packages p where p.service_id = s.id))
  returning s.id, s.archived_at
)
insert into public.audit_logs(action, entity_type, entity_id, metadata)
select 'service.archived', 'service', id::text,
  jsonb_build_object('source','legacy-delete','archivedAt',archived_at) from removed;

with latest as (
  select distinct on (entity_id) entity_id, id
  from public.audit_logs
  where entity_type = 'package' and action in
    ('package.created','package.updated','package.activated','package.deactivated','package.deleted','package.archived')
  order by entity_id, created_at desc, id desc
), removed as (
  update public.packages p set archived_at = statement_timestamp(), is_active = false
  from latest l join public.audit_logs a on a.id = l.id
  where l.entity_id = p.id::text and a.action in ('package.deactivated','package.deleted')
    and not p.is_active and p.archived_at is null
    and not exists (select 1 from public.bookings b where b.package_id = p.id)
  returning p.id, p.archived_at
)
insert into public.audit_logs(action, entity_type, entity_id, metadata)
select 'package.archived', 'package', id::text,
  jsonb_build_object('source','legacy-delete','archivedAt',archived_at) from removed;
commit;

select 'service' as entity, count(*) as newly_archived
from public.services s join catalog_archive_before b on b.entity = 'service' and b.id = s.id where s.archived_at is not null
union all select 'package', count(*)
from public.packages p join catalog_archive_before b on b.entity = 'package' and b.id = p.id where p.archived_at is not null;
