-- Run through catalog-archives.verify.cjs to insert the actual legacy migration.
-- All rows/routines/triggers below are temporary; no production rows or pushes.
begin;
create temporary table services_archive_probe (like public.services including defaults including constraints);
create temporary table packages_archive_probe (like public.packages including defaults including constraints);
create temporary table profiles_archive_probe (like public.profiles including defaults including constraints);
create temporary table bookings_archive_probe (like public.bookings including defaults including constraints);
create temporary table audit_logs_archive_probe (like public.audit_logs including defaults including constraints);
create unique index probe_service_slug on services_archive_probe(slug) where archived_at is null;
create unique index probe_package_name on packages_archive_probe(service_id,name) where archived_at is null;
grant select, insert, update on services_archive_probe, packages_archive_probe, profiles_archive_probe,
  bookings_archive_probe, audit_logs_archive_probe to authenticated;
do $$ declare source text; routine text; item text;
begin
  if has_function_privilege('anon','public.archive_catalog_item(text,uuid)','execute')
    or not has_function_privilege('authenticated','public.archive_catalog_item(text,uuid)','execute') then
    raise exception 'Incorrect archive RPC grants';
  end if;
  foreach routine in array array['guard_catalog_archive()', 'guard_archived_catalog_reference()', 'archive_catalog_item(text,uuid)'] loop
    source := pg_get_functiondef(('public.' || routine)::regprocedure);
    source := replace(source,'public.' || split_part(routine,'(',1),'pg_temp.' || split_part(routine,'(',1));
    foreach item in array array['services','packages','profiles','bookings','audit_logs'] loop
      source := replace(source,'public.' || item,'pg_temp.' || item || '_archive_probe');
    end loop;
    source := replace(replace(source,'''services''','''services_archive_probe'''),'''bookings''','''bookings_archive_probe''');
    execute source;
  end loop;
end; $$;
create trigger service_probe_guard before update on services_archive_probe for each row execute function pg_temp.guard_catalog_archive();
create trigger package_probe_guard before update on packages_archive_probe for each row execute function pg_temp.guard_catalog_archive();
create trigger booking_probe_reference before insert or update of service_id,package_id on bookings_archive_probe
  for each row execute function pg_temp.guard_archived_catalog_reference();
create trigger package_probe_parent before insert or update of service_id on packages_archive_probe
  for each row execute function pg_temp.guard_archived_catalog_reference();

insert into profiles_archive_probe(id,role,full_name) values
  ('10000000-0000-0000-0000-000000000090','admin','Admin'),('10000000-0000-0000-0000-000000000091','client','Client');
insert into services_archive_probe(id,name,slug,is_active) values
  ('10000000-0000-0000-0000-000000000001','Off','off',false),
  ('10000000-0000-0000-0000-000000000002','Delete service','reusable',true),
  ('10000000-0000-0000-0000-000000000003','Booked','booked',true),
  ('10000000-0000-0000-0000-000000000004','Package owner','package-owner',true);
insert into packages_archive_probe(id,service_id,name,price,is_active) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Child off',10,false),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Child active',10,true),
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','Booked package',10,true),
  ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','Reusable package',10,false);
insert into bookings_archive_probe(id,client_id,service_id,package_id,booking_date,start_time,end_time,status) values
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000091',
  '10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','2026-10-10','09:00','10:00','confirmed');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000090","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000090',true);
set local role authenticated;
do $$ declare rejected boolean; affected integer; attempt integer;
begin
  if not pg_temp.archive_catalog_item('service','10000000-0000-0000-0000-000000000002')
    or not pg_temp.archive_catalog_item('service','10000000-0000-0000-0000-000000000002') then raise exception 'Archive failed'; end if;
  if (select count(*) from audit_logs_archive_probe where action='service.archived') <> 1
    or (select count(*) from packages_archive_probe where service_id='10000000-0000-0000-0000-000000000002' and archived_at is not null and not is_active) <> 2 then
    raise exception 'Archive did not cascade/idempotently audit'; end if;
  if not pg_temp.archive_catalog_item('package','20000000-0000-0000-0000-000000000004') then raise exception 'Package archive failed'; end if;
  update services_archive_probe set is_active=true where name='Off';
  update services_archive_probe set is_active=false where name='Off';
  if not exists(select 1 from services_archive_probe where name='Off' and archived_at is null) then raise exception 'Off became deleted'; end if;
  update services_archive_probe set is_active=true where name='Delete service' and archived_at is null;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Stale edit matched an archived row'; end if;
  rejected := false;
  begin update services_archive_probe set is_active=true where name='Delete service'; exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Archived activation accepted'; end if;
  rejected := false;
  begin update services_archive_probe set archived_at=null where name='Delete service'; exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Archive removal accepted'; end if;
  rejected := false;
  begin perform pg_temp.archive_catalog_item('service','10000000-0000-0000-0000-000000000003'); exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Booked service archive accepted'; end if;
  rejected := false;
  begin perform pg_temp.archive_catalog_item('package','20000000-0000-0000-0000-000000000003'); exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Booked package archive accepted'; end if;
  if exists(select 1 from services_archive_probe where name='Booked' and archived_at is not null)
    or (select count(*) from audit_logs_archive_probe) <> 2 then raise exception 'Rejected delete changed records/audit'; end if;
  if pg_temp.archive_catalog_item('service',gen_random_uuid()) then raise exception 'Unknown archive reported success'; end if;
  for attempt in 1..3 loop
    rejected := false;
    begin
      insert into bookings_archive_probe(client_id,service_id,package_id,booking_date,start_time,end_time) values
        ('10000000-0000-0000-0000-000000000091',
        case attempt when 1 then '10000000-0000-0000-0000-000000000002'::uuid when 2 then '10000000-0000-0000-0000-000000000004'::uuid else null end,
        case attempt when 2 then '20000000-0000-0000-0000-000000000004'::uuid else '20000000-0000-0000-0000-000000000001'::uuid end,
        '2026-10-11','09:00','10:00');
    exception when check_violation then rejected:=true; end;
    if not rejected then raise exception 'New booking referenced an archived record'; end if;
  end loop;
  rejected := false;
  begin insert into packages_archive_probe(service_id,name,price) values('10000000-0000-0000-0000-000000000002','New child',1);
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Package added to archived service'; end if;
  insert into services_archive_probe(name,slug) values('Replacement','reusable');
  insert into packages_archive_probe(service_id,name,price) values('10000000-0000-0000-0000-000000000004','Reusable package',20);
  update bookings_archive_probe set status='completed' where id='30000000-0000-0000-0000-000000000001';
  if (select count(*) from bookings_archive_probe) <> 1 or not exists(select 1 from bookings_archive_probe where status='completed') then
    raise exception 'Booking history changed'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000091","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000091',true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform pg_temp.archive_catalog_item('service','10000000-0000-0000-0000-000000000001'); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Client archive accepted'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform pg_temp.archive_catalog_item('service','10000000-0000-0000-0000-000000000001'); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Signed-out archive accepted'; end if;
end; $$;
reset role;

insert into services_archive_probe(id,name,slug,is_active) values
  ('10000000-0000-0000-0000-000000000008','Legacy delete','legacy-delete',false),
  ('10000000-0000-0000-0000-000000000009','Legacy off','legacy-off',false),
  ('10000000-0000-0000-0000-000000000010','Later edit','later-edit',false),
  ('10000000-0000-0000-0000-000000000011','Unknown','unknown',false);
insert into packages_archive_probe(id,service_id,name,price,is_active) values
  ('20000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000008','Legacy child',10,true),
  ('20000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000009','Legacy delete package',10,false),
  ('20000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000009','Legacy off package',10,false);
insert into audit_logs_archive_probe(action,entity_type,entity_id,metadata,created_at) values
  ('service.deactivated','service','10000000-0000-0000-0000-000000000008','{}','2026-10-01'),
  ('service.updated','service','10000000-0000-0000-0000-000000000009','{"isActive":false}','2026-10-01'),
  ('service.deactivated','service','10000000-0000-0000-0000-000000000010','{}','2026-10-01'),
  ('service.updated','service','10000000-0000-0000-0000-000000000010','{"isActive":false}','2026-10-02'),
  ('service.deactivated','service','10000000-0000-0000-0000-000000000003','{}','2026-10-01'),
  ('package.deactivated','package','20000000-0000-0000-0000-000000000009','{}','2026-10-01'),
  ('package.updated','package','20000000-0000-0000-0000-000000000010','{"isActive":false}','2026-10-01');
update services_archive_probe set is_active=false where name='Booked';

-- LEGACY_MIGRATION_HERE

do $$ begin
  if not exists(select 1 from services_archive_probe where name='Legacy delete' and archived_at is not null)
    or not exists(select 1 from packages_archive_probe where name='Legacy child' and archived_at is not null)
    or not exists(select 1 from packages_archive_probe where name='Legacy delete package' and archived_at is not null) then
    raise exception 'Legacy removal was not recovered'; end if;
  if exists(select 1 from services_archive_probe where name in ('Legacy off','Later edit','Unknown','Booked','Off') and archived_at is not null)
    or exists(select 1 from packages_archive_probe where name='Legacy off package' and archived_at is not null) then
    raise exception 'Legacy recovery archived a disabled, edited, unknown or booked record'; end if;
  if (select count(*) from bookings_archive_probe) <> 1 then raise exception 'Recovery changed bookings'; end if;
end; $$;
rollback;
select 'catalog_archive_verification_passed' as result;
