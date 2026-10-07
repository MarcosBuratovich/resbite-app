import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseDeletionLedgerStore } from './deletion-ledger-storage.ts';
import { createDeletionLedger } from './deletion-ledger.ts';
const sourceProject = 'a'.repeat(20), recoveryProject = 'b'.repeat(20), bucket = 'deletion-recovery';
const jwt = (role = 'service_role', ref = recoveryProject) => `fixture.${Buffer.from(JSON.stringify({ role, ref })).toString('base64url')}.signature`;
const config = { sourceProject, recoveryProject, bucket, serviceRoleKey: jwt() };
const objectKey = `deletion-intents/v1/${'a'.repeat(64)}`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function fixture() {
  const calls: { url: string; init: RequestInit }[] = [];
  const objects = new Map<string, string>();
  let publicBucket = false, lostReply = false;
  const fetcher: typeof fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith(`/bucket/${bucket}`)) return json({ id: bucket, public: publicBucket });
    if (init.method === 'POST') {
      if (objects.has(String(url))) return json({ code: 'ResourceAlreadyExists' }, 400);
      objects.set(String(url), String(init.body));
      if (lostReply) throw Error('private provider detail');
      return json({ Key: 'fixture' });
    }
    return objects.has(String(url)) ? new Response(objects.get(String(url))) : json({ code: 'NoSuchKey' }, 404);
  };
  return { calls, objects, fetcher, public: () => { publicBucket = true; }, lose: () => { lostReply = true; } };
}
test('private authenticated immutable upload and read use only the recovery project', async () => {
  const f = fixture(), store = supabaseDeletionLedgerStore(config, f.fetcher);
  assert.equal(await store.read(objectKey), null);
  await store.createIfAbsent(objectKey, 'encrypted-fixture');
  assert.equal(await store.read(objectKey), 'encrypted-fixture');
  await assert.rejects(store.createIfAbsent(objectKey, 'replacement'), /unconfirmed/);
  assert.equal(await store.read(objectKey), 'encrypted-fixture');
  for (const { url, init } of f.calls) {
    assert.ok(url.startsWith(`https://${recoveryProject}.supabase.co/storage/v1/`));
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal);
    assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${config.serviceRoleKey}`);
    if (init.method === 'POST') assert.equal(new Headers(init.headers).get('x-upsert'), 'false');
    assert.ok(['GET', 'POST'].includes(init.method!));
  }
});
test('same project, wrong credential scope and unsafe paths fail before network work', async () => {
  const f = fixture();
  assert.throws(() => supabaseDeletionLedgerStore({ ...config, recoveryProject: sourceProject }, f.fetcher));
  assert.throws(() => supabaseDeletionLedgerStore({ ...config, serviceRoleKey: jwt('authenticated') }, f.fetcher));
  assert.throws(() => supabaseDeletionLedgerStore({ ...config, serviceRoleKey: jwt('service_role', sourceProject) }, f.fetcher));
  assert.throws(() => supabaseDeletionLedgerStore({ ...config, bucket: '../escape' }, f.fetcher));
  const store = supabaseDeletionLedgerStore(config, f.fetcher);
  await assert.rejects(store.read('../escape'));
  await assert.rejects(store.createIfAbsent(objectKey, 'x'.repeat(8193)));
  assert.equal(f.calls.length, 0);
});
test('public or unverifiable bucket blocks reads and writes before object operations', async () => {
  const f = fixture(); f.public();
  const store = supabaseDeletionLedgerStore(config, f.fetcher);
  await assert.rejects(store.read(objectKey), /Private recovery bucket/);
  await assert.rejects(store.createIfAbsent(objectKey, 'ciphertext'), /Private recovery bucket/);
  assert.ok(f.calls.every(c => c.url.includes('/bucket/')));
});
test('provider permission, missing-bucket and generic 404 errors are never absence', async () => {
  for (const [code, status] of [['AccessDenied', 403], ['NoSuchBucket', 404], ['unknown', 404], ['internal', 500]] as const) {
    const store = supabaseDeletionLedgerStore(config, async url => String(url).includes('/bucket/')
      ? json({ id: bucket, public: false }) : json({ code, message: 'secret details' }, status));
    await assert.rejects(store.read(objectKey), /^Error: Recovery object read unavailable$/);
  }
});
test('streamed response is size bounded even without Content-Length', async () => {
  let cancelled = false;
  const store = supabaseDeletionLedgerStore(config, async url => String(url).includes('/bucket/') ? json({ id: bucket, public: false }) : new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(8193)); },
    cancel() { cancelled = true; },
  })));
  await assert.rejects(store.read(objectKey), /^Error: Recovery storage unavailable$/);
  assert.equal(cancelled, true);
});
test('encrypted ledger reconciles a lost HTTP upload reply via verified read-back', async () => {
  const f = fixture(); f.lose();
  const ledger = await createDeletionLedger(supabaseDeletionLedgerStore(config, f.fetcher), sourceProject, new Uint8Array(32).fill(9));
  const intent = { schema: 1 as const, project: sourceProject, userId: '11111111-1111-4111-8111-111111111111', requestId: '22222222-2222-4222-8222-222222222222', requestedAt: '2026-09-29T12:00:00.000Z' };
  assert.deepEqual(await ledger.record(intent), intent);
  assert.equal(f.objects.size, 1);
  assert.deepEqual(await ledger.record(intent), intent);
  assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 1);
});
