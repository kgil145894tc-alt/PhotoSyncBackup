create or replace function public.mark_my_notification_read(
  p_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.notifications
  set is_read = true
  where id = p_notification_id
    and user_id = auth.uid();

  get diagnostics updated_count = row_count;

  return updated_count > 0;
end;
$$;

grant execute on function public.mark_my_notification_read(uuid) to authenticated;

-- Bulk writes use the same ownership check as individual reads. No user ID
-- parameter is accepted, so callers cannot mark another account's inbox read.
create or replace function public.mark_all_my_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  updated_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.notifications
  set is_read = true
  where user_id = current_user_id
    and is_read = false;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_all_my_notifications_read() from public, anon;
grant execute on function public.mark_all_my_notifications_read() to authenticated;
