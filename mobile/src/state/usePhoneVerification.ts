import { useEffect, useRef, useState } from "react";
import type { TextInput } from "react-native";
import { router } from "expo-router";
import { deviceRegion, parsePhone, phoneVerified, samePhone } from "../domain/phone";
import { TERMS_VERSION } from "../domain/guestAccount";
import { phoneCodeDeps, sendPhoneCode, verifyPhoneCode, type PhonePurpose } from "../services/phoneCode";
import { foldLanded, foldNext, foldPhoneAccount, retryFold, phoneFoldDeps, sendFoldCode, type FoldClientDeps } from "../services/phoneFold";
import { clearAttestation, rememberAttestation } from "../services/phoneAccount";
import { useAccount } from "./AccountState";
import { usePushRegistration } from "./usePushRegistration";

const RESEND_MS = 60_000;

/**
 * Send a six-digit SMS code and check it, for sign-up, sign-in and Add your number. After a sign-up or
 * sign-in the navigator remounts, so nothing here relies on local state once verifyOtp has succeeded.
 */
export function usePhoneVerification(purpose: PhonePurpose) {
  const { refresh } = useAccount();
  const { reconcilePush } = usePushRegistration();
  const [step, setStep] = useState<"number" | "code">("number");
  const [input, setInputState] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [ticked, setTicked] = useState(false);
  const [digits, setDigits] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<"no_account" | "taken" | null>(null);
  /** Add only: the code on its way (or checked) is for a web-only account to bring in, not for this one. */
  const [folding, setFolding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const foldDeps = useRef<FoldClientDeps | null>(null);
  /** The verified web account's token, in memory only, so Retry can post again without a spent code. */
  const foreignToken = useRef<string | null>(null);
  const [foldBlocked, setFoldBlocked] = useState(false);
  const mounted = useRef(true);
  const working = useRef(false);
  const verifying = useRef(false);
  /** Bumped by changeNumber: a send that finishes under an older tag is dropped. */
  const request = useRef(0);
  const codeInput = useRef<TextInput>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      foreignToken.current = null;
    };
  }, []);
  useEffect(() => {
    if (step !== "code" || resendAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step, resendAt]);

  async function sendTo(number: string) {
    working.current = true;
    const tag = request.current;
    setBusy(true);
    setError(null);
    setReason(null);
    const result = await sendPhoneCode(phoneCodeDeps, number, purpose);
    if (tag !== request.current) return;
    working.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setReason(result.reason ?? null);
      return;
    }
    setResendAt(result.resendAt);
    setNow(Date.now());
    setDigits("");
    if (step === "code") codeInput.current?.focus();
    setStep("code");
  }

  const fold = () => (foldDeps.current ??= phoneFoldDeps());

  return {
    step,
    folding,
    notice,
    /** The fold is switched off: no Retry; change the number or sign out. */
    foldBlocked,
    /** Offered when Add refused the number as taken: send a code to the web-only account that holds it. */
    async sendFold() {
      if (working.current || purpose !== "add" || !e164) return;
      foreignToken.current = null;
      setFoldBlocked(false);
      working.current = true;
      const tag = request.current;
      setBusy(true);
      setError(null);
      const result = await sendFoldCode(fold(), e164);
      if (tag !== request.current) return;
      working.current = false;
      if (!mounted.current) return;
      setBusy(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReason(null);
      setFolding(true);
      setResendAt(result.resendAt);
      setNow(Date.now());
      setDigits("");
      setStep("code");
    },
    input,
    setInput(value: string) {
      setInputState(value);
      setError(null);
      setReason(null);
    },
    e164,
    ticked,
    setTicked,
    digits,
    setDigits(value: string) {
      setDigits(value.replace(/\D/g, "").slice(0, 6));
      setError(null);
    },
    codeInput,
    secondsLeft: Math.max(0, Math.ceil((resendAt - now) / 1000)),
    busy,
    error,
    reason,
    async send() {
      if (working.current || (purpose === "signup" && !ticked)) return;
      const parsed = parsePhone(input, deviceRegion());
      if (!parsed.ok) {
        setError(parsed.message);
        setReason(null);
        return;
      }
      setE164(parsed.e164);
      await sendTo(parsed.e164);
    },
    async verify(code: string) {
      if (working.current || !e164 || foldBlocked) return false;
      working.current = true;
      verifying.current = true;
      setBusy(true);
      setError(null);
      // Remembered for this number just before the verify that completes a sign-up, and only then.
      if (purpose === "signup") rememberAttestation(TERMS_VERSION, e164);
      if (folding) {
        const held = foreignToken.current;
        const folded = held
          ? await retryFold(fold(), e164, held)
          : await foldPhoneAccount(fold(), e164, code, resendAt - RESEND_MS);
        const then = foldNext(folded);
        foreignToken.current = then.keepToken;
        // A failure after the code was checked may still have folded (a lost reply): re-read the account.
        let landed = folded.ok;
        if (folded.ok) await refresh();
        else if (then.reread) landed = foldLanded(await refresh(), e164);
        working.current = false;
        verifying.current = false;
        if (landed) {
          // The fold may have just created this account's profile, which registering the phone for push needs.
          void reconcilePush();
          router.replace("/account");
          return true;
        }
        if (folded.ok || !mounted.current) return false;
        // Off (404, 503) or refused (403, 409): Retry would change nothing, so it goes.
        if (then.blockRetry) setFoldBlocked(true);
        if (folded.gone) {
          // The web account was deleted meanwhile, so the number is free: carry on with the ordinary Add.
          setFolding(false);
          setNotice(folded.message);
          setDigits("");
          await sendTo(e164);
          return false;
        }
        setBusy(false);
        setError(folded.message);
        if (folded.clear) {
          setDigits("");
          codeInput.current?.focus();
        }
        return false;
      }
      const result = await verifyPhoneCode(phoneCodeDeps, e164, code, resendAt - RESEND_MS, purpose);
      // A failed sign-up check leaves no tick behind; the next verify remembers it again.
      if (!result.ok && purpose === "signup") clearAttestation();
      let added = false;
      if (purpose === "add") {
        // Re-read the account either way (refresh never rejects). After a failure the server may still
        // have taken the code and the reply been lost: if the account now holds this number, verified, it
        // was added. Still "verifying" meanwhile, so Change number can't call it off.
        const user = await refresh();
        added = phoneVerified(user) && samePhone(user?.phone, e164);
      }
      working.current = false;
      verifying.current = false;
      if (result.ok || added) {
        // Signed in: the navigator may already have remounted onto /account, which makes this moot.
        router.replace("/account");
        return true;
      }
      if (!mounted.current) return false;
      setBusy(false);
      setError(result.message);
      if (result.clear) {
        setDigits("");
        codeInput.current?.focus();
      }
      return false;
    },
    async resend() {
      if (working.current || !e164) return;
      if (folding) {
        await this.sendFold();
        return;
      }
      await sendTo(e164);
    },
    changeNumber() {
      // A check that may sign the person in can't be called off.
      if (verifying.current) return;
      request.current += 1;
      working.current = false;
      setBusy(false);
      setStep("number");
      foreignToken.current = null;
      setFoldBlocked(false);
      setFolding(false);
      setNotice(null);
      setDigits("");
      setError(null);
      setReason(null);
    },
  };
}
