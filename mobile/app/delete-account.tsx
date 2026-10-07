import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShieldCheck, Trash2, Mail, KeyRound } from "lucide-react-native";
import {
  ActionRow,
  Back,
  Button,
  Copy,
  Field,
  Title,
  s,
} from "../src/design/ui";
import { colors } from "../src/design/tokens";
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
        <Back label="Your data & privacy" />
        <Title>Delete account</Title>
        <View style={[s.card, { padding: 20, gap: 12 }]}>
          <Trash2 color={colors.error} size={28} />
          <Title style={{ fontSize: 23 }}>A permanent goodbye</Title>
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
        </View>
        {!available &&
        !status &&
        (!receipt || preview || !accountDeletionEnabled) ? (
          <View style={[s.card, { padding: 20, gap: 12 }]}>
            <ShieldCheck color={colors.aquaDark} size={26} />
            <Copy>
              {preview
                ? "You are exploring the design. Preview cannot delete a real account."
                : "Account deletion is not enabled in this development build. Its server setup and recovery checks must be completed before tester access opens."}
            </Copy>
          </View>
        ) : null}
        {available && !status && (
          <View style={[s.card, { padding: 20, gap: 14 }]}>
            <Title style={{ fontSize: 23 }}>Confirm it’s you</Title>
            <Copy>{email}</Copy>
            {passwordMode ? (
              <Field
                label="Current password"
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
                <Field
                  label="Email verification code"
                  value={credential}
                  onChangeText={setCredential}
                  autoComplete="one-time-code"
                  keyboardType="number-pad"
                  editable={!busy}
                />
              </>
            )}
            {passwordAccount && (
              <ActionRow
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
            <Field
              label="Type DELETE to confirm"
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
            />
            <Copy>This cannot be undone once your request is accepted.</Copy>
            <Button
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
          </View>
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
    </SafeAreaView>
  );
}
