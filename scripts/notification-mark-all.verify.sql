-- Run with an administrative database connection. All read-state changes are
-- rolled back; this does not create notifications or send push notifications.
begin;

do $$
declare
  account_id uuid;
  expected_count integer;
  actual_count integer;
  other_rows jsonb;
begin
  if not has_function_privilege('authenticated', 'public.mark_all_my_notifications_read()', 'EXECUTE')
    or has_function_privilege('anon', 'public.mark_all_my_notifications_read()', 'EXECUTE') then
    raise exception 'Bulk read function permissions are incorrect';
  end if;

  select user_id into account_id from public.notifications
  order by is_read asc, id limit 1;
  if account_id is null then
    raise exception 'No existing notifications available for verification';
  end if;

  select count(*) into expected_count from public.notifications
  where user_id = account_id and is_read = false;
  select coalesce(jsonb_object_agg(id::text, is_read), '{}'::jsonb) into other_rows
  from public.notifications where user_id <> account_id;

  perform set_config('request.jwt.claim.sub', account_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_id, 'role', 'authenticated')::text, true);
  actual_count := public.mark_all_my_notifications_read();
  if actual_count <> expected_count or exists (
    select 1 from public.notifications where user_id = account_id and is_read = false
  ) then
    raise exception 'Bulk read did not update every unread notification';
  end if;
  if exists (
    select 1 from public.notifications
    where other_rows ? id::text and other_rows -> id::text <> to_jsonb(is_read)
  ) then
    raise exception 'Bulk read changed a different account';
  end if;
  if public.mark_all_my_notifications_read() <> 0 then
    raise exception 'Repeated bulk read should succeed with zero changed rows';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.mark_all_my_notifications_read();
    raise exception 'Signed-out call should have been refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
select 'PASS: own inbox, other accounts, repeated reads, authentication and grants; all changes rolled back' as result;
