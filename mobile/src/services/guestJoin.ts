// GI2 guest services: the invitation preview and link-open count (anon, publishable key only, no
// session, as the isolated client in accountDeletion.ts is built) and the join itself (signed in).
// The factory takes its dependencies so the mappers run under node with stubs.
import { isLinkCode } from "../domain/appLinks";

export type InvitationPreview = {
  state: "open" | "cancelled" | "happened" | "inactive";
  host?: string;
  title?: string;
  starts_at?: string;
  time_zone?: string;
};

export type JoinRefusalKind = "unavailable" | "name" | "age" | "signin";
export class JoinRefusal extends Error {
  kind: JoinRefusalKind;
  constructor(kind: JoinRefusalKind, message: string) {
    super(message);
    this.name = "JoinRefusal";
    this.kind = kind;
  }
}

export type GuestJoinDeps = {
  fetch: typeof fetch;
  supabaseUrl: string;
  publishableKey: string;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const refusals: [string, JoinRefusalKind][] = [
  ["Invitation unavailable", "unavailable"],
  ["Name required", "name"],
  ["Age confirmation required", "age"],
  ["Sign-in required", "signin"],
];
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
      body: JSON.stringify({ code }),
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
    if (typeof row.host === "string") preview.host = row.host;
    if (typeof row.title === "string") preview.title = row.title;
    if (typeof row.starts_at === "string") preview.starts_at = row.starts_at;
    if (typeof row.time_zone === "string") preview.time_zone = row.time_zone;
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

  async function joinByLink(code: string, name: string | null, termsVersion: string): Promise<string> {
    const { data, error } = await d.rpc("join_by_link", {
      p_code: code,
      p_name: name ?? "",
      p_terms_version: termsVersion,
    });
    if (error) {
      const match = refusals.find(([text]) => error.message.includes(text));
      if (match) throw new JoinRefusal(match[1], error.message);
      throw error;
    }
    return data as string;
  }

  return { readInvitationPreview, noteLinkOpen, joinByLink };
}

const real = createGuestJoin({
  fetch: (input, init) => fetch(input, init),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "unconfigured",
  rpc: async (fn, args) => {
    const { supabase } = require("./supabase") as typeof import("./supabase");
    return supabase.rpc(fn, args);
  },
});
export const readInvitationPreview = real.readInvitationPreview;
export const noteLinkOpen = real.noteLinkOpen;
export const joinByLink = real.joinByLink;
