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
