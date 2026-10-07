-- Own optional onboarding metadata only. Approval, credentials and public profile
-- data are unchanged. Auth API updates do not expose conditional writes, so this
-- narrow RPC serializes the existing metadata contract without a second store.
create function private.save_registration_details(p_expected jsonb,p_details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_user auth.users;
 v_meta jsonb;
 v_old jsonb;
 v_saved jsonb;
 v_birth date;
 v_deleting boolean := false;
begin
 if v_uid is null then raise exception 'Verified account required' using errcode='42501'; end if;
 -- Match the deletion lifecycle's lock order: user advisory lock, then rows.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 select * into v_user from auth.users where id=v_uid for update;
 if not found or v_user.email_confirmed_at is null or coalesce(v_user.is_anonymous,false)
   or (v_user.banned_until is not null and v_user.banned_until>now())
 then raise exception 'Verified account required' using errcode='42501'; end if;
 if exists(select 1 from public.profiles p where p.id=v_uid and p.deletion_requested_at is not null) then
  raise exception 'Account is unavailable' using errcode='42501';
 end if;
 -- The foundation is deployable without the prepared deletion-job migration.
 if to_regclass('private.account_deletion_jobs') is not null then
  execute 'select exists(select 1 from private.account_deletion_jobs where user_id=$1)'
    into v_deleting using v_uid;
  if v_deleting then raise exception 'Account is unavailable' using errcode='42501'; end if;
 end if;

 if jsonb_typeof(p_details) is distinct from 'object' then
  raise exception 'Invalid account details' using errcode='22023';
 end if;
 if not (p_details ?& array['birth_date','phone','city','interests'])
   or (p_details - array['birth_date','phone','city','interests']) <> '{}'::jsonb then
  raise exception 'Invalid account details fields' using errcode='22023';
 end if;
 if p_details->'birth_date' <> 'null'::jsonb then
  if jsonb_typeof(p_details->'birth_date')<>'string' or (p_details->>'birth_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   raise exception 'Invalid date of birth' using errcode='22023';
  end if;
  begin
   v_birth := (p_details->>'birth_date')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
   raise exception 'Invalid date of birth' using errcode='22023';
  end;
  if v_birth < date '1900-01-01' or v_birth > current_date then
   raise exception 'Invalid date of birth' using errcode='22023';
  end if;
 end if;
 if p_details->'phone' <> 'null'::jsonb and
   (jsonb_typeof(p_details->'phone')<>'string' or (p_details->>'phone') !~ '^[+][1-9][0-9]{6,14}$') then
  raise exception 'Invalid phone number' using errcode='22023';
 end if;
 if p_details->'city' <> 'null'::jsonb and
   (jsonb_typeof(p_details->'city')<>'string' or char_length(p_details->>'city') not between 1 and 100
     or btrim(p_details->>'city') <> p_details->>'city') then
  raise exception 'Invalid city' using errcode='22023';
 end if;
 if jsonb_typeof(p_details->'interests') is distinct from 'array' then
  raise exception 'Invalid interests' using errcode='22023';
 end if;
 if jsonb_array_length(p_details->'interests')>6 or exists(
   select 1 from jsonb_array_elements(p_details->'interests') item
   where jsonb_typeof(item)<>'string' or not (item #>> '{}'=any(array[
     'Outdoors','Food & drink','Arts & creativity','Relaxation','Learning','Time with friends'])))
   or (select count(distinct item) from jsonb_array_elements(p_details->'interests') item) <> jsonb_array_length(p_details->'interests')
 then raise exception 'Invalid interests' using errcode='22023'; end if;

 v_meta := coalesce(v_user.raw_user_meta_data,'{}'::jsonb);
 if jsonb_typeof(v_meta)<>'object' then raise exception 'Invalid stored account details' using errcode='22023'; end if;
 v_old := coalesce(v_meta->'registration_details','null'::jsonb);
 v_saved := (case when jsonb_typeof(v_old)='object' then v_old else '{}'::jsonb end) || p_details;
 -- Repeated identical saves (including a lost successful reply) do not mutate.
 if v_old=v_saved and v_meta->'registration_details_version'='1'::jsonb then
  return jsonb_build_object('account_id',v_uid,'registration_details',v_old);
 end if;
 if v_old is distinct from coalesce(p_expected,'null'::jsonb) then
  raise exception 'Account details changed; reload before saving' using errcode='40001';
 end if;
 update auth.users set raw_user_meta_data=v_meta || jsonb_build_object(
   'registration_details',v_saved,'registration_details_version',1)
 where id=v_uid;
 return jsonb_build_object('account_id',v_uid,'registration_details',v_saved);
end $$;

create function public.save_registration_details(p_expected jsonb,p_details jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.save_registration_details(p_expected,p_details)
$$;
revoke all on function private.save_registration_details(jsonb,jsonb),public.save_registration_details(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.save_registration_details(jsonb,jsonb),public.save_registration_details(jsonb,jsonb) to authenticated;
