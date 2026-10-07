-- Offline catalogue checks complement, not replace, hosted Supabase advisors.
begin;
do $$ declare item record; begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' and not c.relrowsecurity) then raise exception 'Private table lacks RLS'; end if;
 for item in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('request_account_deletion','account_deletion_status','claim_account_deletions','deletion_photo_paths','finish_account_deletion','claim_notification_deliveries','validate_notification_delivery','finish_notification_delivery') loop
  if has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE') then raise exception 'Privileged RPC exposed: %',item.proname; end if;
  if not has_function_privilege('service_role',item.oid,'EXECUTE') then raise exception 'Worker RPC inaccessible: %',item.proname; end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prosecdef and not ('search_path=""'=any(p.proconfig))) then raise exception 'Private definer has unsafe search path'; end if;
end $$;
rollback;
