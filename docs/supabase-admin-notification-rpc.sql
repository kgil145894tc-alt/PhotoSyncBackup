create or replace function public.create_admin_booking_notification(
  p_booking_id uuid,
  p_title text,
  p_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (booking_id, title, message, user_id)
  select p_booking_id, p_title, p_message, profiles.id
  from public.profiles
  join public.bookings on bookings.id = p_booking_id
  where profiles.role = 'admin'
    and bookings.client_id = auth.uid();
$$;

grant execute on function public.create_admin_booking_notification(uuid, text, text) to authenticated;
