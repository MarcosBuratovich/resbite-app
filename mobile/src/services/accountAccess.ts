export type AccountAccessStatus = "approved" | "unconfirmed" | "access_pending";

/**
 * The access status and the Terms of Use the server reports with it (plan 4, C8): the current published version,
 * and whether this account has yet to accept it. A server without those keys reads as no gate.
 */
export type AccountAccess = {
  status: AccountAccessStatus;
  termsVersion: string | null;
  termsNeeded: boolean;
};

export type AccountAccessAdapter = {
  sessionAccountId(): Promise<string | null>;
  readStatus(signal: AbortSignal): Promise<unknown>;
};

/**
 * The response must belong to the account captured by the screen/session. The Terms keys count only when well
 * formed: a version that isn't YYYY-MM, or a need that isn't `true`, asks nothing.
 */
export function decodeAccountAccess(
  value: unknown,
  accountId: string,
): AccountAccess {
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
  const termsVersion =
    typeof response.terms_version === "string" &&
    /^\d{4}-\d{2}$/.test(response.terms_version)
      ? response.terms_version
      : null;
  return {
    status: response.status,
    termsVersion,
    termsNeeded: response.terms_needed === true && termsVersion !== null,
  };
}

/** The sign-up tick, once recorded for the server's current version, means the account has accepted it. */
export function afterTick(
  access: AccountAccess,
  recorded: string | null,
): AccountAccess {
  return recorded !== null && recorded === access.termsVersion
    ? { ...access, termsNeeded: false }
    : access;
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
): Promise<AccountAccess> {
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
