import React, { useRef } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut } from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction, s } from "../src/design/ui";
import { Chip, useFocusOnChange } from "../src/design/kit";
import { CodeField } from "../src/design/CodeField";
import { PhoneField } from "../src/design/PhoneField";
import { colors as c } from "../src/design/tokens";
import { formatPhone } from "../src/domain/phone";
import { PHONE_COPY } from "../src/domain/phoneCopy";
import { useApp } from "../src/state/AppState";
import { usePhoneVerification } from "../src/state/usePhoneVerification";

/** The gate for an account without a verified number: add one, or sign out. There is no other exit. */
export default function AddPhone() {
  const phone = usePhoneVerification("add");
  const { signOut, signingOut } = useApp();
  const heading = useRef<Text>(null);
  const code = phone.step === "code";
  const title = code ? PHONE_COPY.codeHeading : PHONE_COPY.addHeading;
  useFocusOnChange(heading, title);
  const typeDigits = (value: string) => {
    if (phone.busy) return;
    const clean = value.replace(/\D/g, "").slice(0, 6);
    phone.setDigits(clean);
    if (clean.length === 6) void phone.verify(clean);
  };

  return (
    <SafeAreaView style={s.page}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
          <Text ref={heading} accessibilityRole="header" style={s.title}>
            {title}
          </Text>
          {code ? (
            <>
              <Copy>{PHONE_COPY.codeBody(formatPhone(phone.e164 ?? phone.input))}</Copy>
              <CodeField value={phone.digits} onChange={typeDigits} inputRef={phone.codeInput} />
              {phone.busy ? <ActivityIndicator accessibilityLabel={PHONE_COPY.checking} color={c.aquaDark} /> : null}
              {phone.notice ? <Copy style={styles.helper}>{phone.notice}</Copy> : null}
              <ErrorNote message={phone.error} />
              {phone.error && phone.digits.length === 6 && !phone.busy && !phone.foldBlocked ? (
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
              <Copy>{PHONE_COPY.addBody}</Copy>
              <PhoneField
                value={phone.input}
                onChangeText={phone.setInput}
                editable={!phone.busy}
                returnKeyType="send"
                onSubmitEditing={() => void phone.send()}
              />
              <Copy style={styles.helper}>{PHONE_COPY.numberHint}</Copy>
              <ErrorNote message={phone.error} />
              {phone.reason === "taken" ? (
                <>
                  <Copy>{PHONE_COPY.foldOffer}</Copy>
                  <Button large icon={false} title={PHONE_COPY.foldSend} loading={phone.busy} onPress={() => void phone.sendFold()} />
                  <TextAction title={PHONE_COPY.changeNumber} onPress={() => phone.setInput("")} />
                </>
              ) : null}
              <Button
                large
                icon={false}
                title={PHONE_COPY.send}
                loading={phone.busy}
                onPress={() => void phone.send()}
              />
            </>
          )}
          <View style={styles.chips}>
            <Chip text="Sign out" icon={LogOut} disabled={signingOut} onPress={() => void signOut().catch(() => {})} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  helper: { color: c.muted, fontSize: 14 },
  links: { alignItems: "flex-start", gap: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
