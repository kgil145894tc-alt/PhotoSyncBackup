alter table public.bookings
add column if not exists rejection_reason text;
