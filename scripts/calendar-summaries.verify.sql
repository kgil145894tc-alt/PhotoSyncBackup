-- Exercise the installed aggregate and RLS against temporary fixtures only.
begin;
create temporary table bookings_summary_probe (like public.bookings including defaults);
create temporary table time_slots_summary_probe (like public.time_slots including defaults);
create temporary table profiles_summary_probe (like public.profiles including defaults);
alter table bookings_summary_probe enable row level security;
alter table time_slots_summary_probe enable row level security;
alter table profiles_summary_probe enable row level security;
grant select on bookings_summary_probe, time_slots_summary_probe, profiles_summary_probe to authenticated;

do $$
declare source text; item record; expression text;
begin
  if has_function_privilege('anon', 'public.get_calendar_day_summaries(date)', 'execute')
    or not has_function_privilege('authenticated', 'public.get_calendar_day_summaries(date)', 'execute')
    or exists(select 1 from pg_proc where oid = 'public.get_calendar_day_summaries(date)'::regprocedure and prosecdef) then
    raise exception 'Summary RPC must preserve RLS and authenticated-only access';
  end if;
  source := pg_get_functiondef('public.get_calendar_day_summaries(date)'::regprocedure);
  source := replace(source, 'public.get_calendar_day_summaries', 'pg_temp.summary_probe');
  source := replace(replace(source, 'public.bookings', 'pg_temp.bookings_summary_probe'), 'public.time_slots', 'pg_temp.time_slots_summary_probe');
  execute source;
  for item in select * from pg_policies where schemaname = 'public' and tablename in ('bookings','time_slots','profiles') and cmd in ('SELECT','ALL') loop
    expression := regexp_replace(item.qual, '\m(bookings|time_slots|profiles)\M', 'pg_temp.\1_summary_probe', 'g');
    execute format('create policy %I on pg_temp.%I for select to authenticated%s', item.policyname,
      item.tablename || '_summary_probe', case when expression is null then '' else ' using (' || expression || ')' end);
  end loop;
end; $$;

do $$
declare actor uuid; admin_actor uuid; other_actor uuid := gen_random_uuid();
  svc uuid := gen_random_uuid(); pkg uuid := gen_random_uuid(); result jsonb; rejected boolean := false;
begin
  select id into actor from public.profiles where role = 'client' order by id limit 1;
  select id into admin_actor from public.profiles where role = 'admin' order by id limit 1;
  if actor is null or admin_actor is null then raise exception 'Client/admin verification profiles required'; end if;
  insert into profiles_summary_probe(id,role) values(actor,'client'),(other_actor,'client'),(admin_actor,'admin');
  insert into bookings_summary_probe(id,client_id,service_id,package_id,booking_date,start_time,end_time,status)
  select gen_random_uuid(), actor,svc,pkg,'2026-10-15','09:00','10:00','confirmed' from generate_series(1,2005);
  insert into bookings_summary_probe(id,client_id,service_id,package_id,booking_date,start_time,end_time,status) values
    (gen_random_uuid(),other_actor,svc,pkg,'2026-10-16','09:00','10:00','confirmed'),
    (gen_random_uuid(),actor,svc,pkg,'2026-10-17','09:00','10:00','pending'),
    (gen_random_uuid(),actor,svc,pkg,'2026-09-30','09:00','10:00','confirmed'),
    (gen_random_uuid(),actor,svc,pkg,'2026-11-01','09:00','10:00','confirmed');
  insert into time_slots_summary_probe(slot_date,start_time,end_time,status)
  select '2026-10-22','08:00','17:00','available' from generate_series(1,2005);
  insert into time_slots_summary_probe(slot_date,start_time,end_time,status) values
    ('2026-10-22','12:00','13:00','unavailable'),('2026-10-31','00:00','23:59','unavailable'),
    ('2026-10-20','00:00','23:30','unavailable'),('2026-11-01','08:00','17:00','available'),
    ('2028-02-29','08:00','17:00','available');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  set local role authenticated;
  select jsonb_agg(to_jsonb(s) order by s.date) into result from pg_temp.summary_probe('2026-10-01') s;
  if jsonb_array_length(result) <> 4 or result->0->>'date' <> '2026-10-15' or not (result->0->>'has_booked')::boolean
    or (result->1->>'has_full_day_unavailable')::boolean or not (result->2->>'has_available')::boolean
    or not (result->2->>'has_unavailable')::boolean or not (result->3->>'has_full_day_unavailable')::boolean then
    raise exception 'Client flags, ownership, API-cap aggregation or date boundaries failed: %',result;
  end if;
  if (select count(*) from pg_temp.summary_probe('2026-12-01')) <> 0
    or (select count(*) from pg_temp.summary_probe('2028-02-01')) <> 1 then
    raise exception 'Empty/leap months failed';
  end if;
  begin perform pg_temp.summary_probe('2026-10-02'); exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Invalid month accepted'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',admin_actor::text,true);
  if (select count(*) from pg_temp.summary_probe('2026-10-01')) <> 5
    or not (select has_booked from pg_temp.summary_probe('2026-10-01') where date='2026-10-16') then
    raise exception 'Admin aggregate did not preserve full visibility';
  end if;
  perform set_config('request.jwt.claims','{}',true); perform set_config('request.jwt.claim.sub','',true); rejected := false;
  begin perform pg_temp.summary_probe('2026-10-01'); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Signed-out aggregate accepted'; end if;
  reset role;
end; $$;
rollback;
select 'calendar_summary_verification_passed' as result;
