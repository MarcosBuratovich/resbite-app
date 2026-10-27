// The open event link's anon reads: the invitation preview and the link-open count (publishable key only, no
// session, as the isolated client in accountDeletion.ts is built). Answering is a request now (joinRequests.ts).
// The factory takes its dependencies so the mappers run under node with stubs.
import { isLinkCode } from "../domain/appLinks";

export type InvitationPreview = {
  state: "open" | "cancelled" | "happened" | "inactive";
  host?: string;
  title?: string;
  starts_at?: string;
  ends_at?: string;
  time_zone?: string;
  area?: string;
  image?: { kind: string; ref: string | null };
};

export type GuestJoinDeps = {
  fetch: typeof fetch;
  supabaseUrl: string;
  publishableKey: string;
};

const states = ["open", "cancelled", "happened", "inactive"] as const;
const inactive: InvitationPreview = { state: "inactive" };

export function createGuestJoin(d: GuestJoinDeps) {
  const anonRpc = (fn: string, code: string) =>
    d.fetch(`${d.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: d.publishableKey,
        Authorization: `Bearer ${d.publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_code: code }),
      signal: AbortSignal.timeout(20000),
    });

  async function readInvitationPreview(code: string): Promise<InvitationPreview> {
    if (!isLinkCode(code)) return inactive;
    const response = await anonRpc("invitation_page", code);
    if (!response.ok) throw new Error("The invitation could not be read.");
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return inactive;
    const row = body as Record<string, unknown>;
    const state = states.find((s) => s === row.state);
    if (!state) return inactive;
    const preview: InvitationPreview = { state };
    for (const key of ["host", "title", "starts_at", "ends_at", "time_zone", "area"] as const) {
      const value = row[key];
      if (typeof value === "string") preview[key] = value;
    }
    const image = row.image as { kind?: unknown; ref?: unknown } | null | undefined;
    if (typeof image === "object" && image !== null && typeof image.kind === "string")
      preview.image = { kind: image.kind, ref: typeof image.ref === "string" ? image.ref : null };
    return preview;
  }

  async function noteLinkOpen(code: string): Promise<void> {
    if (!isLinkCode(code)) return;
    try {
      await anonRpc("note_link_open", code);
    } catch {
      // Counting an open never blocks the page.
    }
  }

  return { readInvitationPreview, noteLinkOpen };
}

const real = createGuestJoin({
  fetch: (input, init) => fetch(input, init),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "unconfigured",
});
export const readInvitationPreview = real.readInvitationPreview;
export const noteLinkOpen = real.noteLinkOpen;
