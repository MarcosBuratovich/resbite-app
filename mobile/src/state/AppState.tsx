import { drafts } from "../services/drafts";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { createPendingInviteStore } from "../services/pendingInviteStore";
import { createSessionLifecycle } from "../services/sessionLifecycle";
import { profilePhotoStore } from "../services/profile";
import { peopleStore } from "../services/people";
import { supabase, storage } from "../services/supabase";
import type { Plan } from "../domain/plans";
/** Kept as an alias for existing screens; the type lives in the domain layer. */
export type LocalPlan = Plan;
const State = createContext<{
  session: Session | null;
  restoring: boolean;
  pendingInvite: string | null;
  inviteRestored: boolean;
  inviteRestoreError: string | null;
  restoreInvite: () => Promise<void>;
  rememberInvite: (token: string | null, expected?: string) => Promise<void>;
  captureSession: () => () => void;
  signingOut: boolean;
  signOutError: string | null;
  clearSignOutError: () => void;
  preview: boolean;
  setPreview: (x: boolean) => void;
  localPlans: LocalPlan[];
  setLocalPlans: React.Dispatch<React.SetStateAction<LocalPlan[]>>;
  signOut: () => Promise<void>;
  finishAccountDeletion: (accountId: string) => Promise<void>;
}>({
  session: null,
  restoring: true,
  pendingInvite: null,
  inviteRestored: false,
  inviteRestoreError: null,
  restoreInvite: async () => {},
  rememberInvite: async () => {},
  captureSession: () => () => {},
  signingOut: false,
  signOutError: null,
  clearSignOutError: () => {},
  preview: false,
  setPreview: () => {},
  localPlans: [],
  setLocalPlans: () => {},
  signOut: async () => {},
  finishAccountDeletion: async () => {},
});
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [pendingStore] = useState(() =>
    createPendingInviteStore(storage, setPendingInvite),
  );
  const rememberInvite = useCallback(
    async (token: string | null, expected?: string) => {
      await pendingStore.remember(token, expected);
      setInviteRestored(true);
      setInviteRestoreError(null);
    },
    [pendingStore],
  );
  const [inviteRestored, setInviteRestored] = useState(false);
  const [inviteRestoreError, setInviteRestoreError] = useState<string | null>(
    null,
  );
  const restoreInvite = useCallback(async () => {
    setInviteRestored(false);
    setInviteRestoreError(null);
    try {
      await pendingStore.restore();
      setInviteRestored(true);
    } catch {
      setInviteRestoreError(
        "We couldn’t restore an invitation saved on this device. Please try again, or reopen the original link.",
      );
    }
  }, [pendingStore]);
  useEffect(() => {
    void restoreInvite();
  }, [restoreInvite]);
  const [session, setSession] = useState<Session | null>(null),
    [restoring, setRestoring] = useState(true),
    [preview, setPreview] = useState(false),
    [localPlans, setLocalPlans] = useState<LocalPlan[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  const previewRef = useRef(preview);
  const [lifecycle] = useState(() =>
    createSessionLifecycle({
      suspend: peopleStore.suspend,
      resume: peopleStore.resume,
      clearPeople: peopleStore.clear,
      clearPhoto: (scope) => profilePhotoStore.clear(scope),
      blockPending: pendingStore.beginCleanup,
      clearPending: pendingStore.clear,
      clearDrafts: drafts.clearScope,
      authSignOut: async (localOnly) => {
        const { error } = await supabase.auth.signOut(
          localOnly ? { scope: "local" } : undefined,
        );
        if (error) throw error;
      },
      finish: (wasPreview) => {
        if (!wasPreview) {
          sessionRef.current = null;
          setSession(null);
        }
        previewRef.current = false;
        setPreview(false);
        setLocalPlans([]);
        lifecycle.update({
          account: sessionRef.current?.user.id ?? null,
          preview: false,
        });
      },
      busy: setSigningOut,
    }),
  );
  const changePreview = useCallback(
    (value: boolean) => {
      previewRef.current = value;
      lifecycle.update({
        account: sessionRef.current?.user.id ?? null,
        preview: value,
      });
      setPreview(value);
    },
    [lifecycle],
  );
  const captureSession = useCallback(() => lifecycle.capture(), [lifecycle]);
  useEffect(() => {
    let active = true;
    let authChanged = false;
    const accept = (value: Session | null) => {
      sessionRef.current = value;
      lifecycle.update({
        account: value?.user.id ?? null,
        preview: previewRef.current,
      });
      setSession(value);
      setRestoring(false);
    };
    const timer = setTimeout(() => active && setRestoring(false), 6000);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active && !authChanged) accept(data.session);
      })
      .catch(() => active && setRestoring(false));
    const { data } = supabase.auth.onAuthStateChange((_event, value) => {
      if (!active) return;
      authChanged = true;
      accept(value);
    });
    return () => {
      active = false;
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);
  const signOut = useCallback(() => {
    setSignOutError(null);
    return lifecycle.signOut().catch((error) => {
      setSignOutError(
        sessionRef.current || previewRef.current
          ? "Sign-out could not finish. Some local data may already be cleared. Please try again."
          : "You are signed out on this device, but server sign-out could not be confirmed. Other sessions may still be active. Sign in again to manage your account.",
      );
      throw error;
    });
  }, [lifecycle]);
  return (
    <State.Provider
      value={{
        session,
        restoring,
        pendingInvite,
        inviteRestored,
        inviteRestoreError,
        restoreInvite,
        rememberInvite,
        preview,
        setPreview: changePreview,
        signingOut,
        signOutError,
        clearSignOutError: () => setSignOutError(null),
        captureSession,
        localPlans,
        setLocalPlans,
        signOut,
        finishAccountDeletion: (accountId) =>
          lifecycle.finishAccountDeletion(accountId),
      }}
    >
      {children}
    </State.Provider>
  );
}
export const useApp = () => useContext(State);
