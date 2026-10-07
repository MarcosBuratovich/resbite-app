-- Read-only own-account status. This does not approve testers or replace RLS.
-- Depends only on the foundation; private.eligible() remains authoritative when
-- later lifecycle migrations strengthen eligibility.
create function private.account_access_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_user auth.users; v_status text;
begin
 if v_uid is null then
  raise exception 'Authenticated account required' using errcode='42501';
 end if;
 select * into v_user from auth.users where id=v_uid;
 if not found then
  raise exception 'Authenticated account required' using errcode='42501';
 end if;
 if private.eligible() then
  v_status := 'approved';
 elsif v_user.email_confirmed_at is null
   and not coalesce(v_user.is_anonymous,false)
   and (v_user.banned_until is null or v_user.banned_until<=now())
   and not exists(select 1 from public.profiles p where p.id=v_uid and p.deletion_requested_at is not null)
 then
  v_status := 'unconfirmed';
 else
  v_status := 'access_pending';
 end if;
 return jsonb_build_object('account_id',v_uid,'status',v_status);
end $$;

create function public.account_access_status() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select private.account_access_status()
$$;

revoke all on function private.account_access_status(),public.account_access_status() from public,anon,authenticated,service_role;
grant execute on function private.account_access_status(),public.account_access_status() to authenticated;
