import { REMINDER_PREFIX } from "../domain/reminders";
import { pushDestination, type PushDestination } from "../domain/pushRoute";
import { parseNotificationTarget, resolveNotificationTarget } from "./pushRegistration";
import { isNotInChat } from "./chat";

export type TapResponse = {
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
};
/** `account` is the signed-in user id; `approved` is whether the app is open to them (approved and reviewed). */
export type TapContext = { ready: boolean; account: string | null; approved: boolean; preview: boolean };
export type TapDestination = PushDestination | { pathname: "/account" };

/** A push from Resbite's sender: not a local reminder, and typed as a plan update, a connection or a chat (well formed or not). */
export function isPlanUpdateTap(response: TapResponse | null): boolean {
  const request = response?.notification.request;
  if (!request || request.identifier.startsWith(REMINDER_PREFIX)) return false;
  const type = request.content.data?.type;
  return type === "plan_update" || type === "connection" || type === "chat";
}

/**
 * Routes push taps. A tap is held until the session and account have settled (`ready`), dropped when signed
 * out or in preview, and otherwise resolved by an authorized refetch before navigating. A newer tap
 * supersedes an older one still in flight. An empty read lands on My resbites with the gone note; a read that
 * failed opens the event, whose page has its own retry and offline states. A tap from an account that isn't
 * approved yet refreshes the account once; it is never held longer than `holdMs` and then goes to /account.
 * A chat tap (Task 8) reads the chat first and opens it; when the chat refuses ('Not in this chat': a pending invitee
 * on an "Everyone invited" announcement, a guest who left or was removed) it reads the plan as a plan tap does and
 * opens the event, or the gone note when that reads empty (K-B4); a chat read that failed (offline, timed out) opens
 * the chat, which has its own offline state.
 * The launch tap is taken at most once. Reminder taps are not handled here.
 */
export function createPushTapRouter(deps: {
  context(): TapContext;
  /** The plan as this account may read it: null for an empty read (removed, declined, gone); rejects when the
   * read itself failed (offline, timed out, a server error). */
  readAuthorizedPlan(account: string, plan: string): Promise<{ id: string } | null>;
  /** The chat of a series as this account may read it (`chat_summary`): rejects with 42501 'Not in this chat' when
   * the account isn't in it, and otherwise when the read itself failed. */
  readChat(account: string, series: string): Promise<unknown>;
  /** Re-reads the account once: true when it is now approved, false when not, null when superseded or failed. */
  refreshAccount(): Promise<boolean | null>;
  open(destination: TapDestination): void;
  /** How long a tap may wait for an unapproved account to settle. */
  holdMs?: number;
}) {
  const holdMs = deps.holdMs ?? 10_000;
  let pending: unknown;
  let has = false;
  let launched = false;
  let generation = 0;
  let phase: "idle" | "refreshing" | "waiting" = "idle";
  let forced = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    has = false;
    pending = undefined;
    phase = "idle";
    forced = false;
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const toAccount = () => {
    finish();
    deps.open({ pathname: "/account" });
  };
  async function flush(): Promise<void> {
    if (!has) return;
    const start = { ...deps.context() };
    if (!start.ready) return;
    if (!start.account || start.preview) return finish();
    const mine = generation;
    if (!start.approved && !forced) {
      if (phase === "waiting") return toAccount();
      if (phase === "idle") {
        phase = "refreshing";
        timer = setTimeout(() => {
          if (generation === mine && has) toAccount();
        }, holdMs);
        void deps.refreshAccount().then(
          (approved) => {
            if (generation !== mine || !has) return;
            phase = "waiting";
            if (approved === true) forced = true;
            else if (approved === false) return toAccount();
            void flush();
          },
          () => {
            if (generation !== mine || !has) return;
            phase = "waiting";
            void flush();
          },
        );
      }
      return;
    }
    const data = pending;
    finish();
    // A connection tap needs no plan read: it opens Connections once the account is ready and approved.
    if (parseNotificationTarget(data)?.kind === "connection") {
      if (generation === mine) deps.open(pushDestination(null, "connection"));
      return;
    }
    // Keyed on the signed-in user, not on approval, so a refresh mid-resolve doesn't drop the tap.
    const assertCurrent = () => {
      const now = deps.context();
      if (generation !== mine || now.account !== start.account || now.preview) throw Error("Superseded.");
    };
    const current = () => {
      try {
        assertCurrent();
        return true;
      } catch {
        return false;
      }
    };
    const target = parseNotificationTarget(data);
    if (target?.kind === "chat") {
      const account = start.account;
      let refused = false;
      try {
        await deps.readChat(account, target.seriesId);
      } catch (error) {
        refused = isNotInChat(error);
      }
      if (!current()) return;
      // Read, or a read that failed: the chat, whose screen has its own offline and not-in-this-chat states.
      if (!refused) return deps.open(pushDestination(target.seriesId, "chat"));
      // Refused: the event when this account can still read it (K-B4), the gone note when not; a plan read that
      // failed opens the event, as a plan tap does.
      let plan: string | null;
      try {
        const found = await deps.readAuthorizedPlan(account, target.planId);
        plan = found?.id === target.planId ? found.id : null;
      } catch {
        plan = target.planId;
      }
      if (current()) deps.open(pushDestination(plan));
      return;
    }
    // The plan whose read failed, as opposed to an empty read.
    const failed: { plan?: string } = {};
    let result: string | null;
    try {
      result = await resolveNotificationTarget(data, {
        account: start.account,
        preview: start.preview,
        assertCurrent,
        async readAuthorizedPlan(account, plan) {
          try {
            return await deps.readAuthorizedPlan(account, plan);
          } catch (error) {
            failed.plan = plan;
            throw error;
          }
        },
      });
    } catch {
      // Superseded by a newer tap, or the account changed while checking: the tap is dropped. A read that failed
      // (offline, timed out) isn't "gone": the tap opens the event, which has its own retry and offline states.
      if (!failed.plan) return;
      try {
        assertCurrent();
      } catch {
        return;
      }
      result = failed.plan;
    }
    if (generation === mine) deps.open(pushDestination(result));
  }
  const taps = {
    receive(response: TapResponse | null): boolean {
      if (!isPlanUpdateTap(response)) return false;
      generation++;
      finish();
      pending = response!.notification.request.content.data;
      has = true;
      void flush();
      return true;
    },
    /** The tap that opened the app, handled once however often this is called. Returns whether it was one. */
    launch(read: () => TapResponse | null, clear: () => void): boolean {
      if (launched) return false;
      launched = true;
      const response = read();
      if (!isPlanUpdateTap(response)) return false;
      clear();
      return taps.receive(response);
    },
    flush,
  };
  return taps;
}
