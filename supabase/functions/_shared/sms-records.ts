/** The daily sweep of Twilio's message records (the Privacy Policy's placeholder 5 proposal): once a day, every record
 * whose status is final and that is over a day old is deleted through Twilio's API, so a code's text stays at Twilio
 * for about a day, then only in Twilio's 30-day backups. pg_cron calls it with its own bearer secret. It logs counts
 * only, never a sid, a number, a text or an upstream body. */
import { sameText, type LogEntry, type TwilioConfig } from "./sms-hook.ts";

export type SmsRecord = { sid: string; status: string; createdAt: number };

/** Twilio's statuses for a message still on its way: never deleted. */
export const IN_FLIGHT: ReadonlySet<string> = new Set(["queued", "sending", "accepted", "scheduled", "receiving"]);

/** How long a settled record stays at Twilio before the sweep deletes it: one day. */
export const KEEP_MS = 86_400_000;

/** One run reads at most ten pages of a hundred records. */
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
/** How long each call to Twilio may take. */
const TWILIO_RECORDS_TIMEOUT_MS = 10_000;
const TWILIO_ORIGIN = "https://api.twilio.com";

export type SweepDeps = {
  secret?: string;
  nowMs(): number;
  list(): Promise<SmsRecord[]>;
  remove(sid: string): Promise<boolean>;
  log(entry: LogEntry): void;
};

function reply(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });
}

/** POST with `Authorization: Bearer <secret>` (32 characters or more). Lists every record first, then deletes the
 * settled ones over a day old; a delete that fails is counted and the run goes on. */
export async function handleSweep(request: Request, deps: SweepDeps): Promise<Response> {
  if (request.method !== "POST") {
    deps.log({ route: "sweep", outcome: "method" });
    return reply(405, { error: "method not allowed" }, { Allow: "POST" });
  }
  const supplied = request.headers.get("authorization") ?? "";
  if (!deps.secret || deps.secret.length < 32 || !sameText(supplied, `Bearer ${deps.secret}`)) {
    deps.log({ route: "sweep", outcome: "unauthorized" });
    return reply(401, { error: "unauthorized" });
  }
  let records: SmsRecord[];
  try {
    records = await deps.list();
  } catch {
    deps.log({ route: "sweep", outcome: "unavailable" });
    return reply(503, { error: "unavailable" });
  }
  const now = deps.nowMs();
  let deleted = 0;
  let kept = 0;
  let failed = 0;
  for (const record of records) {
    // A record still in flight, a day old or less, or with an unreadable date (NaN) is kept.
    if (IN_FLIGHT.has(record.status) || !(now - record.createdAt > KEEP_MS)) {
      kept++;
      continue;
    }
    let gone = false;
    try {
      gone = await deps.remove(record.sid);
    } catch {
      gone = false;
    }
    if (gone) deleted++;
    else failed++;
  }
  deps.log({ route: "sweep", outcome: "swept", deleted, kept, failed });
  return reply(200, { deleted, kept, failed });
}

/** Twilio's next page, only ever on Twilio's API (the Basic key goes with it). */
function nextPage(uri: unknown): string | null {
  if (uri === null || uri === undefined || uri === "") return null;
  if (typeof uri !== "string" || !uri.startsWith("/")) throw new Error("Twilio's next page is not on its API");
  const url = new URL(uri, TWILIO_ORIGIN);
  if (url.origin !== TWILIO_ORIGIN) throw new Error("Twilio's next page is not on its API");
  return url.href;
}

/** The account's message records through Twilio's API, with the same API key as the sender. */
export function twilioRecords(c: TwilioConfig): Pick<SweepDeps, "list" | "remove"> {
  const doFetch = c.fetch ?? ((input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(input, init));
  const messages = `${TWILIO_ORIGIN}/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}/Messages`;
  const headers = { Authorization: `Basic ${btoa(`${c.apiKeySid}:${c.apiKeySecret}`)}` };
  return {
    async list() {
      const records: SmsRecord[] = [];
      let url: string | null = `${messages}.json?PageSize=${PAGE_SIZE}`;
      for (let page = 0; url !== null && page < MAX_PAGES; page++) {
        const response = await doFetch(url, { method: "GET", headers, signal: AbortSignal.timeout(TWILIO_RECORDS_TIMEOUT_MS) });
        if (response.status !== 200) {
          await response.body?.cancel().catch(() => {});
          throw new Error(`Twilio answered ${response.status}`);
        }
        const body = (await response.json()) as { messages?: unknown; next_page_uri?: unknown } | null;
        if (!body || !Array.isArray(body.messages)) throw new Error("Twilio's page has no message list");
        for (const message of body.messages as unknown[]) {
          const { sid, status, date_created: created } = (message ?? {}) as { sid?: unknown; status?: unknown; date_created?: unknown };
          if (typeof sid !== "string" || sid === "" || typeof status !== "string") throw new Error("Twilio's page has a record without a sid or status");
          records.push({ sid, status, createdAt: typeof created === "string" ? Date.parse(created) : Number.NaN });
        }
        url = nextPage(body.next_page_uri);
      }
      return records;
    },
    async remove(sid) {
      try {
        const response = await doFetch(`${messages}/${encodeURIComponent(sid)}.json`, {
          method: "DELETE",
          headers,
          signal: AbortSignal.timeout(TWILIO_RECORDS_TIMEOUT_MS),
        });
        await response.body?.cancel().catch(() => {});
        // 404: already gone. Anything else (409 for a message Twilio still holds, 5xx) is not deleted.
        return response.status === 204 || response.status === 404;
      } catch {
        return false;
      }
    },
  };
}
