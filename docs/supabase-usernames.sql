alter table public.profiles
add column if not exists username text;

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(username))
where username is not null and username <> '';

update public.profiles as profile
set username = lower(split_part(coalesce(profile.email, profile.id::text), '@', 1))
where profile.username is null
  and profile.email is not null
  and not exists (
    select 1
    from public.profiles existing
    where lower(existing.username) = lower(split_part(profile.email, '@', 1))
  );

create or replace function public.get_email_for_username(p_username text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select email
  from public.profiles
  where lower(username) = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.get_email_for_username(text) to anon, authenticated;
