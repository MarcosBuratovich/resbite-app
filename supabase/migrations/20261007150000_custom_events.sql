-- Custom events (CE1): a plan carries its own title, description and categories.
-- Catalogue ideas become optional, editable templates (owner decisions CE-D1..D8).
-- Hosted-compatible: depends only on the five deployed migrations.

-- One or two distinct keys from the seven approved categories (CE-D5, CE-D6).
-- Always true or false, never null, so a CHECK constraint cannot pass on null.
create function private.valid_categories(p text[]) returns boolean
language sql immutable set search_path = '' as $$
 select coalesce(
  array_ndims(p) = 1
  and cardinality(p) between 1 and 2
  and array_position(p, null) is null
  and p <@ array['creative','intellectual','mindful','natural','physical','community','uplifting']::text[]
  and cardinality(p) = (select count(distinct x) from unnest(p) as x),
  false)
$$;

alter table public.activities
 add column categories text[],
 add constraint activities_categories_valid check (categories is null or private.valid_categories(categories));

-- Approved mapping for the eleven published ideas (CE-D7).
-- Mirrors mobile/content/activity-categories.json; a mobile test keeps them identical.
update public.activities as a set categories = m.categories
from (values
 ('coffee-together', array['community','uplifting']),
 ('painting', array['creative','mindful']),
 ('get-out-with-bikes', array['physical','natural']),
 ('building-a-snowman', array['creative','natural']),
 ('bbq', array['community','natural']),
 ('wine-tasting', array['community','intellectual']),
 ('spa-day', array['mindful','uplifting']),
 ('book-club', array['intellectual','community']),
 ('picnic-in-the-park', array['natural','community']),
 ('walk-and-talk', array['physical','community']),
 ('board-game-night', array['intellectual','community'])
) as m(id, categories)
where a.id = m.id;

-- Published ideas must always offer categories to the events they prefill.
alter table public.activities
 add constraint activities_published_categories check (not published or categories is not null);

alter table public.plans
 add column title text,
 add column description text not null default '',
 add column categories text[],
 alter column activity_id drop not null;
comment on column public.plans.activity_id is 'Idea this event started from, if any (an editable template, CE-D3).';

-- Existing plans take their idea's title and categories. A plan whose idea has no
-- categories fails the not-null step below loudly instead of inventing one.
update public.plans as p
 set title = btrim(left(btrim(a.title), 80)), categories = a.categories
 from public.activities as a where a.id = p.activity_id;

alter table public.plans
 alter column title set not null,
 alter column categories set not null,
 add constraint plans_title_valid check (title = btrim(title) and length(title) between 1 and 80),
 add constraint plans_description_valid check (length(description) <= 1000),
 add constraint plans_categories_valid check (private.valid_categories(categories));

-- Older callers (the legacy create_plan, maintainer and fixture inserts) omit the
-- event fields; fill them from the idea so every row meets the rules above.
create function private.fill_plan_from_activity() returns trigger
language plpgsql set search_path = '' as $$
declare v_title text; v_categories text[];
begin
 if (new.title is null or new.categories is null) and new.activity_id is not null then
  select a.title, a.categories into v_title, v_categories from public.activities as a where a.id = new.activity_id;
  new.title := coalesce(new.title, btrim(left(btrim(v_title), 80)));
  new.categories := coalesce(new.categories, v_categories);
 end if;
 return new;
end $$;
create trigger plans_fill_from_activity before insert on public.plans
 for each row execute function private.fill_plan_from_activity();

-- Account deletion marks the profile before it updates each owned plan. While that
-- mark is present, no update can leave organizer-written event text behind.
create function private.redact_deleting_owner_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.owner_id is not null and exists(
  select 1 from public.profiles as p where p.id = new.owner_id and p.deletion_requested_at is not null) then
  new.title := 'Resbite';
  new.description := '';
 end if;
 return new;
end $$;
create trigger plans_redact_deleting_owner before update on public.plans
 for each row execute function private.redact_deleting_owner_plan();

create function private.create_plan_v2(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_existing public.plans;
begin
 -- Serialize repeated creation IDs; a retry must match the original payload exactly.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
 select * into v_existing from public.plans where id=p_id;
 if found then
  if v_existing.owner_id<>v_uid or v_existing.title is distinct from btrim(p_title)
  or v_existing.description is distinct from coalesce(p_description,'') or v_existing.categories is distinct from p_categories
  or v_existing.activity_id is distinct from p_activity or v_existing.starts_at is distinct from p_start
  or v_existing.time_zone is distinct from p_zone or v_existing.place_label is distinct from btrim(p_place)
  or v_existing.note is distinct from coalesce(p_note,'') or v_existing.latitude is distinct from p_lat
  or v_existing.longitude is distinct from p_lon then
   raise exception 'Creation identifier already used' using errcode='22023';
  end if;
  return p_id;
 end if;
 if p_title is null or p_categories is null then raise exception 'Title and categories required' using errcode='23502'; end if;
 if p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 if p_activity is not null and not exists(select 1 from public.activities where id=p_activity and published) then raise exception 'Activity unavailable' using errcode='22023'; end if;
 insert into public.plans(id,owner_id,activity_id,title,description,categories,starts_at,time_zone,place_label,note,latitude,longitude)
 values(p_id,v_uid,p_activity,btrim(p_title),coalesce(p_description,''),p_categories,p_start,p_zone,btrim(p_place),coalesce(p_note,''),p_lat,p_lon);
 return p_id;
end $$;

create function private.change_plan_v2(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer; v_cancel boolean := coalesce(p_cancel,false);
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 if not v_cancel and (p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 v_next := v_plan.version+1;
 if v_cancel then
  -- Terminal; the other arguments are ignored.
  update public.plans set status='cancelled',version=v_next where id=p_plan;
  update private.invitations set revoked_at=now() where plan_id=p_plan and revoked_at is null;
 else
  update public.plans set title=btrim(p_title),description=coalesce(p_description,''),categories=p_categories,
   starts_at=p_start,time_zone=p_zone,place_label=btrim(p_place),note=coalesce(p_note,''),latitude=null,longitude=null,version=v_next
  where id=p_plan;
 end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
 select p_plan,a.user_id,case when v_cancel then 'plan_cancelled' else 'plan_changed' end,'plan:'||p_plan||':'||v_next||':'||a.user_id
 from public.attendees a where a.plan_id=p_plan and a.user_id<>v_uid on conflict do nothing;
 return v_next;
end $$;

create function public.create_plan_v2(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null)
returns uuid language sql security invoker set search_path='' as $$ select private.create_plan_v2(p_id,p_title,p_description,p_categories,p_activity,p_start,p_zone,p_place,p_note,p_lat,p_lon) $$;
create function public.change_plan_v2(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false)
returns integer language sql security invoker set search_path='' as $$ select private.change_plan_v2(p_plan,p_version,p_title,p_description,p_categories,p_start,p_zone,p_place,p_note,p_cancel) $$;

revoke all on function private.valid_categories(text[]), private.fill_plan_from_activity(), private.redact_deleting_owner_plan()
 from public, anon, authenticated;
revoke all on function
 private.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision),
 public.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision),
 private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean),
 public.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)
 from public, anon, authenticated;
grant execute on function
 private.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision),
 public.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision),
 private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean),
 public.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)
 to authenticated;
