import React from "react";
import { ScrollView, View, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mail } from "lucide-react-native";
import { Back, Button, Copy, Title, Field, ErrorNote, TextAction, IconBadge, s } from "../../src/design/ui";
import { colors as c } from "../../src/design/tokens";
import { RegistrationDetails } from "../../src/design/RegistrationDetails";
import { useAuthFlow } from "../../src/state/useAuthFlow";

export default function Auth() {
  const {
    mode, step, setStep, details, setDetails, confirmedEmail, setConfirmedEmail,
    showPassword, setShowPassword, email, setEmail, password, setPassword,
    busy, restoring, blocked, error, setError, notice, setNotice, pending, remaining, scroll,
    submit, checkConfirmed, switchMode, forgetDestination, google,
  } = useAuthFlow();
  return (
    <SafeAreaView style={s.page}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { paddingBottom: 36 }]}>
          <Back />
          {mode === "register" && <Copy style={{ color: c.muted }}>YOUR ACCOUNT · STEP {step + 1} OF 3</Copy>}
          <Copy style={{ color: c.aquaDark }}>A LITTLE TIME TOGETHER</Copy>
          <Title>{mode === "confirm" ? confirmedEmail ? "Check your inbox." : "Confirm your email."
            : mode === "register" ? step === 0 ? "A little about you." : step === 1 ? "Make it yours." : "Your account, your people."
              : mode === "reset" ? "Let’s get you back in." : "Welcome back."}</Title>
          <Copy style={s.muted}>Private Resbite test · access is opened by invitation.</Copy>
          {mode === "login" && <>
            <Button title="Continue with Google" secondary onPress={google} loading={busy} disabled={restoring} />
            <Copy style={{ textAlign: "center", color: c.muted }}>or with your email</Copy>
          </>}
          {mode === "register" && step < 2 && <RegistrationDetails value={details} onChange={(value) => { setDetails(value); setError(null); }} step={step} />}
          {(mode !== "register" || step === 2) && !confirmedEmail && <>
            <Field label="Email address" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} editable={!blocked} onChangeText={(value) => { setEmail(value); setError(null); setNotice(""); }} />
            {(mode === "register" || mode === "login") && <>
              <Field label="Password" secureTextEntry={!showPassword} autoCorrect={false} autoCapitalize="none" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} editable={!blocked} onChangeText={setPassword} />
              <TextAction title={showPassword ? "Hide password" : "Show password"} disabled={blocked} onPress={() => setShowPassword(!showPassword)} />
            </>}
            {mode === "register" && <Copy style={{ color: c.muted, fontSize: 13 }}>Use at least 8 characters. After confirming your email, you can add an optional profile photo.</Copy>}
          </>}
          {Boolean(confirmedEmail) && <View style={[s.card, { padding: 20, gap: 12 }]}>
            <IconBadge icon={Mail} tone="aqua" />
            <Copy>{confirmedEmail}</Copy>
            <Copy style={s.muted}>Open the most recent link on this device, where you requested it. Confirmation and private-beta approval are separate steps.</Copy>
            <Copy style={{ color: c.muted, fontSize: 12 }}>This email is remembered on this device for up to 7 days. Your password is never saved with it.</Copy>
          </View>}
          <ErrorNote message={error} />
          {Boolean(notice) && <View style={[s.card, { padding: 18, backgroundColor: c.aquaSoft }]}><Copy accessibilityLiveRegion="polite">{notice}</Copy></View>}
          {mode === "confirm" && Boolean(confirmedEmail) && <Button title="I’ve confirmed my email" onPress={checkConfirmed} loading={busy} disabled={restoring} />}
          {mode === "reset" || mode === "confirm" ? <>
            <Button title={mode === "reset" ? "Send reset link" : "Resend confirmation email"} secondary={Boolean(confirmedEmail)} onPress={submit} loading={busy} disabled={restoring || remaining > 0} />
            {remaining > 0 && <Copy style={s.muted}>You can request another email in {remaining}s.</Copy>}
          </> : <>
            <Button title={mode === "register" ? step < 2 ? "Continue" : "Create account" : "Sign in"} onPress={submit} loading={busy} disabled={restoring || (mode === "register" && step === 2 && remaining > 0)} />
            {mode === "register" && step === 2 && remaining > 0 && <Copy style={s.muted}>You can request another email in {remaining}s. Check your inbox first if you already tried to create this account.</Copy>}
          </>}
          {mode === "register" && step > 0 && <TextAction title="Previous step" disabled={blocked} onPress={() => { setStep(step - 1); setError(null); }} />}
          {mode === "confirm" && Boolean(confirmedEmail) && <TextAction title="Use a different email" disabled={blocked} onPress={() => void forgetDestination()} />}
          <TextAction title={mode === "register" || mode === "confirm" ? "Already have an account? Sign in" : "New to Resbite? Create an account"} disabled={blocked} onPress={() => switchMode(mode === "register" || mode === "confirm" ? "login" : "register")} />
          {mode === "reset" && <Button title="Back to sign in" secondary disabled={blocked} onPress={() => switchMode("login")} />}
          {mode === "login" && <>
            <TextAction title="Forgot password?" disabled={blocked} onPress={() => switchMode("reset")} />
            <TextAction title="Need to confirm your email?" disabled={blocked} onPress={() => {
              switchMode("confirm");
              if (pending?.kind === "confirmation") { setEmail(pending.email); setConfirmedEmail(pending.email); }
            }} />
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
