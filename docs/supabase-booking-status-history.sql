create table if not exists public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  status text not null check (status in ('pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired')),
  changed_by uuid references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.booking_status_history enable row level security;

insert into public.booking_status_history (booking_id, status, changed_by, reason, metadata, created_at)
select
  b.id,
  b.status,
  null,
  b.rejection_reason,
  jsonb_build_object(
    'bookingDate', b.booking_date,
    'startTime', b.start_time,
    'endTime', b.end_time,
    'backfilled', true
  ),
  b.created_at
from public.bookings b
where not exists (
  select 1
  from public.booking_status_history h
  where h.booking_id = b.id
);

drop policy if exists "Clients can read their own booking status history" on public.booking_status_history;
create policy "Clients can read their own booking status history"
on public.booking_status_history for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_status_history.booking_id
      and b.client_id = auth.uid()
  )
);

drop policy if exists "Admins can read booking status history" on public.booking_status_history;
create policy "Admins can read booking status history"
on public.booking_status_history for select
to authenticated
using (public.is_admin());

drop policy if exists "Users can create status history for their own bookings" on public.booking_status_history;
create policy "Users can create status history for their own bookings"
on public.booking_status_history for insert
to authenticated
with check (
  changed_by = auth.uid()
  and exists (
    select 1
    from public.bookings b
    where b.id = booking_status_history.booking_id
      and b.client_id = auth.uid()
  )
);

drop policy if exists "Admins can create booking status history" on public.booking_status_history;
create policy "Admins can create booking status history"
on public.booking_status_history for insert
to authenticated
with check (
  public.is_admin()
  and changed_by = auth.uid()
);
