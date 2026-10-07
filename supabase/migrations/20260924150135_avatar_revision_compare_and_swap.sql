-- Additive photo concurrency protection; no cleanup/deletion worker is enabled.
alter table public.profiles add column avatar_revision bigint not null default 0
 check(avatar_revision>=0);

-- The database owns this counter, including legacy set_avatar and trusted direct
-- maintenance. Unrelated/no-op updates cannot bump, rewind or replace it.
create function private.track_avatar_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.avatar_revision := 0;
 elsif new.avatar_path is distinct from old.avatar_path then
  new.avatar_revision := old.avatar_revision + 1;
 else
  new.avatar_revision := old.avatar_revision;
 end if;
 return new;
end $$;
revoke all on function private.track_avatar_revision() from public,anon,authenticated,service_role;
create trigger resbite_profile_avatar_revision before insert or update on public.profiles
 for each row execute function private.track_avatar_revision();

create function private.set_avatar_if_current(p_path text,p_expected_path text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_profile public.profiles;
begin
 if v_uid is null then raise exception 'Verified invited tester required' using errcode='42501'; end if;
 -- Foundation-only installs do not yet lock in require_tester(). Take the
 -- shared lifecycle lock explicitly before eligibility and profile row locks.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 perform private.require_tester();
 if p_expected_revision is null or p_expected_revision<0 then
  raise exception 'Invalid photo revision' using errcode='22023';
 end if;
 select * into v_profile from public.profiles where id=v_uid for update;
 if not found then raise exception 'Save your profile before adding a photo' using errcode='22023'; end if;
 if p_path is not null and (split_part(p_path,'/',1)<>v_uid::text or not exists(
   select 1 from storage.objects where bucket_id='profile-photos' and name=p_path)) then
  raise exception 'Own uploaded photo required' using errcode='42501';
 end if;
 if v_profile.avatar_path is not distinct from p_expected_path and v_profile.avatar_revision=p_expected_revision then
  if v_profile.avatar_path is distinct from p_path then
   update public.profiles set avatar_path=p_path where id=v_uid returning * into v_profile;
  end if;
 elsif v_profile.avatar_path is not distinct from p_path
   and v_profile.avatar_revision>0 and v_profile.avatar_revision-1=p_expected_revision then
  -- Only the exact next revision can acknowledge a lost successful reply.
  -- In particular, an A->B->A sequence cannot replay a stale A baseline.
  null;
 else
  raise exception 'Your photo changed elsewhere; reload before saving' using errcode='40001';
 end if;
 return jsonb_build_object('avatar_path',v_profile.avatar_path,'avatar_revision',v_profile.avatar_revision);
end $$;
create function public.set_avatar_if_current(p_path text,p_expected_path text,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select private.set_avatar_if_current(p_path,p_expected_path,p_expected_revision)
$$;
revoke all on function private.set_avatar_if_current(text,text,bigint),public.set_avatar_if_current(text,text,bigint) from public,anon,authenticated,service_role;
grant execute on function private.set_avatar_if_current(text,text,bigint),public.set_avatar_if_current(text,text,bigint) to authenticated;

-- Keep interrupted-upload reads for the owner. Other authorized participants
-- may read only the currently referenced photo, not replaced/orphaned images.
-- This is independent of the prepared cleanup worker and its retirement fences.
alter policy resbite_avatar_read on storage.objects using (
 bucket_id='profile-photos' and (select private.eligible()) and exists(
  select 1 from public.profiles p where p.id::text=(storage.foldername(name))[1]
   and private.can_read_profile(p.id) and (p.id=(select auth.uid()) or p.avatar_path=name))
);

-- Clients detach through the versioned profile pointer. Physical deletion needs
-- the service worker's durable retirement fence, so old/in-flight clients must
-- not be able to remove an object another device has just attached.
alter policy resbite_avatar_delete on storage.objects using (false);
