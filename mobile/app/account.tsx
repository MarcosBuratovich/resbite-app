import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Hourglass, LogOut, Mail, MailCheck, RefreshCw, ShieldCheck, Ticket, UserRound } from "lucide-react-native";
import { useApp } from "../src/state/AppState";
import { useAccount } from "../src/state/AccountState";
import { Button, Copy, ErrorNote, Title, s } from "../src/design/ui";
import { Chip, StatusCard } from "../src/design/kit";
import { RequestCard } from "../src/design/GuestSteps";
import { categoryPalette, colors as c, fonts } from "../src/design/tokens";
import { accessState, accessTitles, type AccessState } from "../src/domain/accountCopy";
import { isLinkCode, pendingInviteParams } from "../src/domain/appLinks";
import { accountGate } from "../src/domain/accountRoute";
import { nameFromSession } from "../src/domain/guestAccount";
import { formatPhone, phoneVerified } from "../src/domain/phone";
import { INVITE_COPY } from "../src/domain/inviteCopy";
import { joinRequestGateway, type MyRequest } from "../src/services/joinRequests";

const icons: Record<AccessState, typeof ShieldCheck> = {
  checking: ShieldCheck,
  unconfirmed: MailCheck,
  error: RefreshCw,
  pending: Hourglass,
};

/**
 * The account access check (UX4): one status card per state, today's guidance word for word,
 * and chips for the actions. Before any of it, the phone gate (accountGate): an approved or waiting
 * account without a verified phone goes to Add your number, and one with a phone but no name (and
 * no profile) to About you. Details are no longer asked for here; they stay optional in Account
 * details. Plan 3: while waiting for access, the account's open-link requests are listed under the card
 * (as in My resbites); a failed read leaves the list as it was, without a message.
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
  const { status, user, profileReady, error, refresh } = useAccount();
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const accountId = session?.user.id;
  useFocusEffect(
    useCallback(() => {
      if (!accountId || preview || status !== "access_pending") return;
      let live = true;
      void joinRequestGateway.mine().then(
        (rows) => {
          if (live) setRequests(rows);
        },
        () => {},
      );
      return () => {
        live = false;
      };
    }, [accountId, preview, status]),
  );
  if (preview) return <Redirect href="/create" />;
  if (!session && !restoring) return <Redirect href="/auth" />;
  const gate = session
    ? accountGate({
        status,
        phoneVerified: phoneVerified(user),
        name: nameFromSession(user, null),
        profileReady,
      })
    : null;
  if (gate) return <Redirect href={gate === "add-phone" ? "/add-phone" : "/about-you"} />;
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
    if (!profileReady) return <Redirect href="/profile" />;
    const kept = pendingInviteParams(pendingInvite);
    if (kept)
      return <Redirect href={{ pathname: "/invite", params: kept }} />;
    return <Redirect href="/create" />;
  }
  // Plan 3: a kept event link sends its request from the invite screen once the gate above is clear; the
  // host's approval is what grants access.
  if (session && status === "access_pending" && pendingInvite && isLinkCode(pendingInvite))
    return <Redirect href={{ pathname: "/invite", params: { code: pendingInvite } }} />;
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
              <Copy style={styles.email}>
                {session?.user.email || (session?.user.phone ? formatPhone(session.user.phone) : null)}
              </Copy>
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
                  <Copy style={styles.line}>
                    If someone invited you to a resbite, open their link again.
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
        {!checking && status === "access_pending" && requests.length > 0 && (
          <View style={styles.requests}>
            <Copy accessibilityRole="header" style={styles.heading}>
              {INVITE_COPY.invitationsHeading}
            </Copy>
            {requests.map((request) => (
              <RequestCard key={request.plan_id} request={request} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  email: { fontFamily: fonts.medium, textAlign: "center" },
  line: { textAlign: "center", color: c.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  // As My resbites' Invitations.
  requests: { gap: 12 },
  heading: { fontFamily: fonts.display, fontSize: 22 },
});
