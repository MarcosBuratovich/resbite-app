-- Preparation only: Edge worker has a hard disabled release gate. No schedule or sends.
create table private.notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 outbox_id bigint not null references private.notification_outbox(id) on delete cascade,
 token text not null,
 endpoint_updated_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','sending','ticket','received','failed','invalid','unknown','suppressed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease_id uuid,
 lease_until timestamptz,
 ticket_id text,
 ticket_created_at timestamptz,
 unique(outbox_id,token)
);
alter table private.notification_deliveries enable row level security;
revoke all on private.notification_deliveries from public,anon,authenticated;
create index notification_deliveries_due_idx on private.notification_deliveries(next_attempt_at) where state in ('pending','ticket','sending');
alter table private.notification_outbox add column expanded_at timestamptz;

create function private.notification_recipient_eligible(p_outbox bigint) returns boolean
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
 and (plan.owner_id=p.id or exists(select 1 from public.attendees a where a.plan_id=plan.id and a.user_id=p.id))
 and o.created_at>now()-interval '24 hours'
 )
$$;
revoke all on function private.notification_recipient_eligible(bigint) from public,anon,authenticated;

create function public.claim_notification_deliveries(p_limit integer default 25) returns jsonb
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
 'ticket_id',d.ticket_id,'ticket_created_at',d.ticket_created_at)),'[]'::jsonb) into v_result
 from claimed d join private.notification_outbox o on o.id=d.outbox_id;
 update private.notification_outbox o set delivered_at=now() where o.expanded_at is not null and o.delivered_at is null
 and not exists(select 1 from private.notification_deliveries d where d.outbox_id=o.id and d.state in ('pending','sending','ticket'));
 return v_result;
end $$;

create function public.validate_notification_delivery(p_id uuid,p_lease uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from private.notification_deliveries d
 join private.notification_outbox o on o.id=d.outbox_id
 join private.device_endpoints e on e.token=d.token and e.user_id=o.recipient_id and e.updated_at=d.endpoint_updated_at
 where d.id=p_id and d.lease_id=p_lease and d.lease_until>now() and d.state in ('sending','ticket')
 and private.notification_recipient_eligible(o.id))
$$;

create function public.finish_notification_delivery(p_id uuid,p_lease uuid,p_outcome text,p_ticket text default null,p_delay_seconds integer default 0)
returns void language plpgsql security definer set search_path='' as $$
declare d private.notification_deliveries; v_recipient uuid;
begin
 if p_outcome not in ('ticket','received','retry','failed','invalid','unknown','suppressed') then raise exception 'Invalid delivery outcome'; end if;
 select * into d from private.notification_deliveries where id=p_id and lease_id=p_lease and lease_until>now() for update;
 if not found then return; end if; -- deletion or obsolete worker lease
 if p_outcome='ticket' and (p_ticket is null or length(p_ticket) not between 1 and 512) then raise exception 'Ticket required'; end if;
 if p_outcome='invalid' then
  select recipient_id into v_recipient from private.notification_outbox where id=d.outbox_id;
  delete from private.device_endpoints where token=d.token and user_id=v_recipient and updated_at=d.endpoint_updated_at;
 end if;
 update private.notification_deliveries set
 state=case when p_outcome='retry' then case when attempts>=8 then 'unknown' when ticket_id is null then 'pending' else 'ticket' end else p_outcome end,
 ticket_id=case when p_outcome='ticket' then p_ticket else ticket_id end,
 ticket_created_at=case when p_outcome='ticket' then now() else ticket_created_at end,
 next_attempt_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_delay_seconds,30),3600))),
 lease_id=null,lease_until=null where id=d.id;
 update private.notification_outbox o set delivered_at=now() where o.id=d.outbox_id
 and not exists(select 1 from private.notification_deliveries x where x.outbox_id=o.id and x.state in ('pending','sending','ticket'));
end $$;

-- Cleanup works even after roster removal/deletion request, but cannot remove another user's endpoint.
create function public.unregister_device(p_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 delete from private.device_endpoints where token=p_token and user_id=auth.uid();
end $$;
revoke all on function public.claim_notification_deliveries(integer),public.validate_notification_delivery(uuid,uuid),public.finish_notification_delivery(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.claim_notification_deliveries(integer),public.validate_notification_delivery(uuid,uuid),public.finish_notification_delivery(uuid,uuid,text,text,integer) to service_role;
revoke all on function public.unregister_device(text) from public,anon,authenticated;
grant execute on function public.unregister_device(text) to authenticated;
comment on column private.notification_outbox.delivered_at is 'Worker processing finished across all endpoints; not a guarantee of delivery or reading. Inspect delivery ledger outcomes.';

-- Reconciliation of the same binding must not invalidate in-flight receipt work.
-- A real account/platform rebind gets a new generation, including within one transaction.
create or replace function private.register_device(p_token text,p_platform text) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_tester();
begin
 if p_token is null or length(p_token)>300 or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' or p_platform not in ('ios','android') then
 raise exception 'Invalid endpoint' using errcode='22023'; end if;
 insert into private.device_endpoints(token,user_id,platform,updated_at) values(p_token,v_uid,p_platform,clock_timestamp())
 on conflict(token) do update set user_id=v_uid,platform=excluded.platform,
 updated_at=case when private.device_endpoints.user_id=v_uid and private.device_endpoints.platform=excluded.platform
 then private.device_endpoints.updated_at else clock_timestamp() end;
end $$;
