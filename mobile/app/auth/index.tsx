import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Eye, EyeOff, Info, KeyRound, Mail, MailCheck, RefreshCw, Send } from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction, s } from "../../src/design/ui";
import { Chip, FieldCard, IconButton, InfoSheet, StatusCard, StepScreen, useFocusOnChange } from "../../src/design/kit";
import { colors as c, fonts } from "../../src/design/tokens";
import { RegistrationDetails } from "../../src/design/RegistrationDetails";
import { authTitle } from "../../src/domain/accountCopy";
import { skipOptionalDetails } from "../../src/domain/registration";
import { useAuthFlow } from "../../src/state/useAuthFlow";

/**
 * Sign in, sign up, reset and confirm (UX4-D3): one step screen per mode, field cards and
 * chips. All behaviour is useAuthFlow's; the notices, guidance and errors keep their wording.
 */
export default function Auth() {
  const {
    mode, step, setStep, details, setDetails, confirmedEmail, setConfirmedEmail,
    showPassword, setShowPassword, email, setEmail, password, setPassword,
    busy, restoring, blocked, error, setError, notice, setNotice, pending, remaining, scroll,
    submit, checkConfirmed, switchMode, forgetDestination, google,
  } = useAuthFlow();
  const [about, setAbout] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const heading = useRef<Text>(null);
  const title = authTitle(mode, step, confirmedEmail);
  // VoiceOver focus moves to each new heading: a mode switch, a sign-up step, "Check your inbox".
  useFocusOnChange(heading, title);
  const register = mode === "register";
  const forward = () => setDirection("forward");
  const go = (next: Parameters<typeof switchMode>[0]) => {
    forward();
    switchMode(next);
  };
  const resendChip = (
    <Chip
      text={remaining > 0 ? `Resend in ${remaining}s` : "Resend"}
      icon={RefreshCw}
      label="Resend confirmation email"
      hint={remaining > 0 ? `You can request another email in ${remaining}s.` : undefined}
      disabled={restoring || busy || remaining > 0}
      onPress={() => void submit()}
    />
  );
  const primary =
    mode === "confirm" && confirmedEmail ? undefined : (
      <Button
        large
        icon={false}
        title={
          mode === "reset"
            ? "Send reset link"
            : mode === "confirm"
              ? "Resend confirmation email"
              : register
                ? step < 2
                  ? "Next"
                  : "Create account"
                : "Sign in"
        }
        onPress={() => {
          forward();
          void submit();
        }}
        loading={busy}
        disabled={restoring || ((mode === "reset" || mode === "confirm" || (register && step === 2)) && remaining > 0)}
      />
    );
  const status =
    remaining > 0 && (mode === "reset" || (mode === "confirm" && !confirmedEmail))
      ? `You can request another email in ${remaining}s.`
      : register && step === 2 && remaining > 0
        ? `You can request another email in ${remaining}s. Check your inbox first if you already tried to create this account.`
        : undefined;
  return (
    <StepScreen
      step={register ? step + 1 : null}
      total={3}
      title={title}
      titleRef={heading}
      scrollRef={scroll}
      direction={direction}
      onBack={
        register && step > 0
          ? () => {
              if (blocked) return;
              setDirection("back");
              setStep(step - 1);
              setError(null);
            }
          : undefined
      }
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      header={<IconButton icon={Info} label="About access" tone="plain" onPress={() => setAbout(true)} />}
      primary={primary}
      status={status}
    >
      {register && step < 2 && (
        <RegistrationDetails
          value={details}
          onChange={(value) => {
            setDetails(value);
            setError(null);
          }}
          step={step}
        />
      )}
      {register && step === 1 && (
        <Chip
          text="Skip"
          label="Skip"
          disabled={blocked}
          onPress={() => {
            forward();
            setDetails(skipOptionalDetails(details));
            setError(null);
            setStep(2);
          }}
        />
      )}
      {(!register || step === 2) && !confirmedEmail && (
        <>
          <FieldCard
            label="Email address"
            placeholder="Email address"
            icon={Mail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            editable={!blocked}
            onChangeText={(value) => {
              setEmail(value);
              setError(null);
              setNotice("");
            }}
          />
          {(register || mode === "login") && (
            <FieldCard
              label="Password"
              placeholder="Password"
              icon={KeyRound}
              secureTextEntry={!showPassword}
              autoCorrect={false}
              autoCapitalize="none"
              autoComplete={register ? "new-password" : "current-password"}
              value={password}
              editable={!blocked}
              onChangeText={setPassword}
              accessory={
                <IconButton
                  icon={showPassword ? EyeOff : Eye}
                  label={showPassword ? "Hide password" : "Show password"}
                  tone="plain"
                  disabled={blocked}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />
          )}
          {register && (
            <Copy style={styles.small}>
              Use at least 8 characters. After confirming your email, you can add an optional profile photo.
            </Copy>
          )}
        </>
      )}
      {Boolean(confirmedEmail) && (
        <StatusCard icon={MailCheck}>
          <Copy style={styles.email}>{confirmedEmail}</Copy>
          <Copy style={styles.center}>
            Open the most recent link on this device, where you requested it. Confirmation and private-beta approval are separate steps.
          </Copy>
          <Copy style={[styles.center, styles.small]}>
            This email is remembered on this device for up to 7 days. Your password is never saved with it.
          </Copy>
        </StatusCard>
      )}
      <ErrorNote message={error} />
      {Boolean(notice) && (
        <View style={[s.card, styles.notice]}>
          <Copy accessibilityLiveRegion="polite">{notice}</Copy>
        </View>
      )}
      {mode === "confirm" && Boolean(confirmedEmail) && (
        <View style={styles.chips}>
          <Chip
            text="I’ve confirmed"
            icon={MailCheck}
            tone="aqua"
            label="I’ve confirmed my email"
            disabled={blocked}
            onPress={() => {
              forward();
              void checkConfirmed();
            }}
          />
          {resendChip}
          <Chip
            text="Use a different email"
            icon={Send}
            disabled={blocked}
            onPress={() => void forgetDestination()}
          />
        </View>
      )}
      {(mode === "login" || (register && step === 2)) && (
        <Chip text="Continue with Google" onPress={google} disabled={blocked} />
      )}
      <View style={styles.links}>
        {mode === "login" && (
          <>
            <TextAction title="Forgot password?" disabled={blocked} onPress={() => go("reset")} />
            <TextAction title="Create account" disabled={blocked} onPress={() => go("register")} />
            <TextAction
              title="Need to confirm your email?"
              disabled={blocked}
              onPress={() => {
                go("confirm");
                if (pending?.kind === "confirmation") {
                  setEmail(pending.email);
                  setConfirmedEmail(pending.email);
                }
              }}
            />
          </>
        )}
        {(register || mode === "confirm") && (
          <TextAction title="I have an account" disabled={blocked} onPress={() => go("login")} />
        )}
        {mode === "reset" && (
          <>
            <TextAction title="Create account" disabled={blocked} onPress={() => go("register")} />
            <TextAction title="Back to sign in" disabled={blocked} onPress={() => go("login")} />
          </>
        )}
      </View>
      <InfoSheet visible={about} title="About access" onClose={() => setAbout(false)}>
        <Copy>Private Resbite test · access is opened by invitation.</Copy>
      </InfoSheet>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  small: { color: c.muted, fontSize: 13 },
  email: { fontFamily: fonts.medium, textAlign: "center" },
  center: { textAlign: "center", color: c.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  notice: { padding: 18, backgroundColor: c.aquaSoft },
  links: { alignItems: "flex-start" },
});
