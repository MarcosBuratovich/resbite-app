-- UX2 notification wording inputs. LOCAL-ONLY: replaces functions from
-- 20260918001308_notification_delivery_preparation.sql, which the hosted project does not run.
-- It goes live with the notification sender, after that has its own owner approval, never with the UX2 release.

-- A change notice goes only to people who may still come, checked again at send time (UX-P4).
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
  and (o.kind<>'plan_changed' or a.response in ('accepted','maybe','pending'))))
 and o.created_at>now()-interval '24 hours'
 )
$$;

-- Each job carries what the sender may say (UX2-D4): never the place, note, description or cover description.
-- Otherwise the 20260918001308_notification_delivery_preparation body, verbatim.
create or replace function public.claim_notification_deliveries(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_outbox record; v_result jsonb;
begin
 -- Endpoint expansion is once per logical event; never notify a newly bound device about old events.
 for v_outbox in select o.id from private.notification_outbox o
 where o.expanded_at is null and o.delivered_at is null order by o.id limit 100 for update skip locked
 loop
  if private.notification_recipient_eligible(v_outbox.id) then
   insert into private.notification_deliveries(outbox_id,token,endpoint_updated_at)
   select o.id,e.token,e.updated_at from private.notification_outbox o
   join private.device_endpoints e on e.user_id=o.recipient_id where o.id=v_outbox.id
   on conflict do nothing;
  end if;
  update private.notification_outbox set expanded_at=now() where id=v_outbox.id;
 end loop;
 -- A crashed send without a persisted ticket is uncertain: never blindly send it again.
 update private.notification_deliveries set state='unknown',lease_id=null,lease_until=null
 where state='sending' and lease_until<now();
 update private.notification_deliveries d set state='suppressed',lease_id=null,lease_until=null
 where d.state in ('pending','ticket') and (not private.notification_recipient_eligible(d.outbox_id)
 or not exists(select 1 from private.device_endpoints e join private.notification_outbox o on o.id=d.outbox_id
 where e.token=d.token and e.user_id=o.recipient_id and e.updated_at=d.endpoint_updated_at));
 with picked as (
 select d.id from private.notification_deliveries d where d.state in ('pending','ticket')
 and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<now())
 order by d.next_attempt_at,d.id limit greatest(1,least(coalesce(p_limit,25),25)) for update skip locked
 ), claimed as (
 update private.notification_deliveries d set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',
 attempts=d.attempts+1,state=case when d.ticket_id is null then 'sending' else 'ticket' end
 from picked where d.id=picked.id returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease_id',d.lease_id,'outbox_id',d.outbox_id::text,
 'plan_id',o.plan_id,'recipient_id',o.recipient_id,'token',d.token,'attempts',d.attempts,
 'ticket_id',d.ticket_id,'ticket_created_at',d.ticket_created_at,
 'kind',o.kind,'detail',o.detail,'title',plan.title,'starts_at',plan.starts_at,'time_zone',plan.time_zone,
 'actor_name',actor.display_name)),'[]'::jsonb) into v_result
 from claimed d join private.notification_outbox o on o.id=d.outbox_id
 join public.plans plan on plan.id=o.plan_id
 left join public.profiles actor on actor.id=o.actor_id and actor.deletion_requested_at is null;
 update private.notification_outbox o set delivered_at=now() where o.expanded_at is not null and o.delivered_at is null
 and not exists(select 1 from private.notification_deliveries d where d.outbox_id=o.id and d.state in ('pending','sending','ticket'));
 return v_result;
end $$;
