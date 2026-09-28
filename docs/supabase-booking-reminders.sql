create or replace function public.ensure_booking_reminder_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_date date := current_date + interval '1 day';
begin
  if auth.uid() is null then
    return;
  end if;

  if public.is_admin() then
    insert into public.notifications (booking_id, title, message, user_id)
    select
      b.id,
      'Booking reminder',
      concat(
        coalesce(b.contact_name, p.full_name, 'A client'),
        ' has a ',
        coalesce(pkg.name, 'booking'),
        ' appointment tomorrow at ',
        to_char(b.start_time, 'FMHH12:MI AM'),
        '.'
      ),
      auth.uid()
    from public.bookings b
    left join public.profiles p on p.id = b.client_id
    left join public.packages pkg on pkg.id = b.package_id
    where b.status = 'confirmed'
      and b.booking_date = reminder_date
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = auth.uid()
          and n.booking_id = b.id
          and n.title = 'Booking reminder'
      );

    return;
  end if;

  insert into public.notifications (booking_id, title, message, user_id)
  select
    b.id,
    'Booking reminder',
    concat(
      'Your ',
      coalesce(pkg.name, 'booking'),
      ' appointment is tomorrow at ',
      to_char(b.start_time, 'FMHH12:MI AM'),
      '.'
    ),
    auth.uid()
  from public.bookings b
  left join public.packages pkg on pkg.id = b.package_id
  where b.status = 'confirmed'
    and b.client_id = auth.uid()
    and b.booking_date = reminder_date
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = auth.uid()
        and n.booking_id = b.id
        and n.title = 'Booking reminder'
    );
end;
$$;

grant execute on function public.ensure_booking_reminder_notifications() to authenticated;
