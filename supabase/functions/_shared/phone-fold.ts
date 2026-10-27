export type FoldUser = { id: string; phone: string | null; phone_confirmed_at: string | null };

export type FoldDeps = {
  approved: boolean;
  userFor(token: string): Promise<FoldUser | null>;
  fold(from: string, into: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
  setPhone(id: string, digits: string): Promise<void>;
};

/** The fold RPC refused the pair (Postgres 22023: the web account used the app, organizes an event, or is the same
 * account). Nothing moved; the handler answers 409. */
export class FoldRefused extends Error {}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Never echo upstream errors, tokens or phone numbers.
export async function handleFold(request: Request, deps: FoldDeps): Promise<Response> {
  if (!deps.approved) return json(503, { error: "unavailable" });
  if (request.method !== "POST") return json(405, { error: "method" });
  let body: { foreign_token?: unknown; phone?: unknown } = {};
  try { body = await request.json(); } catch { return json(401, { error: "unauthorized" }); }
  const header = request.headers.get("Authorization") ?? "";
  const callerToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const foreignToken = typeof body?.foreign_token === "string" ? body.foreign_token : "";
  if (!callerToken || !foreignToken) return json(401, { error: "unauthorized" });
  let caller: FoldUser | null;
  let foreign: FoldUser | null;
  try {
    [caller, foreign] = await Promise.all([deps.userFor(callerToken), deps.userFor(foreignToken)]);
  } catch {
    return json(401, { error: "unauthorized" });
  }
  if (!caller || !foreign) return json(401, { error: "unauthorized" });
  const digits = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  if (!digits || !foreign.phone_confirmed_at || (foreign.phone ?? "").replace(/\D/g, "") !== digits) {
    return json(403, { error: "forbidden" });
  }
  if (caller.id === foreign.id) return json(409, { error: "conflict" });
  if (caller.phone_confirmed_at && caller.phone) return json(409, { error: "conflict" });
  try {
    await deps.fold(foreign.id, caller.id);
    await deps.deleteUser(foreign.id);
    await deps.setPhone(caller.id, digits);
  } catch (error) {
    if (error instanceof FoldRefused) return json(409, { error: "conflict" });
    return json(500, { error: "failed" });
  }
  return json(200, { ok: true });
}

export function foldGateway(url: string, serviceKey: string): Omit<FoldDeps, "approved"> {
  const base = url.replace(/\/$/, "");
  const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  return {
    async userFor(token) {
      const response = await fetch(`${base}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
      if (!response.ok) return null;
      const u = await response.json();
      if (!u || typeof u.id !== "string") return null;
      return { id: u.id, phone: u.phone || null, phone_confirmed_at: u.phone_confirmed_at ?? null };
    },
    async fold(from, into) {
      const response = await fetch(`${base}/rest/v1/rpc/fold_web_account`, {
        method: "POST", headers: admin, body: JSON.stringify({ p_from: from, p_into: into }),
      });
      if (response.ok) return;
      // PostgREST answers a raised 22023 with 400 and the SQLSTATE in the JSON `code` field.
      if (response.status === 400) {
        const body = await response.json().catch(() => null);
        if (body?.code === "22023") throw new FoldRefused("Fold refused");
      }
      throw Error("Backend operation failed");
    },
    async deleteUser(id) {
      const response = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: "DELETE", headers: admin });
      if (!response.ok && response.status !== 404) throw Error("Backend operation failed");
    },
    async setPhone(id, digits) {
      const response = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
        method: "PUT", headers: admin, body: JSON.stringify({ phone: digits, phone_confirm: true }),
      });
      if (!response.ok) throw Error("Backend operation failed");
    },
  };
}
