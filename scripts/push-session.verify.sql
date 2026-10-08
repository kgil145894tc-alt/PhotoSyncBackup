-- Transactional probes only: no real sessions, notifications or pushes are
-- modified. Fake sessions and fake tokens are removed by the final rollback.
begin;

do $$
declare
  account_a uuid;
  account_b uuid;
  session_a uuid := gen_random_uuid();
  session_a_other uuid := gen_random_uuid();
  session_b uuid := gen_random_uuid();
  expired_session uuid := gen_random_uuid();
  probe_prefix text := 'ExpoPushToken[verify-' || gen_random_uuid()::text;
  shared_token text;
  other_token text;
  cleanup_token text;
  revoked_token text;
  expired_token text;
  legacy_token text;
begin
  select id into account_a from public.profiles order by id limit 1;
  select id into account_b from public.profiles where id <> account_a order by id limit 1;
  if account_a is null or account_b is null then
    raise exception 'Two existing accounts are required for transactional verification';
  end if;
  if not has_function_privilege('authenticated', 'public.register_my_push_token(text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.register_my_push_token(text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.unregister_my_push_session()', 'EXECUTE')
    or has_function_privilege('anon', 'public.unregister_my_push_session()', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.get_active_push_tokens_for_user(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_active_push_tokens_for_user(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_active_push_tokens_for_user(uuid)', 'EXECUTE') then
    raise exception 'Push function grants are incorrect';
  end if;

  shared_token := probe_prefix || '-shared]';
  other_token := probe_prefix || '-other]';
  cleanup_token := probe_prefix || '-cleanup]';
  revoked_token := probe_prefix || '-revoked]';
  expired_token := probe_prefix || '-expired]';
  legacy_token := probe_prefix || '-legacy]';
  insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
    (session_a, account_a, now(), now(), null),
    (session_a_other, account_a, now(), now(), null),
    (session_b, account_b, now(), now(), null),
    (expired_session, account_a, now(), now(), now() - interval '1 minute');

  perform set_config('request.jwt.claim.sub', account_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_a, 'session_id', session_a, 'role', 'authenticated')::text, true);
  perform public.register_my_push_token(shared_token, 'android');
  if not exists (select 1 from public.get_active_push_tokens_for_user(account_a) where expo_push_token = shared_token and session_id = session_a) then
    raise exception 'Registration did not bind the authenticated session';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_a, 'session_id', session_a_other, 'role', 'authenticated')::text, true);
  perform public.register_my_push_token(other_token, 'ios');

  insert into public.push_tokens (user_id, expo_push_token, platform, session_id) values
    (account_a, expired_token, 'android', expired_session),
    (account_a, legacy_token, 'android', null);
  if exists (select 1 from public.get_active_push_tokens_for_user(account_a) where expo_push_token in (expired_token, legacy_token)) then
    raise exception 'Expired or unbound registrations must not receive pushes';
  end if;

  -- A device logging into account B takes ownership without leaving account A's
  -- registration. An old cleanup of A must not delete B or A's other device.
  perform set_config('request.jwt.claim.sub', account_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_b, 'session_id', session_b, 'role', 'authenticated')::text, true);
  perform public.register_my_push_token(shared_token, 'android');
  if exists (select 1 from public.get_active_push_tokens_for_user(account_a) where expo_push_token = shared_token)
    or not exists (select 1 from public.get_active_push_tokens_for_user(account_b) where expo_push_token = shared_token) then
    raise exception 'Account switch did not transfer the device registration';
  end if;
  perform set_config('request.jwt.claim.sub', account_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_a, 'session_id', session_a, 'role', 'authenticated')::text, true);
  if public.unregister_my_push_session() <> 0 then
    raise exception 'Old cleanup affected another login';
  end if;
  perform public.register_my_push_token(cleanup_token, 'android');
  if public.unregister_my_push_session() <> 1 or public.unregister_my_push_session() <> 0 then
    raise exception 'Cleanup must remove only its own session and be repeatable';
  end if;
  if not exists (select 1 from public.push_tokens where expo_push_token = other_token)
    or not exists (select 1 from public.push_tokens where expo_push_token = shared_token and user_id = account_b) then
    raise exception 'Cleanup changed another device or account';
  end if;

  -- Simulate the database effect of the auth service ending this fake session.
  -- FK cleanup must work even when the device never unregisters its token.
  perform public.register_my_push_token(revoked_token, 'android');
  delete from auth.sessions where id = session_a;
  if exists (select 1 from public.push_tokens where expo_push_token = revoked_token) then
    raise exception 'Sign-out did not cascade push registration cleanup';
  end if;
  begin
    perform public.register_my_push_token(shared_token, 'android');
    raise exception 'A revoked session recreated a device registration';
  exception when raise_exception then
    if sqlerrm <> 'Active login session required.' then raise; end if;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_a, 'session_id', session_b, 'role', 'authenticated')::text, true);
  begin
    perform public.register_my_push_token(shared_token, 'android');
    raise exception 'A different account session was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Active login session required.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.unregister_my_push_session();
    raise exception 'Signed-out cleanup was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Authentication required.' then raise; end if;
  end;
end;
$$;

rollback;
