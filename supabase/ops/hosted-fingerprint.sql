-- Read-only, for hosted before/after snapshots: `supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json`.
-- Run the same file with psql --csv on a local replay of tests/hosted-baseline/migrations.txt and compare by (kind, name).
select kind, name, md5, acl from (
 select 'function' kind, p.oid::regprocedure::text name, md5(pg_catalog.pg_get_functiondef(p.oid)) md5, coalesce(p.proacl::text,'') acl
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prokind in ('f','p')
 union all
 select 'table', c.oid::regclass::text,
  md5(string_agg(a.attname||' '||pg_catalog.format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull||' '||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),''), ',' order by a.attnum)||' rls='||c.relrowsecurity),
  coalesce(c.relacl::text,'')
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 where n.nspname in ('public','private') and c.relkind in ('r','v','p','m')
 group by c.oid, c.relacl, c.relrowsecurity
 union all
 select 'policy', schemaname||'.'||tablename||'.'||policyname,
  md5(coalesce(qual,'')||'|'||coalesce(with_check,'')||'|'||array_to_string(roles,',')||'|'||cmd||'|'||permissive), ''
 from pg_catalog.pg_policies where schemaname in ('public','private')
 union all
 select 'trigger', t.tgrelid::regclass::text||'.'||t.tgname, md5(pg_catalog.pg_get_triggerdef(t.oid)), ''
 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and n.nspname in ('public','private')
 union all
 select 'constraint', k.conrelid::regclass::text||'.'||k.conname, md5(pg_catalog.pg_get_constraintdef(k.oid)), ''
 from pg_catalog.pg_constraint k join pg_catalog.pg_namespace n on n.oid=k.connamespace
 where n.nspname in ('public','private') and k.conrelid<>0
 union all
 select 'index', i.indexrelid::regclass::text, md5(pg_catalog.pg_get_indexdef(i.indexrelid)), ''
 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private')
) s order by kind, name;
