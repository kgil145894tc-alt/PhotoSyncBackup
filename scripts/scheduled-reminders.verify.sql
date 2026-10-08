-- No real notifications or push calls: clones have no production triggers.
begin;
create temporary table bookings_reminder_probe (like public.bookings including defaults);
create temporary table profiles_reminder_probe (like public.profiles including defaults);
create temporary table packages_reminder_probe (like public.packages including defaults);
create temporary table notifications_reminder_probe (like public.notifications including defaults);
create unique index reminder_probe_key on notifications_reminder_probe(user_id,booking_id) where title='Booking reminder';
grant select on notifications_reminder_probe to authenticated;
do $$
declare source text; routine text; item text;
begin
  foreach routine in array array['public.generate_booking_reminders(uuid,timestamptz)','public.run_scheduled_booking_reminders()'] loop
    if has_function_privilege('anon',routine,'execute') or has_function_privilege('authenticated',routine,'execute') then
      raise exception 'Untrusted role can run a global reminder routine';
    end if;
  end loop;
  if has_function_privilege('service_role','public.generate_booking_reminders(uuid,timestamptz)','execute')
    or has_function_privilege('anon','public.ensure_booking_reminder_notifications()','execute')
    or not has_function_privilege('authenticated','public.ensure_booking_reminder_notifications()','execute') then
    raise exception 'Incorrect reminder routine grants';
  end if;
  source := pg_get_functiondef('public.generate_booking_reminders(uuid,timestamptz)'::regprocedure);
  source := replace(source,'public.generate_booking_reminders','pg_temp.generate_probe');
  foreach item in array array['bookings','profiles','packages','notifications'] loop
    source := replace(source,'public.' || item,'pg_temp.' || item || '_reminder_probe');
  end loop;
  execute source;
  source := pg_get_functiondef('public.ensure_booking_reminder_notifications()'::regprocedure);
  source := replace(replace(source,'public.ensure_booking_reminder_notifications','pg_temp.ensure_probe'),
    'public.generate_booking_reminders','pg_temp.generate_probe');
  execute source;
end; $$;
do $$
declare actor uuid := gen_random_uuid(); other_actor uuid := gen_random_uuid(); admin_actor uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); svc uuid := gen_random_uuid(); pkg uuid := gen_random_uuid();
  tomorrow date := (statement_timestamp() at time zone 'Asia/Manila')::date + 1; rejected boolean := false;
begin
  insert into profiles_reminder_probe(id,role,full_name) values(actor,'client','First'),(other_actor,'client','Second'),(admin_actor,'admin','Admin');
  insert into packages_reminder_probe(id,service_id,name,price) values(pkg,svc,'Portrait',1000);
  insert into bookings_reminder_probe(id,client_id,service_id,package_id,booking_date,start_time,end_time,status) values
    (b1,actor,svc,pkg,tomorrow,'09:00','10:00','confirmed'),(b2,other_actor,svc,pkg,tomorrow,'10:00','11:00','confirmed'),
    (gen_random_uuid(),actor,svc,pkg,tomorrow,'11:00','12:00','pending'),
    (gen_random_uuid(),actor,svc,pkg,tomorrow-1,'12:00','13:00','confirmed'),
    (gen_random_uuid(),actor,svc,pkg,tomorrow+1,'13:00','14:00','confirmed');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  set local role authenticated;
  perform pg_temp.ensure_probe(); perform pg_temp.ensure_probe();
  if (select count(*) from notifications_reminder_probe) <> 1
    or not exists(select 1 from notifications_reminder_probe where user_id=actor and booking_id=b1 and message like 'Your Portrait%') then
    raise exception 'App maintenance generated another recipient or duplicate';
  end if;
  reset role;
  if pg_temp.generate_probe() <> 3 or pg_temp.generate_probe() <> 0 then
    raise exception 'Scheduled job did not generate exactly the missing client/admin reminders';
  end if;
  if (select count(*) from notifications_reminder_probe where user_id=admin_actor) <> 2
    or (select count(*) from notifications_reminder_probe) <> 4 then raise exception 'Incorrect recipient count'; end if;
  insert into notifications_reminder_probe(user_id,booking_id,title,message) values(actor,b1,'Booking reminder','Duplicate')
    on conflict(user_id,booking_id) where title='Booking reminder' do nothing;
  if (select count(*) from notifications_reminder_probe) <> 4 then raise exception 'Atomic duplicate protection failed'; end if;
  truncate notifications_reminder_probe, bookings_reminder_probe;
  insert into bookings_reminder_probe(id,client_id,service_id,package_id,booking_date,start_time,end_time,status)
  values(b1,actor,svc,pkg,'2026-10-09','09:00','10:00','confirmed');
  if pg_temp.generate_probe(null,'2026-10-07T15:59:59Z') <> 0
    or pg_temp.generate_probe(null,'2026-10-07T16:00:00Z') <> 2 then
    raise exception 'Reminder date did not change at Manila midnight';
  end if;
  perform set_config('request.jwt.claims','{}',true); perform set_config('request.jwt.claim.sub','',true);
  set local role authenticated;
  begin perform pg_temp.ensure_probe(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Signed-out app maintenance accepted'; end if;
  reset role;
end; $$;
rollback;
select 'scheduled_reminder_verification_passed' as result;
