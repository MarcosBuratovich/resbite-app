import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Copy, ErrorNote, TextAction } from "../../src/design/ui";
import { Chip, StepScreen, useFocusOnChange } from "../../src/design/kit";
import { AppleMark } from "../../src/design/AppleMark";
import { CodeField } from "../../src/design/CodeField";
import { PhoneField } from "../../src/design/PhoneField";
import { TermsLine, TickRow } from "../../src/design/TickRow";
import { colors as c } from "../../src/design/tokens";
import { GUEST_COPY } from "../../src/domain/guestAccount";
import { formatPhone } from "../../src/domain/phone";
import { PHONE_COPY } from "../../src/domain/phoneCopy";
import { appleSignInAvailable } from "../../src/services/appleSignIn";
import { useAuthFlow } from "../../src/state/useAuthFlow";
import { usePhoneVerification } from "../../src/state/usePhoneVerification";

/** Sign up or sign in with a mobile number and a six-digit code: /auth/phone?intent=signup|signin. */
export default function PhoneAuth() {
  const params = useLocalSearchParams<{ intent?: string }>();
  const [intent, setIntent] = useState<"signup" | "signin">(params.intent === "signin" ? "signin" : "signup");
  const phone = usePhoneVerification(intent);
  const { apple, google } = useAuthFlow();
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    void appleSignInAvailable().then((available) => {
      if (live) setAppleAvailable(available);
    });
    return () => {
      live = false;
    };
  }, []);
  const heading = useRef<Text>(null);
  const signup = intent === "signup";
  const code = phone.step === "code";
  const title = code ? PHONE_COPY.codeHeading : signup ? PHONE_COPY.signupHeading : PHONE_COPY.signinHeading;
  // VoiceOver focus moves to each new heading.
  useFocusOnChange(heading, title);
  const canSend = !signup || phone.ticked;
  const typeDigits = (value: string) => {
    if (phone.busy) return;
    const clean = value.replace(/\D/g, "").slice(0, 6);
    phone.setDigits(clean);
    if (clean.length === 6) void phone.verify(clean);
  };

  return (
    <StepScreen
      step={null}
      title={title}
      titleRef={heading}
      onBack={code ? phone.changeNumber : undefined}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      primary={
        code ? undefined : (
          <Button
            large
            icon={false}
            title={PHONE_COPY.send}
            loading={phone.busy}
            disabled={!canSend}
            hint={canSend ? undefined : GUEST_COPY.ageHelper}
            onPress={() => void phone.send()}
          />
        )
      }
    >
      {code ? (
        <>
          <Copy>{PHONE_COPY.codeBody(formatPhone(phone.e164 ?? phone.input))}</Copy>
          <CodeField value={phone.digits} onChange={typeDigits} inputRef={phone.codeInput} />
          {phone.busy ? <ActivityIndicator accessibilityLabel={PHONE_COPY.checking} color={c.aquaDark} /> : null}
          <ErrorNote message={phone.error} />
          {phone.error && phone.digits.length === 6 && !phone.busy ? (
            <TextAction title={PHONE_COPY.retry} onPress={() => void phone.verify(phone.digits)} />
          ) : null}
          <View style={styles.links}>
            {phone.secondsLeft > 0 ? (
              <Copy style={styles.helper}>{PHONE_COPY.resendIn(phone.secondsLeft)}</Copy>
            ) : (
              <TextAction title={PHONE_COPY.resend} disabled={phone.busy} onPress={() => void phone.resend()} />
            )}
            <TextAction title={PHONE_COPY.changeNumber} disabled={phone.busy} onPress={phone.changeNumber} />
          </View>
        </>
      ) : (
        <>
          <PhoneField
            value={phone.input}
            onChangeText={phone.setInput}
            editable={!phone.busy}
            returnKeyType="send"
            onSubmitEditing={() => void phone.send()}
          />
          <Copy style={styles.helper}>{PHONE_COPY.numberHint}</Copy>
          {signup ? (
            <View style={styles.tick}>
              <TickRow
                label={GUEST_COPY.tick}
                hint={GUEST_COPY.terms}
                checked={phone.ticked}
                onChange={phone.setTicked}
                disabled={phone.busy}
              >
                <TermsLine text={GUEST_COPY.terms} />
              </TickRow>
              {!phone.ticked ? <Copy style={styles.helper}>{GUEST_COPY.ageHelper}</Copy> : null}
            </View>
          ) : null}
          <ErrorNote message={phone.error} />
          {phone.reason === "no_account" ? (
            <TextAction
              title={PHONE_COPY.createInstead}
              onPress={() => {
                setIntent("signup");
                phone.setInput(phone.input);
              }}
            />
          ) : null}
          {!signup ? (
            <>
              {appleAvailable ? <Chip text={GUEST_COPY.apple} icon={AppleMark} onPress={apple} /> : null}
              <Chip text={GUEST_COPY.google} onPress={google} />
              <View style={styles.links}>
                <TextAction title={PHONE_COPY.useEmail} onPress={() => router.push("/auth?mode=login")} />
              </View>
            </>
          ) : null}
        </>
      )}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  helper: { color: c.muted, fontSize: 14 },
  tick: { gap: 6 },
  links: { alignItems: "flex-start", gap: 4 },
});
