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

commit;
