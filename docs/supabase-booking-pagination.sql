-- Bounded booking reads, exact counts, and a small dashboard payload.
-- SECURITY INVOKER preserves existing row-level security on every table.
begin;
create index if not exists bookings_created_page_idx on public.bookings(created_at desc, id desc);
create index if not exists bookings_client_page_idx on public.bookings(client_id, created_at desc, id desc);
create index if not exists bookings_status_page_idx on public.bookings(status, created_at desc, id desc);
create index if not exists bookings_status_date_idx on public.bookings(status, booking_date, start_time);
create index if not exists notifications_user_page_idx on public.notifications(user_id, created_at desc, id desc);
create index if not exists notifications_unread_page_idx on public.notifications(user_id, created_at desc, id desc) where not is_read;

create or replace function public.get_booking_page(
  p_scope text default 'client', p_status text default 'all', p_date_filter text default 'all',
  p_search text default '', p_booking_id uuid default null, p_dashboard boolean default false,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 30
) returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog
-- Choose the matching paging/date index for each filter and dashboard request.
-- This setting is local to the function, never changed globally.
set plan_cache_mode = force_custom_plan as $$
declare
  actor uuid := auth.uid();
  today date := (statement_timestamp() at time zone 'Asia/Manila')::date;
  page_size integer := least(greatest(coalesce(p_limit, 30), 1), 30);
  counts jsonb := null;
  rows jsonb;
  visible_rows jsonb;
  last_row jsonb;
  needle text := lower(trim(coalesce(p_search, '')));
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_scope is null or p_scope not in ('client', 'admin') or (p_scope = 'admin' and not public.is_admin(actor))
    or (p_dashboard and p_scope <> 'admin') then
    raise exception 'Booking scope is not authorized' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('all', 'approved', 'pending', 'confirmed', 'completed', 'cancelled', 'rejected', 'expired')
    or p_date_filter is null or p_date_filter not in ('all', 'today', 'tomorrow', 'thisWeek', 'upcoming') then
    raise exception 'Invalid booking filter' using errcode = '22023';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'Incomplete booking cursor' using errcode = '22023';
  end if;
  if p_booking_id is null and p_cursor_id is null then
    select jsonb_build_object('all', count(*), 'pending', count(*) filter(where status = 'pending'),
      'confirmed', count(*) filter(where status = 'confirmed'), 'completed', count(*) filter(where status = 'completed'),
      'cancelled', count(*) filter(where status = 'cancelled'), 'rejected', count(*) filter(where status = 'rejected'),
      'expired', count(*) filter(where status = 'expired'), 'approved', count(*) filter(where status in ('confirmed','completed')),
      'closed', count(*) filter(where status in ('cancelled','rejected','expired')),
      'today', count(*) filter(where status = 'confirmed' and booking_date = today),
      'upcoming', count(*) filter(where status = 'confirmed' and booking_date > today)) into counts
    from public.bookings where p_scope = 'admin' or client_id = actor;
  end if;
  if p_dashboard then page_size := 3; end if;
  select coalesce(jsonb_agg(row_data order by
    case when p_dashboard then booking_date end asc, case when p_dashboard then start_time end asc,
    case when not p_dashboard then created_at end desc, id desc), '[]'::jsonb) into rows from (
    select jsonb_build_object('id', b.id, 'created_at', b.created_at, 'client_id', b.client_id,
      'booking_date', b.booking_date, 'start_time', b.start_time, 'end_time', b.end_time, 'status', b.status,
      'contact_name', b.contact_name, 'contact_email', b.contact_email, 'contact_phone', b.contact_phone,
      'notes', b.notes, 'people_count', b.people_count, 'session_theme', b.session_theme,
      'shoot_location', b.shoot_location, 'special_requests', b.special_requests, 'rejection_reason', b.rejection_reason,
      'profiles', jsonb_build_object('avatar_url', pr.avatar_url, 'email', pr.email, 'phone', pr.phone, 'full_name', pr.full_name),
      'services', jsonb_build_object('name', s.name),
      'packages', jsonb_build_object('name', pk.name, 'price', pk.price, 'inclusions', pk.inclusions, 'image_url', pk.image_url)) as row_data,
      b.booking_date, b.start_time, b.created_at, b.id
    from public.bookings b
      left join public.profiles pr on pr.id = b.client_id
      left join public.services s on s.id = b.service_id
      left join public.packages pk on pk.id = b.package_id
    where (p_scope = 'admin' or b.client_id = actor)
      and (p_booking_id is null or b.id = p_booking_id)
      and (not p_dashboard or (b.status = 'confirmed' and b.booking_date >= today
        and (coalesce((counts->>'today')::bigint, 0) = 0 or b.booking_date = today)))
      and (p_status = 'all' or b.status = p_status or (p_scope = 'client' and p_status = 'cancelled' and b.status in ('cancelled','rejected','expired'))
        or (p_status = 'approved' and b.status in ('confirmed','completed')))
      and (p_date_filter = 'all' or (p_date_filter = 'today' and b.booking_date = today)
        or (p_date_filter = 'tomorrow' and b.booking_date = today + 1)
        or (p_date_filter = 'upcoming' and b.booking_date >= today)
        or (p_date_filter = 'thisWeek' and b.booking_date between today - extract(dow from today)::integer and today - extract(dow from today)::integer + 6))
      and (needle = '' or strpos(lower(coalesce(b.contact_name, pr.full_name, 'Client')), needle) > 0
        or strpos(lower(coalesce(s.name, 'Service')), needle) > 0 or strpos(lower(coalesce(pk.name, 'Package')), needle) > 0
        or strpos(lower(to_char(b.booking_date, 'Mon FMDD, YYYY')), needle) > 0 or strpos(b.booking_date::text, needle) > 0)
      and (p_cursor_id is null or (b.created_at, b.id) < (p_cursor_created_at, p_cursor_id))
    order by case when p_dashboard then b.booking_date end asc, case when p_dashboard then b.start_time end asc,
      case when not p_dashboard then b.created_at end desc, b.id desc
    limit case when p_booking_id is not null then 1 else page_size + 1 end
  ) page;
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb) into visible_rows
    from jsonb_array_elements(rows) with ordinality where ordinality <= page_size;
  last_row := visible_rows->(jsonb_array_length(visible_rows) - 1);
  return jsonb_build_object('items', visible_rows, 'counts', counts,
    'hasMore', not p_dashboard and jsonb_array_length(rows) > page_size,
    'nextCursor', case when not p_dashboard and jsonb_array_length(rows) > page_size
      then jsonb_build_object('createdAt', last_row->>'created_at', 'id', last_row->>'id') else null end);
end;
$$;
revoke all on function public.get_booking_page(text,text,text,text,uuid,boolean,timestamptz,uuid,integer) from public, anon;
grant execute on function public.get_booking_page(text,text,text,text,uuid,boolean,timestamptz,uuid,integer) to authenticated;
commit;
