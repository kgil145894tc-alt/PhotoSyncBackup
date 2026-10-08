begin;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- NULL is reserved for older registrations. Delivery excludes them until the
-- device registers again; never guess which login owns an existing token.
alter table public.push_tokens add column if not exists session_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.push_tokens'::regclass and conname = 'push_tokens_session_id_fkey') then
    alter table public.push_tokens add constraint push_tokens_session_id_fkey
      foreign key (session_id) references auth.sessions(id) on delete cascade;
  end if;
end;
$$;

alter table public.push_tokens enable row level security;

drop policy if exists "Users can manage their own push tokens" on public.push_tokens;
create policy "Users can manage their own push tokens"
on public.push_tokens for all
to authenticated
using (auth.uid() = user_id and (session_id is null or session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid))
with check (auth.uid() = user_id and session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid);

drop policy if exists "Service role can manage all push tokens" on public.push_tokens;
create policy "Service role can manage all push tokens"
on public.push_tokens for all
to service_role
using (true)
with check (true);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);
create index if not exists push_tokens_last_seen_at_idx on public.push_tokens(last_seen_at);
create index if not exists push_tokens_session_id_idx on public.push_tokens(session_id);

create or replace function public.register_my_push_token(
  p_expo_push_token text,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'Unsupported push token platform.';
  end if;

  if nullif(trim(p_expo_push_token), '') is null then
    raise exception 'Push token required.';
  end if;

  -- Lock the session until this registration commits. A simultaneous logout
  -- then cascades its deletion instead of allowing a token to be recreated.
  perform 1 from auth.sessions
  where id = current_session_id and user_id = auth.uid()
    and (not_after is null or not_after > now())
  for key share;
  if not found then
    raise exception 'Active login session required.';
  end if;

  insert into public.push_tokens (user_id, expo_push_token, platform, session_id, last_seen_at)
  values (auth.uid(), p_expo_push_token, p_platform, current_session_id, now())
  on conflict (expo_push_token) do update set
    user_id = excluded.user_id, platform = excluded.platform,
    session_id = excluded.session_id, last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.register_my_push_token(text, text) from public, anon;
grant execute on function public.register_my_push_token(text, text) to authenticated;

create or replace function public.unregister_my_push_session()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  removed_count integer;
begin
  if auth.uid() is null or current_session_id is null then
    raise exception 'Authentication required.';
  end if;
  delete from public.push_tokens
  where user_id = auth.uid() and session_id = current_session_id;
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;
revoke all on function public.unregister_my_push_session() from public, anon;
grant execute on function public.unregister_my_push_session() to authenticated;

-- Only the push delivery service may enumerate another user's active devices.
create or replace function public.get_active_push_tokens_for_user(p_user_id uuid)
returns table (expo_push_token text, session_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select tokens.expo_push_token, tokens.session_id
  from public.push_tokens tokens
  join auth.sessions sessions on sessions.id = tokens.session_id and sessions.user_id = tokens.user_id
  where tokens.user_id = p_user_id and (sessions.not_after is null or sessions.not_after > now());
$$;
revoke all on function public.get_active_push_tokens_for_user(uuid) from public, anon, authenticated;
grant execute on function public.get_active_push_tokens_for_user(uuid) to service_role;


-- Transactional probes only: no real sessions, notifications or pushes are
-- modified. Fake sessions and fake tokens are removed by the final rollback.

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
