import type { LedgerStore } from "./deletion-ledger.ts";

/** Server-only adapter for a distinct, private hosted Supabase project. */
export function supabaseDeletionLedgerStore(config: {
  sourceProject: string;
  recoveryProject: string;
  bucket: string;
  serviceRoleKey: string;
}, fetcher: typeof fetch = fetch): LedgerStore {
  const { sourceProject, recoveryProject, bucket, serviceRoleKey } = config;
  if (![sourceProject, recoveryProject].every(ref => /^[a-z]{20}$/.test(ref)) ||
      sourceProject === recoveryProject || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket) ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(serviceRoleKey))
    throw Error("Invalid recovery storage configuration");
  // Configuration sanity check only; the provider verifies the signature.
  try {
    const payload = serviceRoleKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    if (claims.role !== "service_role" || claims.ref !== recoveryProject) throw Error();
  } catch { throw Error("Recovery project service credential required"); }
  // Legacy server-side service_role JWT only. Never supply the app's key or a
  // user token. Project role/permissions are verified by provider acceptance.
  const origin = `https://${recoveryProject}.supabase.co/storage/v1`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Cache-Control": "no-store",
  };
  async function call(path: string, method: string, body?: string) {
    try {
      const response = await fetcher(`${origin}${path}`, {
        method, redirect: "error", cache: "no-store",
        headers: { ...headers, ...(body === undefined ? {} : {
          "Content-Type": "application/json", "x-upsert": "false",
        }) },
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(10000),
      });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        if (reader) while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 8192) throw Error();
          chunks.push(value);
        }
      } catch (error) {
        await reader?.cancel().catch(() => {});
        throw error;
      } finally { reader?.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return { status: response.status, body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    } catch { throw Error("Recovery storage unavailable"); }
  }
  async function requirePrivateBucket() {
    const response = await call(`/bucket/${bucket}`, "GET");
    let value;
    try { value = JSON.parse(response.body); } catch { /* Reject below. */ }
    if (response.status !== 200 || value?.id !== bucket || value?.public !== false)
      throw Error("Private recovery bucket could not be verified");
  }
  function path(key: string) {
    if (!/^deletion-intents\/v1\/[0-9a-f]{64}$/.test(key)) throw Error("Invalid recovery object path");
    return `${bucket}/${key}`;
  }
  return {
    async createIfAbsent(key, encrypted) {
      const object = path(key);
      if (!encrypted || new TextEncoder().encode(encrypted).byteLength > 8192)
        throw Error("Invalid recovery object size");
      await requirePrivateBucket();
      const response = await call(`/object/${object}`, "POST", encrypted);
      if (response.status !== 200 && response.status !== 201)
        throw Error("Recovery object creation unconfirmed");
      // Ledger core always performs separate authenticated content read-back.
    },
    async read(key) {
      const object = path(key);
      await requirePrivateBucket();
      const response = await call(`/object/${object}`, "GET");
      if (response.status === 200) return response.body;
      let failure;
      try { failure = JSON.parse(response.body); } catch { /* Reject below. */ }
      // Generic 404/permission/bucket errors are not evidence of an absent key.
      if ([400, 404].includes(response.status) && failure?.code === "NoSuchKey") return null;
      throw Error("Recovery object read unavailable");
    },
  };
}
