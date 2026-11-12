-- Disposable PostgreSQL harness only: minimal Auth/Storage contracts, not a full Supabase emulator.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create schema auth;
create schema storage;
create schema extensions;
create table auth.users(id uuid primary key,email text,phone text unique,phone_change text,phone_confirmed_at timestamptz,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;

create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant usage on schema auth to authenticated, service_role;
grant execute on all functions in schema auth to authenticated, service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
grant usage on schema storage to authenticated,service_role;
grant select,insert,update,delete on storage.objects to authenticated;
grant all on all tables in schema storage to service_role;
-- Supabase's default privileges, as the hosted project has them (K-S5): every table, sequence and function a migration
-- creates in public is granted to the three API roles unless the migration revokes it, so a local "no access" test
-- means what it means on hosted.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- A stub of the Realtime pieces the chat uses (K-S6); hosted has the real ones and the migration never creates them.
-- realtime.send records each broadcast as a row, so a test reads what was sent; realtime.topic() reads the topic a test
-- sets with set_config('realtime.topic', …, true), as Realtime sets it for a channel's policy check.
create schema realtime;
create table realtime.messages (
 id bigint generated always as identity,
 topic text not null,
 extension text not null default 'broadcast',
 event text,
 payload jsonb,
 private boolean not null default true,
 inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$
 insert into realtime.messages(topic, extension, event, payload, private) values (send.topic, 'broadcast', send.event, send.payload, send.private)
$$;
grant usage on schema realtime to authenticated;
grant select on realtime.messages to authenticated;
