import { createJournal } from "../services/journal";
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
import {
  createSessionLifecycle,
  signOutNotice,
} from "../services/sessionLifecycle";
import { profilePhotoStore } from "../services/profile";
import { planCoverStore } from "../services/planCovers";
import { peopleStore } from "../services/people";
import { recentPlaces } from "../services/recentPlaces";
import { inviteCodeStore } from "../services/inviteCodeStore";
import { chatQueue } from "../services/chatQueue";
import { forgetNames } from "./knownNames";
import { clearReminders } from "../services/deviceReminders";
import { clearCalendarRecords } from "../services/deviceCalendar";
import { clearAttestation } from "../services/phoneAccount";
import { supabase, storage } from "../services/supabase";
import { pushSession, usePushForeground } from "./usePushRegistration";
import { clearShownPushes } from "../services/pushDevice";
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
  /** The plan a lost create turned out to have made (found by the launch reconcile), for the account it belongs to. */
  createdPlan: { scope: string; title: string } | null;
  setCreatedPlan: (found: { scope: string; title: string } | null) => void;
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
  createdPlan: null,
  setCreatedPlan: () => {},
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
  const [createdPlan, setCreatedPlan] = useState<{ scope: string; title: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  const previewRef = useRef(preview);
  const [lifecycle] = useState(() =>
    createSessionLifecycle({
      suspend: (scope) => {
        peopleStore.suspend(scope);
        inviteCodeStore.suspend(scope);
        chatQueue.suspend(scope);
      },
      resume: (scope) => {
        peopleStore.resume(scope);
        inviteCodeStore.resume(scope);
        chatQueue.resume(scope);
      },
      clearPeople: peopleStore.clear,
      clearRecentPlaces: (scope) => recentPlaces.clear(scope),
      clearInviteCodes: (scope) => inviteCodeStore.clear(scope),
      clearChatQueue: (scope) => chatQueue.clear(scope),
      clearKnownNames: forgetNames,
      clearReminders,
      clearCalendarRecords,
      clearPhoto: (scope) => profilePhotoStore.clear(scope),
      clearCovers: (scope) => planCoverStore.clearCoverJournals(scope),
      blockPending: pendingStore.beginCleanup,
      clearPending: async () => {
        // A sign-up's 18+ tick still waiting for its account goes with the device's other pending state.
        clearAttestation();
        await pendingStore.clear();
      },
      clearJournal: createJournal.clear,
      // Plan 4: this phone's push endpoint goes first, with the account's own session.
      blockPush: pushSession.hold,
      clearPush: pushSession.clear,
      clearShownPushes,
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
        setCreatedPlan(null);
        const next = {
          account: sessionRef.current?.user.id ?? null,
          preview: false,
        };
        lifecycle.update(next);
        void pushSession.update(next);
      },
      busy: setSigningOut,
    }),
  );
  const changePreview = useCallback(
    (value: boolean) => {
      previewRef.current = value;
      const next = {
        account: sessionRef.current?.user.id ?? null,
        preview: value,
      };
      lifecycle.update(next);
      void pushSession.update(next);
      setPreview(value);
    },
    [lifecycle],
  );
  const captureSession = useCallback(() => lifecycle.capture(), [lifecycle]);
  usePushForeground();
  useEffect(() => {
    let active = true;
    let authChanged = false;
    const accept = (value: Session | null) => {
      sessionRef.current = value;
      const next = {
        account: value?.user.id ?? null,
        preview: previewRef.current,
      };
      lifecycle.update(next);
      // Plan 4: registers this phone for push once the session is known.
      void pushSession.update(next);
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
        signOutNotice(error, Boolean(sessionRef.current || previewRef.current)),
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
        createdPlan,
        setCreatedPlan,
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
