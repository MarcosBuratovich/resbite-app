import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, type ScrollView } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { supabase, configured } from "../services/supabase";
import { safeAuthCode, validateRegistration } from "../domain/rules";
import { exchangeAuthCode } from "../services/authCallback";
import { confirmationStore } from "../services/confirmation";
import {
  type PendingEmailRequest, type EmailRequestKind, EmailRequestCooldownError,
  checkEmailConfirmation, confirmationNotice, recoveryNotice,
  emailRequestFailure, retrySeconds, normalizeEmail, validEmail,
} from "../services/confirmationFlow";
import { emptyRegistration, validateDetails, validateSignupStep, registrationMetadata } from "../domain/registration";
import type { AuthMode } from "../domain/accountCopy";

WebBrowser.maybeCompleteAuthSession();

/**
 * Sign-in, sign-up, reset and confirm (UX4): the state, effects and actions moved unchanged
 * from app/auth/index.tsx so the screen only renders. Nothing here changed behaviour.
 */
export function useAuthFlow() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<AuthMode>(
    params.mode === "register" || params.mode === "reset" || params.mode === "confirm" ? params.mode : "login",
  );
  const [details, setDetails] = useState(emptyRegistration);
  const [step, setStep] = useState(0);
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingEmailRequest | null>(null);
  const [now, setNow] = useState(Date.now());
  const scroll = useRef<ScrollView>(null);
  const working = useRef(false);
  const generation = useRef(0);
  const accountGeneration = useRef(0);
  const activeAccount = useRef<string | null>(null);
  const blocked = busy || restoring;
  const destination = confirmedEmail || email;
  const remaining = pending && normalizeEmail(pending.email) === normalizeEmail(destination)
    ? retrySeconds(pending, now) : 0;

  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step, confirmedEmail, mode]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") tick(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  useFocusEffect(useCallback(() => {
    const current = ++generation.current;
    setRestoring(true);
    if (params.mode === "register" || params.mode === "reset" || params.mode === "confirm" || params.mode === "login")
      setMode(params.mode);
    void confirmationStore.read().then((saved) => {
      if (generation.current !== current) return;
      setPending(saved);
      if (saved && params.mode !== "register") {
        setEmail(saved.email);
        if ((!params.mode || params.mode === "confirm") && saved.kind === "confirmation") {
          setConfirmedEmail(saved.email);
          setMode("confirm");
        } else if (!params.mode && saved.kind === "recovery") {
          setMode("reset");
          setNotice(recoveryNotice);
        }
      }
    }).catch(() => {
      if (generation.current === current)
        setError("We couldn’t restore your last email request. You can enter your email again.");
    }).finally(() => {
      if (generation.current === current) setRestoring(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      if (id !== activeAccount.current) { activeAccount.current = id; accountGeneration.current++; }
    });
    return () => { generation.current++; listener.subscription.unsubscribe(); };
  }, [params.mode]));

  async function recordFailure(record: PendingEmailRequest | null, failure: unknown, current: number) {
    if (failure instanceof EmailRequestCooldownError) {
      if (generation.current === current) {
        setPending(failure.pending);
        setError(failure.message);
      }
      return;
    }
    if (record) {
      try {
        const updated = await confirmationStore.failure(record, failure);
        if (generation.current === current) setPending(updated);
      } catch { /* The original reservation still prevents immediate retry in this screen. */ }
    }
    if (generation.current === current)
      setError(record ? emailRequestFailure(failure).message : "We couldn’t save this email request on your device. Please try again.");
  }

  async function requestEmail(kind: EmailRequestKind) {
    if (working.current || restoring) return;
    const target = kind === "confirmation" ? confirmedEmail || email : email;
    setError(null); setNotice("");
    if (!validEmail(target)) { setError("Enter a valid email address."); return; }
    if (!configured) { setError("Account services are not configured yet."); return; }
    const current = generation.current;
    working.current = true; setBusy(true);
    let record: PendingEmailRequest | null = null;
    try {
      record = await confirmationStore.reserve(target, kind);
      if (generation.current !== current) return;
      setPending(record); setNow(Date.now());
      const { error: requestError } = kind === "confirmation"
        ? await supabase.auth.resend({ type: "signup", email: target.trim(), options: { emailRedirectTo: "resbite://auth/callback" } })
        : await supabase.auth.resetPasswordForEmail(target.trim(), { redirectTo: "resbite://auth/callback?recovery=1" });
      if (requestError) throw requestError;
      if (generation.current !== current) return;
      if (kind === "confirmation") { setConfirmedEmail(target.trim()); setMode("confirm"); }
      setNotice(kind === "confirmation" ? confirmationNotice : recoveryNotice);
    } catch (failure) { await recordFailure(record, failure, current); }
    finally { working.current = false; setBusy(false); }
  }

  async function submit() {
    if (working.current || restoring) return;
    if (mode === "reset" || mode === "confirm") {
      await requestEmail(mode === "reset" ? "recovery" : "confirmation"); return;
    }
    const current = generation.current;
    setError(null); setNotice("");
    if (mode === "register" && step < 2) {
      const invalid = validateSignupStep(step, details);
      if (invalid) { setError(invalid); return; }
      setStep(step + 1); return;
    }
    const invalid = mode === "register"
      ? validateDetails(details) || validateRegistration(email, password)
      : !validEmail(email) ? "Enter a valid email address." : !password ? "Enter your password." : null;
    if (invalid) { setError(invalid); return; }
    if (!configured) { setError("Account services are not configured yet."); return; }
    working.current = true; setBusy(true);
    let record: PendingEmailRequest | null = null;
    try {
      if (mode === "register") {
        record = await confirmationStore.reserve(email, "confirmation");
        if (generation.current !== current) return;
        setPending(record); setNow(Date.now());
        const { error: signupError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: "resbite://auth/callback", data: registrationMetadata(details) },
        });
        if (signupError) throw signupError;
        if (generation.current !== current) return;
        setConfirmedEmail(email.trim()); setPassword(""); setMode("confirm");
        setNotice(confirmationNotice);
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (generation.current !== current) return;
        if (loginError) {
          if (loginError.code === "email_not_confirmed") {
            setConfirmedEmail(email.trim()); setMode("confirm"); setPassword("");
            setNotice("Confirm your email before signing in. Open your most recent Resbite email on this device, or request another below.");
            return;
          }
          throw loginError;
        }
        if (pending && normalizeEmail(pending.email) === normalizeEmail(email))
          await confirmationStore.clear(pending).catch(() => {});
        if (generation.current === current) router.replace("/account");
      }
    } catch (failure) {
      if (mode === "register") await recordFailure(record, failure, current);
      else if (generation.current === current)
        setError(failure instanceof Error ? failure.message : "Unable to connect. Please try again.");
    } finally { working.current = false; setBusy(false); }
  }

  async function checkConfirmed() {
    if (working.current || !confirmedEmail) return;
    if (!configured) { setError("Account services are not configured yet."); return; }
    const current = generation.current, accountVersion = accountGeneration.current;
    working.current = true; setBusy(true); setError(null); setNotice("");
    try {
      const result = await checkEmailConfirmation(confirmedEmail, {
        session: async () => {
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          return data.session?.user ?? null;
        },
        user: async () => {
          const { data, error: userError } = await supabase.auth.getUser();
          if (userError) throw userError;
          return data.user;
        },
      });
      if (generation.current !== current) return;
      if (accountGeneration.current !== accountVersion) {
        setNotice("Your account session changed. Check your confirmation again before continuing."); return;
      }
      if (result === "confirmed") {
        if (pending) await confirmationStore.clear(pending);
        if (generation.current === current && accountGeneration.current === accountVersion) router.replace("/account");
      } else setNotice(result === "different_account"
        ? "Another account is signed in on this device. Return to that account and sign out before continuing with this email."
        : result === "sign_in"
          ? "If you have confirmed your email, sign in below. We can only check confirmation after this device has a session for that email."
          : "This account is still waiting for email confirmation. Open the most recent link on this device, then check again.");
    } catch {
      if (generation.current === current) setError("We couldn’t check confirmation right now. Check your connection, or sign in after opening your email link.");
    } finally { working.current = false; setBusy(false); }
  }

  function switchMode(next: AuthMode) {
    setMode(next); setConfirmedEmail(""); setShowPassword(false); setStep(0);
    setPassword(""); setError(null); setNotice("");
  }
  async function forgetDestination() {
    if (working.current) return;
    working.current = true; setBusy(true);
    try {
      await confirmationStore.clear(pending ?? undefined);
      setPending(null); setConfirmedEmail(""); setEmail(""); setNotice(""); setError(null);
    } catch { setError("We couldn’t remove the saved email from this device. Please try again."); }
    finally { working.current = false; setBusy(false); }
  }

  async function google() {
    if (working.current || restoring) return;
    if (!configured) { setError("Account services are not configured yet."); return; }
    const current = generation.current;
    working.current = true; setBusy(true); setNotice(""); setError(null);
    try {
      if (Platform.OS === "web") throw new Error("Google sign-in is available in the mobile build.");
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google", options: { redirectTo: "resbite://auth/callback", skipBrowserRedirect: true },
      });
      if (generation.current !== current) return;
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error("Google sign-in is not configured.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, "resbite://auth/callback");
      if (generation.current !== current) return;
      if (result.type === "success") {
        const code = safeAuthCode(result.url);
        if (!code) throw new Error("Unable to verify the sign-in link.");
        await exchangeAuthCode(code);
        if (generation.current === current) router.replace("/account");
      }
    } catch (failure) {
      if (generation.current === current) setError(failure instanceof Error ? failure.message : "Sign-in failed.");
    } finally { working.current = false; setBusy(false); }
  }
  return {
    mode, step, setStep, details, setDetails, confirmedEmail, setConfirmedEmail,
    showPassword, setShowPassword, email, setEmail, password, setPassword,
    busy, restoring, blocked, error, setError, notice, setNotice, pending, remaining, scroll,
    submit, checkConfirmed, switchMode, forgetDestination, google,
  };
}
