-- Custom events CE2: organizer cover photos. Private bucket; owner-only uploads to an
-- active future plan; readers see only the current cover; compare-and-swap attach.
-- Hosted-compatible: depends only on the hosted foundation and custom_events migrations.

alter table public.plans
 add column cover_path text check (cover_path is null or length(cover_path) <= 300),
 add column cover_revision bigint not null default 0 check (cover_revision >= 0);

-- The database owns the counter, as for avatars: any cover_path change bumps it once;
-- unrelated or no-op updates (including trusted maintenance) cannot change it.
create function private.track_cover_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.cover_revision := 0;
 elsif new.cover_path is distinct from old.cover_path then
  new.cover_revision := old.cover_revision + 1;
 else
  new.cover_revision := old.cover_revision;
 end if;
 return new;
end $$;
revoke all on function private.track_cover_revision() from public, anon, authenticated, service_role;
-- BEFORE triggers fire in name order: this runs after plans_redact_deleting_owner.
create trigger plans_track_cover_revision before insert or update on public.plans
 for each row execute function private.track_cover_revision();

-- Deletion redaction now also detaches the cover (create or replace keeps its privileges).
create or replace function private.redact_deleting_owner_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.owner_id is not null and exists(
  select 1 from public.profiles as p where p.id = new.owner_id and p.deletion_requested_at is not null) then
  new.title := 'Resbite';
  new.description := '';
  new.cover_path := null;
 end if;
 return new;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('plan-covers','plan-covers',false,2097152,array['image/jpeg']);

-- Paths are <owner uid>/<plan id>/<name>.jpg. Uploads (insert, and update for upsert)
-- go only into the caller's own folder for their own active, future plan.
create policy resbite_cover_insert on storage.objects for insert to authenticated with check (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and p.starts_at>now())
);
create policy resbite_cover_update on storage.objects for update to authenticated using (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and p.starts_at>now())
) with check (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and p.starts_at>now())
);
-- The owner reads their own uploads (interrupted-upload recovery). Anyone else who can
-- read the plan reads only its current cover. No delete policy: clients only detach.
create policy resbite_cover_read on storage.objects for select to authenticated using (
 bucket_id='plan-covers' and (select private.eligible()) and exists(
  select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
   and p.owner_id::text=(storage.foldername(name))[1]
   and (p.owner_id=(select auth.uid()) or p.cover_path=name))
);

create function private.set_plan_cover_if_current(p_plan uuid,p_path text,p_expected_path text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans;
begin
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid cover revision' using errcode='22023'; end if;
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_path is not null and (p_path !~ ('^'||v_uid::text||'/'||p_plan::text||'/[A-Za-z0-9-]+\.jpg$') or not exists(
   select 1 from storage.objects where bucket_id='plan-covers' and name=p_path)) then
  raise exception 'Own uploaded cover required' using errcode='42501';
 end if;
 if v_plan.cover_path is not distinct from p_expected_path and v_plan.cover_revision=p_expected_revision then
  if v_plan.cover_path is distinct from p_path then
   update public.plans set cover_path=p_path where id=p_plan returning * into v_plan;
  end if;
 elsif v_plan.cover_path is not distinct from p_path
   and v_plan.cover_revision>0 and v_plan.cover_revision-1=p_expected_revision then
  -- Only the exact next revision acknowledges a lost successful reply (no ABA replay).
  null;
 else
  raise exception 'The cover changed elsewhere; reload before saving' using errcode='40001';
 end if;
 return jsonb_build_object('cover_path',v_plan.cover_path,'cover_revision',v_plan.cover_revision);
end $$;
create function public.set_plan_cover_if_current(p_plan uuid,p_path text,p_expected_path text,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select private.set_plan_cover_if_current(p_plan,p_path,p_expected_path,p_expected_revision)
$$;
revoke all on function private.set_plan_cover_if_current(uuid,text,text,bigint), public.set_plan_cover_if_current(uuid,text,text,bigint)
 from public, anon, authenticated, service_role;
grant execute on function private.set_plan_cover_if_current(uuid,text,text,bigint), public.set_plan_cover_if_current(uuid,text,text,bigint)
 to authenticated;
