-- Project: ewcsgvhuojxdpaspwsrx. Maintainer SQL only; never ship to a mobile client.
-- Approved scope: 148bebe1a58c48abe12a2fcd763c73c0f51e6067b7d095a328f4d5377c1c2df9
-- All eight candidate IDs were absent at read-only preflight on 2026-09-24.
-- Reads remain possible while the short table lock serializes catalogue writers.
-- Execute only through the coordinator after checking approved-scope.json and hashes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
set local idle_in_transaction_session_timeout = '15s';
lock table public.activities in share row exclusive mode;
-- Hold the approved roster stable through commit without changing it.
lock table private.tester_roster in share mode;

drop table if exists pg_temp.resbite_catalogue_expected;
drop table if exists pg_temp.resbite_catalogue_receipt;
create temporary table resbite_catalogue_expected (like public.activities including constraints) on commit drop;
create temporary table resbite_catalogue_receipt (receipt jsonb not null) on commit preserve rows;

-- Fail closed on a table/policy/permission contract different from the reviewed one.
do $contract$
begin
 if (select array_agg(attname::text order by attnum) from pg_attribute
     where attrelid='public.activities'::regclass and attnum>0 and not attisdropped)
    is distinct from array['id','title','description','category','artwork_key','source_ids','published','duration_minutes','tips']::text[] then
   raise exception 'Catalogue schema differs from the reviewed publication contract';
 end if;
 if not (select relrowsecurity from pg_class where oid='public.activities'::regclass)
    or (select count(*) from pg_policies where schemaname='public' and tablename='activities') <> 1
    or not exists(select 1 from pg_policies where schemaname='public' and tablename='activities'
       and policyname='activity_read' and cmd='SELECT' and roles=array['authenticated']::name[]
       and qual='(( SELECT private.eligible() AS eligible) AND published)' and with_check is null)
    or not has_table_privilege('authenticated','public.activities','SELECT')
    or has_table_privilege('anon','public.activities','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('authenticated','public.activities','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
   raise exception 'Catalogue access policy differs from the reviewed owner-only contract';
 end if;
 if (select count(*) from private.tester_roster where enabled) <> 1
    or not exists(select 1 from private.tester_roster
                  where enabled and email='caco.burato@gmail.com') then
   raise exception 'Enabled tester roster differs from the approved single-owner scope';
 end if;
end
$contract$;

insert into pg_temp.resbite_catalogue_expected
select * from jsonb_populate_recordset(null::public.activities, $approved_payload$
[
  {
    "id": "coffee-together",
    "title": "Coffee together",
    "description": "Make time for a drink and a catch-up with people you know.",
    "category": "Meals & Drinks",
    "artwork_key": "coffee-together",
    "source_ids": [
      "S0618",
      "S0945",
      "S0716"
    ],
    "published": true,
    "duration_minutes": null,
    "tips": [
      "Choose a place where everyone can sit together.",
      "Agree a time that works for the group."
    ]
  },
  {
    "id": "painting",
    "title": "Painting",
    "description": "Paint a scene, an object or an abstract design together. Try different colours and let everyone take their own approach.",
    "category": "Creative",
    "artwork_key": "painting",
    "source_ids": [
      "S0618",
      "S0713"
    ],
    "published": true,
    "duration_minutes": 30,
    "tips": [
      "Bring paints, brushes and something to paint on.",
      "Look at painting styles for inspiration."
    ]
  },
  {
    "id": "get-out-with-bikes",
    "title": "Get out with bikes",
    "description": "Get together for a bicycle ride and enjoy some time outside.",
    "category": "Adventure",
    "artwork_key": "get-out-with-bikes",
    "source_ids": [
      "S0618",
      "S0945",
      "S0714"
    ],
    "published": true,
    "duration_minutes": null,
    "tips": [
      "Agree the route and meeting place in advance.",
      "Choose a route everyone in the group is comfortable with."
    ]
  },
  {
    "id": "building-a-snowman",
    "title": "Building a snowman",
    "description": "When there is enough snow, get together to build and decorate a snowman.",
    "category": "Creative",
    "artwork_key": "building-a-snowman",
    "source_ids": [
      "S0945",
      "S0705"
    ],
    "published": true,
    "duration_minutes": null,
    "tips": [
      "Choose a suitable outdoor spot.",
      "Bring warm clothes and simple decorations."
    ]
  },
  {
    "id": "bbq",
    "title": "BBQ",
    "description": "Share a barbecue and spend time together over food.",
    "category": "Meals & Drinks",
    "artwork_key": "bbq",
    "source_ids": [
      "S0618",
      "S0945",
      "S0706"
    ],
    "published": true,
    "duration_minutes": null,
    "tips": [
      "Agree who is bringing the food and equipment.",
      "Check dietary preferences with your guests."
    ]
  },
  {
    "id": "wine-tasting",
    "title": "Wine tasting",
    "description": "Get together to compare wines and talk about what you notice.",
    "category": "Meals & Drinks",
    "artwork_key": "wine-tasting",
    "source_ids": [
      "S0618",
      "S0945",
      "S0710"
    ],
    "published": true,
    "duration_minutes": null,
    "tips": [
      "Choose a suitable place and agree what to bring.",
      "Have water and alcohol-free options available."
    ]
  },
  {
    "id": "spa-day",
    "title": "Spa day",
    "description": "Set aside time to relax together at a spa.",
    "category": "Leisure",
    "artwork_key": "spa-day",
    "source_ids": [
      "S0618",
      "S0619",
      "S0711"
    ],
    "published": true,
    "duration_minutes": null,
    "tips": [
      "Choose the place together.",
      "Check availability before confirming your plan."
    ]
  },
  {
    "id": "book-club",
    "title": "Book Club",
    "description": "Meet to talk about a book you have chosen together.",
    "category": "Intellectual",
    "artwork_key": "book-club",
    "source_ids": [
      "S0619",
      "S0945",
      "S0707"
    ],
    "published": true,
    "duration_minutes": null,
    "tips": [
      "Agree the book before the meeting.",
      "Bring a question or a favourite passage to discuss."
    ]
  }
]
$approved_payload$::jsonb);

do $publish$
declare
 before_image jsonb;
 after_image jsonb;
 existing_count integer;
 inserted_count integer;
begin
 if (select count(*) from pg_temp.resbite_catalogue_expected) <> 8
    or (select count(distinct id) from pg_temp.resbite_catalogue_expected) <> 8 then
   raise exception 'The approved publication payload must contain exactly eight distinct activities';
 end if;
 select count(*) into existing_count from public.activities a join pg_temp.resbite_catalogue_expected e using(id);
 -- This batch is atomic: only an entirely absent batch or its complete exact after-image is accepted.
 if existing_count not in (0,8) then
   raise exception 'Partial candidate batch exists; inspect before any catalogue publication';
 end if;
 if exists(select 1 from public.activities a join pg_temp.resbite_catalogue_expected e using(id)
           where to_jsonb(a) is distinct from to_jsonb(e)) then
   raise exception 'An existing candidate differs from the approved after-image; no activity changed';
 end if;
 select jsonb_agg(jsonb_build_object('id',e.id,'row',case when a.id is null then null else to_jsonb(a) end) order by e.id)
 into before_image from pg_temp.resbite_catalogue_expected e left join public.activities a using(id);

 insert into public.activities(id,title,description,category,artwork_key,source_ids,published,duration_minutes,tips)
 select e.id,e.title,e.description,e.category,e.artwork_key,e.source_ids,e.published,e.duration_minutes,e.tips
 from pg_temp.resbite_catalogue_expected e
 where not exists(select 1 from public.activities a where a.id=e.id);
 get diagnostics inserted_count = row_count;
 if inserted_count not in (0,8) then raise exception 'Unexpected partial publication count'; end if;
 if (select count(*) from public.activities a join pg_temp.resbite_catalogue_expected e using(id)
     where to_jsonb(a)=to_jsonb(e)) <> 8 then
   raise exception 'Publication read-back differs from approved payload';
 end if;
 select jsonb_agg(to_jsonb(a) order by a.id) into after_image
 from public.activities a join pg_temp.resbite_catalogue_expected e using(id);
 insert into pg_temp.resbite_catalogue_receipt values(jsonb_build_object(
   'publication_id','resbite-catalogue-2026-09-24-148bebe1a58c','operation','publish',
   'scope_sha256','148bebe1a58c48abe12a2fcd763c73c0f51e6067b7d095a328f4d5377c1c2df9','project_ref','ewcsgvhuojxdpaspwsrx',
   'transaction_id',txid_current(),'transaction_started_at',transaction_timestamp(),
   'database',current_database(),'before_image',before_image,'after_image',after_image,
   'inserted_count',inserted_count,'unchanged_count',existing_count,
   'enabled_tester_count_observed',(select count(*) from private.tester_roster where enabled),
   'note','Receipt describes this attempt. Preserve the initial journal before-image on a retry.'
 ));
end
$publish$;
commit;
-- Read this receipt only after successful COMMIT. Save it and separately re-read hosted rows.
select receipt || jsonb_build_object('commit_returned',true,'receipt_returned_at',clock_timestamp()) as publication_receipt
from pg_temp.resbite_catalogue_receipt;
