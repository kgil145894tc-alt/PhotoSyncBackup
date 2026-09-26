create unique index if not exists bookings_active_slot_key
on public.bookings (booking_date, start_time, end_time)
where status in ('pending', 'confirmed');
