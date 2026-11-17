import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { LogOut } from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction, s } from "../src/design/ui";
import { Chip, useFocusOnChange } from "../src/design/kit";
import { TermsLine, TickRow } from "../src/design/TickRow";
import { colors as c } from "../src/design/tokens";
import { GUEST_COPY } from "../src/domain/guestAccount";
import { TERMS_COPY } from "../src/domain/termsCopy";
import { acceptTerms, termsErrorMessage } from "../src/services/termsAcceptance";
import { useAccount } from "../src/state/AccountState";
import { useApp } from "../src/state/AppState";

/**
 * Accept your Terms (plan 4, B2): an approved account with a number that has yet to accept the Terms of Use version
 * the server reports as current, between Add your number and About you (accountGate). Continue records that version
 * (accept_terms) and goes back through /account. A version published while the screen was open is refused: the box
 * is unticked, the line says why, and the account is read again for the new one. Delete my account is the way out
 * for someone who doesn't accept (Terms section 16.2).
 */
export default function AcceptTerms() {
  const { session, signOut, signingOut } = useApp();
  const { termsVersion, refresh } = useAccount();
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<Text>(null);
  const mounted = useRef(true);
  // A version published while the screen was open is a new text to read: VoiceOver goes back to the heading.
  useFocusOnChange(heading, termsVersion);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Nothing to accept without a session or a published version: /account decides where to go.
  if (!session || !termsVersion) return <Redirect href="/account" />;
  const version = termsVersion;

  async function accept() {
    if (busy || !ticked) return;
    setBusy(true);
    setError(null);
    try {
      await acceptTerms(version);
    } catch (e) {
      if (!mounted.current) return;
      const { message, changed } = termsErrorMessage(e);
      setError(message);
      if (changed) {
        // The box is ticked again for the new version only; the read below brings it.
        setTicked(false);
        await refresh();
        if (!mounted.current) return;
      }
      setBusy(false);
      return;
    }
    await refresh();
    if (!mounted.current) return;
    router.replace("/account");
  }

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
        <Text ref={heading} accessibilityRole="header" style={s.title}>
          {TERMS_COPY.heading}
        </Text>
        <Copy>{TERMS_COPY.intro}</Copy>
        <Copy>{TERMS_COPY.whatsNew}</Copy>
        <View style={styles.tick}>
          <TickRow
            label={GUEST_COPY.tick}
            hint={GUEST_COPY.tickHint}
            checked={ticked}
            onChange={setTicked}
            disabled={busy}
          >
            <TermsLine text={GUEST_COPY.terms} />
          </TickRow>
          {!ticked ? <Copy style={styles.helper}>{GUEST_COPY.ageHelper}</Copy> : null}
        </View>
        <ErrorNote message={error} />
        <Button
          large
          icon={false}
          title={TERMS_COPY.continue}
          loading={busy}
          disabled={!ticked}
          hint={ticked ? undefined : GUEST_COPY.ageHelper}
          onPress={() => void accept()}
        />
        <View style={styles.chips}>
          <TextAction
            destructive
            title={TERMS_COPY.deleteAccount}
            disabled={busy}
            onPress={() => router.push("/delete-account")}
          />
          <Chip
            text={TERMS_COPY.signOut}
            icon={LogOut}
            disabled={signingOut}
            onPress={() => void signOut().catch(() => {})}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  helper: { color: c.muted, fontSize: 14 },
  tick: { gap: 6 },
});
