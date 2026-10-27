import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LogOut, UserRound } from "lucide-react-native";
import { Button, Copy, ErrorNote, s } from "../src/design/ui";
import { Chip, FieldCard, announce, useFocusOnChange } from "../src/design/kit";
import { AppleMark } from "../src/design/AppleMark";
import { colors as c } from "../src/design/tokens";
import { GUEST_COPY, nameFromSession } from "../src/domain/guestAccount";
import { PHONE_COPY } from "../src/domain/phoneCopy";
import { appleSignInAvailable } from "../src/services/appleSignIn";
import { appleLinkDeps, googleLinkDeps, linkApple, linkGoogle, type LinkResult } from "../src/services/identityLink";
import { supabase } from "../src/services/supabase";
import { useAccount } from "../src/state/AccountState";
import { useApp } from "../src/state/AppState";

/** A phone account's name, asked once. Apple and Google can suggest it; Continue saves it. */
export default function AboutYou() {
  const { user, refresh } = useAccount();
  const { signOut, signingOut } = useApp();
  const [name, setName] = useState(() => nameFromSession(user, null) ?? "");
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<Text>(null);
  const mounted = useRef(true);
  useFocusOnChange(heading, PHONE_COPY.aboutHeading);
  useEffect(() => {
    mounted.current = true;
    let live = true;
    void appleSignInAvailable().then((available) => {
      if (live) setAppleAvailable(available);
    });
    return () => {
      live = false;
      mounted.current = false;
    };
  }, []);

  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 80;

  async function link(run: () => Promise<LinkResult>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await run();
    if (!mounted.current) return;
    setBusy(false);
    if (result.ok) {
      if (result.name) setName(result.name);
    } else if (!result.cancelled) setError(result.message);
  }

  async function save() {
    if (busy) return;
    if (!valid) {
      // Return in the field with no usable name: say why instead of doing nothing.
      announce(PHONE_COPY.nameRule);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
      if (failure) throw failure;
      await refresh();
      router.replace("/account");
    } catch {
      if (!mounted.current) return;
      setBusy(false);
      setError("Check your connection and try again.");
    }
  }

  return (
    <SafeAreaView style={s.page}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
          <Text ref={heading} accessibilityRole="header" style={s.title}>
            {PHONE_COPY.aboutHeading}
          </Text>
      <FieldCard
        label={PHONE_COPY.nameField}
        placeholder={PHONE_COPY.nameField}
        icon={UserRound}
        value={name}
        onChangeText={setName}
        editable={!busy}
        maxLength={80}
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        returnKeyType="done"
        onSubmitEditing={() => void save()}
      />
      {valid ? null : (
        <Copy accessibilityLiveRegion="polite" style={styles.helper}>
          {PHONE_COPY.nameRule}
        </Copy>
      )}
      <View style={styles.chips}>
        {appleAvailable ? (
          <Chip
            text={GUEST_COPY.apple}
            icon={AppleMark}
            hint={PHONE_COPY.appleNameHint}
            disabled={busy}
            onPress={() => void link(() => linkApple(appleLinkDeps))}
          />
        ) : null}
        <Chip
          text={GUEST_COPY.google}
          hint={PHONE_COPY.googleNameHint}
          disabled={busy}
          onPress={() => void link(() => linkGoogle(googleLinkDeps))}
        />
      </View>
      <ErrorNote message={error} />
      <Button
        large
        icon={false}
        title={PHONE_COPY.continue}
        loading={busy}
        disabled={!valid}
        hint={valid ? undefined : PHONE_COPY.nameRule}
        onPress={() => void save()}
      />
      <View style={styles.chips}>
        <Chip text="Sign out" icon={LogOut} disabled={signingOut} onPress={() => void signOut().catch(() => {})} />
      </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  helper: { color: c.muted, fontSize: 14 },
});
