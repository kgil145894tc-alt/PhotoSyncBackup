alter table public.bookings
add column if not exists contact_name text,
add column if not exists contact_email text,
add column if not exists contact_phone text,
add column if not exists people_count text,
add column if not exists shoot_location text,
add column if not exists session_theme text,
add column if not exists special_requests text;

update public.bookings b
set
  contact_name = coalesce(b.contact_name, p.full_name),
  contact_email = coalesce(b.contact_email, p.email),
  contact_phone = coalesce(b.contact_phone, p.phone),
  shoot_location = coalesce(
    b.shoot_location,
    nullif(trim(substring(b.notes from '(?im)^Shoot Location:\s*(.*)$')), '')
  ),
  session_theme = coalesce(
    b.session_theme,
    nullif(trim(substring(b.notes from '(?im)^Theme / Concept:\s*(.*)$')), '')
  ),
  people_count = coalesce(
    b.people_count,
    nullif(trim(substring(b.notes from '(?im)^Number of People:\s*(.*)$')), '')
  ),
  special_requests = coalesce(
    b.special_requests,
    nullif(trim(substring(b.notes from '(?im)^Special Requests:\s*(.*)$')), '')
  )
from public.profiles p
where p.id = b.client_id;
