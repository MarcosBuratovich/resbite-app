#!/usr/bin/env python3
"""Rehearse only the approved three additions in a disposable local database."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import re
import subprocess
import tempfile
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
PG=Path('/opt/homebrew/opt/postgresql@17/bin')
APPROVED='8b077f214b5cf42a446f88f47dc36f6bb0ee41e18b08eea60fc18d6307f7d6bf'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=ROOT/'qa/activity-concepts-2026-09-24'
assert sha(source/'activities.json')==APPROVED
items=json.loads((source/'activities.json').read_text()); provenance=json.loads((source/'provenance.json').read_text())
for a in items:
    p=next(p for p in provenance['outputs'] if p['activityId']==a['id'])
    assert a['artwork']==p['file'] and sha(source/a['artwork'])==a['artworkSha256']==p['sha256']
payload=[{'id':a['id'],'title':a['title'],'description':a['description'],'category':a['category'],'artwork_key':a['id'],'source_ids':['R20260924-'+a['id']],'published':True,'duration_minutes':None,'tips':a['tips']} for a in items]
assert all(a['durationMinutes'] is None for a in items)
assert json.loads((HERE/'approved-payload.json').read_text())==payload
originals=json.loads((ROOT/'qa/catalogue-publication-2026-09-24/approved-payload.json').read_text())
assert json.loads((HERE/'original-eight-before-image.json').read_text())==originals
for name in ['publish.sql','rollback.sql']:
    body=(HERE/name).read_text()
    assert json.loads(re.search(r'\$approved_payload\$\n(.*?)\n\$approved_payload\$',body,re.S)[1])==payload
    assert json.loads(re.search(r'\$preserved_originals\$\n(.*?)\n\$preserved_originals\$',body,re.S)[1])==originals
    assert APPROVED in body
passed=['Reviewed manifest and three PNG hashes match provenance; both SQL payloads and original-eight guards match exact records.']
with tempfile.TemporaryDirectory(prefix='resbite-additions-',dir='/private/tmp') as directory:
    work=Path(directory)
    subprocess.run([str(PG/'initdb'),'-D',str(work/'data'),'-A','trust','-U','postgres'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',str(work/'data'),'-l',str(work/'postgres.log'),'-o',f"-k {work} -h '' -p 55439",'-w','start'],check=True,stdout=subprocess.DEVNULL)
    args=[str(PG/'psql'),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',str(work),'-p','55439','-U','postgres','-d','postgres']
    def sql(query,error=None):
        r=subprocess.run(args,input=query,text=True,capture_output=True)
        if error:
            assert r.returncode!=0 and error in r.stderr,r.stderr
            return None
        assert r.returncode==0,r.stderr
        return r.stdout.strip()
    def run(name,error=None):
        output=sql((HERE/name).read_text(),error)
        return json.loads(output) if not error else None
    def insert(records): sql('insert into public.activities select * from jsonb_populate_recordset(null::public.activities,$fixture$'+json.dumps(records)+'$fixture$::jsonb)')
    def rows(): return json.loads(sql("select jsonb_agg(to_jsonb(a) order by id) from public.activities a"))
    ids=[a['id'] for a in payload]; original_ids=[a['id'] for a in originals]
    candidate_filter='id=any(array['+','.join("'"+i+"'" for i in ids)+']::text[])'
    def clear(): sql('delete from public.activities where '+candidate_filter)
    def access(): return sql("select jsonb_build_object('acl',(select relacl from pg_class where oid='public.activities'::regclass),'rls',(select relrowsecurity from pg_class where oid='public.activities'::regclass),'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='activities'),'roster',(select jsonb_agg(to_jsonb(r) order by email) from private.tester_roster r))")
    def unchanged_originals(): assert [r for r in rows() if r['id'] in original_ids]==sorted(originals,key=lambda a:a['id'])
    try:
        sql((ROOT/'supabase/tests/local/bootstrap.sql').read_text())
        for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')): sql(migration.read_text())
        sql("insert into private.tester_roster(email) values('caco.burato@gmail.com')")
        unrelated={'id':'unrelated-fixture','title':'Unrelated','description':'Preserve me','category':'Test','artwork_key':'painting','source_ids':['TEST'],'published':False,'duration_minutes':None,'tips':[]}
        insert(originals+[unrelated]); initial_access=access();assert run('rollback.sql')['unpublished_count']==0
        receipt=run('publish.sql');assert receipt['inserted_count']==3 and receipt['unchanged_count']==0 and receipt['original_count_verified']==8
        assert all(a['row'] is None for a in receipt['before_image'])
        assert receipt['after_image']==sorted(payload,key=lambda a:a['id']) and receipt['originals_after_image']==sorted(originals,key=lambda a:a['id'])
        xmin=sql('select jsonb_object_agg(id,xmin::text) from public.activities')
        repeat=run('publish.sql');assert repeat['inserted_count']==0 and repeat['unchanged_count']==3
        assert xmin==sql('select jsonb_object_agg(id,xmin::text) from public.activities')
        assert rows()==sorted(originals+payload+[unrelated],key=lambda a:a['id']);assert access()==initial_access
        passed.append('Publish inserts exactly three alongside original eight; replay writes zero; all old rows, unrelated row, RLS/ACL/roster and exact receipts preserved.')
        sql("insert into auth.users(id,email,email_confirmed_at) values('eeeeeeee-0000-4000-8000-000000000001','caco.burato@gmail.com',now());insert into public.profiles(id,display_name) values('eeeeeeee-0000-4000-8000-000000000001','Local');insert into public.plans(id,owner_id,activity_id,starts_at,time_zone,place_label) values('eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000001','picnic-in-the-park',now()+interval '1 day','UTC','Local')")
        assert run('rollback.sql')['unpublished_count']==3;unchanged_originals()
        assert sql("select count(*) from public.plans where activity_id='picnic-in-the-park'")=='1'
        assert len(rows())==12 and all(not a['published'] for a in rows() if a['id'] in ids)
        assert run('rollback.sql')['unpublished_count']==0;run('publish.sql','differs from the approved after-image');assert access()==initial_access
        passed.append('Rollback unpublishes only three and preserves original eight plus real new-activity plan FK; replay zero; republish after rollback stops.')
        sql("delete from public.plans where id='eeeeeeee-0000-4000-8000-000000000002'");clear()
        insert(payload[:1]);run('publish.sql','Partial candidate batch exists');assert len(rows())==10;clear()
        changed=[dict(a) for a in payload];changed[0]['title']='Later edited title';insert(changed)
        run('publish.sql','differs from the approved after-image');run('rollback.sql','changed after publication');assert rows()==sorted(originals+changed+[unrelated],key=lambda a:a['id']);clear()
        passed.append('Partial addition batch, conflicting existing addition and rollback after later addition edit abort atomically.')
        sql("update public.activities set title='Changed original' where id='painting'")
        run('publish.sql','Original eight activities differ');run('rollback.sql','Original eight activities differ')
        assert not any(r['id'] in ids for r in rows());sql("update public.activities set title='Painting' where id='painting'");unchanged_originals()
        passed.append('Any change to the preserved original-eight before-image blocks publication and rollback without new writes.')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: receipts=list(pool.map(lambda _:run('publish.sql'),range(2)))
        assert sorted(r['inserted_count'] for r in receipts)==[0,3];unchanged_originals();assert access()==initial_access
        passed.append('Concurrent duplicate addition publishes serialize to one three-row insert and one zero-write replay.')
        sql("update private.tester_roster set email='different@example.invalid'");run('publish.sql','roster differs');run('rollback.sql','roster differs')
        sql("update private.tester_roster set email='caco.burato@gmail.com';insert into private.tester_roster(email) values('extra@example.invalid')");run('publish.sql','roster differs');run('rollback.sql','roster differs')
        sql("delete from private.tester_roster where email='extra@example.invalid'");assert access()==initial_access
        sql('alter table public.activities disable row level security');run('publish.sql','access policy differs');run('rollback.sql','access policy differs');unchanged_originals()
        passed.append('Wrong owner, additional enabled tester or changed RLS blocks both operations; unrelated records remain untouched.')
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',str(work/'data'),'-m','immediate','stop'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'environment':'Disposable local PostgreSQL 17; no hosted writes','passed':passed},indent=2))
