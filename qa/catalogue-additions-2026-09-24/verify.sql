-- Read-only post-commit check. Compare full rows to approved-payload.json locally.
select jsonb_build_object(
 'observed_at',clock_timestamp(),
 'rows',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.activities a
    where a.id=any(array['picnic-in-the-park','walk-and-talk','board-game-night']::text[])),'[]'::jsonb),
 'candidate_count',(select count(*) from public.activities where id=any(array['picnic-in-the-park','walk-and-talk','board-game-night']::text[])),
 'candidate_published_count',(select count(*) from public.activities where published and id=any(array['picnic-in-the-park','walk-and-talk','board-game-night']::text[])),
 'original_rows',(select jsonb_agg(to_jsonb(a) order by a.id) from public.activities a where id=any(array['coffee-together','painting','get-out-with-bikes','building-a-snowman','bbq','wine-tasting','spa-day','book-club']::text[])),
 'total_count',(select count(*) from public.activities),
 'enabled_tester_count',(select count(*) from private.tester_roster where enabled),
 'rls_enabled',(select relrowsecurity from pg_class where oid='public.activities'::regclass),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename='activities'),
 'grants',(select jsonb_agg(jsonb_build_object('grantee',grantee,'privilege',privilege_type) order by grantee,privilege_type)
           from information_schema.table_privileges where table_schema='public' and table_name='activities')
) as catalogue_verification;
