export type AccountAccessStatus = "approved" | "unconfirmed" | "access_pending";

export type AccountAccessAdapter = {
  sessionAccountId(): Promise<string | null>;
  readStatus(signal: AbortSignal): Promise<unknown>;
};

/** The response must belong to the account captured by the screen/session. */
export function decodeAccountAccess(
  value: unknown,
  accountId: string,
): AccountAccessStatus {
  if (!accountId || !value || typeof value !== "object" || Array.isArray(value))
    throw Error("Account access could not be checked. Please try again.");
  const response = value as Record<string, unknown>;
  if (response.account_id !== accountId)
    throw Error("Account changed. Please check access again.");
  if (
    response.status !== "approved" &&
    response.status !== "unconfirmed" &&
    response.status !== "access_pending"
  )
    throw Error("Account access could not be checked. Please try again.");
  return response.status;
}

// Lazy imports keep the decoder and injected adapter usable in isolated tests.
export const supabaseAccountAccessAdapter: AccountAccessAdapter = {
  async sessionAccountId() {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.user.id ?? null;
  },
  async readStatus(signal) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .rpc("account_access_status")
      .abortSignal(signal);
    if (error) throw error;
    return data;
  },
};

/** A failed/unknown check must stay retryable; it never implies approval. */
export async function readAccountAccess(
  options: {
    accountId: string;
    assertCurrent: () => void;
    timeoutMs?: number;
  },
  adapter: AccountAccessAdapter = supabaseAccountAccessAdapter,
): Promise<AccountAccessStatus> {
  const { accountId, assertCurrent } = options;
  if (!accountId) throw Error("Sign in to check account access.");
  assertCurrent();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => {
    assertCurrent();
    if (controller.signal.aborted)
      throw Error("Account access check timed out. Please try again.");
  };
  const check = async () => {
    const before = await adapter.sessionAccountId();
    current();
    if (before !== accountId)
      throw Error("Account changed. Please check access again.");
    const response = await adapter.readStatus(controller.signal);
    current();
    const after = await adapter.sessionAccountId();
    current();
    if (after !== accountId)
      throw Error("Account changed. Please check access again.");
    return decodeAccountAccess(response, accountId);
  };
  try {
    return await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("Account access check timed out. Please try again."));
        }, options.timeoutMs ?? 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
