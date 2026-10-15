import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Info, KeyRound, Mail, ShieldCheck, Trash2, TriangleAlert } from "lucide-react-native";
import { Back, Button, Copy, TextAction, Title, s } from "../src/design/ui";
import { Chip, FieldCard, InfoSheet, StatusCard } from "../src/design/kit";
import { colors, fonts } from "../src/design/tokens";
import { useApp } from "../src/state/AppState";
import {
  accountDeletionEnabled,
  checkDeletionStatus,
  deletionFlow,
  loadDeletionReceipt,
  loadRecentDeletionReceipt,
  sendDeletionCode,
} from "../src/services/accountDeletion";
import type {
  DeletionReceipt,
  DeletionStatus,
} from "../src/services/accountDeletionFlow";

export default function DeleteAccount() {
  const { session, preview, captureSession, finishAccountDeletion } = useApp();
  const [credential, setCredential] = useState("");
  const [useEmailCode, setUseEmailCode] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoringReceipt, setRestoringReceipt] = useState(true);
  const [warnings, setWarnings] = useState(false);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const capture = () => {
    const sessionGuard = captureSession();
    return () => {
      sessionGuard();
      if (!mounted.current || !focused.current)
        throw new Error("Screen changed. Reopen account deletion to continue.");
    };
  };
  const [receipt, setReceipt] = useState<DeletionReceipt | null>(null);
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const mounted = useRef(true),
    working = useRef(false);
  const accountId = session?.user.id;
  const context = useRef({ accountId, preview });
  context.current = { accountId, preview };
  const email = session?.user.email;
  const passwordAccount =
    session?.user.app_metadata.providers?.includes("email");
  const passwordMode = passwordAccount && !useEmailCode;
  const available =
    accountDeletionEnabled && !preview && !!accountId && !!email;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setCredential("");
    setConfirmation("");
    setRestoringReceipt(true);
    if (accountId || preview) {
      setStatus(null);
      setMessage("");
      setReceipt(null);
      setUseEmailCode(false);
    }
    if (preview) {
      setRestoringReceipt(false);
      return;
    }
    let active = true;
    (accountId ? loadDeletionReceipt(accountId) : loadRecentDeletionReceipt())
      .then(async (value) => {
        if (!active) return;
        setReceipt(value);
        if (value && !accountId && accountDeletionEnabled) {
          const savedStatus = await checkDeletionStatus(value);
          if (!active) return;
          setStatus(savedStatus === "not_found" ? null : savedStatus);
          setMessage(describe(savedStatus));
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            "The saved deletion request could not be loaded. Please reopen this screen.",
          );
      })
      .finally(() => {
        if (active) setRestoringReceipt(false);
      });
    return () => {
      active = false;
    };
  }, [accountId, preview]);
  async function action(task: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (error) {
      if (mounted.current)
        setMessage(
          error instanceof Error ? error.message : "Please try again.",
        );
    } finally {
      working.current = false;
      if (mounted.current) {
        setBusy(false);
        setCredential("");
      }
    }
  }
  const describe = (value: DeletionStatus) =>
    value === "complete"
      ? "Account deletion is complete in the active service. Backup retention and restore handling must be configured separately; this receipt does not certify erasure of backups."
      : value === "not_found"
        ? "No accepted request was found. You can verify your identity and retry."
        : "Your deletion request is accepted. Access is closed while cleanup finishes. You can check its progress here.";
  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.body, { paddingBottom: 40 }]}
      >
        <Back label="Privacy" />
        <Title>Delete account</Title>
        <StatusCard icon={Trash2} tint={colors.pinkSoft} ink={colors.error}>
          <Copy style={styles.line}>Deletion immediately closes access.</Copy>
          <Chip
            text="What happens"
            icon={Info}
            hint="Opens the full deletion warnings"
            onPress={() => setWarnings(true)}
          />
        </StatusCard>
        {!available &&
        !status &&
        (!receipt || preview || !accountDeletionEnabled) ? (
          <StatusCard icon={ShieldCheck}>
            <Copy style={styles.line}>
              {preview
                ? "You are exploring the design. Preview cannot delete a real account."
                : "Account deletion is not enabled in this development build. Its server setup and recovery checks must be completed before tester access opens."}
            </Copy>
          </StatusCard>
        ) : null}
        {available && !status && (
          <>
            <NumberedCard number={1} title="Confirm it’s you">
              <Copy style={{ color: colors.muted }}>{email}</Copy>
              {passwordMode ? (
                <FieldCard
                  label="Current password"
                  icon={KeyRound}
                  value={credential}
                  onChangeText={setCredential}
                  secureTextEntry
                  autoComplete="current-password"
                  editable={!busy}
                />
              ) : (
                <>
                  <Copy>
                    Request an email verification code for this account. A fresh
                    code is required; refreshing your session is not enough.
                  </Copy>
                  <Button
                    title="Send verification code"
                    secondary
                    loading={busy}
                    onPress={() =>
                      void action(async () => {
                        const guard = capture();
                        await sendDeletionCode(email!, guard);
                        setMessage("Check your email for the verification code.");
                      })
                    }
                  />
                  <FieldCard
                    label="Email verification code"
                    icon={Mail}
                    value={credential}
                    onChangeText={setCredential}
                    autoComplete="one-time-code"
                    keyboardType="number-pad"
                    editable={!busy}
                  />
                </>
              )}
              {passwordAccount && (
                <TextAction
                  title={
                    passwordMode
                      ? "Use an email code instead"
                      : "Use my password instead"
                  }
                  icon={passwordMode ? Mail : KeyRound}
                  disabled={busy}
                  onPress={() => {
                    setUseEmailCode(!useEmailCode);
                    setCredential("");
                  }}
                />
              )}
            </NumberedCard>
            <NumberedCard number={2} title="Type DELETE">
              <FieldCard
                label="Type DELETE to confirm"
                icon={TriangleAlert}
                placeholder="DELETE"
                value={confirmation}
                onChangeText={setConfirmation}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
              />
              <Copy style={{ color: colors.muted }}>
                This cannot be undone once your request is accepted.
              </Copy>
            </NumberedCard>
            <Button
              destructive
              title={
                receipt
                  ? "Retry account deletion"
                  : "Permanently delete account"
              }
              loading={busy}
              disabled={
                restoringReceipt || confirmation !== "DELETE" || !credential
              }
              onPress={() =>
                void action(async () => {
                  const guard = capture();
                  const flow = deletionFlow({
                    accountId: accountId!,
                    email: email!,
                    preview,
                    assertCurrent: guard,
                    credential: {
                      kind: passwordMode ? "password" : "otp",
                      value: credential,
                    },
                    cleanup: async () => {
                      const saved = await loadDeletionReceipt(accountId!);
                      if (mounted.current) setReceipt(saved);
                      await finishAccountDeletion(accountId!);
                    },
                  });
                  const value = await flow.submit(confirmation === "DELETE");
                  if (mounted.current) {
                    setStatus(value);
                    setMessage(describe(value));
                  }
                })
              }
            />
          </>
        )}
        {receipt && !session && !preview && accountDeletionEnabled && (
          <Copy>
            A saved deletion receipt is available on this device. Check its
            progress below.
          </Copy>
        )}
        {message ? <Copy accessibilityRole="alert">{message}</Copy> : null}
        {receipt && accountDeletionEnabled && !preview && (
          <Button
            title="Check deletion status"
            disabled={restoringReceipt}
            secondary
            loading={busy}
            onPress={() =>
              void action(async () => {
                const expectedAccount = accountId;
                const value = await checkDeletionStatus(receipt);
                if (
                  !mounted.current ||
                  !focused.current ||
                  context.current.preview ||
                  context.current.accountId !== expectedAccount
                )
                  throw new Error(
                    "Account or screen changed. Check the request again.",
                  );
                if (value !== "not_found" && accountId === receipt.accountId)
                  await finishAccountDeletion(accountId);
                if (mounted.current) {
                  setStatus(value === "not_found" ? null : value);
                  setMessage(describe(value));
                }
              })
            }
          />
        )}
      </ScrollView>
      <InfoSheet visible={warnings} title="What happens" onClose={() => setWarnings(false)}>
        <Copy>
          Deletion immediately closes access. Your profile, private photo and
          sign-in account are then removed as cleanup finishes. Invitations
          are revoked and your participation records are removed.
        </Copy>
        <Copy>
          Future plans you organized are cancelled. Other participants can
          retain a neutral plan record; your meeting place, note and location
          are cleared.
        </Copy>
        <Copy>
          Saved groups, invitation records and plan drafts on this device are
          cleared. Information already copied or shared outside Resbite cannot
          be recalled. Backup copies are not erased instantly.
        </Copy>
        <Copy>
          Signing out does not delete your account or shared plans. Review
          what permanent deletion removes and its availability in this build.
          Backup retention and restore handling must also be verified before
          tester access opens.
        </Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}

/** One numbered step of the deletion form: a card with a number circle and a short title. */
function NumberedCard({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[s.card, styles.card]}>
      <View style={styles.cardTop}>
        <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.number}>
          <Text style={styles.numberText}>{number}</Text>
        </View>
        <Copy style={styles.cardTitle}>{title}</Copy>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { textAlign: "center" },
  card: { padding: 20, gap: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontFamily: fonts.bold, fontSize: 15, color: colors.error },
  cardTitle: { flex: 1, fontFamily: fonts.medium, fontSize: 17 },
});
