import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeletionLedger, type DeletionIntent, type LedgerStore } from './deletion-ledger.ts';
const project = 'fixture-project';
const intent: DeletionIntent = { schema: 1, project, userId: '11111111-1111-4111-8111-111111111111', requestId: '22222222-2222-4222-8222-222222222222', requestedAt: '2026-09-29T12:00:00.000Z' };
const key = new Uint8Array(32).fill(7);
function fixture() {
  const objects = new Map<string, string>();
  let writes = 0;
  const store: LedgerStore = {
    read: async path => objects.get(path) ?? null,
    createIfAbsent: async (path, value) => {
      writes++;
      if (objects.has(path)) throw Error('Already exists');
      objects.set(path, value);
    },
  };
  return { objects, store, writes: () => writes };
}
test('encrypted minimal intent survives restart and replay is idempotent', async () => {
  const f = fixture();
  const ledger = await createDeletionLedger(f.store, project, key);
  assert.deepEqual(await ledger.record(intent), intent);
  const [path, raw] = [...f.objects][0];
  for (const field of [intent.userId, intent.requestId, intent.requestedAt, project]) {
    assert.ok(!raw.includes(field));
    assert.ok(!path.includes(field));
  }
  const restarted = await createDeletionLedger(f.store, project, key);
  assert.deepEqual(await restarted.read(intent.requestId), intent);
  assert.deepEqual(await restarted.record(intent), intent);
  assert.equal(f.writes(), 1);
});
test('lost write acknowledgement requires authenticated read-back', async () => {
  const f = fixture(), create = f.store.createIfAbsent;
  f.store.createIfAbsent = async (...args) => { await create(...args); throw Error('Lost reply'); };
  assert.deepEqual(await (await createDeletionLedger(f.store, project, key)).record(intent), intent);
  const unavailable: LedgerStore = { read: async () => null, createIfAbsent: async () => { throw Error('secret provider detail'); } };
  await assert.rejects((await createDeletionLedger(unavailable, project, key)).record(intent), /^Error: Deletion intent not durably confirmed$/);
});
test('read failure blocks confirmation even when the write committed', async () => {
  const f = fixture();
  let reads = 0;
  f.store.read = async path => { if (++reads > 1) throw Error('provider secret'); return f.objects.get(path) ?? null; };
  await assert.rejects((await createDeletionLedger(f.store, project, key)).record(intent), /^Error: Recovery ledger unavailable$/);
  assert.equal(f.objects.size, 1);
});
test('concurrent identical records converge; conflicting identity never overwrites', async () => {
  const f = fixture();
  const a = await createDeletionLedger(f.store, project, key), b = await createDeletionLedger(f.store, project, key);
  assert.deepEqual(await Promise.all([a.record(intent), b.record(intent)]), [intent, intent]);
  const before = [...f.objects];
  await assert.rejects(b.record({ ...intent, userId: '33333333-3333-4333-8333-333333333333' }), /conflict/);
  assert.deepEqual([...f.objects], before);
});
test('tampering, wrong keys and relocation cannot produce verified intents', async () => {
  const f = fixture();
  const ledger = await createDeletionLedger(f.store, project, key);
  await ledger.record(intent);
  const [path, raw] = [...f.objects][0];
  await assert.rejects((await createDeletionLedger(f.store, project, new Uint8Array(32).fill(8))).read(intent.requestId), /verification failed/);
  const envelope = JSON.parse(raw);
  envelope.ciphertext = (envelope.ciphertext.startsWith('00') ? '01' : '00') + envelope.ciphertext.slice(2);
  f.objects.set(path, JSON.stringify(envelope));
  await assert.rejects(ledger.read(intent.requestId), /verification failed/);
  f.store.read = async () => raw;
  await assert.rejects(ledger.read('33333333-3333-4333-8333-333333333333'), /verification failed/);
  await assert.rejects((await createDeletionLedger(f.store, 'other-project', key)).read(intent.requestId), /verification failed/);
});
test('extra personal fields, malformed identity and oversized records are rejected', async () => {
  const f = fixture(), ledger = await createDeletionLedger(f.store, project, key);
  await assert.rejects(ledger.record({ ...intent, email: 'do-not-store@example.invalid' } as DeletionIntent), /Invalid deletion intent/);
  await assert.rejects(ledger.record({ ...intent, requestedAt: 'yesterday' }), /Invalid deletion intent/);
  await assert.rejects(ledger.record({ ...intent, userId: '../escape' }), /Invalid deletion intent/);
  assert.equal(f.objects.size, 0);
  f.store.read = async () => 'x'.repeat(8193);
  await assert.rejects(ledger.read(intent.requestId), /Invalid encrypted ledger record/);
});
