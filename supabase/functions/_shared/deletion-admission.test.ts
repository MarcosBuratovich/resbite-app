import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgerBackedDeletionRequest, type DeletionAdmissionBackend } from './deletion-admission.ts';
import { createDeletionLedger, type DeletionIntent } from './deletion-ledger.ts';
import { createDeletionHandler } from './account-deletion.ts';
const project = 'fixture-project';
const userId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const recoveryToken = 'a'.repeat(64);
const intent: DeletionIntent = { schema: 1, project, userId, requestId, requestedAt: '2026-09-29T12:00:00.000Z' };
const args = [userId, sessionId, requestId, recoveryToken] as const;
function fixture() {
  const calls: string[] = [];
  const objects = new Map<string, string>();
  const backend: DeletionAdmissionBackend = {
    prepare: async input => { calls.push('prepare'); assert.deepEqual(input, { userId, sessionId, requestId, recoveryToken }); return { ...intent }; },
    activate: async (prepared, receipt) => { calls.push('activate'); assert.deepEqual(prepared, intent); assert.equal(receipt, recoveryToken); return { requestId, status: 'queued' }; },
  };
  const store = {
    read: async (path: string) => { calls.push('read'); return objects.get(path) ?? null; },
    createIfAbsent: async (path: string, value: string) => { calls.push('write'); if (objects.has(path)) throw Error('exists'); objects.set(path, value); },
  };
  return { calls, objects, backend, store };
}
test('preparation precedes encrypted persistence/read-back and only then activation', async () => {
  const f = fixture();
  const request = ledgerBackedDeletionRequest(project, f.backend, await createDeletionLedger(f.store, project, new Uint8Array(32)));
  assert.deepEqual(await request(...args), { requestId, status: 'queued' });
  assert.deepEqual(f.calls, ['prepare', 'read', 'write', 'read', 'activate']);
  assert.ok(![...f.objects.values()][0].includes(recoveryToken));
});
test('authorization/preparation failure makes no ledger or activation call', async () => {
  const f = fixture(); f.backend.prepare = async () => { throw Error('not authorized'); };
  await assert.rejects(ledgerBackedDeletionRequest(project, f.backend, await createDeletionLedger(f.store, project, new Uint8Array(32)))(...args));
  assert.deepEqual(f.calls, []);
});
test('incorrect prepared identity, project or extra private fields cannot be persisted', async () => {
  for (const change of [{ userId: sessionId }, { requestId: sessionId }, { project: 'other' }, { recoveryToken }]) {
    const f = fixture(); f.backend.prepare = async () => ({ ...intent, ...change });
    await assert.rejects(ledgerBackedDeletionRequest(project, f.backend, await createDeletionLedger(f.store, project, new Uint8Array(32)))(...args));
    assert.deepEqual(f.calls, []);
  }
});
test('failed/uncertain ledger write prevents activation and remains retryable', async () => {
  const f = fixture(); f.store.createIfAbsent = async () => { throw Error('offline'); };
  await assert.rejects(ledgerBackedDeletionRequest(project, f.backend, await createDeletionLedger(f.store, project, new Uint8Array(32)))(...args), /not durably confirmed/);
  assert.ok(!f.calls.includes('activate'));
});
test('mismatched read-back cannot activate or mutate the intended reservation', async () => {
  const f = fixture();
  const request = ledgerBackedDeletionRequest(project, f.backend, { record: async value => { value.userId = sessionId; return value; } });
  await assert.rejects(request(...args), /confirmation mismatch/);
  assert.deepEqual(f.calls, ['prepare']);
});
test('crash after durable intent retries the same record without overwriting', async () => {
  const f = fixture();
  f.backend.activate = async () => { throw Error('activation unavailable'); };
  const ledger = await createDeletionLedger(f.store, project, new Uint8Array(32));
  await assert.rejects(ledgerBackedDeletionRequest(project, f.backend, ledger)(...args));
  assert.equal(f.objects.size, 1);
  f.backend.activate = async () => ({ requestId, status: 'queued' });
  assert.deepEqual(await ledgerBackedDeletionRequest(project, f.backend, await createDeletionLedger(f.store, project, new Uint8Array(32)))(...args), { requestId, status: 'queued' });
  assert.equal(f.calls.filter(x => x === 'write').length, 1);
});
test('lost successful activation reply can return existing job on retry', async () => {
  const f = fixture(); let accepted = false;
  f.backend.activate = async () => {
    if (!accepted) { accepted = true; throw Error('reply lost'); }
    return { requestId, status: 'processing' };
  };
  const request = ledgerBackedDeletionRequest(project, f.backend, await createDeletionLedger(f.store, project, new Uint8Array(32)));
  await assert.rejects(request(...args));
  assert.deepEqual(await request(...args), { requestId, status: 'processing' });
  assert.equal(f.objects.size, 1);
});
test('HTTP handler does not acknowledge or revoke sessions while recovery persistence fails', async () => {
  const f = fixture(); let revoked = false;
  const request = ledgerBackedDeletionRequest(project, f.backend, { record: async () => { throw Error('secret provider failure'); } });
  const handler = createDeletionHandler({
    verify: async () => ({ userId, sessionId, amr: [{ method: 'password', timestamp: 1000 }] }),
    request, status: async () => null, revoke: async () => { revoked = true; },
  }, true, () => 1000);
  const response = await handler(new Request('https://fixture.invalid', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ action: 'request', requestId, recoveryToken, proof: 'fixture' }) }));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('secret provider'));
  assert.equal(revoked, false);
  assert.deepEqual(f.calls, ['prepare']);
});

test('real gateway fails closed without ledger and sends only prepare/activate RPCs when composed', async () => {
  const { accountDeletionGateway } = await import('./account-deletion-gateway.ts');
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const gateway = accountDeletionGateway('https://fixture.invalid', 'server-fixture', async (url, options) => {
    const body = JSON.parse(String(options?.body));
    calls.push({ url: String(url), body });
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer server-fixture');
    if (String(url).endsWith('/prepare_deletion_intent')) return new Response(JSON.stringify(intent));
    assert.ok(String(url).endsWith('/activate_deletion_intent'));
    return new Response(JSON.stringify({ requestId, status: 'queued' }));
  });
  await assert.rejects(gateway.request.request(...args), /not configured/);
  assert.equal(calls.length, 0);
  const bound = gateway.withLedger(project, { record: async prepared => {
    assert.equal(calls.length, 1);
    return prepared;
  } });
  assert.deepEqual(await bound.request(...args), { requestId, status: 'queued' });
  assert.deepEqual(calls[0].body, { p_user: userId, p_session: sessionId, p_request: requestId, p_recovery: recoveryToken, p_project: project });
  assert.deepEqual(calls[1].body, { p_user: userId, p_request: requestId, p_recovery: recoveryToken, p_project: project, p_requested_at: intent.requestedAt });
});
