import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { Hourglass, LogOut, Mail, MailCheck, RefreshCw, ShieldCheck, Ticket, UserRound } from "lucide-react-native";
import { useApp } from "../src/state/AppState";
import { useAccount } from "../src/state/AccountState";
import { Button, Copy, ErrorNote, Title, s } from "../src/design/ui";
import { Chip, StatusCard } from "../src/design/kit";
import { categoryPalette, colors as c, fonts } from "../src/design/tokens";
import { accessState, accessTitles, type AccessState } from "../src/domain/accountCopy";

const icons: Record<AccessState, typeof ShieldCheck> = {
  checking: ShieldCheck,
  unconfirmed: MailCheck,
  error: RefreshCw,
  pending: Hourglass,
};

/**
 * The account access check (UX4): one status card per state, today's guidance word for word,
 * and chips for the actions. Routing is unchanged.
 */
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
  if (preview) return <Redirect href="/create" />;
  if (!session && !restoring) return <Redirect href="/auth" />;
  const signOutChip = (
    <Chip
      text="Sign out"
      icon={LogOut}
      disabled={signingOut}
      onPress={() => void signOut().catch(() => {})}
    />
  );
  if (session && status === "approved") {
    if (!inviteRestored)
      return (
        <SafeAreaView style={s.page}>
          <ScrollView contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
            <Title>Restoring your invitation</Title>
            <StatusCard icon={Ticket} tint={categoryPalette.uplifting.tint} ink={categoryPalette.uplifting.ink}>
              {inviteRestoreError ? null : (
                <ActivityIndicator accessibilityLabel="Restoring saved invitation" />
              )}
            </StatusCard>
            <ErrorNote message={inviteRestoreError} />
            {inviteRestoreError ? (
              <Button title="Try restoring again" onPress={() => void restoreInvite()} />
            ) : null}
            <View style={styles.chips}>{signOutChip}</View>
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
    return <Redirect href="/create" />;
  }
  const checking = restoring || status === "checking";
  const state = accessState(checking, status);
  const Icon = icons[state];
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
        <Title>{accessTitles[state]}</Title>
        <StatusCard icon={Icon} tint={categoryPalette.intellectual.tint} ink={categoryPalette.intellectual.ink}>
          {checking ? (
            <ActivityIndicator accessibilityLabel="Checking account access" />
          ) : (
            <>
              <Copy style={styles.email}>{session?.user.email}</Copy>
              {status === "access_pending" && (
                <>
                  <Copy style={styles.line}>
                    Your email is confirmed. Resbite’s private beta is currently
                    limited to approved testers.
                  </Copy>
                  <Copy style={styles.line}>
                    Once your account is approved, check again here to continue.
                    Confirming your email does not automatically grant tester
                    access.
                  </Copy>
                </>
              )}
              {status === "unconfirmed" && (
                <Copy style={styles.line}>
                  Open the confirmation email on this iPhone, or request another
                  link. Tester approval is a separate step.
                </Copy>
              )}
              {pendingInvite && (
                <Copy style={styles.line}>
                  Your invitation is kept on this device while you finish setting
                  up your account.
                </Copy>
              )}
            </>
          )}
        </StatusCard>
        {!checking && (
          <>
            <ErrorNote message={error} />
            <View style={styles.chips}>
              <Chip
                text="Check again"
                icon={RefreshCw}
                tone="aqua"
                hint="Checks your account access again."
                onPress={() => void refresh()}
              />
              {status === "unconfirmed" && (
                <Chip
                  text="Email help"
                  icon={Mail}
                  hint="Opens email confirmation help."
                  onPress={() => router.push("/auth?mode=confirm")}
                />
              )}
              {status === "access_pending" && (
                <Chip
                  text="Details"
                  icon={UserRound}
                  label="Review optional account details"
                  onPress={() => router.push("/account-details")}
                />
              )}
              {signOutChip}
            </View>
          </>
        )}
        {checking && <View style={styles.chips}>{signOutChip}</View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  email: { fontFamily: fonts.medium, textAlign: "center" },
  line: { textAlign: "center", color: c.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
});
