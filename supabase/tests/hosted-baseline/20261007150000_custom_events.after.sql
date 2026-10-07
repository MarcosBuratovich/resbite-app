do $$ begin
 if (select categories from public.activities where id='painting')<>array['creative','mindful'] then raise exception 'Approved idea mapping not applied'; end if;
 if (select title||'|'||description||'|'||categories::text from public.plans where id='b2000000-0000-4000-8000-000000000001')<>'Painting||{creative,mindful}' then raise exception 'Legacy plan not backfilled'; end if;
end $$;
-- Remove the seed so later tests start clean.
delete from public.plans where id='b2000000-0000-4000-8000-000000000001';
delete from public.activities where id='painting';
delete from public.profiles where id='b1000000-0000-4000-8000-000000000001';
delete from auth.users where id='b1000000-0000-4000-8000-000000000001';
