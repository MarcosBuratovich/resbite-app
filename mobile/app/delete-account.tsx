import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Info, KeyRound, Mail, ShieldCheck, Smartphone, Trash2, TriangleAlert } from "lucide-react-native";
import { Back, Button, Copy, TextAction, Title, s } from "../src/design/ui";
import { Chip, FieldCard, InfoSheet, StatusCard } from "../src/design/kit";
import { AppleMark } from "../src/design/AppleMark";
import { colors, fonts } from "../src/design/tokens";
import { useApp } from "../src/state/AppState";
import {
  accountDeletionEnabled,
  checkDeletionStatus,
  deletionFlow,
  loadDeletionReceipt,
  loadRecentDeletionReceipt,
  sendDeletionCode,
  sendDeletionPhoneCode,
  type DeletionCredential,
} from "../src/services/accountDeletion";
import {
  type DeletionReceipt,
  type DeletionStatus,
} from "../src/services/accountDeletionFlow";
import {
  DELETION_COPY,
  deletionPhone,
  deletionProof,
  describeDeletionStatus,
  type DeletionAccount,
} from "../src/domain/deletion";
import { GUEST_COPY } from "../src/domain/guestAccount";
import { formatPhone } from "../src/domain/phone";

export default function DeleteAccount() {
  const { session, preview, captureSession, finishAccountDeletion } = useApp();
  const [credential, setCredential] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  // When the deletion text was sent: the phone proof needs one first, and verifyPhoneCode tells expiry by it.
  const [sentAt, setSentAt] = useState<number | null>(null);
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
  const email = session?.user.email || null;
  const providers: string[] = session?.user.app_metadata.providers ?? [];
  const account: DeletionAccount = {
    providers,
    email,
    phone: session?.user.phone || null,
    phoneConfirmed: !!session?.user.phone_confirmed_at,
  };
  // ASR2-2: Apple when Apple is linked; else an email code (or password); else a code texted to the confirmed number;
  // else none, and the person writes to the privacy address.
  const proof = deletionProof(account);
  const phone = deletionPhone(account);
  const appleAccount = proof === "apple";
  // An "email" account may have a password or only ever have used a code (GI2's email code), and no claim says
  // which, so the code comes first and "Use my password instead" switches to the password.
  const passwordAccount = proof === "email" && providers.includes("email");
  const passwordMode = passwordAccount && usePassword;
  // DEL-2: every account type, so no email is needed here; the proof decides what card 1 asks for.
  const available = accountDeletionEnabled && !preview && !!accountId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setCredential("");
    setConfirmation("");
    setSentAt(null);
    setRestoringReceipt(true);
    if (accountId || preview) {
      setStatus(null);
      setMessage("");
      setReceipt(null);
      setUsePassword(false);
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
    describeDeletionStatus(value, !!session);
  const proofCredential = (): DeletionCredential | null =>
    proof === "phone"
      ? { kind: "sms", value: credential, sentAt: sentAt! }
      : proof === "email"
        ? { kind: passwordMode ? "password" : "otp", value: credential }
        : null;
  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.body, { paddingBottom: 40 }]}
      >
        {/* Opened from Data & privacy, the suspended screen, a gate (Add your number, Accept your Terms, About you) or the
            welcome screen: a neutral label for all of them. */}
        <Back />
        <Title>Delete account</Title>
        <StatusCard icon={Trash2} tint={colors.pinkSoft} ink={colors.error}>
          <Copy style={styles.line}>{DELETION_COPY.intro}</Copy>
          <View style={styles.chips}>
            <Chip
              text={DELETION_COPY.whatHappens}
              icon={Info}
              hint="Opens the full deletion warnings"
              onPress={() => setWarnings(true)}
            />
          </View>
        </StatusCard>
        {!available &&
        !status &&
        (!receipt || preview || !accountDeletionEnabled) ? (
          <StatusCard icon={ShieldCheck}>
            <Copy style={styles.line}>
              {preview ? DELETION_COPY.preview : DELETION_COPY.unavailable}
            </Copy>
          </StatusCard>
        ) : null}
        {available && !status && (
          <>
            <NumberedCard number={1} title={DELETION_COPY.proveHeading}>
              {proof === null ? (
                <Copy>{DELETION_COPY.noProof}</Copy>
              ) : proof === "apple" ? (
                <Copy>{DELETION_COPY.appleBody}</Copy>
              ) : proof === "phone" ? (
                <>
                  <Copy>{DELETION_COPY.phoneBody(formatPhone(phone!))}</Copy>
                  <Button
                    title={DELETION_COPY.sendCode}
                    secondary
                    loading={busy}
                    onPress={() =>
                      void action(async () => {
                        const guard = capture();
                        await sendDeletionPhoneCode(phone!, guard);
                        if (!mounted.current) return;
                        setSentAt(Date.now());
                        setMessage(DELETION_COPY.phoneSent(formatPhone(phone!)));
                      })
                    }
                  />
                  <FieldCard
                    label={DELETION_COPY.phoneCodeField}
                    placeholder={DELETION_COPY.phoneCodeField}
                    icon={Smartphone}
                    value={credential}
                    onChangeText={setCredential}
                    autoComplete="one-time-code"
                    keyboardType="number-pad"
                    editable={!busy}
                  />
                </>
              ) : passwordMode ? (
                <FieldCard
                  label={DELETION_COPY.passwordField}
                  placeholder={DELETION_COPY.passwordField}
                  icon={KeyRound}
                  value={credential}
                  onChangeText={setCredential}
                  secureTextEntry
                  autoComplete="current-password"
                  editable={!busy}
                />
              ) : (
                <>
                  <Copy>{DELETION_COPY.emailBody(email!)}</Copy>
                  <Button
                    title={DELETION_COPY.sendCode}
                    secondary
                    loading={busy}
                    onPress={() =>
                      void action(async () => {
                        const guard = capture();
                        await sendDeletionCode(email!, guard);
                        setMessage(DELETION_COPY.emailSent);
                      })
                    }
                  />
                  <FieldCard
                    label={DELETION_COPY.emailCodeField}
                    placeholder={DELETION_COPY.emailCodeField}
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
                      ? DELETION_COPY.useEmailCode
                      : DELETION_COPY.usePassword
                  }
                  icon={passwordMode ? Mail : KeyRound}
                  disabled={busy}
                  onPress={() => {
                    setUsePassword(!usePassword);
                    setCredential("");
                  }}
                />
              )}
            </NumberedCard>
            {proof !== null && (
              <>
                <NumberedCard number={2} title={DELETION_COPY.typeHeading}>
                  <FieldCard
                    label={DELETION_COPY.typeField}
                    icon={TriangleAlert}
                    placeholder="DELETE"
                    value={confirmation}
                    onChangeText={setConfirmation}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!busy}
                  />
                  <Copy style={{ color: colors.muted }}>
                    {DELETION_COPY.cannotUndo}
                  </Copy>
                </NumberedCard>
                <Button
                  destructive
                  title={
                    appleAccount
                      ? GUEST_COPY.apple
                      : receipt
                        ? DELETION_COPY.retry
                        : DELETION_COPY.delete
                  }
                  mark={appleAccount ? AppleMark : undefined}
                  hint={appleAccount ? DELETION_COPY.appleHint : undefined}
                  loading={busy}
                  disabled={
                    restoringReceipt ||
                    confirmation !== "DELETE" ||
                    (!appleAccount && !credential) ||
                    (proof === "phone" && sentAt === null)
                  }
                  onPress={() =>
                    void action(async () => {
                      const guard = capture();
                      const flow = deletionFlow({
                        accountId: accountId!,
                        proof,
                        email,
                        phone,
                        preview,
                        assertCurrent: guard,
                        credential: proofCredential(),
                        cleanup: async () => {
                          const saved = await loadDeletionReceipt(accountId!);
                          if (mounted.current) setReceipt(saved);
                          await finishAccountDeletion(accountId!);
                        },
                      });
                      const value = await flow.submit(confirmation === "DELETE");
                      // A closed Apple sheet: nothing was requested and nothing is said.
                      if (value === null) return;
                      if (mounted.current) {
                        setStatus(value);
                        setMessage(describe(value));
                      }
                    })
                  }
                />
              </>
            )}
          </>
        )}
        {receipt && !session && !preview && accountDeletionEnabled && (
          <Copy>{DELETION_COPY.savedReceipt}</Copy>
        )}
        {message ? <Copy accessibilityRole="alert">{message}</Copy> : null}
        {receipt && accountDeletionEnabled && !preview && (
          <Button
            title={DELETION_COPY.check}
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
      <InfoSheet
        visible={warnings}
        title={DELETION_COPY.whatHappens}
        onClose={() => setWarnings(false)}
      >
        {DELETION_COPY.sheet.map((paragraph) => (
          <Copy key={paragraph}>{paragraph}</Copy>
        ))}
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
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
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
