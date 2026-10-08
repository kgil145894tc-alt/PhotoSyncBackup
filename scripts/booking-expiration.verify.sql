-- Exercise the installed routine and RLS policies against temporary copies.
-- No real booking, profile, history or auth rows are changed.
begin;

create temporary table expiration_bookings_probe (like public.bookings including defaults);
create temporary table expiration_history_probe (like public.booking_status_history including defaults);
alter table expiration_bookings_probe enable row level security;
alter table expiration_history_probe enable row level security;
grant select, update on expiration_bookings_probe to authenticated;
grant select, insert on expiration_history_probe to authenticated;

do $$
declare
  source text;
  item record;
  expression text;
  check_expression text;
begin
  if not exists (
    select 1 from pg_proc where oid = 'public.expire_past_pending_bookings()'::regprocedure
      and not prosecdef and proconfig = array['search_path=pg_catalog']
  ) then raise exception 'Expiration RPC must be an invoker with a pinned search path.'; end if;
  if has_function_privilege('anon', 'public.expire_past_pending_bookings()', 'execute')
    or not has_function_privilege('authenticated', 'public.expire_past_pending_bookings()', 'execute') then
    raise exception 'Incorrect expiration RPC execution grants.';
  end if;
  if not has_table_privilege('authenticated', 'public.bookings', 'SELECT')
    or not has_table_privilege('authenticated', 'public.bookings', 'UPDATE')
    or not has_table_privilege('authenticated', 'public.booking_status_history', 'INSERT') then
    raise exception 'Missing table privileges for authenticated expiration/history writes.';
  end if;

  source := pg_get_functiondef('public.expire_past_pending_bookings()'::regprocedure);
  source := replace(source, 'public.expire_past_pending_bookings', 'pg_temp.expiration_probe');
  source := replace(source, 'public.bookings', 'pg_temp.expiration_bookings_probe');
  source := replace(source, 'public.booking_status_history', 'pg_temp.expiration_history_probe');
  execute source;

  for item in select * from pg_policies where schemaname = 'public'
    and tablename in ('bookings', 'booking_status_history') and cmd in ('SELECT', 'UPDATE', 'INSERT') loop
    expression := regexp_replace(item.qual, '\mbookings\M', 'pg_temp.expiration_bookings_probe', 'g');
    check_expression := regexp_replace(item.with_check, '\mbookings\M', 'pg_temp.expiration_bookings_probe', 'g');
    -- The outer history alias belongs to the copied table, not its source.
    expression := replace(expression, 'booking_status_history.', 'expiration_history_probe.');
    check_expression := replace(check_expression, 'booking_status_history.', 'expiration_history_probe.');
    execute format('create policy %I on pg_temp.%I for %s to authenticated%s%s', item.policyname,
      case item.tablename when 'bookings' then 'expiration_bookings_probe' else 'expiration_history_probe' end,
      item.cmd, case when expression is null then '' else ' using (' || expression || ')' end,
      case when check_expression is null then '' else ' with check (' || check_expression || ')' end);
  end loop;
end;
$$;

do $$
declare
  client_actor uuid;
  admin_actor uuid;
  studio_now timestamp := clock_timestamp() at time zone 'Asia/Manila';
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  today_id uuid := gen_random_uuid();
  future_id uuid := gen_random_uuid();
  confirmed_id uuid := gen_random_uuid();
  count_expired integer;
begin
  select id into client_actor from public.profiles where role = 'client' order by id limit 1;
  select id into admin_actor from public.profiles where role = 'admin' order by id limit 1;
  if client_actor is null or admin_actor is null then raise exception 'Verification needs existing client and admin profiles.'; end if;

  insert into expiration_bookings_probe (id, client_id, service_id, package_id, booking_date, start_time, end_time, status)
  values
    (first_id, client_actor, gen_random_uuid(), gen_random_uuid(), studio_now::date - 1, '09:00', '10:00', 'pending'),
    (second_id, admin_actor, gen_random_uuid(), gen_random_uuid(), studio_now::date - 1, '11:00', '12:00', 'pending'),
    (today_id, client_actor, gen_random_uuid(), gen_random_uuid(), studio_now::date, '00:00', '01:00', 'pending'),
    (future_id, client_actor, gen_random_uuid(), gen_random_uuid(), studio_now::date + 1, '09:00', '10:00', 'pending'),
    (confirmed_id, client_actor, gen_random_uuid(), gen_random_uuid(), studio_now::date - 1, '13:00', '14:00', 'confirmed');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', client_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', client_actor::text, true);
  set local role authenticated;
  count_expired := pg_temp.expiration_probe();
  if count_expired <> 2 then raise exception 'Client should expire exactly two owned due requests, got %.', count_expired; end if;
  if pg_temp.expiration_probe() <> 0 then raise exception 'A repeat call must not duplicate history.'; end if;
  reset role;
  if (select status from expiration_bookings_probe where id = second_id) <> 'pending'
    or (select status from expiration_bookings_probe where id = future_id) <> 'pending'
    or (select status from expiration_bookings_probe where id = confirmed_id) <> 'confirmed' then
    raise exception 'Client scope, future requests or confirmed bookings changed.';
  end if;
  if (select count(*) from expiration_history_probe) <> 2
    or exists (select 1 from expiration_history_probe where changed_by <> client_actor or status <> 'expired'
      or metadata->>'expiredAt' is null) then raise exception 'Expiration history is missing or incorrect.'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_actor::text, true);
  set local role authenticated;
  if pg_temp.expiration_probe() <> 1 then raise exception 'Admin must expire the remaining due request.'; end if;
  reset role;

  -- An audit failure must also roll the booking status back.
  update expiration_bookings_probe set status = 'pending' where id = first_id;
  alter table expiration_history_probe add constraint expiration_probe_reject_history check (false) not valid;
  set local role authenticated;
  begin
    perform pg_temp.expiration_probe();
    raise exception 'Expected the history write to fail.';
  exception when check_violation then null;
  end;
  reset role;
  if (select status from expiration_bookings_probe where id = first_id) <> 'pending' then
    raise exception 'Booking status was not rolled back after a history failure.';
  end if;

  perform set_config('request.jwt.claims', '{}'::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  begin
    perform pg_temp.expiration_probe();
    raise exception 'Expected a signed-out call to fail.';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;

rollback;
select 'Expiration RPC, owner/admin scopes, studio clock, idempotency, history and atomic rollback passed.' as verification;
