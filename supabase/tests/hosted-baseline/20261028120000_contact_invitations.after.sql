-- Rehearsal checks for 20261028120000_contact_invitations (hosted-baseline mode only).
-- 1. The migration added its two tables and nineteen functions, redefined exactly remove_guest(), the outbox kind
-- check, the grant-source check and the private schema's grants, changed nothing else it relies on and wrote no rows.
do $$ declare item record; begin
 if exists(select 1 from private.invite_rehearsal_snapshot() where (name like 'table %' or name like 'function %') and definition is null) then
  raise exception 'Contact-invitation objects missing after the apply';
 end if;
 for item in
  select b.name, b.definition as before, n.definition as after
  from private.invite_rehearsal_baseline b join private.invite_rehearsal_snapshot() n on n.name=b.name
  where b.name not like 'table %' and b.name not like 'function %'
 loop
  if item.name in ('private.remove_guest(uuid,uuid)','constraint private.notification_outbox notification_outbox_kind_check',
   'constraint private.beta_access beta_access_source_check','schema private') then
   if item.before=item.after then raise exception '% not redefined by the apply', item.name; end if;
  elsif item.before is distinct from item.after then
   raise exception 'The apply changed %', item.name;
  end if;
 end loop;
 if (select definition from private.invite_rehearsal_snapshot() where name='constraint private.notification_outbox notification_outbox_kind_check')
    not like '%''invited''%'
 or (select definition from private.invite_rehearsal_snapshot() where name='constraint private.beta_access beta_access_source_check')
    not like '%''invitation''%'
 or (select definition from private.invite_rehearsal_snapshot() where name='private.remove_guest(uuid,uuid)') not like '%phone_invitations%' then
  raise exception 'The redefinitions lack the invited kind, the invitation source or the phone revoke';
 end if;
 if exists(select 1 from private.phone_invitations) or exists(select 1 from private.lookup_usage)
 or exists(select 1 from private.notification_outbox where kind='invited') or exists(select 1 from private.beta_access where source='invitation') then
  raise exception 'The apply wrote rows';
 end if;
end $$;
-- 2. Grants: the tables and the budget helper for nobody; the host's calls, the answer and the caller's own invitation
-- for signed-in accounts; the page and the number check for anyone but the service role; the fold for the service
-- role only, which may now use the private schema.
do $$ declare r text; s text; f text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'private.phone_invitations','select,insert,update,delete')
  or has_table_privilege(r,'private.lookup_usage','select,insert,update,delete') then
   raise exception '% may use a contact-invitation table', r;
  end if;
  if has_function_privilege(r,'private.charge_lookup(uuid,integer)','execute') then raise exception '% may call charge_lookup', r; end if;
 end loop;
 foreach s in array array['private.','public.'] loop
  foreach f in array array['contacts_on_resbite(text[])','invite_contacts(uuid,jsonb)','plan_phone_invitations(uuid)',
   'revoke_phone_invitation(uuid,text)','answer_phone_invitation(text,text,text,text)','my_phone_invitation(text)'] loop
   if not has_function_privilege('authenticated',s||f,'execute') or has_function_privilege('anon',s||f,'execute')
   or has_function_privilege('service_role',s||f,'execute') then raise exception '% grants wrong', s||f; end if;
  end loop;
  foreach f in array array['personal_invitation_page(text)','check_invited_number(text,text)'] loop
   if not has_function_privilege('anon',s||f,'execute') or not has_function_privilege('authenticated',s||f,'execute')
   or has_function_privilege('service_role',s||f,'execute') then raise exception '% grants wrong', s||f; end if;
  end loop;
  if not has_function_privilege('service_role',s||'fold_web_account(uuid,uuid)','execute')
  or has_function_privilege('anon',s||'fold_web_account(uuid,uuid)','execute')
  or has_function_privilege('authenticated',s||'fold_web_account(uuid,uuid)','execute') then raise exception '%fold_web_account grants wrong', s; end if;
 end loop;
 if not has_schema_privilege('service_role','private','usage') then raise exception 'service_role cannot reach the fold'; end if;
end $$;
-- 3. The host looks up and invites (the contact in the app, the web invitee and one more number by link), the web
-- invitee opens, checks and answers, the host removes the in-app guest and revokes the other link, the web invitee is
-- folded into the email account, and another invitation grant is a ban. The rollback restores every definition, grant
-- and check exactly and removes every new object, the in-app notices and the invitation grants (the ban stays a ban);
-- rehearsed, then undone.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ca000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 if public.contacts_on_resbite(array['+447700900802','+447700900804']) is distinct from array['447700900802'] then
  raise exception 'Lookup wrong';
 end if;
 r := public.invite_contacts('cb000000-0000-4000-8000-000000000001',jsonb_build_array(
  jsonb_build_object('phone','+447700900802','country','44','code',repeat('K',22)),
  jsonb_build_object('phone','+447700900804','country','44','code',repeat('L',22)),
  jsonb_build_object('phone','+447700900899','country','44','code',repeat('M',22))));
 if (select array_agg(e->>'kind') from jsonb_array_elements(r) e) is distinct from array['app','link','link'] then
  raise exception 'Invite kinds were %', r;
 end if;
end $$;
reset role;
set local role anon;
do $$ begin
 if public.personal_invitation_page(repeat('L',22))->>'state'<>'open' or not public.check_invited_number(repeat('L',22),'+447700900804') then
  raise exception 'The web invitee cannot open or check their link';
 end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ca000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 perform public.answer_phone_invitation(repeat('L',22),'Rehearsal web','accepted','2026-10');
 if public.my_phone_invitation(repeat('L',22))->>'response' is distinct from 'accepted' then raise exception 'Answer not recorded'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"ca000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.remove_guest('cb000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000002');
 perform public.revoke_phone_invitation('cb000000-0000-4000-8000-000000000001','+447700900899');
 if jsonb_array_length(public.plan_phone_invitations('cb000000-0000-4000-8000-000000000001'))<>1 then raise exception 'Host list wrong'; end if;
end $$;
reset role;
set local role service_role;
do $$ begin
 if public.fold_web_account('ca000000-0000-4000-8000-000000000004','ca000000-0000-4000-8000-000000000005')<>'{"moved_attendees":1}'::jsonb then
  raise exception 'Fold wrong';
 end if;
end $$;
reset role;
insert into private.beta_access(user_id,source,revoked_at) values ('ca000000-0000-4000-8000-000000000006','invitation',now());
do $$ begin
 if not exists(select 1 from private.notification_outbox where kind='invited')
 or (select source from private.beta_access where user_id='ca000000-0000-4000-8000-000000000005') is distinct from 'invitation'
 or not private.user_eligible('ca000000-0000-4000-8000-000000000005') or not exists(select 1 from private.lookup_usage) then
  raise exception 'Rehearsal data missing before the rollback';
 end if;
end $$;
\ir ../../rollback/20261028120000_contact_invitations.rollback.sql
do $$ declare item record; begin
 for item in
  select coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.invite_rehearsal_baseline b full join private.invite_rehearsal_snapshot() n on n.name=b.name
 loop
  if item.before is distinct from item.after then raise exception 'Rollback did not restore %', item.name; end if;
 end loop;
 -- The in-app notice is gone and the earlier notice stays.
 if exists(select 1 from private.notification_outbox where kind='invited')
 or not exists(select 1 from private.notification_outbox where dedupe_key='invite-rehearsal:cancelled') then
  raise exception 'Rollback deleted the wrong notices';
 end if;
 -- Maintainer and link grants stay; the live invitation grant is gone; the ban is a revoked maintainer grant.
 if (select count(*) from private.beta_access where user_id in ('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000002')
     and source='maintainer' and revoked_at is null)<>2
 or not exists(select 1 from private.beta_access where user_id='ca000000-0000-4000-8000-000000000003' and source='link' and revoked_at is null)
 or exists(select 1 from private.beta_access where user_id='ca000000-0000-4000-8000-000000000005')
 or (select source from private.beta_access where user_id='ca000000-0000-4000-8000-000000000006' and revoked_at is not null) is distinct from 'maintainer'
 or exists(select 1 from private.beta_access where source not in ('link','maintainer')) then
  raise exception 'Rollback changed the wrong grants';
 end if;
 -- The folded account keeps its place, answer and tick, but no longer gets in; the others keep their access.
 if (select response from public.attendees where plan_id='cb000000-0000-4000-8000-000000000001' and user_id='ca000000-0000-4000-8000-000000000005')
    is distinct from 'accepted'
 or (select terms_version from private.age_attestations where user_id='ca000000-0000-4000-8000-000000000005') is distinct from '2026-10' then
  raise exception 'Rollback lost the answer or the tick';
 end if;
 if private.user_eligible('ca000000-0000-4000-8000-000000000005') then raise exception 'The invitation grant holder kept access'; end if;
 if not private.user_eligible('ca000000-0000-4000-8000-000000000001') or not private.user_eligible('ca000000-0000-4000-8000-000000000003') then
  raise exception 'A maintainer or link grant holder lost access';
 end if;
end $$;
-- remove_guest works again without phone invitations.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ca000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.remove_guest('cb000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000005');
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.attendees where user_id='ca000000-0000-4000-8000-000000000005') then
  raise exception 'remove_guest did not remove the guest after the rollback';
 end if;
end $$;
rollback;
-- 4. Remove the seed and the rehearsal helpers so later tests start clean.
delete from public.plans where id='cb000000-0000-4000-8000-000000000001';
delete from auth.users where id in ('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000002',
 'ca000000-0000-4000-8000-000000000003','ca000000-0000-4000-8000-000000000004','ca000000-0000-4000-8000-000000000005',
 'ca000000-0000-4000-8000-000000000006');
drop table private.invite_rehearsal_baseline;
drop function private.invite_rehearsal_snapshot();
