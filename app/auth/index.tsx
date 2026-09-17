import React, { useState } from "react";
import {
  ScrollView,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  Back,
  Button,
  Copy,
  Title,
  Field,
  ErrorNote,
  s,
} from "../../src/design/ui";
import { colors as c } from "../../src/design/tokens";
import { supabase, configured } from "../../src/services/supabase";
import { safeAuthCode, validateRegistration } from "../../src/domain/rules";
import { exchangeAuthCode } from "../../src/services/authCallback";
WebBrowser.maybeCompleteAuthSession();
export default function Auth() {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  async function submit() {
    setError(null);
    setNotice("");
    const invalid =
      mode === "register"
        ? validateRegistration(email, password)
        : !email.trim()
          ? "Enter your email address."
          : null;
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!configured) {
      setError("Account services are not configured yet.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: "resbite://auth/callback" },
        });
        if (error) throw error;
        setNotice(
          "Check your email to confirm your account, then return here to sign in. Tester approval is required separately.",
        );
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: "resbite://auth/callback?recovery=1" },
        );
        if (error) throw error;
        setNotice(
          "If this email has an account, a password reset link is on its way.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.replace("/profile");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError(null);
    try {
      if (Platform.OS === "web")
        throw new Error("Google sign-in is available in the mobile build.");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "resbite://auth/callback",
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Google sign-in is not configured.");
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        "resbite://auth/callback",
      );
      if (result.type === "success") {
        const code = safeAuthCode(result.url);
        if (!code) throw new Error("Unable to verify the sign-in link.");
        await exchangeAuthCode(code);
        router.replace("/profile");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
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
          contentContainerStyle={[s.body, { paddingBottom: 36 }]}
        >
          <Back />
          <Copy style={{ color: c.aquaDark }}>A LITTLE TIME TOGETHER</Copy>
          <Title>
            {mode === "register"
              ? "Good things start here."
              : mode === "reset"
                ? "Let’s get you back in."
                : "Welcome back."}
          </Title>
          <Copy style={s.muted}>
            Private Resbite test · access is opened by invitation.
          </Copy>
          {mode !== "reset" && (
            <>
              <Button
                title="Continue with Google"
                secondary
                onPress={google}
                loading={busy}
              />
              <Copy style={{ textAlign: "center", color: c.muted }}>
                or with your email
              </Copy>
            </>
          )}
          <Field
            label="Email address"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {mode !== "reset" && (
            <Field
              label="Password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              value={password}
              onChangeText={setPassword}
            />
          )}
          <ErrorNote message={error} />
          {Boolean(notice) && (
            <View
              style={[s.card, { padding: 18, backgroundColor: c.aquaSoft }]}
            >
              <Copy>{notice}</Copy>
            </View>
          )}
          <Button
            title={
              mode === "register"
                ? "Create account"
                : mode === "reset"
                  ? "Send reset link"
                  : "Sign in"
            }
            onPress={submit}
            loading={busy}
          />
          <Pressable
            accessibilityRole="button"
            style={{ padding: 12 }}
            onPress={() => {
              setMode(mode === "register" ? "login" : "register");
              setError(null);
              setNotice("");
            }}
          >
            <Copy style={{ textAlign: "center" }}>
              {mode === "register"
                ? "Already have an account? Sign in"
                : "New to Resbite? Create an account"}
            </Copy>
          </Pressable>
          {mode === "login" && (
            <Pressable
              accessibilityRole="button"
              style={{ padding: 12 }}
              onPress={() => setMode("reset")}
            >
              <Copy style={{ textAlign: "center", color: c.muted }}>
                Forgot password?
              </Copy>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
