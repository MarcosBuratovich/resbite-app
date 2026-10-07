import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useApp } from "./AppState";
import {
  readAccountAccess,
  type AccountAccessStatus,
} from "../services/accountAccess";
import { accountDetailsAdapter } from "../services/accountDetails";
import { readProfile } from "../services/profile";
import { withDeadline } from "../services/plans";
import { hasReviewedDetails } from "../domain/registration";

type Snapshot = {
  accountId: string;
  status: AccountAccessStatus | "checking" | "error";
  user: User | null;
  profileReady: boolean;
  error: string | null;
};
const blank = (accountId = ""): Snapshot => ({
  accountId,
  status: "checking",
  user: null,
  profileReady: false,
  error: null,
});
const Context = createContext<
  Snapshot & {
    reviewed: boolean;
    refresh: () => Promise<void>;
    acceptDetails: (user: User) => void;
    profileSaved: () => void;
  }
>({
  ...blank(),
  reviewed: false,
  refresh: async () => {},
  acceptDetails: () => {},
  profileSaved: () => {},
});

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { session, preview, captureSession, signingOut } = useApp();
  const accountId = preview ? "" : (session?.user.id ?? "");
  const [snapshot, setSnapshot] = useState<Snapshot>(blank);
  const identity = useRef(accountId),
    generation = useRef(0),
    sessionRef = useRef(session);
  identity.current = accountId;
  sessionRef.current = session;
  const refresh = useCallback(async () => {
    const captured = sessionRef.current;
    if (!accountId || !captured || signingOut) return;
    const request = ++generation.current,
      assertSession = captureSession();
    const assertCurrent = () => {
      assertSession();
      if (identity.current !== accountId || generation.current !== request)
        throw Error("Account changed.");
    };
    setSnapshot((old) => ({
      ...old,
      accountId,
      status: "checking",
      error: null,
    }));
    try {
      const [status, user] = await Promise.all([
        readAccountAccess({ accountId, assertCurrent }),
        withDeadline((signal) =>
          accountDetailsAdapter(captured.access_token).read(signal),
        ),
      ]);
      assertCurrent();
      if (user.id !== accountId) throw Error("Account changed.");
      const profile =
        status === "approved" ? await readProfile(accountId) : null;
      assertCurrent();
      setSnapshot({
        accountId,
        status,
        user,
        profileReady: Boolean(profile?.display_name),
        error: null,
      });
    } catch {
      try {
        assertCurrent();
      } catch {
        return;
      }
      setSnapshot({
        ...blank(accountId),
        status: "error",
        error:
          "We couldn’t check your account. Check your connection and try again.",
      });
    }
  }, [accountId, captureSession, signingOut]);
  useEffect(() => {
    setSnapshot(blank(accountId));
    void refresh();
    return () => {
      generation.current++;
    };
  }, [accountId, refresh]);
  const value = snapshot.accountId === accountId ? snapshot : blank(accountId);
  return (
    <Context.Provider
      value={{
        ...value,
        reviewed: Boolean(
          value.user && hasReviewedDetails(value.user.user_metadata),
        ),
        refresh,
        acceptDetails: (user) => {
          if (user.id !== identity.current) return;
          setSnapshot((old) =>
            old.accountId === user.id ? { ...old, user } : old,
          );
        },
        profileSaved: () =>
          setSnapshot((old) =>
            old.accountId === identity.current
              ? { ...old, profileReady: true }
              : old,
          ),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAccount = () => useContext(Context);
