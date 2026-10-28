-- Read-only, for hosted before/after snapshots: `supabase db query --linked -f supabase/ops/hosted-counts.sql -o json`.
select c.oid::regclass::text as name,
 (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s', c.oid::regclass), false, true, '')))[1]::text::bigint as n
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind in ('r','p') order by 1;
