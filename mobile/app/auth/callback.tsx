import React, { useCallback, useState, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { configured, supabase } from "../../src/services/supabase";
import { exchangeAuthCode } from "../../src/services/authCallback";
import { confirmationStore } from "../../src/services/confirmation";
import { authLinkGuidance, normalizeEmail } from "../../src/services/confirmationFlow";
import { parseAuthCallbackParams } from "../../src/domain/authCallbackParams";
import { Button, Copy, Title, Field, ErrorNote, s } from "../../src/design/ui";

export default function Callback() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    recovery?: string | string[];
    error_code?: string | string[];
  }>();
  const parsed = parseAuthCallbackParams(params.code, params.recovery);
  const code = parsed?.code;
  const recovery = params.recovery === "1";
  const linkError = typeof params.error_code === "string" ? params.error_code : undefined;
  const generation = useRef(0);
  const saving = useRef(false);
  const focused = useRef(false);
  const account = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const current = ++generation.current;
      const active = () => generation.current === current;
      account.current = null;
      setReady(false);
      setPassword("");
      setError(null);
      setBusy(saving.current);
      if (!code || !configured) {
        setError(
          !configured
            ? "Account connection is not configured yet."
            : linkError ? authLinkGuidance({ code: linkError }, recovery)
              : recovery ? "This password reset link is incomplete or invalid. Please request a new one."
                : "This confirmation link is incomplete or invalid. Please request a new one.",
        );
      } else {
        void (async () => {
          try {
            const exchangedUserId = await exchangeAuthCode(code);
            if (!active()) return;
            const { data, error: sessionError } =
              await supabase.auth.getSession();
            if (!active()) return;
            if (sessionError) throw sessionError;
            if (!data.session || data.session.user.id !== exchangedUserId)
              throw new Error(
                "This confirmation link has expired. Please request a new one.",
              );
            if (recovery) {
              account.current = data.session.user.id;
              setReady(true);
            } else {
              const pending = await confirmationStore.read().catch(() => null);
              if (!active()) return;
              if (pending && normalizeEmail(pending.email) === normalizeEmail(data.session.user.email ?? ""))
                await confirmationStore.clear(pending).catch(() => {});
              if (active()) router.replace("/account");
            }
          } catch (failure) {
            if (active())
              setError(
                authLinkGuidance(failure, recovery),
              );
          }
        })();
      }
      const { data: listener } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (
            active() &&
            account.current &&
            session?.user.id !== account.current
          ) {
            account.current = null;
            setReady(false);
            setPassword("");
            setError(
              "Your account session changed. Please request a new password reset link.",
            );
          }
        },
      );
      return () => {
        ++generation.current;
        focused.current = false;
        account.current = null;
        listener.subscription.unsubscribe();
      };
    }, [code, recovery, linkError]),
  );

  async function savePassword() {
    if (saving.current || !ready || !account.current) return;
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    const current = generation.current;
    const userId = account.current;
    const active = () =>
      generation.current === current && account.current === userId;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (!active()) return;
      if (sessionError) throw sessionError;
      if (data.user?.id !== userId)
        throw new Error(
          "Your session changed. Please request a new password reset link.",
        );
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (!active()) return;
      if (updateError) throw updateError;
      setPassword("");
      const pending = await confirmationStore.read().catch(() => null);
      if (!active()) return;
      if (pending && normalizeEmail(pending.email) === normalizeEmail(data.user.email ?? ""))
        await confirmationStore.clear(pending).catch(() => {});
      if (active()) router.replace("/account");
    } catch (failure) {
      if (active())
        setError(
          failure instanceof Error
            ? failure.message
            : "We couldn’t save your password. Please try again.",
        );
    } finally {
      saving.current = false;
      // A newer callback may still be visible while this request settles.
      if (focused.current) setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            s.body,
            { flexGrow: 1, justifyContent: "center", paddingBottom: 36 },
          ]}
        >
          <Title>
            {ready
              ? "Choose a new password."
              : error
                ? "Let’s try that again."
                : "Confirming your account…"}
          </Title>
          <ErrorNote message={error} />
          {ready ? (
            <>
              <Copy>Use at least 8 characters for your new password.</Copy>
              <Field
                label="New password"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                onSubmitEditing={() => void savePassword()}
              />
              <Button
                title="Save password"
                loading={busy}
                onPress={() => void savePassword()}
              />
            </>
          ) : (
            !error && (
              <ActivityIndicator accessibilityLabel="Confirming your account" />
            )
          )}
          {!ready && error && (
            <>
              <Copy>
                Use the newest email and the same device where you requested it.
                If the account is already confirmed, you can sign in normally.
              </Copy>
              <Button
                title={recovery ? "Request a new reset link" : "Request confirmation email"}
                onPress={() => router.replace(recovery ? "/auth?mode=reset" : "/auth?mode=confirm")}
              />
              <Button
                title="Back to sign in"
                secondary
                onPress={() => router.replace("/auth?mode=login")}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
