import type { NotificationPermission } from "../domain/notifications";

export type PushContext = { account: string | null; preview: boolean };
export type PushJournal = {
  account: string;
  token: string;
  phase: "registering" | "registered" | "removing";
};
export type PushRegistrationAdapter = {
  platform: "ios" | "android" | "web";
  // Must use device-local secure storage; retain until server removal is confirmed.
  readJournal(): Promise<PushJournal | null>;
  writeJournal(value: PushJournal | null): Promise<void>;
  readPermission(): Promise<NotificationPermission>;
  readToken(): Promise<string>;
  // Gateway MUST bind requests to the captured account session, never a later global session.
  register(
    account: string,
    token: string,
    platform: "ios" | "android",
  ): Promise<void>;
  unregister(account: string, token: string): Promise<void>;
};
const validToken = (value: string) =>
  /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(value);
/** Preparation only. No native API, permission request, or live adapter is wired here. */
export function createPushRegistration(
  adapter: PushRegistrationAdapter,
  enabled = false,
) {
  let context: PushContext = { account: null, preview: false };
  let epoch = 0;
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue(work: () => Promise<string>) {
    const result = queue.then(work, work);
    queue = result.catch(() => {});
    return result;
  }
  function operation(removeOnly: boolean) {
    const captured = { ...context },
      generation = epoch;
    return enqueue(async () => {
      if (
        !enabled ||
        adapter.platform === "web" ||
        captured.preview ||
        !captured.account
      )
        return "disabled";
      const account = captured.account;
      const current = () => {
        if (
          epoch !== generation ||
          context.account !== account ||
          context.preview
        )
          throw Error("Account changed during notification setup.");
      };
      current();
      let journal = await adapter.readJournal();
      current();
      if (
        journal &&
        (!validToken(journal.token) ||
          !journal.account ||
          !["registering", "registered", "removing"].includes(journal.phase))
      )
        throw Error("Notification cleanup record is invalid.");
      // An account switch must first await cleanup using the old authenticated session.
      // Do not silently forget an endpoint that may still belong to another account.
      if (journal && journal.account !== account)
        throw Error("Previous account notification cleanup is required.");
      async function remove() {
        if (!journal) return;
        const pending = { ...journal, phase: "removing" as const };
        await adapter.writeJournal(pending);
        current();
        await adapter.unregister(account, pending.token);
        current();
        await adapter.writeJournal(null);
        current();
        journal = null;
      }
      if (removeOnly) {
        await remove();
        return "removed";
      }
      const permission = await adapter.readPermission();
      current();
      if (!["granted", "provisional", "ephemeral"].includes(permission)) {
        await remove();
        return "permission-off";
      }
      // Finish a previous removal before obtaining/registering another token.
      if (journal?.phase === "removing") await remove();
      const token = await adapter.readToken();
      current();
      if (!validToken(token)) throw Error("Notification endpoint is invalid.");
      if (journal && journal.token !== token) await remove();
      // Re-register even a matching journal on foreground reconciliation: server cleanup or
      // an earlier device/account rebind may have removed that endpoint since last use.
      const pending: PushJournal = { account, token, phase: "registering" };
      await adapter.writeJournal(pending);
      current();
      await adapter.register(
        account,
        token,
        adapter.platform as "ios" | "android",
      );
      current();
      await adapter.writeJournal({ ...pending, phase: "registered" });
      current();
      return "registered";
    });
  }
  return {
    update(next: PushContext) {
      if (
        next.account !== context.account ||
        next.preview !== context.preview
      ) {
        context = { ...next };
        epoch++;
      }
    },
    reconcile: () => operation(false),
    // Await BEFORE auth.signOut or switching account. Offline failure retains a retry record.
    beforeSignOut: () => operation(true),
  };
}

export type NotificationTarget = { planId: string; notificationId: string };
export function parseNotificationTarget(
  value: unknown,
): NotificationTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) => !["type", "planId", "notificationId"].includes(key),
    )
  )
    return null;
  if (
    data.type !== "plan_update" ||
    typeof data.planId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.planId,
    ) ||
    typeof data.notificationId !== "string" ||
    !/^[1-9][0-9]{0,18}$/.test(data.notificationId)
  )
    return null;
  return { planId: data.planId, notificationId: data.notificationId };
}
/** Returns only a refetched, account-authorized plan ID, never a payload-provided route. */
export async function resolveNotificationTarget(
  value: unknown,
  deps: {
    account: string | null;
    preview: boolean;
    assertCurrent(): void;
    readAuthorizedPlan(
      account: string,
      plan: string,
    ): Promise<{ id: string } | null>;
  },
): Promise<string | null> {
  const target = parseNotificationTarget(value);
  if (!target || !deps.account || deps.preview) return null;
  deps.assertCurrent();
  const plan = await deps.readAuthorizedPlan(deps.account, target.planId);
  deps.assertCurrent();
  return plan?.id === target.planId ? plan.id : null;
}
