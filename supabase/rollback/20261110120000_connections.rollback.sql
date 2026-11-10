-- Rollback for 20261110120000_connections.sql (connections). Run as one transaction, only with the owner's approval:
--   begin; \i supabase/rollback/20261110120000_connections.rollback.sql; commit;
-- It is for the hosted project, where that migration created every object below. It deletes:
--   - the five connection functions, request_connection, accept_connection, decline_connection,
--     cancel_connection_request and remove_connection, and the two read functions, my_connections and
--     plan_connection_states, each with its public wrapper, and private.pair();
--   - public.connections and private.connection_refusals with every row in them: every connection, request and
--     refusal is gone, and nobody is told;
--   - every 'connection_request' and 'connection_accepted' outbox row, delivered or not, so the earlier kind check can
--     come back. The choice: a row not yet sent goes with them, and that request or acceptance is never told. Delivered
--     rows go too; sent pushes are not recalled. Rows younger than a day are the ones the sender could still send: run
--     this just after the sender has drained the outbox to lose none.
-- The outbox kind check comes back from 20261031120000_creating_a_resbite.sql; the detail check was not changed.
-- private.can_read_profile comes back from 20261014120000_ux2_rules.sql: people read each other's profile only through a
-- resbite they share, as before. Its grants are kept.
-- Kept: everything else.
-- Builds: once this has run, app builds made with this plan call functions that no longer exist (the seven above).
-- Order: run it first of the rollbacks, before the creating-a-resbite one
-- (supabase/rollback/20261031120000_creating_a_resbite.rollback.sql): the kind check restored here is that migration's
-- and allows 'admin_added', which the creating-a-resbite rollback removes. The guard below stops this file when that
-- rollback has already run; it changes nothing.

do $$ begin
 if to_regclass('public.plan_admins') is null then raise exception 'Run the connections rollback before the creating-a-resbite rollback'; end if;
end $$;

-- The profile read rule as it was, before the table it reads goes.
create or replace function private.can_read_profile(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and (p_id=auth.uid() or exists (
 select 1 from public.plans p where private.can_read_plan(p.id) and
 (p.owner_id=p_id or (private.can_see_guests(p.id) and exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=p_id)))))
$$;
drop function public.plan_connection_states(uuid);
drop function private.plan_connection_states(uuid);
drop function public.my_connections();
drop function private.my_connections();
drop function public.remove_connection(uuid);
drop function private.remove_connection(uuid);
drop function public.cancel_connection_request(uuid);
drop function private.cancel_connection_request(uuid);
drop function public.decline_connection(uuid);
drop function private.decline_connection(uuid);
drop function public.accept_connection(uuid);
drop function private.accept_connection(uuid);
drop function public.request_connection(uuid,uuid);
drop function private.request_connection(uuid,uuid);
drop function private.pair(uuid,uuid);
drop table private.connection_refusals;
drop table public.connections;

-- The outbox rows the earlier check does not allow, and the check as it was.
delete from private.notification_outbox where kind in ('connection_request','connection_accepted');
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited','join_request','join_approved','admin_added'));
