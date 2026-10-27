import { useEffect, useRef, useState } from "react";
import type { TextInput } from "react-native";
import { router } from "expo-router";
import { deviceRegion, parsePhone } from "../domain/phone";
import { TERMS_VERSION } from "../domain/guestAccount";
import { phoneCodeDeps, sendPhoneCode, verifyPhoneCode, type PhonePurpose } from "../services/phoneCode";
import { rememberAttestation } from "../services/phoneAccount";
import { useAccount } from "./AccountState";

const RESEND_MS = 60_000;

/**
 * Send a six-digit SMS code and check it, for sign-up, sign-in and Add your number. After a sign-up or
 * sign-in the navigator remounts, so nothing here relies on local state once verifyOtp has succeeded.
 */
export function usePhoneVerification(purpose: PhonePurpose) {
  const { refresh } = useAccount();
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

  return {
    step,
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
      if (working.current || !e164) return false;
      working.current = true;
      verifying.current = true;
      setBusy(true);
      setError(null);
      // Remembered just before the verify that completes a sign-up, and only then.
      if (purpose === "signup") rememberAttestation(TERMS_VERSION);
      const result = await verifyPhoneCode(phoneCodeDeps, e164, code, resendAt - RESEND_MS, purpose);
      working.current = false;
      verifying.current = false;
      if (result.ok) {
        // Signed in: the navigator may already have remounted onto /account, which makes this moot.
        if (purpose === "add") {
          try {
            await refresh();
          } catch {
            // The number is verified; /account re-reads the account on arrival.
          }
        }
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
      await sendTo(e164);
    },
    changeNumber() {
      // A check that may sign the person in can't be called off.
      if (verifying.current) return;
      request.current += 1;
      working.current = false;
      setBusy(false);
      setStep("number");
      setDigits("");
      setError(null);
      setReason(null);
    },
  };
}
