import React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { MailCheck, ShieldCheck } from "lucide-react-native";
import { useApp } from "../src/state/AppState";
import { useAccount } from "../src/state/AccountState";
import {
  Button,
  Copy,
  ErrorNote,
  IconBadge,
  TextAction,
  Title,
  s,
} from "../src/design/ui";
import { colors as c } from "../src/design/tokens";
export default function Account() {
  const {
    session,
    preview,
    restoring,
    signOut,
    signingOut,
    pendingInvite,
    inviteRestored,
    inviteRestoreError,
    restoreInvite,
  } = useApp();
  const { status, reviewed, profileReady, error, refresh } = useAccount();
  if (preview) return <Redirect href="/discover" />;
  if (!session && !restoring) return <Redirect href="/auth" />;
  if (session && status === "approved") {
    if (!inviteRestored)
      return (
        <SafeAreaView style={s.page}>
          <ScrollView contentContainerStyle={s.body}>
            <Title>Restoring your invitation</Title>
            <ErrorNote message={inviteRestoreError} />
            {inviteRestoreError ? (
              <Button
                title="Try restoring again"
                onPress={() => void restoreInvite()}
              />
            ) : (
              <ActivityIndicator accessibilityLabel="Restoring saved invitation" />
            )}
            <TextAction
              title="Sign out"
              onPress={() => void signOut().catch(() => {})}
            />
          </ScrollView>
        </SafeAreaView>
      );
    if (!reviewed) return <Redirect href="/account-details?setup=1" />;
    if (!profileReady) return <Redirect href="/profile" />;
    if (pendingInvite)
      return (
        <Redirect
          href={{ pathname: "/invite", params: { token: pendingInvite } }}
        />
      );
    return <Redirect href="/discover" />;
  }
  const checking = restoring || status === "checking";
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
        <IconBadge
          icon={status === "unconfirmed" ? MailCheck : ShieldCheck}
          tone="violet"
        />
        <Copy style={{ color: c.aquaDark }}>YOUR RESBITE ACCOUNT</Copy>
        <Title>
          {checking
            ? "Checking your account"
            : status === "unconfirmed"
              ? "Confirm your email"
              : status === "error"
                ? "Let’s try again"
                : "You’re on your way"}
        </Title>
        {checking ? (
          <ActivityIndicator accessibilityLabel="Checking account access" />
        ) : (
          <>
            <Copy>{session?.user.email}</Copy>
            {status === "access_pending" && (
              <View style={[s.card, { padding: 20, gap: 12 }]}>
                <Copy>
                  Your email is confirmed. Resbite’s private beta is currently
                  limited to approved testers.
                </Copy>
                <Copy>
                  Once your account is approved, check again here to continue.
                  Confirming your email does not automatically grant tester
                  access.
                </Copy>
              </View>
            )}
            {status === "unconfirmed" && (
              <Copy>
                Open the confirmation email on this iPhone, or request another
                link. Tester approval is a separate step.
              </Copy>
            )}
            {pendingInvite && (
              <Copy>
                Your invitation is kept on this device while you finish setting
                up your account.
              </Copy>
            )}
            <ErrorNote message={error} />
            {status === "unconfirmed" && (
              <Button
                title="Email confirmation help"
                onPress={() => router.push("/auth?mode=confirm")}
              />
            )}
            <Button
              title="Check account access"
              loading={checking}
              onPress={() => void refresh()}
            />
            {status === "access_pending" && (
              <TextAction
                title="Review optional account details"
                onPress={() => router.push("/account-details")}
              />
            )}
          </>
        )}
        <TextAction
          title="Sign out"
          disabled={signingOut}
          onPress={() => void signOut().catch(() => {})}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
