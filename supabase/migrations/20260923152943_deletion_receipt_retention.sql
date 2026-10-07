-- Depends on 20260923152816_orphan_profile_photo_cleanup (receipt proof must outlive photo fences).
-- Prepared only. Requires reviewed retention/backup policy before worker activation.
-- Completed deletion receipts contain no user content but retain request/user IDs
-- and a recovery-secret digest. Keep them for 30 days after proven completion.
create index account_deletion_completed_idx on private.account_deletion_jobs(completed_at)
 where status='complete';

create function private.purge_completed_deletion_receipts(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if p_limit is null or p_limit not between 1 and 100 then
  raise exception 'Invalid purge batch size' using errcode='22023';
 end if;
 with candidates as (
  select j.request_id from private.account_deletion_jobs j
  where j.status='complete' and j.completed_at<=now()-interval '30 days'
    and j.lease_id is null and j.lease_until is null
    and not exists(select 1 from private.profile_photo_retired_paths r where r.user_id=j.user_id)
    and not exists(select 1 from private.profile_photo_cleanup_jobs p where p.user_id=j.user_id)
    and not exists(select 1 from auth.users u where u.id=j.user_id)
    and not exists(select 1 from public.profiles p where p.id=j.user_id)
    and not exists(select 1 from storage.objects o
      where o.bucket_id='profile-photos' and o.name like j.user_id::text||'/%')
  order by j.completed_at,j.request_id
  limit p_limit for update of j skip locked
 ), removed as (
  delete from private.account_deletion_jobs j using candidates c
   where j.request_id=c.request_id returning j.request_id
 ) select count(*) into v_count from removed;
 return v_count;
end $$;
create function public.purge_completed_deletion_receipts(p_limit integer default 100)
returns integer language sql security invoker set search_path='' as $$
 select private.purge_completed_deletion_receipts(p_limit)
$$;
revoke all on function private.purge_completed_deletion_receipts(integer),public.purge_completed_deletion_receipts(integer) from public,anon,authenticated;
grant execute on function private.purge_completed_deletion_receipts(integer),public.purge_completed_deletion_receipts(integer) to service_role;
