alter table public.services
add column if not exists image_url text;

alter table public.packages
add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do update set
  public = excluded.public;

drop policy if exists "Service images are public" on storage.objects;
create policy "Service images are public"
on storage.objects for select
to public
using (bucket_id = 'service-images');

drop policy if exists "Admins can upload service images" on storage.objects;
create policy "Admins can upload service images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'service-images'
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

drop policy if exists "Admins can update service images" on storage.objects;
create policy "Admins can update service images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'service-images'
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
)
with check (
  bucket_id = 'service-images'
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

drop policy if exists "Admins can delete service images" on storage.objects;
create policy "Admins can delete service images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'service-images'
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);
