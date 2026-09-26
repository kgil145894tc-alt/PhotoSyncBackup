alter table public.services
add column if not exists minimum_notice_days integer not null default 1;

update public.services
set minimum_notice_days = case slug
  when 'wedding-photography' then 7
  when 'event-photography' then 3
  when 'graduation-photography' then 3
  when 'family-photography' then 2
  when 'videography' then 3
  else 1
end
where minimum_notice_days is null
   or minimum_notice_days = 1;
