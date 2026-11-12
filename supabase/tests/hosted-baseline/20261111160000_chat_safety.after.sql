-- Rehearsal checks for 20261111160000_chat_safety (hosted-baseline mode only). Task 1's first assertions; Task 2 completes
-- this file (its own objects, and the rollback rehearsed and undone).
-- 1. The block table (K-S5): private.blocks has RLS on, no policy and no privilege for any role.
do $$ declare r text; p text; begin
 if pg_catalog.to_regclass('private.blocks') is null
 or not (select relrowsecurity from pg_catalog.pg_class where oid='private.blocks'::regclass)
 or exists(select 1 from pg_catalog.pg_policy where polrelid='private.blocks'::regclass) then
  raise exception 'private.blocks is missing, has no RLS, or has a policy';
 end if;
 foreach r in array array['public','anon','authenticated','service_role'] loop
  foreach p in array array['select','insert','update','delete','truncate','references','trigger'] loop
   if has_table_privilege(r,'private.blocks',p) then raise exception '% has % on private.blocks', r, p; end if;
  end loop;
 end loop;
end $$;

-- 2. The functions (K-S5). block_user and my_blocks, both schemas, only authenticated may call; invited_by and
-- inviter_of no API role may. Each private one is a security definer with an empty search path, and each public one an
-- invoker. The worker's claim, redefined, is still for service_role only.
do $$ declare r text; f text; begin
 foreach f in array array['private.block_user(uuid,boolean)','public.block_user(uuid,boolean)','private.my_blocks()','public.my_blocks()'] loop
  if pg_catalog.to_regprocedure(f) is null then raise exception '% is missing', f; end if;
  foreach r in array array['public','anon','service_role'] loop
   if has_function_privilege(r,f,'execute') then raise exception '% may execute %', r, f; end if;
  end loop;
  if not has_function_privilege('authenticated',f,'execute') then raise exception 'authenticated may not execute %', f; end if;
 end loop;
 foreach f in array array['private.invited_by(uuid,uuid)','private.inviter_of(uuid)'] loop
  if pg_catalog.to_regprocedure(f) is null then raise exception '% is missing', f; end if;
  foreach r in array array['public','anon','authenticated','service_role'] loop
   if has_function_privilege(r,f,'execute') then raise exception '% may execute %', r, f; end if;
  end loop;
 end loop;
 foreach f in array array['private.block_user(uuid,boolean)','private.my_blocks()','private.invited_by(uuid,uuid)','private.inviter_of(uuid)'] loop
  if not (select p.prosecdef and p.proconfig=array['search_path=""'] from pg_catalog.pg_proc p where p.oid=f::regprocedure) then
   raise exception '% is not a security definer with an empty search path', f;
  end if;
 end loop;
 foreach f in array array['public.block_user(uuid,boolean)','public.my_blocks()'] loop
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid=f::regprocedure) then raise exception '% is a security definer', f; end if;
 end loop;
 foreach r in array array['public','anon','authenticated'] loop
  if has_function_privilege(r,'public.claim_notification_deliveries(integer)','execute') then
   raise exception '% may execute public.claim_notification_deliveries(integer)', r;
  end if;
 end loop;
 if not has_function_privilege('service_role','public.claim_notification_deliveries(integer)','execute') then
  raise exception 'service_role may not execute public.claim_notification_deliveries(integer)';
 end if;
end $$;
