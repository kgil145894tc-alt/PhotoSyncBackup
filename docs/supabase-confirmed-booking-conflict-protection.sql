create extension if not exists btree_gist;

alter table public.bookings
drop constraint if exists no_overlapping_confirmed_bookings;

alter table public.bookings
add constraint no_overlapping_confirmed_bookings
exclude using gist (
  tsrange(
    (booking_date + start_time)::timestamp,
    (booking_date + end_time)::timestamp,
    '[)'
  ) with &&
)
where (status = 'confirmed');
