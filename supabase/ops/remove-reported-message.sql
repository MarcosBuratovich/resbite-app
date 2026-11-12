-- Remove a reported message (chat plan 3: docs/superpowers/plans/2026-11-11-chat-3-safety.md, G-B4(b), CH-R-A3;
-- challenge N6).
--
-- OWNER-RUN, NOT A MIGRATION. Paste into the hosted project's SQL editor, put the report's id below in the editor's
-- copy, and run. In one statement, so one transaction: it first locks the message's chat row (for update), as
-- delete_message, remove_message and the account deletion take the chat's row before the message's (H28), so it never
-- deadlocks with them; then, while the reported message is a message or an announcement still sent, it becomes
-- removed, with no words and payload {"by": "resbite"} (not a person: no names map ever looks it up). Chat core's
-- triggers do the rest: open chats get the change (chat_messages_since and the live signal), the chat's count drops, a
-- removed pinned announcement unpins, and no push goes out for it. It prints the message's id and its state. Run
-- again, it changes nothing. The report stays open: close it with close-report.sql (action 'message_removed' or
-- 'both').
-- Edit: the report's id from open-reports.sql.
with input(report_id) as (values (0)),
 reported as (select m.id, m.series_id from input i join private.reports r on r.id = i.report_id join public.messages m on m.id = r.message_id),
 chat as (select c.series_id from public.chats c join reported t on t.series_id = c.series_id for update of c),
 removed as (update public.messages m set state = 'removed', body = null, payload = jsonb_build_object('by', 'resbite')
  from reported t where m.id = t.id and m.kind in ('message', 'announcement') and m.state = 'sent' and exists (select 1 from chat)
  returning m.id, m.state)
select t.id as message_id, coalesce(x.state, m.state) as state
from reported t join public.messages m on m.id = t.id left join removed x on x.id = t.id;
