import { useCallback, useEffect, useRef, useState } from "react";
import type { TextInput } from "react-native";
import { router } from "expo-router";
import type { Session, User } from "@supabase/supabase-js";
import { useAccount } from "./AccountState";
import { useApp } from "./AppState";
import { useAuthFlow } from "./useAuthFlow";
import type { CardState } from "../design/GuestSteps";
import { appleSignInAvailable, appleSignInDeps, signInWithApple } from "../services/appleSignIn";
import { emailCodeDeps, sendCode, verifyCode } from "../services/emailCode";
import { JoinRefusal, joinByLink, noteLinkOpen, readInvitationPreview } from "../services/guestJoin";
import { accountDetailsAdapter, saveAccountDetails } from "../services/accountDetails";
import { withDeadline } from "../services/plans";
import { supabase } from "../services/supabase";
import { isLinkCode } from "../domain/appLinks";
import { detailsFromMetadata } from "../domain/registration";
import { TERMS_VERSION, nameFromSession, nextStepAfterSignIn, type GuestStep } from "../domain/guestAccount";

// Signing in remounts every screen (the root Stack is keyed by the account), so two things live outside it:
// Apple's name by account (Apple sends it on the first sign-in only), and the code a signed-out visit counted,
// so the mount right after signing in from that visit doesn't count the same open again.
const appleNames = new Map<string, string>();
let countedSignedOut: string | null = null;
/** sendCode's `resendAt` is the send time plus this; verifyCode wants the send time. */
const RESEND_MS = 60_000;

export type DeadState = "cancelled" | "happened" | "inactive";

/** Marks setup as reviewed with the account's own optional details, so a guest skips "About you" (GI2-D8). */
async function markReviewed(current: Session, assertCurrent: () => void): Promise<User> {
  const adapter = accountDetailsAdapter(current.access_token);
  const baseline = await withDeadline((signal) => adapter.read(signal));
  assertCurrent();
  return saveAccountDetails({
    accountId: current.user.id,
    baseline,
    value: detailsFromMetadata(baseline.user_metadata),
    assertCurrent,
    adapter,
  });
}

/**
 * GI2: the guest's account from an event link (spec §4). `active` while signed out, and signed in while the
 * account waits for access; once a join starts it stays active until the handoff. Signed out: the invitation's
 * card, the 18+ tick (kept on the device with the code) and Apple, Google or an email code. Signed in, once per
 * account on the screen after the kept tick is read: join straight away when the name and the tick are known,
 * else the Name step or the tick again. After the join: the account is refreshed, setup marked reviewed, the
 * kept code and tick dropped, and the event page opens once the route guard lets it.
 */
export function useGuestAccount({ code, token }: { code?: string; token?: string }) {
  const { session, preview, signingOut, rememberInvite, pendingTerms, rememberTerms, readTerms, captureSession } =
    useApp();
  const account = useAccount();
  // The event link as opened, and that code when well formed.
  const link = !token && code !== undefined && !preview ? code : null;
  const linkCode = isLinkCode(link) ? link : null;
  const pendingAccess = Boolean(session) && linkCode !== null && account.status === "access_pending";
  const [began, setBegan] = useState(false);
  const active = link !== null && (!session || pendingAccess || began);
  const [card, setCard] = useState<CardState>({ status: "loading" });
  const [dead, setDead] = useState<DeadState | null>(null);
  const [step, setStep] = useState<GuestStep | null>(session ? null : "providers");
  const [ticked, setTicked] = useState(pendingTerms === TERMS_VERSION);
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState("");
  const [name, setName] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [signInAgain, setSignInAgain] = useState(false);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const flow = useAuthFlow();
  const mounted = useRef(true);
  const joining = useRef(false);
  const verifying = useRef(false);
  const lastName = useRef<string | null>(null);
  const counted = useRef<string | null>(null);
  const cardFor = useRef<string | null>(null);
  const decided = useRef<string | null>(null);
  const codeInput = useRef<TextInput>(null);
  const remember = useRef(rememberInvite);
  remember.current = rememberInvite;

  useEffect(() => {
    mounted.current = true;
    void appleSignInAvailable().then((available) => {
      if (mounted.current) setAppleAvailable(available);
    });
    return () => {
      mounted.current = false;
    };
  }, []);
  // One open counted per visit (spec §7), signed in or not.
  useEffect(() => {
    if (link === null || counted.current === link) return;
    counted.current = link;
    if (session && countedSignedOut === link) {
      countedSignedOut = null;
      return;
    }
    countedSignedOut = session ? null : link;
    void noteLinkOpen(link);
  }, [link]);
  const loadCard = useCallback(() => {
    if (link === null) return;
    cardFor.current = link;
    setCard({ status: "loading" });
    readInvitationPreview(link).then(
      (value) => {
        if (!mounted.current) return;
        setCard({ status: "ready", value });
        // A cancelled, past or turned-off invitation is refused for good: the kept code goes, as GI1 does.
        if (value.state !== "open") {
          setDead(value.state);
          if (linkCode) void remember.current(null, linkCode).catch(() => {});
        }
      },
      () => {
        if (mounted.current) setCard({ status: "failed" });
      },
    );
  }, [link, linkCode]);
  useEffect(() => {
    if (active && cardFor.current !== link) loadCard();
  }, [active, link, loadCard]);
  const sessionName = (current: Session) =>
    nameFromSession(
      account.user?.id === current.user.id ? account.user : current.user,
      appleNames.get(current.user.id) ?? null,
    );
  // Signed in and waiting for access: once per account (and sign-in) on this screen, after the kept tick is read.
  useEffect(() => {
    if (!pendingAccess || !session || signingOut || decided.current === session.user.id) return;
    decided.current = session.user.id;
    const current = session;
    setBegan(true);
    setStep(null);
    setSignInAgain(false);
    void readTerms()
      .catch(() => null)
      .then((terms) => {
        if (!mounted.current) return;
        const known = sessionName(current);
        const next = nextStepAfterSignIn({ name: known, attested: Boolean(terms) });
        setTicked(Boolean(terms));
        if (next === "joining") void join(current, known);
        else setStep(next);
      });
  }, [pendingAccess, session, signingOut]);
  // The event page opens once the account reads as approved and reviewed (its route guard).
  useEffect(() => {
    if (!handoff) return;
    if (account.status === "approved" && account.reviewed)
      router.replace({ pathname: "/event", params: { plan: handoff } });
    else if (account.status === "error") {
      setHandoff(null);
      setFailed(true);
    }
  }, [handoff, account.status, account.reviewed]);
  useEffect(() => {
    if (step !== "code") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  async function join(current: Session, chosen: string | null) {
    if (!linkCode || joining.current) return;
    joining.current = true;
    lastName.current = chosen;
    const assertSession = captureSession();
    const live = () => {
      if (!mounted.current) return false;
      try {
        assertSession();
        return true;
      } catch {
        return false;
      }
    };
    setStep("joining");
    setFailed(false);
    setError(null);
    setSignInAgain(false);
    try {
      const id = await joinByLink(linkCode, chosen, TERMS_VERSION);
      if (!live()) return;
      await account.refresh();
      if (!live()) return;
      const reviewed = await markReviewed(current, assertSession);
      if (!live()) return;
      account.acceptDetails(reviewed);
      appleNames.delete(current.user.id);
      await rememberInvite(null, linkCode).catch(() => {});
      await rememberTerms(null).catch(() => {});
      if (live()) setHandoff(id);
    } catch (failure) {
      if (!live()) return;
      if (!(failure instanceof JoinRefusal)) setFailed(true);
      else if (failure.kind === "unavailable") {
        await rememberInvite(null, linkCode).catch(() => {});
        if (live()) setDead("inactive");
      } else if (failure.kind === "age") {
        await rememberTerms(null).catch(() => {});
        if (live()) {
          setTicked(false);
          setStep("providers");
        }
      } else if (failure.kind === "name") setStep("name");
      else {
        // The account can't join as it is (spec rule 1): offer the sign-in again.
        setSignInAgain(true);
        setStep("providers");
      }
    } finally {
      joining.current = false;
    }
  }
  /** After a sign-in on this screen, the signed-in branch decides again even for the same account. */
  function signedInHere() {
    decided.current = null;
  }

  return {
    active,
    signedIn: Boolean(session),
    card,
    dead,
    step,
    ticked,
    email,
    digits,
    name,
    secondsLeft: Math.max(0, Math.ceil((resendAt - now) / 1000)),
    working: working || flow.busy,
    error: error ?? (step === "providers" ? flow.error : null),
    failed,
    signInAgain,
    appleAvailable,
    codeInput,
    retryCard: loadCard,
    tick(next: boolean) {
      setTicked(next);
      setError(null);
      void rememberTerms(next ? TERMS_VERSION : null).catch(() => {});
    },
    async apple() {
      if (working) return;
      setWorking(true);
      setError(null);
      const result = await signInWithApple(appleSignInDeps);
      if (result.ok) {
        signedInHere();
        if (result.name)
          try {
            const { data } = await supabase.auth.getSession();
            if (data.session) appleNames.set(data.session.user.id, result.name);
          } catch {
            // The Name step asks instead.
          }
      }
      if (!mounted.current) return;
      setWorking(false);
      if (!result.ok && !result.cancelled) setError(result.message);
    },
    google: () => void flow.google(),
    goTo(next: GuestStep) {
      if (working) return;
      setError(null);
      setDigits("");
      setStep(next);
    },
    setEmail(value: string) {
      setEmail(value);
      setError(null);
    },
    setName(value: string) {
      setName(value);
      setError(null);
    },
    async send() {
      if (working) return;
      setWorking(true);
      setError(null);
      const result = await sendCode(emailCodeDeps, email);
      if (!mounted.current) return;
      setWorking(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setResendAt(result.resendAt);
      setNow(Date.now());
      setDigits("");
      if (step === "code") codeInput.current?.focus();
      setStep("code");
    },
    async typeDigits(value: string) {
      if (verifying.current) return;
      const clean = value.replace(/\D/g, "").slice(0, 6);
      setDigits(clean);
      setError(null);
      if (clean.length < 6) return;
      verifying.current = true;
      setWorking(true);
      const result = await verifyCode(emailCodeDeps, email, clean, resendAt - RESEND_MS);
      verifying.current = false;
      if (!mounted.current) return;
      setWorking(false);
      // Signed in: the session takes the screen over (it remounts, and the signed-in branch decides).
      if (result.ok) return signedInHere();
      setError(result.message);
      if (result.clear) {
        setDigits("");
        codeInput.current?.focus();
      }
    },
    /** Signed in without a kept tick: join, or ask for the name first. */
    continueTicked() {
      if (!session || !ticked) return;
      const known = sessionName(session);
      if (nextStepAfterSignIn({ name: known, attested: true }) === "joining") void join(session, known);
      else setStep("name");
    },
    continueWithName() {
      const chosen = name.trim();
      if (session && chosen) void join(session, chosen);
    },
    retry() {
      if (session) void join(session, lastName.current);
    },
    async goHome() {
      if (linkCode) await remember.current(null, linkCode).catch(() => {});
      router.replace("/");
    },
  };
}

export type GuestAccount = ReturnType<typeof useGuestAccount>;
