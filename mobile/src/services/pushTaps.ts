import { REMINDER_PREFIX } from "../domain/reminders";
import { pushDestination, type PushDestination } from "../domain/pushRoute";
import { resolveNotificationTarget } from "./pushRegistration";

export type TapResponse = {
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
};
export type TapContext = { ready: boolean; account: string | null; preview: boolean };

/** A push from Resbite's sender: not a local reminder, and typed as a plan update (well formed or not). */
export function isPlanUpdateTap(response: TapResponse | null): boolean {
  const request = response?.notification.request;
  if (!request || request.identifier.startsWith(REMINDER_PREFIX)) return false;
  return request.content.data?.type === "plan_update";
}

/**
 * Routes push taps. A tap is held until the session and account have settled (`ready`), dropped when signed
 * out or in preview, and otherwise resolved by an authorized refetch before navigating. The launch tap is
 * taken at most once. Reminder taps are not handled here.
 */
export function createPushTapRouter(deps: {
  context(): TapContext;
  readAuthorizedPlan(account: string, plan: string): Promise<{ id: string } | null>;
  open(destination: PushDestination): void;
}) {
  let pending: unknown;
  let has = false;
  let launched = false;
  let running = false;
  async function flush(): Promise<void> {
    if (!has || running) return;
    const start = { ...deps.context() };
    if (!start.ready) return;
    const data = pending;
    has = false;
    pending = undefined;
    if (!start.account || start.preview) return;
    running = true;
    try {
      const result = await resolveNotificationTarget(data, {
        account: start.account,
        preview: start.preview,
        assertCurrent() {
          const now = deps.context();
          if (now.account !== start.account || now.preview) throw Error("Account changed.");
        },
        readAuthorizedPlan: deps.readAuthorizedPlan,
      });
      deps.open(pushDestination(result));
    } catch {
      // The account changed while checking; the tap is dropped.
    } finally {
      running = false;
    }
  }
  return {
    receive(response: TapResponse | null): boolean {
      if (!isPlanUpdateTap(response)) return false;
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
      return this.receive(response);
    },
    flush,
  };
}
