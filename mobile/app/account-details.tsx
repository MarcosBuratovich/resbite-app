import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { Eraser, Info, LogOut, RotateCcw } from "lucide-react-native";
import type { User } from "@supabase/supabase-js";
import { useApp } from "../src/state/AppState";
import { useAccount } from "../src/state/AccountState";
import { RegistrationDetails, registrationHelp } from "../src/design/RegistrationDetails";
import { Back, Button, Copy, ErrorNote, Title, s } from "../src/design/ui";
import { Chip, IconButton, InfoSheet, Row, RowGroup } from "../src/design/kit";
import {
  detailsFromMetadata,
  emptyRegistration,
  optionalMetadata,
} from "../src/domain/registration";
import {
  accountDetailsAdapter,
  saveAccountDetails,
} from "../src/services/accountDetails";
import { withDeadline } from "../src/services/plans";

export default function AccountDetails() {
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const { session, preview, captureSession, signingOut, signOut } = useApp();
  const { user, status, acceptDetails } = useAccount();
  const [value, setValue] = useState(() =>
    detailsFromMetadata(user?.user_metadata),
  );
  const [baseline, setBaseline] = useState<User | null>(user);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [about, setAbout] = useState(false);
  const focused = useRef(false),
    generation = useRef(0),
    working = useRef(false),
    saved = useRef(false);
  const navigation = useNavigation();
  const dirty =
    JSON.stringify(optionalMetadata(value)) !==
    JSON.stringify(
      optionalMetadata(detailsFromMetadata(baseline?.user_metadata)),
    );
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        generation.current++;
      };
    }, []),
  );
  usePreventRemove(
    (dirty || busy) && !saved.current && !signingOut,
    ({ data }) => {
      if (working.current) return;
      const leave = () => navigation.dispatch(data.action);
      if (Platform.OS === "web") {
        if (window.confirm("Discard your unsaved account details?")) leave();
      } else
        Alert.alert(
          "Leave account details?",
          "Your unsaved changes will be discarded.",
          [
            { text: "Keep editing", style: "cancel" },
            { text: "Discard changes", style: "destructive", onPress: leave },
          ],
        );
    },
  );
  useEffect(() => {
    if (setup === "1" && notice && !busy && saved.current)
      router.replace("/account");
  }, [setup, notice, busy]);
  function guard() {
    const assertSession = captureSession(),
      run = generation.current;
    return () => {
      assertSession();
      if (!focused.current || run !== generation.current)
        throw Error("Account details closed.");
    };
  }
  async function save(skip = false) {
    if (!session || !baseline || working.current) return;
    const assertCurrent = guard();
    Keyboard.dismiss();
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await saveAccountDetails({
        accountId: session.user.id,
        baseline,
        value: skip ? { ...emptyRegistration, name: value.name } : value,
        assertCurrent,
        adapter: accountDetailsAdapter(session.access_token),
      });
      assertCurrent();
      saved.current = true;
      setBaseline(next);
      setValue(detailsFromMetadata(next.user_metadata));
      acceptDetails(next);
      setNotice(
        skip
          ? "Optional details skipped. You can add them in Profile later."
          : "Account details saved.",
      );
    } catch (e) {
      try {
        assertCurrent();
      } catch {
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "Your changes are kept. Please try again.",
      );
    } finally {
      working.current = false;
      if (focused.current) setBusy(false);
    }
  }
  async function reload() {
    if (!session || working.current) return;
    const assertCurrent = guard();
    Keyboard.dismiss();
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await withDeadline((signal) =>
        accountDetailsAdapter(session.access_token).read(signal),
      );
      assertCurrent();
      if (next.id !== session.user.id) throw Error("Account changed.");
      setBaseline(next);
      setValue(detailsFromMetadata(next.user_metadata));
      acceptDetails(next);
      setNotice("Saved details reloaded.");
      saved.current = false;
    } catch {
      try {
        assertCurrent();
        setError("Saved details could not be loaded. Your changes are kept.");
      } catch {}
    } finally {
      working.current = false;
      if (focused.current) setBusy(false);
    }
  }
  function confirmReload() {
    if (!dirty) {
      void reload();
      return;
    }
    if (Platform.OS === "web") {
      if (
        window.confirm(
          "Replace your unsaved changes with saved account details?",
        )
      )
        void reload();
    } else
      Alert.alert(
        "Reload saved details?",
        "This replaces your unsaved changes.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Reload", onPress: () => void reload() },
        ],
      );
  }
  if (preview || !session)
    return <Redirect href={preview ? "/profile" : "/auth"} />;
  if (!user || (status !== "approved" && status !== "access_pending"))
    return <Redirect href="/account" />;
  const change = (next: typeof value) => {
    saved.current = false;
    setValue(next);
    setNotice(null);
  };
  return (
    <SafeAreaView style={s.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.body, { paddingBottom: 40 }]}
        >
          {setup !== "1" && <Back label="Profile" />}
          <View style={styles.header}>
            <Title style={{ flexShrink: 1 }}>{setup === "1" ? "About you" : "Account details"}</Title>
            <IconButton icon={Info} label="About these details" onPress={() => setAbout(true)} />
          </View>
          <View
            pointerEvents={busy ? "none" : "auto"}
            style={{ gap: 16 }}
            accessibilityElementsHidden={busy}
            importantForAccessibility={busy ? "no-hide-descendants" : "auto"}
          >
            <RegistrationDetails
              disabled={busy}
              value={value}
              onChange={change}
              step={0}
              showName={false}
              whyWeAsk={false}
            />
            <RegistrationDetails
              disabled={busy}
              value={value}
              onChange={change}
              step={1}
              whyWeAsk={false}
            />
          </View>
          <ErrorNote message={error} />
          {notice && <Copy accessibilityLiveRegion="polite">{notice}</Copy>}
          <Button title="Save" loading={busy} onPress={() => void save()} />
          {setup === "1" && (
            <View style={styles.center}>
              <Chip text="Skip" disabled={busy} onPress={() => void save(true)} />
            </View>
          )}
          <RowGroup>
            {setup !== "1" && (
              <Row
                title="Clear details"
                icon={Eraser}
                destructive
                disabled={busy}
                onPress={() => change({ ...emptyRegistration, name: value.name })}
              />
            )}
            <Row
              title="Reload saved details"
              icon={RotateCcw}
              chevron={false}
              disabled={busy}
              onPress={confirmReload}
            />
            {setup === "1" && (
              <Row
                title="Sign out"
                icon={LogOut}
                destructive
                disabled={busy || signingOut}
                onPress={() => void signOut().catch(() => {})}
              />
            )}
          </RowGroup>
        </ScrollView>
      </KeyboardAvoidingView>
      <InfoSheet visible={about} title="About these details" onClose={() => setAbout(false)}>
        <Copy>
          All of these details are optional. Add what feels useful, and change
          or remove it whenever you like.
        </Copy>
        <Copy>
          These details stay private to your account. Your shared name and
          photo are managed in Profile.
        </Copy>
        {setup !== "1" && (
          <Copy>Clear the fields, then save to remove them from your account.</Copy>
        )}
        {[...registrationHelp(0, false), ...registrationHelp(1)].map((line) => (
          <Copy key={line}>{line}</Copy>
        ))}
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  center: { alignItems: "center" },
});
