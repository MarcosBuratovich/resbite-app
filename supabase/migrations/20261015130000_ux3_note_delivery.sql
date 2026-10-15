-- UX3 Note to guests delivery check. LOCAL-ONLY: replaces a function from
-- 20261014130000_ux2_notification_wording.sql, which the hosted project does not run.
-- It goes live with the notification sender, after that has its own owner approval, never with the UX3 release.

-- A change notice or a Note to guests goes only to people who may still come, checked again at send time.
-- Otherwise the 20261014130000_ux2_notification_wording body.
create or replace function private.notification_recipient_eligible(p_outbox bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from private.notification_outbox o
 join public.profiles p on p.id=o.recipient_id
 join auth.users u on u.id=p.id
 join private.tester_roster r on r.email=lower(u.email) and r.enabled
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox and p.deletion_requested_at is null
 and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and (u.banned_until is null or u.banned_until<=now())
 and (plan.owner_id=p.id or exists(select 1 from public.attendees a where a.plan_id=plan.id and a.user_id=p.id
  and (o.kind not in ('plan_changed','guest_note') or a.response in ('accepted','maybe','pending'))))
 and o.created_at>now()-interval '24 hours'
 )
$$;
