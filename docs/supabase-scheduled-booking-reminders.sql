begin;

-- Existing reminder rows are preserved. Concurrent app/job inserts are deduped
-- atomically by the partial unique index, not by a check-then-insert race.
create unique index if not exists notifications_booking_reminder_key
on public.notifications(user_id, booking_id) where title = 'Booking reminder';

create or replace function public.generate_booking_reminders(
  p_recipient uuid default null, p_now timestamptz default statement_timestamp()
) returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare inserted_count integer; reminder_date date := (p_now at time zone 'Asia/Manila')::date + 1;
begin
  insert into public.notifications (booking_id, title, message, user_id)
  select b.id, 'Booking reminder',
    case when recipient.role = 'admin' then
      concat(coalesce(b.contact_name, client.full_name, 'A client'), ' has a ', coalesce(pkg.name, 'booking'),
        ' appointment tomorrow at ', to_char(b.start_time, 'FMHH12:MI AM'), '.')
    else concat('Your ', coalesce(pkg.name, 'booking'), ' appointment is tomorrow at ',
        to_char(b.start_time, 'FMHH12:MI AM'), '.') end,
    recipient.id
  from public.bookings b
  join public.profiles recipient on (recipient.id = b.client_id or recipient.role = 'admin')
  left join public.profiles client on client.id = b.client_id
  left join public.packages pkg on pkg.id = b.package_id
  where b.status = 'confirmed' and b.booking_date = reminder_date
    and (p_recipient is null or recipient.id = p_recipient)
    and not exists (select 1 from public.notifications n
      where n.user_id = recipient.id and n.booking_id = b.id and n.title = 'Booking reminder')
  on conflict (user_id, booking_id) where title = 'Booking reminder' do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.generate_booking_reminders(uuid, timestamptz) from public, anon, authenticated, service_role;

-- Preserve the existing app API, restricted to the authenticated recipient.
create or replace function public.ensure_booking_reminder_notifications()
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform public.generate_booking_reminders(auth.uid());
end;
$$;
revoke all on function public.ensure_booking_reminder_notifications() from public, anon;
grant execute on function public.ensure_booking_reminder_notifications() to authenticated;

create or replace function public.run_scheduled_booking_reminders()
returns integer language sql security definer set search_path = pg_catalog as $$
  select public.generate_booking_reminders();
$$;
revoke all on function public.run_scheduled_booking_reminders() from public, anon, authenticated;
grant execute on function public.run_scheduled_booking_reminders() to service_role;

commit;
