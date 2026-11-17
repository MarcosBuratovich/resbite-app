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
  afterTick,
  readAccountAccess,
  type AccountAccessStatus,
} from "../services/accountAccess";
import { accountDetailsAdapter } from "../services/accountDetails";
import { readProfile } from "../services/profile";
import { withDeadline } from "../services/plans";
import { phoneVerified } from "../domain/phone";
import { flushAttestation, noteAppSession } from "../services/phoneAccount";

type Snapshot = {
  accountId: string;
  status: AccountAccessStatus | "checking" | "error";
  user: User | null;
  profileReady: boolean;
  /** This account's own display name, trimmed, as its profile was read or last saved; null when unknown. */
  displayName: string | null;
  /** The current Terms of Use version the server reported; null when none is published or unknown. */
  termsVersion: string | null;
  /** The account has yet to accept `termsVersion` (the Accept your Terms gate). */
  termsNeeded: boolean;
  error: string | null;
};
const blank = (accountId = ""): Snapshot => ({
  accountId,
  status: "checking",
  user: null,
  profileReady: false,
  displayName: null,
  termsVersion: null,
  termsNeeded: false,
  error: null,
});
const Context = createContext<
  Snapshot & {
    reviewed: boolean;
    /** Re-reads the account. Resolves with the user it read, or null when the read failed or was
     * superseded by a newer one or another account; never rejects. */
    refresh: () => Promise<User | null>;
    /** The access status of the newest finished read (not React state, so it is current right after `refresh`). */
    latestStatus: () => Snapshot["status"];
    acceptDetails: (user: User) => void;
    /** The profile was saved with this name. */
    profileSaved: (name: string) => void;
  }
>({
  ...blank(),
  reviewed: false,
  refresh: async () => null,
  latestStatus: () => "checking",
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
  const noted = useRef<string | null>(null);
  const latest = useRef<Snapshot["status"]>("checking");
  identity.current = accountId;
  sessionRef.current = session;
  const refresh = useCallback(async (): Promise<User | null> => {
    const captured = sessionRef.current;
    if (!accountId || !captured || signingOut) return null;
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
      const [read, user] = await Promise.all([
        readAccountAccess({ accountId, assertCurrent }),
        withDeadline((signal) =>
          accountDetailsAdapter(captured.access_token).read(signal),
        ),
      ]);
      assertCurrent();
      if (user.id !== accountId) throw Error("Account changed.");
      const { status } = read;
      const profile =
        status === "approved" ? await readProfile(accountId) : null;
      assertCurrent();
      let access = read;
      if (status === "approved" || status === "access_pending") {
        // The sign-up tick goes first, as the server's current Terms version, so an account that has just
        // ticked is not asked to accept them again. Recorded only when this account holds the number the
        // tick was given for; never throws.
        access = afterTick(read, await flushAttestation(user, undefined, read.termsVersion));
        assertCurrent();
      }
      latest.current = status;
      setSnapshot({
        accountId,
        status,
        user,
        profileReady: Boolean(profile?.display_name),
        displayName: profile?.display_name?.trim() || null,
        termsVersion: access.termsVersion,
        termsNeeded: access.termsNeeded,
        error: null,
      });
      if (status === "approved" || status === "access_pending") {
        if (noted.current !== accountId) {
          noted.current = accountId;
          void noteAppSession();
        }
      }
      return user;
    } catch {
      try {
        assertCurrent();
      } catch {
        return null;
      }
      latest.current = "error";
      setSnapshot({
        ...blank(accountId),
        status: "error",
        error:
          "We couldn’t check your account. Check your connection and try again.",
      });
      return null;
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
        // The phone gate is the only way in: reviewed details alone no longer open the app. The current
        // Terms of Use are accepted first, so the signed-in stack stays shut until then.
        reviewed:
          Boolean(value.user && phoneVerified(value.user)) && !value.termsNeeded,
        refresh,
        latestStatus: () => latest.current,
        acceptDetails: (user) => {
          if (user.id !== identity.current) return;
          setSnapshot((old) =>
            old.accountId === user.id ? { ...old, user } : old,
          );
        },
        profileSaved: (name) =>
          setSnapshot((old) =>
            old.accountId === identity.current
              ? { ...old, profileReady: true, displayName: name.trim() || old.displayName }
              : old,
          ),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAccount = () => useContext(Context);
