/** Server-only recovery primitive. No provider or live deletion is wired yet. */
export type DeletionIntent = {
  schema: 1;
  project: string;
  userId: string;
  requestId: string;
  requestedAt: string;
};
export type LedgerStore = {
  // Atomic create, never overwrite. Adapter must bound requests/responses,
  // authenticate privately and provide strongly consistent read-after-write.
  createIfAbsent(key: string, encrypted: string): Promise<void>;
  read(key: string): Promise<string | null>;
};
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
function bytes(value: unknown, length?: number) {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/.test(value) ||
      (length !== undefined && value.length !== length * 2)) throw Error("Invalid encrypted ledger record");
  return Uint8Array.from(value.match(/../g)!, pair => parseInt(pair, 16));
}
export function validateDeletionIntent(value: unknown, project: string): DeletionIntent {
  const v = value as DeletionIntent;
  if (!v || Object.keys(v).sort().join(",") !== "project,requestId,requestedAt,schema,userId" ||
      v.schema !== 1 || v.project !== project || !uuid.test(v.userId) || !uuid.test(v.requestId) ||
      typeof v.requestedAt !== "string" || !Number.isFinite(Date.parse(v.requestedAt)) ||
      new Date(v.requestedAt).toISOString() !== v.requestedAt) throw Error("Invalid deletion intent");
  // Fixed ordering for immutable-content comparison; no email, proof, session,
  // password, recovery secret, profile details or photo paths are accepted.
  return { schema: 1, project, userId: v.userId, requestId: v.requestId, requestedAt: v.requestedAt };
}

export async function createDeletionLedger(store: LedgerStore, project: string, rawKey: Uint8Array) {
  if (!/^[a-z0-9-]{1,64}$/.test(project) || rawKey.byteLength !== 32)
    throw Error("Invalid ledger configuration");
  const key = await crypto.subtle.importKey("raw", new Uint8Array(rawKey), "AES-GCM", false, ["encrypt", "decrypt"]);
  async function objectKey(requestId: string) {
    if (!uuid.test(requestId)) throw Error("Invalid deletion request identifier");
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${project}:${requestId}`));
    return `deletion-intents/v1/${hex(new Uint8Array(digest))}`;
  }
  const aad = (path: string) => encoder.encode(`resbite-deletion-ledger:v1:${project}:${path}`);
  async function decode(raw: string, path: string) {
    if (raw.length > 8192) throw Error("Invalid encrypted ledger record");
    try {
      const envelope = JSON.parse(raw);
      if (envelope.schema !== 1 || Object.keys(envelope).sort().join(",") !== "ciphertext,iv,schema")
        throw Error();
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.iv, 12), additionalData: aad(path) }, key, bytes(envelope.ciphertext));
      return validateDeletionIntent(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain)), project);
    } catch { throw Error("Ledger verification failed"); }
  }
  async function readAt(path: string) {
    let raw: string | null;
    try { raw = await store.read(path); }
    catch { throw Error("Recovery ledger unavailable"); }
    return raw === null ? null : decode(raw, path);
  }
  return {
    async record(input: DeletionIntent): Promise<DeletionIntent> {
      const intent = validateDeletionIntent(input, project);
      const path = await objectKey(intent.requestId);
      let saved = await readAt(path);
      if (!saved) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(path) }, key, encoder.encode(JSON.stringify(intent)));
        const envelope = JSON.stringify({ schema: 1, iv: hex(iv), ciphertext: hex(new Uint8Array(ciphertext)) });
        // A lost acknowledgement or concurrent creator is resolved only by
        // authenticated read-back. An exception alone never implies success.
        try { await store.createIfAbsent(path, envelope); } catch { /* Verify below. */ }
        saved = await readAt(path);
      }
      if (!saved) throw Error("Deletion intent not durably confirmed");
      if (JSON.stringify(saved) !== JSON.stringify(intent)) throw Error("Deletion intent conflict");
      return saved;
    },
    async read(requestId: string): Promise<DeletionIntent | null> {
      const saved = await readAt(await objectKey(requestId));
      if (saved && saved.requestId !== requestId) throw Error("Deletion intent conflict");
      return saved;
    },
  };
}
