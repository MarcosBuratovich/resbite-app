import { REMINDER_PREFIX } from "../domain/reminders";
import { pushDestination, type PushDestination } from "../domain/pushRoute";
import { resolveNotificationTarget } from "./pushRegistration";

export type TapResponse = {
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
};
/** `account` is the signed-in user id; `approved` is whether the app is open to them (approved and reviewed). */
export type TapContext = { ready: boolean; account: string | null; approved: boolean; preview: boolean };
export type TapDestination = PushDestination | { pathname: "/account" };

/** A push from Resbite's sender: not a local reminder, and typed as a plan update (well formed or not). */
export function isPlanUpdateTap(response: TapResponse | null): boolean {
  const request = response?.notification.request;
  if (!request || request.identifier.startsWith(REMINDER_PREFIX)) return false;
  return request.content.data?.type === "plan_update";
}

/**
 * Routes push taps. A tap is held until the session and account have settled (`ready`), dropped when signed
 * out or in preview, and otherwise resolved by an authorized refetch before navigating. A newer tap
 * supersedes an older one still in flight. A tap from an account that isn't approved yet refreshes the
 * account once; it is never held longer than `holdMs` and then goes to /account. The launch tap is taken at
 * most once. Reminder taps are not handled here.
 */
export function createPushTapRouter(deps: {
  context(): TapContext;
  readAuthorizedPlan(account: string, plan: string): Promise<{ id: string } | null>;
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
    try {
      const result = await resolveNotificationTarget(data, {
        account: start.account,
        preview: start.preview,
        assertCurrent() {
          // Keyed on the signed-in user, not on approval, so a refresh mid-resolve doesn't drop the tap.
          const now = deps.context();
          if (generation !== mine || now.account !== start.account || now.preview) throw Error("Superseded.");
        },
        readAuthorizedPlan: deps.readAuthorizedPlan,
      });
      if (generation === mine) deps.open(pushDestination(result));
    } catch {
      // Superseded by a newer tap, or the account changed while checking; the tap is dropped.
    }
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
