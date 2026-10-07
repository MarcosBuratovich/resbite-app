#!/usr/bin/env python3
"""Disposable PostgreSQL rehearsal only. Accepts no remote URL or credentials."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import os
import re
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PG = Path('/opt/homebrew/opt/postgresql@17/bin')
APPROVED = '148bebe1a58c48abe12a2fcd763c73c0f51e6067b7d095a328f4d5377c1c2df9'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
items = json.loads((ROOT/'mobile/content/activities.json').read_text())
scope = {'manifestSha256': sha(ROOT/'mobile/content/activities.json'), 'provenanceSha256': sha(ROOT/'mobile/content/asset-provenance.json'), 'artwork': [{'activityId':a['id'], 'path':'mobile/assets/activities/'+a['artwork'], 'sha256':sha(ROOT/'mobile/assets/activities'/a['artwork'])} for a in items]}
assert hashlib.sha256(json.dumps(scope, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == APPROVED
assert json.loads((HERE/'approved-scope.json').read_text()) == {'scopeSha256':APPROVED,'scope':scope}
payload = [{'id':a['id'],'title':a['title'],'description':a['description'],'category':a['category'],'artwork_key':a['id'],'source_ids':a['sourceIds'],'published':True,'duration_minutes':a['durationMinutes'],'tips':a['tips']} for a in items]
assert json.loads((HERE/'approved-payload.json').read_text()) == payload
for file in ['publish.sql','rollback.sql']:
    body = (HERE/file).read_text()
    embedded = json.loads(re.search(r'\$approved_payload\$\n(.*?)\n\$approved_payload\$',body,re.S)[1])
    assert embedded == payload and APPROVED in body

passed = ['Approved source, PNG and combined hashes match; both SQL payloads exactly match approved rows.']
with tempfile.TemporaryDirectory(prefix='resbite-catalogue-', dir='/private/tmp') as work:
    work = Path(work)
    subprocess.run([str(PG/'initdb'),'-D',str(work/'data'),'-A','trust','-U','postgres'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',str(work/'data'),'-l',str(work/'postgres.log'),'-o',f"-k {work} -h '' -p 55439",'-w','start'],check=True,stdout=subprocess.DEVNULL)
    args=[str(PG/'psql'),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',str(work),'-p','55439','-U','postgres','-d','postgres']
    def sql(query, expect_error=None):
        r=subprocess.run(args,input=query,text=True,capture_output=True)
        if expect_error:
            assert r.returncode != 0 and expect_error in r.stderr, r.stderr
            return r
        assert r.returncode == 0, r.stderr
        return r.stdout.strip()
    def runfile(name, expect_error=None): return sql((HERE/name).read_text(),expect_error)
    def rows(): return json.loads(sql("select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.activities a"))
    ids=[a['id'] for a in payload]
    candidate_filter="id=any(array["+','.join("'"+i+"'" for i in ids)+"]::text[])"
    def clear_candidates(): sql('delete from public.activities where '+candidate_filter)
    def insert(records):
        data=json.dumps(records)
        sql("insert into public.activities select * from jsonb_populate_recordset(null::public.activities,$fixture$"+data+"$fixture$::jsonb)")
    def access_snapshot():
        return sql("select jsonb_build_object('policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='activities'),'acl',(select relacl from pg_class where oid='public.activities'::regclass),'rls',(select relrowsecurity from pg_class where oid='public.activities'::regclass),'roster',(select coalesce(jsonb_agg(to_jsonb(r) order by email),'[]') from private.tester_roster r))")
    try:
        sql((ROOT/'supabase/tests/local/bootstrap.sql').read_text())
        for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')): sql(migration.read_text())
        sql("insert into private.tester_roster(email) values('caco.burato@gmail.com')")
        unrelated={'id':'unrelated-fixture','title':'Unrelated','description':'Preserve me','category':'Test','artwork_key':'painting','source_ids':['TEST'],'published':True,'duration_minutes':11,'tips':['Unchanged']}
        insert([unrelated]); original_access=access_snapshot()
        assert json.loads(runfile('rollback.sql'))['unpublished_count'] == 0
        assert rows()==[unrelated]
        receipt=json.loads(runfile('publish.sql'))
        assert receipt['inserted_count']==8 and receipt['unchanged_count']==0 and receipt['commit_returned'] is True
        assert all(v['row'] is None for v in receipt['before_image'])
        assert sorted(receipt['after_image'],key=lambda a:a['id'])==sorted(payload,key=lambda a:a['id'])
        initial_xmin=sql('select jsonb_object_agg(id,xmin::text) from public.activities where '+candidate_filter)
        repeat=json.loads(runfile('publish.sql'))
        assert repeat['inserted_count']==0 and repeat['unchanged_count']==8
        assert initial_xmin==sql('select jsonb_object_agg(id,xmin::text) from public.activities where '+candidate_filter)
        assert rows()==sorted(payload+[unrelated],key=lambda a:a['id'])
        assert access_snapshot()==original_access
        passed.append('First publish inserts exactly eight; replay writes zero; exact before/after receipts; unrelated row, RLS, ACL and roster unchanged.')
        # A real foreign-key reference must survive unpublication.
        sql("insert into auth.users(id,email,email_confirmed_at) values('eeeeeeee-0000-4000-8000-000000000001','caco.burato@gmail.com',now()); insert into public.profiles(id,display_name) values('eeeeeeee-0000-4000-8000-000000000001','Local'); insert into public.plans(id,owner_id,activity_id,starts_at,time_zone,place_label) values('eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000001','painting',now()+interval '1 day','UTC','Local')")
        undo=json.loads(runfile('rollback.sql')); assert undo['unpublished_count']==8
        assert len(rows())==9 and all(not a['published'] for a in rows() if a['id'] in ids)
        assert sql("select count(*) from public.plans where activity_id='painting'")=='1'
        assert json.loads(runfile('rollback.sql'))['unpublished_count']==0
        assert next(a for a in rows() if a['id']=='unrelated-fixture')==unrelated
        runfile('publish.sql','differs from the approved after-image')
        assert access_snapshot()==original_access
        passed.append('Rollback unpublishes eight without deletion or broken plan FK; replay writes zero; republishing a rolled-back batch fails for review.')
        sql("delete from public.plans where id='eeeeeeee-0000-4000-8000-000000000002'"); clear_candidates()
        insert(payload[:4]); runfile('publish.sql','Partial candidate batch exists'); assert len(rows())==5
        clear_candidates(); changed=[dict(a) for a in payload]; changed[0]['title']='Conflicting later title'; insert(changed)
        runfile('publish.sql','differs from the approved after-image'); assert rows()==sorted(changed+[unrelated],key=lambda a:a['id'])
        runfile('rollback.sql','changed after publication'); assert rows()==sorted(changed+[unrelated],key=lambda a:a['id'])
        passed.append('Partial batch, conflicting existing copy and rollback after later edits all abort atomically without row changes.')
        clear_candidates()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:json.loads(runfile('publish.sql')),range(2)))
        assert sorted(r['inserted_count'] for r in results)==[0,8]
        assert rows()==sorted(payload+[unrelated],key=lambda a:a['id'])
        assert access_snapshot()==original_access
        passed.append('Concurrent exact publication attempts serialize to one eight-row insert and one zero-write replay.')
        # RLS reads after publication; no retained identities outside this disposable cluster.
        sql("insert into auth.users(id,email,email_confirmed_at) values('eeeeeeee-0000-4000-8000-000000000003','not-approved@example.invalid',now())")
        def read_as(user): return sql("begin;set local role authenticated;set local request.jwt.claims='{\"sub\":\""+user+"\"}';select count(*) from public.activities;rollback;")
        assert read_as('eeeeeeee-0000-4000-8000-000000000001')=='9'
        assert read_as('eeeeeeee-0000-4000-8000-000000000003')=='0'
        sql('begin;set local role anon;select * from public.activities;rollback;','permission denied')
        passed.append('Eligible local owner reads the published batch plus unrelated row; unapproved user sees zero; anonymous reads denied.')
        # Owner-only approval must not silently broaden or switch identity.
        sql("update private.tester_roster set email='different-owner@example.invalid'")
        runfile('publish.sql','roster differs'); runfile('rollback.sql','roster differs')
        sql("update private.tester_roster set email='caco.burato@gmail.com';insert into private.tester_roster(email) values('extra@example.invalid')")
        runfile('publish.sql','roster differs'); runfile('rollback.sql','roster differs')
        sql("delete from private.tester_roster where email='extra@example.invalid'")
        assert access_snapshot()==original_access
        passed.append('Wrong sole roster identity or additional enabled tester blocks publication and rollback.')
        # A policy mutation must prevent this fixed batch from executing.
        sql('alter table public.activities disable row level security')
        runfile('publish.sql','access policy differs'); runfile('rollback.sql','access policy differs')
        passed.append('Changed RLS contract blocks publication and rollback.')
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',str(work/'data'),'-m','immediate','stop'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'environment':'disposable local PostgreSQL 17; no hosted writes','passed':passed},indent=2))
