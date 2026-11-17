-- Safety extension (20261117121000_safety_extension.sql; App Store readiness plan 4,
-- docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md, Task 2 and Decisions 7 and 9; spec C7): the three
-- priority report reasons (illegal, child_safety, intimate_image) beside the four, open-reports.sql listing child safety,
-- then intimate images, then illegal, then the rest, and the chat's blocked-terms match on a resbite's title,
-- description and note to guests, its meeting details and a person's name. The filter acts only on a person's own
-- write, and only on a value that changes: text written before a term was listed never blocks an unrelated edit, and
-- the database's own writes (the roll, the fold, the owner's scripts) are never refused. Synthetic identities only
-- (prefix ad); one rolled-back block.
-- Users ad…: 01 host (phone, profile "Host"); 02 Going on Picnic (phone, profile "Guest"); 03 phone, profile
-- "Zzold Sam"; 05 phone only, no profile. Plans ad1…: 01 "Picnic", a one-off with meeting details "Gate B" and the
-- open link C; 02 "Board zzold night", a one-off with meeting details "Meet at zzold gate". 02 wrote one message in
-- Picnic's chat. Then the terms zzbadword, zz bad and zzold are listed.
begin;
create function pg_temp.ad(p text) returns uuid language sql immutable as $$ select ('ad000000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.adp(p text) returns uuid language sql immutable as $$ select ('ad100000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.ad_start(k integer) returns timestamptz language sql stable as $$ select date_trunc('minute',now())+k*interval '1 day' $$;
-- Acting as someone: the claims auth.uid() reads (the role is set apart, with set local role).
create function pg_temp.ad_as(p_user uuid) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true)
$$;
create function pg_temp.ad_check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
 if p_ok is not true then raise exception '%', p_what; end if;
end $$;
-- A call that must be refused with exactly this code (and this message, unless it is null). The refusal undoes the
-- call, as a real one would.
create function pg_temp.ad_refused(p_sql text, p_state text, p_message text) returns void language plpgsql as $$
declare v_state text; v_message text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
 end;
 if v_state is distinct from p_state or (p_message is not null and v_message is distinct from p_message) then
  raise exception 'Expected % "%", got % "%": %', p_state, p_message, v_state, v_message, p_sql;
 end if;
end $$;
-- A new one-off resbite as the current claims, starting in three days: its id.
create function pg_temp.ad_create(p_id uuid, p_title text, p_description text) returns uuid language plpgsql as $$
begin
 return public.create_plan_v4(p_id,p_title,p_description,array['community'],null,pg_temp.ad_start(3),pg_temp.ad_start(3)+interval '2 hours',
  'Europe/London','The park',false,null::smallint,'');
end $$;
-- An edit through change_plan_v4 as the current claims, at the plan's version, keeping its title: a new description
-- (null keeps it), a new start (null keeps it; the end moves with it) and the meeting details as given (null keeps them).
create function pg_temp.ad_change(p_plan uuid, p_description text, p_start timestamptz, p_note text) returns integer language plpgsql as $$
declare p public.plans; v_start timestamptz;
begin
 select * into p from public.plans where id=p_plan;
 v_start := coalesce(p_start,p.starts_at);
 return public.change_plan_v4(p_plan,p.version,p.title,coalesce(p_description,p.description),p.categories,v_start,
  v_start+(p.ends_at-p.starts_at),p.time_zone,p.place_label,p.place_tbd,p.repeat_weeks,p_note,null,false,false);
end $$;
-- An owner-run script's rows, run from its text as the current role: a jsonb array, one object per row.
create function pg_temp.ad_run(p_sql text) returns jsonb language plpgsql as $$
declare r record; v jsonb := '[]'::jsonb;
begin
 if coalesce(length(btrim(p_sql)),0)=0 then raise exception 'The script text is empty'; end if;
 for r in execute p_sql loop v := v||jsonb_build_array(to_jsonb(r)); end loop;
 return v;
end $$;
-- The same in a read-only subtransaction, undone after: a script that writes anything fails with 25006.
create function pg_temp.ad_run_read_only(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
 begin
  perform set_config('transaction_read_only','on',true);
  v := pg_temp.ad_run(p_sql);
  raise exception 'ad: the read-only run is over';
 exception when raise_exception then
  if sqlerrm is distinct from 'ad: the read-only run is over' then raise; end if;
 end;
 return v;
end $$;
-- A script's column names, in order, as 'create temporary table … as <script>' makes them.
create function pg_temp.ad_columns(p_sql text) returns text language plpgsql as $$
declare v text;
begin
 execute 'create temporary table ad_columns_probe as '||regexp_replace(p_sql,';\s*$','');
 select string_agg(a.attname,',' order by a.attnum) into v from pg_catalog.pg_attribute a
 where a.attrelid='pg_temp.ad_columns_probe'::regclass and a.attnum>0 and not a.attisdropped;
 drop table pg_temp.ad_columns_probe;
 return v;
end $$;

-- The cast.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 (pg_temp.ad('01'),null,null,'447700900831',now()),
 (pg_temp.ad('02'),null,null,'447700900832',now()),
 (pg_temp.ad('03'),null,null,'447700900833',now()),
 (pg_temp.ad('05'),null,null,'447700900835',now());
insert into public.profiles(id,display_name) values (pg_temp.ad('01'),'Host'),(pg_temp.ad('02'),'Guest'),(pg_temp.ad('03'),'Zzold Sam');
select pg_temp.ad_as(pg_temp.ad('01'));
select public.create_plan_v4(pg_temp.adp('01'),'Picnic','',array['community'],null,pg_temp.ad_start(1),pg_temp.ad_start(1)+interval '2 hours',
 'Europe/London','The park',false,null::smallint,'Gate B');
select public.create_plan_v4(pg_temp.adp('02'),'Board zzold night','',array['community'],null,pg_temp.ad_start(2),
 pg_temp.ad_start(2)+interval '2 hours','Europe/London','Ana''s flat',false,null::smallint,'Meet at zzold gate');
select set_config('request.jwt.claims','',true);
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) values (pg_temp.adp('01'),pg_temp.ad('02'),'accepted');
select set_config('resbite.system','',true);
insert into public.messages(series_id,plan_id,author_id,kind,event,payload,body,created_at,updated_at) values
 (pg_temp.adp('01'),pg_temp.adp('01'),pg_temp.ad('02'),'message',null,null,'Guest says hi',now()-interval '1 hour',now()-interval '1 hour');
select set_config('ad.m',(select id::text from public.messages where series_id=pg_temp.adp('01') and body='Guest says hi'),true);
insert into private.plan_links(plan_id,code) values (pg_temp.adp('01'),repeat('C',22));
select pg_temp.ad_check((select note from public.plan_meeting_details where plan_id=pg_temp.adp('01'))='Gate B'
 and (select note from public.plan_meeting_details where plan_id=pg_temp.adp('02'))='Meet at zzold gate','The cast''s meeting details');
insert into private.blocked_terms(term) values ('zzbadword'),('zz bad'),('zzold');

-- 1. Reasons. As 01: a report of 02's message as an intimate image; a report about 02 on Picnic's series for child
-- safety, then (that one closed by hand) for something illegal. Each stored with its reason.
set local role authenticated;
select pg_temp.ad_as(pg_temp.ad('01'));
select public.report_message(current_setting('ad.m')::bigint,'intimate_image');
select public.report_user(pg_temp.ad('02'),pg_temp.adp('01'),'child_safety');
reset role;
select pg_temp.ad_check((select reason from private.reports where reporter_id=pg_temp.ad('01') and message_id=current_setting('ad.m')::bigint)
 ='intimate_image','The report of 02''s message is not stored as intimate_image');
select pg_temp.ad_check((select string_agg(reason,',') from private.reports where reporter_id=pg_temp.ad('01') and about='user')='child_safety',
 'The report about 02 is not stored as child_safety');
update private.reports set status='reviewed',reviewed_at=now(),review_note='ad: closed by hand' where reporter_id=pg_temp.ad('01') and about='user';
set local role authenticated;
select pg_temp.ad_as(pg_temp.ad('01'));
select public.report_user(pg_temp.ad('02'),pg_temp.adp('01'),'illegal');
-- A reason outside the seven is refused as before.
select pg_temp.ad_refused(format('select public.report_message(%s,%L)',current_setting('ad.m'),'rude'),'23514','Invalid report');
select pg_temp.ad_refused(format('select public.report_user(%L,%L,%L)',pg_temp.ad('02'),pg_temp.adp('01'),'rude'),'23514','Invalid report');
reset role;
select pg_temp.ad_check((select reason from private.reports where reporter_id=pg_temp.ad('01') and about='user' and status='open')='illegal',
 'The second report about 02 is not stored as illegal');
-- The table's check: 'rude' is a check violation; each of the seven is stored (undone after).
select pg_temp.ad_refused($q$insert into private.reports(reporter_id,target_user_id,about,reason) values (null,null,'user','rude')$q$,'23514',null);
savepoint ad_reasons;
insert into private.reports(reporter_id,target_user_id,about,reason)
 select null,null,'user',r from unnest(array['illegal','child_safety','intimate_image','harassment','spam','inappropriate','other']) r;
select pg_temp.ad_check((select count(*) from private.reports where reporter_id is null)=7,'The seven reasons were not all stored');
rollback to savepoint ad_reasons;

-- 2. Plans, as 01. A new resbite whose title or description holds a listed term is refused and not stored; a longer
-- word that starts with one is not the term (whole words only).
set local role authenticated;
select pg_temp.ad_as(pg_temp.ad('01'));
select pg_temp.ad_refused(format('select pg_temp.ad_create(%L,%L,%L)',pg_temp.adp('11'),'zzbadword picnic',''),'22023','Not allowed');
select pg_temp.ad_refused(format('select pg_temp.ad_create(%L,%L,%L)',pg_temp.adp('12'),'Lunch','Bring ZZBADWORD'),'22023','Not allowed');
select pg_temp.ad_check(pg_temp.ad_create(pg_temp.adp('13'),'zzbadwords night','')=pg_temp.adp('13'),'zzbadwords night was not created');
reset role;
select pg_temp.ad_check(not exists(select 1 from public.plans where id in (pg_temp.adp('11'),pg_temp.adp('12'))),'A refused resbite was stored');
select pg_temp.ad_check((select title from public.plans where id=pg_temp.adp('13'))='zzbadwords night','zzbadwords night is not stored');
-- An edit whose description holds 'zz bad' across a line break; an edit whose meeting details hold a term; a note to
-- guests holding one: each refused, and nothing changes.
select set_config('ad.v01',(select version::text from public.plans where id=pg_temp.adp('01')),true);
set local role authenticated;
select pg_temp.ad_as(pg_temp.ad('01'));
select pg_temp.ad_refused(format('select pg_temp.ad_change(%L,%L,null,null)',pg_temp.adp('01'),'a zz'||E'\n'||'bad b'),'22023','Not allowed');
select pg_temp.ad_refused(format('select pg_temp.ad_change(%L,null,null,%L)',pg_temp.adp('01'),'zzbadword at the gate'),'22023','Not allowed');
select pg_temp.ad_refused(format('select public.set_guest_note(%L,%L)',pg_temp.adp('01'),'zzbadword'),'22023','Not allowed');
reset role;
select pg_temp.ad_check((select (version::text,description,guest_note)=(current_setting('ad.v01'),'','') from public.plans where id=pg_temp.adp('01')),
 'A refused edit changed Picnic: '||(select row(version,description,guest_note)::text from public.plans where id=pg_temp.adp('01')));
select pg_temp.ad_check((select note from public.plan_meeting_details where plan_id=pg_temp.adp('01'))='Gate B','Picnic''s meeting details changed');

-- 3. Names. 02 renaming to a term is refused; 02 stays "Guest". 05 asking to join through the open link with a name
-- that is a term is refused, and leaves nothing: no profile, no guest row, no request, no tick.
set local role authenticated;
select pg_temp.ad_as(pg_temp.ad('02'));
select pg_temp.ad_refused($q$select public.save_profile('Zzbadword')$q$,'22023','Not allowed');
select pg_temp.ad_as(pg_temp.ad('05'));
select pg_temp.ad_refused(format('select public.request_to_join(%L,%L,%L,%L)',repeat('C',22),'zzbadword','accepted','2026-12'),'22023','Not allowed');
reset role;
select pg_temp.ad_check((select display_name from public.profiles where id=pg_temp.ad('02'))='Guest','02''s name changed');
select pg_temp.ad_check(not exists(select 1 from public.profiles where id=pg_temp.ad('05'))
 and not exists(select 1 from public.attendees where user_id=pg_temp.ad('05'))
 and not exists(select 1 from private.join_requests where user_id=pg_temp.ad('05'))
 and not exists(select 1 from private.age_attestations where user_id=pg_temp.ad('05')),'05''s refused request left something behind');

-- 4. Text written before its term was listed (Review Focus 3). Moving only the start of "Board zzold night", with the
-- same title and the same meeting details, saves (version + 1); 03 saving the same name "Zzold Sam" saves.
select set_config('ad.v02',(select version::text from public.plans where id=pg_temp.adp('02')),true);
set local role authenticated;
select pg_temp.ad_as(pg_temp.ad('01'));
select set_config('ad.v02new',pg_temp.ad_change(pg_temp.adp('02'),null,pg_temp.ad_start(2)+interval '1 hour','Meet at zzold gate')::text,true);
select pg_temp.ad_as(pg_temp.ad('03'));
select pg_temp.ad_check(public.save_profile('Zzold Sam')=pg_temp.ad('03'),'03 could not save the same name');
reset role;
select pg_temp.ad_check(current_setting('ad.v02new')::integer=current_setting('ad.v02')::integer+1
 and (select (version,title,starts_at)=(current_setting('ad.v02')::integer+1,'Board zzold night',pg_temp.ad_start(2)+interval '1 hour')
  from public.plans where id=pg_temp.adp('02')),'Moving Board zzold night did not save: '
 ||(select row(version,title,starts_at)::text from public.plans where id=pg_temp.adp('02')));
select pg_temp.ad_check((select note from public.plan_meeting_details where plan_id=pg_temp.adp('02'))='Meet at zzold gate',
 'Board zzold night''s meeting details changed');
select pg_temp.ad_check((select display_name from public.profiles where id=pg_temp.ad('03'))='Zzold Sam','03''s name changed');

-- 5. The database's own writes (no person's claims, as the roll, the fold and the owner's scripts run): a title and a
-- name holding a term are stored (undone after).
select set_config('request.jwt.claims','',true);
savepoint ad_system;
update public.plans set title='zzbadword' where id=pg_temp.adp('01');
insert into public.profiles(id,display_name) values (pg_temp.ad('05'),'zzbadword');
select pg_temp.ad_check((select title from public.plans where id=pg_temp.adp('01'))='zzbadword'
 and (select display_name from public.profiles where id=pg_temp.ad('05'))='zzbadword','A write with no claims was refused');
rollback to savepoint ad_system;

-- 6. The match: a listed term is found; a text over 16,000 bytes, an empty one and none are not checked.
select pg_temp.ad_check(private.holds_blocked_term('Bring zzbadword') and private.holds_blocked_term('ZZ'||chr(160)||'bad'),
 'holds_blocked_term misses a listed term');
select pg_temp.ad_check(not private.holds_blocked_term(repeat('zzbadword ',2000)),'holds_blocked_term checked a text over 16,000 bytes');
select pg_temp.ad_check(private.holds_blocked_term('') is false and private.holds_blocked_term(null) is false,
 'holds_blocked_term of an empty text or null is not false');

-- 7. open-reports.sql. Four open reports added by hand, an hour apart, oldest first: harassment, illegal, child_safety,
-- intimate_image. Its report rows list every open child_safety report, then intimate_image, then illegal, then the
-- rest, each group oldest first; its columns are unchanged.
insert into private.reports(reporter_id,target_user_id,series_id,plan_id,about,reason,created_at)
 select null,pg_temp.ad('02'),pg_temp.adp('01'),pg_temp.adp('01'),'user',x.reason,now()-x.hours*interval '1 hour'
 from (values ('harassment',4),('illegal',3),('child_safety',2),('intimate_image',1)) x(reason,hours);
\set ad_script `cat :'resbite_repo'/supabase/ops/open-reports.sql`
select pg_temp.ad_check(pg_temp.ad_columns(:'ad_script')='item,id,created_at,reason,details,frozen_body,reporter_name,target_name,resbite_title,resbite_date',
 'open-reports.sql''s columns: '||pg_temp.ad_columns(:'ad_script'));
select set_config('ad.out',pg_temp.ad_run_read_only(:'ad_script')::text,true);
do $$ declare v jsonb := current_setting('ad.out')::jsonb; begin
 perform pg_temp.ad_check((select string_agg(t.value->>'id',',' order by t.n) from jsonb_array_elements(v) with ordinality t(value,n)
   where t.value->>'item'='report')
  =(select string_agg(id::text,',' order by case reason when 'child_safety' then 0 when 'intimate_image' then 1 when 'illegal' then 2 else 3 end,
    created_at,id) from private.reports where status='open'),'open-reports.sql''s reports are not in priority order: '||v::text);
 perform pg_temp.ad_check((select string_agg(t.value->>'reason',',' order by t.n) from jsonb_array_elements(v) with ordinality t(value,n)
   where t.value->>'item'='report')='child_safety,intimate_image,intimate_image,illegal,illegal,harassment',
  'open-reports.sql''s reasons: '||v::text);
end $$;

-- 8. Grants and triggers: the match and the three trigger functions are executable by no API role; the three
-- triggers exist, and the plans one runs after the deletion's redaction (BEFORE triggers fire in name order).
do $$ declare f regprocedure; r text; begin
 foreach f in array array['private.holds_blocked_term(text)'::regprocedure,'private.refuse_blocked_plan_words()'::regprocedure,
   'private.refuse_blocked_meeting_words()'::regprocedure,'private.refuse_blocked_name()'::regprocedure] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(r,f,'EXECUTE') then raise exception '% is executable by %', f, r; end if;
  end loop;
 end loop;
 if (select count(*) from pg_catalog.pg_trigger t where not t.tgisinternal and (t.tgname,t.tgrelid) in
   (('plans_refuse_blocked_words','public.plans'::regclass),('plan_meeting_details_refuse_blocked_words','public.plan_meeting_details'::regclass),
    ('profiles_refuse_blocked_words','public.profiles'::regclass)))<>3 then
  raise exception 'A blocked-words trigger is missing';
 end if;
 if not ('plans_redact_deleting_owner' collate "C" < 'plans_refuse_blocked_words' collate "C") then
  raise exception 'The plans trigger would run before the deletion''s redaction';
 end if;
end $$;
rollback;
