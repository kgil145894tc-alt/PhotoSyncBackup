-- Verify the installed function and SELECT policies on temporary fixture tables.
-- Real bookings, profiles, packages, services and auth data remain unchanged.
begin;
create temporary table bookings_pagination_probe (like public.bookings including defaults);
create temporary table profiles_pagination_probe (like public.profiles including defaults);
create temporary table services_pagination_probe (like public.services including defaults);
create temporary table packages_pagination_probe (like public.packages including defaults);
alter table bookings_pagination_probe enable row level security;
alter table profiles_pagination_probe enable row level security;
alter table services_pagination_probe enable row level security;
alter table packages_pagination_probe enable row level security;
grant select on bookings_pagination_probe, profiles_pagination_probe, services_pagination_probe, packages_pagination_probe to authenticated;

do $$
declare source text; item record; expression text;
begin
  if not exists (select 1 from pg_proc where oid = 'public.get_booking_page(text,text,text,text,uuid,boolean,timestamptz,uuid,integer)'::regprocedure
    and not prosecdef and proconfig @> array['search_path=pg_catalog','plan_cache_mode=force_custom_plan']) then
    raise exception 'Page RPC must preserve RLS and pin its search path.';
  end if;
  if has_function_privilege('anon', 'public.get_booking_page(text,text,text,text,uuid,boolean,timestamptz,uuid,integer)', 'execute')
    or not has_function_privilege('authenticated', 'public.get_booking_page(text,text,text,text,uuid,boolean,timestamptz,uuid,integer)', 'execute') then
    raise exception 'Incorrect page RPC grants.';
  end if;
  source := pg_get_functiondef('public.get_booking_page(text,text,text,text,uuid,boolean,timestamptz,uuid,integer)'::regprocedure);
  source := replace(source, 'public.get_booking_page', 'pg_temp.pagination_probe');
  foreach expression in array array['bookings','profiles','services','packages'] loop
    source := replace(source, 'public.' || expression, 'pg_temp.' || expression || '_pagination_probe');
  end loop;
  execute source;
  for item in select * from pg_policies where schemaname = 'public'
    and tablename in ('bookings','profiles','services','packages') and cmd in ('SELECT','ALL') loop
    expression := regexp_replace(item.qual, '\m(bookings|profiles|services|packages)\M', 'pg_temp.\1_pagination_probe', 'g');
    execute format('create policy %I on pg_temp.%I for select to authenticated%s', item.policyname,
      item.tablename || '_pagination_probe', case when expression is null then '' else ' using (' || expression || ')' end);
  end loop;
end;
$$;

do $$
declare
  actor uuid; admin_actor uuid; other_actor uuid := gen_random_uuid();
  svc uuid := gen_random_uuid(); pkg uuid := gen_random_uuid();
  today date := (statement_timestamp() at time zone 'Asia/Manila')::date;
  result jsonb; first_page jsonb; boundary jsonb; item jsonb;
  seen uuid[] := '{}'; own_total integer := 1205; all_total integer := 2005; expected integer;
begin
  select id into actor from public.profiles where role = 'client' order by id limit 1;
  select id into admin_actor from public.profiles where role = 'admin' order by id limit 1;
  if actor is null or admin_actor is null then raise exception 'Verification needs client and admin profiles.'; end if;
  insert into profiles_pagination_probe(id, role, full_name) values (actor,'client','Fixture Client'),
    (other_actor,'client','Other Client'), (admin_actor,'admin','Fixture Admin');
  insert into services_pagination_probe(id,name) values(svc,'Fixture Portrait');
  insert into packages_pagination_probe(id,service_id,name,price,inclusions) values(pkg,svc,'Fixture Package',1000,array['Fixture inclusion']);
  insert into bookings_pagination_probe(id,client_id,service_id,package_id,booking_date,start_time,end_time,status,created_at,contact_name)
  select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    case when n <= own_total then actor else other_actor end, svc,pkg,
    case when n % 5 = 0 then today - 1 when n % 5 = 1 then today else today + 1 end,
    '09:00'::time,'10:00'::time, (array['pending','confirmed','completed','cancelled','rejected','expired'])[1 + n % 6],
    '2026-10-01T00:00:00.000001+00:00'::timestamptz, 'Fixture Client ' || n from generate_series(1,all_total) n;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  set local role authenticated;
  first_page := pg_temp.pagination_probe();
  if jsonb_array_length(first_page->'items') <> 30 or (first_page->'counts'->>'all')::integer <> own_total then
    raise exception 'The first page must stay bounded and its count must include rows beyond the API cap.';
  end if;
  result := first_page;
  loop
    for item in select value from jsonb_array_elements(result->'items') loop
      if (item->>'client_id')::uuid <> actor or (item->>'id')::uuid = any(seen) then
        raise exception 'Foreign row or duplicate across equal-timestamp pages.';
      end if;
      seen := array_append(seen,(item->>'id')::uuid);
    end loop;
    exit when not (result->>'hasMore')::boolean;
    boundary := result->'nextCursor';
    result := pg_temp.pagination_probe(p_cursor_created_at := (boundary->>'createdAt')::timestamptz, p_cursor_id := (boundary->>'id')::uuid);
    if result->'counts' <> 'null'::jsonb then raise exception 'Later pages should reuse cached counts.'; end if;
  end loop;
  if array_length(seen,1) <> own_total then raise exception 'Pagination skipped bookings.'; end if;
  result := pg_temp.pagination_probe(p_booking_id := seen[1000]);
  if jsonb_array_length(result->'items') <> 1 then raise exception 'A booking beyond loaded pages must open directly.'; end if;
  result := pg_temp.pagination_probe(p_booking_id := ('00000000-0000-4000-8000-' || lpad(all_total::text,12,'0'))::uuid);
  if jsonb_array_length(result->'items') <> 0 then raise exception 'Foreign booking detail leaked.'; end if;
  result := pg_temp.pagination_probe(p_status := 'approved');
  if exists(select 1 from jsonb_array_elements(result->'items') where value->>'status' not in ('confirmed','completed')) then
    raise exception 'Approved grouping changed.';
  end if;
  result := pg_temp.pagination_probe(p_status := 'cancelled');
  if exists(select 1 from jsonb_array_elements(result->'items') where value->>'status' not in ('cancelled','rejected','expired')) then
    raise exception 'Client cancelled grouping changed.';
  end if;
  result := pg_temp.pagination_probe(p_search := 'Fixture Portrait',p_date_filter := 'tomorrow');
  if jsonb_array_length(result->'items') <> 30 or exists(select 1 from jsonb_array_elements(result->'items') where (value->>'booking_date')::date <> today + 1) then
    raise exception 'Search/date filtering must happen before pagination.';
  end if;
  result := pg_temp.pagination_probe(p_search := '%');
  if jsonb_array_length(result->'items') <> 0 then raise exception 'Search must treat wildcard characters literally.'; end if;
  result := pg_temp.pagination_probe(p_limit := 99999);
  if jsonb_array_length(result->'items') <> 30 then raise exception 'Caller bypassed page limit.'; end if;
  begin
    perform pg_temp.pagination_probe(p_scope := 'admin');
    raise exception 'A client entered the admin scope.';
  exception when insufficient_privilege then null; end;
  begin
    perform pg_temp.pagination_probe(p_cursor_id := seen[1]);
    raise exception 'An incomplete cursor was accepted.';
  exception when invalid_parameter_value then null; end;
  reset role;

  -- A new row at the head must not shift or repeat the previously read boundary.
  insert into bookings_pagination_probe(id,client_id,booking_date,start_time,end_time,status,created_at)
    values(gen_random_uuid(),actor,today,'11:00','12:00','pending',statement_timestamp());
  set local role authenticated;
  boundary := first_page->'nextCursor';
  result := pg_temp.pagination_probe(p_cursor_created_at := (boundary->>'createdAt')::timestamptz,p_cursor_id := (boundary->>'id')::uuid);
  if result->'items'->0->>'id' <> seen[31]::text then raise exception 'Concurrent insert shifted a page.'; end if;
  reset role;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',admin_actor::text,true);
  set local role authenticated;
  result := pg_temp.pagination_probe(p_scope := 'admin');
  if (result->'counts'->>'all')::integer <> all_total + 1 then raise exception 'Admin totals were limited to a page.'; end if;
  result := pg_temp.pagination_probe(p_scope := 'admin',p_status := 'cancelled');
  if exists(select 1 from jsonb_array_elements(result->'items') where value->>'status' <> 'cancelled') then raise exception 'Admin status grouping changed.'; end if;
  result := pg_temp.pagination_probe(p_scope := 'admin',p_dashboard := true);
  select count(*) into expected from bookings_pagination_probe where status='confirmed' and booking_date=today;
  if jsonb_array_length(result->'items') <> 3 or (result->'counts'->>'today')::integer <> expected
    or (result->>'hasMore')::boolean then raise exception 'Dashboard cards or exact totals are wrong.'; end if;
  if exists(select 1 from jsonb_array_elements(result->'items') where value->>'status' <> 'confirmed' or (value->>'booking_date')::date <> today) then
    raise exception 'Dashboard should show today before future sessions.';
  end if;
  reset role;
  delete from bookings_pagination_probe where status='confirmed' and booking_date=today;
  set local role authenticated;
  result := pg_temp.pagination_probe(p_scope := 'admin',p_dashboard := true);
  if jsonb_array_length(result->'items') <> 3 or exists(select 1 from jsonb_array_elements(result->'items') where (value->>'booking_date')::date <= today) then
    raise exception 'Dashboard did not fall back to upcoming sessions.';
  end if;
  reset role;
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role authenticated;
  begin perform pg_temp.pagination_probe(); raise exception 'An unauthenticated call was accepted.';
  exception when insufficient_privilege then null; end;
  reset role;
end;
$$;
rollback;
select 'Booking pagination, exact counts, dashboard, filters, cursor stability and RLS verification passed' as result;
