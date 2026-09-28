create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can manage their own push tokens" on public.push_tokens;
create policy "Users can manage their own push tokens"
on public.push_tokens for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Service role can manage all push tokens" on public.push_tokens;
create policy "Service role can manage all push tokens"
on public.push_tokens for all
to service_role
using (true)
with check (true);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);
create index if not exists push_tokens_last_seen_at_idx on public.push_tokens(last_seen_at);
