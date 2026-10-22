import React, { useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ticket } from "lucide-react-native";
import { Button, Copy, ErrorNote, Field, TextAction } from "./ui";
import { StatusCard, StepScreen, useFocusOnChange } from "./kit";
import { TermsLine, TickRow } from "./TickRow";
import { AppleMark } from "./AppleMark";
import { categoryPalette, colors as c, fonts } from "./tokens";
import { GUEST_COPY, previewLine, stateSentence } from "../domain/guestAccount";
import type { CardState, GuestAccount } from "../state/useGuestAccount";

// GI2: the guest's account screen (app/invite.tsx): one StepScreen whose heading, content and pinned footer
// follow useGuestAccount's state, and its pieces: the invitation's card, the tick, the providers and the
// Email, Code and Name steps.

const connectionCopy = "Check your connection and try again.";

/** The screen for each state: a dead link, checking or joining, the providers, the Email, Code and Name steps. */
export function GuestScreen({ guest }: { guest: GuestAccount }) {
  const { card, dead, step, failed, working } = guest;
  const heading = useRef<Text>(null);
  const title = dead
    ? stateSentence(dead, card.status === "ready" ? card.value.host : undefined)
    : step === "email"
      ? GUEST_COPY.emailHeading
      : step === "code"
        ? GUEST_COPY.codeHeading
        : step === "name"
          ? GUEST_COPY.nameHeading
          : step === "joining" && !failed
            ? GUEST_COPY.joining
            : GUEST_COPY.heading;
  // VoiceOver focus moves to each new heading (the steps, joining, a dead link).
  useFocusOnChange(heading, title);
  const cardView = <InvitationCard card={card} onRetry={guest.retryCard} />;
  let body: React.ReactNode = null;
  let primary: React.ReactNode;
  let onBack: (() => void) | undefined;
  if (dead) primary = <Button large icon={false} title={GUEST_COPY.goHome} onPress={() => void guest.goHome()} />;
  else if (step === null || (step === "joining" && !failed))
    body = (
      <>
        {step === null ? cardView : null}
        <ActivityIndicator
          accessibilityLabel={step === null ? "Checking account access" : GUEST_COPY.joining}
          color={c.aquaDark}
        />
      </>
    );
  else if (step === "joining") {
    body = (
      <>
        {cardView}
        <ErrorNote message={connectionCopy} />
      </>
    );
    primary = <Button large icon={false} title="Retry" onPress={guest.retry} />;
  } else if (step === "email") {
    onBack = () => guest.goTo("providers");
    body = (
      <>
        <EmailBody
          email={guest.email}
          onChange={guest.setEmail}
          onSubmit={() => void guest.send()}
          editable={!working}
        />
        <ErrorNote message={guest.error} />
      </>
    );
    primary = (
      <Button large icon={false} title={GUEST_COPY.sendCode} loading={working} onPress={() => void guest.send()} />
    );
  } else if (step === "code") {
    onBack = () => guest.goTo("email");
    body = (
      <>
        <CodeBody
          email={guest.email}
          digits={guest.digits}
          onDigits={guest.typeDigits}
          inputRef={guest.codeInput}
          error={guest.error}
          onRetry={guest.verifyLost ? guest.retryVerify : undefined}
          secondsLeft={guest.secondsLeft}
          onResend={() => void guest.send()}
          busy={working}
        />
      </>
    );
  } else if (step === "name") {
    body = (
      <>
        <NameBody name={guest.name} onChange={guest.setName} onSubmit={guest.continueWithName} editable={!working} />
        <ErrorNote message={guest.error} />
      </>
    );
    primary = (
      <Button
        large
        icon={false}
        title="Continue"
        disabled={!guest.name.trim()}
        loading={working}
        onPress={guest.continueWithName}
      />
    );
  } else {
    // The providers before signing in (or to sign in again); signed in without a kept tick, one Continue.
    body = (
      <>
        {cardView}
        <Copy>{GUEST_COPY.body}</Copy>
        <AgeTick ticked={guest.ticked} onChange={guest.tick} disabled={working} />
        <ErrorNote message={guest.error} />
      </>
    );
    primary =
      !guest.signedIn || guest.signInAgain ? (
        <ProviderButtons
          apple={guest.appleAvailable}
          enabled={guest.ticked}
          busy={working}
          onApple={() => void guest.apple()}
          onGoogle={guest.google}
          onEmail={() => guest.goTo("email")}
          onExisting={() => router.push("/auth")}
        />
      ) : (
        <Button
          large
          icon={false}
          title="Continue"
          hint={guest.ticked ? undefined : GUEST_COPY.ageHelper}
          disabled={!guest.ticked}
          onPress={guest.continueTicked}
        />
      );
  }
  return (
    <StepScreen
      step={null}
      title={title}
      titleRef={heading}
      onBack={onBack}
      onClose={() => void guest.close()}
      closeDisabled={guest.closeDisabled}
      primary={primary}
    >
      {body}
    </StepScreen>
  );
}

/** "<Host> invited you", the title and the start, from invitation_page; a placeholder while loading. */
function InvitationCard({ card, onRetry }: { card: CardState; onRetry: () => void }) {
  const tone = categoryPalette.uplifting;
  if (card.status === "loading")
    return (
      <StatusCard icon={Ticket} tint={tone.tint} ink={tone.ink}>
        <ActivityIndicator accessibilityLabel="Loading the invitation" color={c.aquaDark} />
      </StatusCard>
    );
  if (card.status === "failed")
    return (
      <StatusCard icon={Ticket} tint={tone.tint} ink={tone.ink}>
        <Copy style={styles.center}>{connectionCopy}</Copy>
        <TextAction title="Retry" onPress={onRetry} />
      </StatusCard>
    );
  const { host, title } = card.value;
  const when = previewLine(card.value);
  return (
    <StatusCard icon={Ticket} tint={tone.tint} ink={tone.ink} title={host ? `${host} invited you` : "You’re invited"}>
      {title ? <Copy style={styles.eventTitle}>{title}</Copy> : null}
      {when ? <Copy style={styles.center}>{when}</Copy> : null}
    </StatusCard>
  );
}

/** The tick ("I’m 18 or over"), the Terms line under it and, while unticked, the age helper. */
function AgeTick({
  ticked,
  onChange,
  disabled,
}: {
  ticked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.tick}>
      <TickRow label={GUEST_COPY.tick} hint={GUEST_COPY.terms} checked={ticked} onChange={onChange} disabled={disabled}>
        <TermsLine text={GUEST_COPY.terms} />
      </TickRow>
      {!ticked ? <Copy style={styles.helper}>{GUEST_COPY.ageHelper}</Copy> : null}
    </View>
  );
}

/** The pinned footer before sign-in: Apple (iOS only), Google, email, then "I already have an account". */
function ProviderButtons({
  apple,
  enabled,
  busy,
  onApple,
  onGoogle,
  onEmail,
  onExisting,
}: {
  apple: boolean;
  enabled: boolean;
  busy: boolean;
  onApple: () => void;
  onGoogle: () => void;
  onEmail: () => void;
  onExisting: () => void;
}) {
  const hint = enabled ? undefined : GUEST_COPY.ageHelper;
  return (
    <>
      {apple ? (
        <Button title={GUEST_COPY.apple} mark={AppleMark} hint={hint} disabled={!enabled || busy} onPress={onApple} />
      ) : null}
      <Button title={GUEST_COPY.google} secondary hint={hint} disabled={!enabled || busy} onPress={onGoogle} />
      <Button title={GUEST_COPY.email} secondary hint={hint} disabled={!enabled || busy} onPress={onEmail} />
      <View style={styles.centerRow}>
        <TextAction title={GUEST_COPY.existing} disabled={busy} onPress={onExisting} />
      </View>
    </>
  );
}

function EmailBody({
  email,
  onChange,
  onSubmit,
  editable,
}: {
  email: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  editable: boolean;
}) {
  return (
    <Field
      label={GUEST_COPY.emailField}
      value={email}
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
      editable={editable}
      autoFocus
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      keyboardType="email-address"
      textContentType="emailAddress"
      returnKeyType="send"
    />
  );
}

/**
 * One text field shown as six cells: the field lies over the cells with its own text transparent, so typing,
 * pasting, the one-time-code suggestion and VoiceOver all use the real field.
 */
function CodeField({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<TextInput | null>;
}) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, 5);
  return (
    <View style={styles.code}>
      <View aria-hidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.cells}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={[styles.cell, focused && i === active && styles.cellActive]}>
            <Text style={styles.digit}>{value[i] ?? ""}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        accessibilityLabel="6-digit code"
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus
        maxLength={6}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        caretHidden
        selectionColor="transparent"
        style={[StyleSheet.absoluteFill, styles.codeInput]}
      />
    </View>
  );
}

function CodeBody({
  email,
  digits,
  onDigits,
  inputRef,
  error,
  onRetry,
  secondsLeft,
  onResend,
  busy,
}: {
  email: string;
  digits: string;
  onDigits: (value: string) => void;
  inputRef: React.RefObject<TextInput | null>;
  error: string | null;
  /** Shown after a check lost to the connection: checks the same six digits again. */
  onRetry?: () => void;
  secondsLeft: number;
  onResend: () => void;
  busy: boolean;
}) {
  return (
    <>
      <Copy>{GUEST_COPY.codeBody(email.trim())}</Copy>
      <CodeField value={digits} onChange={onDigits} inputRef={inputRef} />
      {busy ? <ActivityIndicator accessibilityLabel="Checking the code" color={c.aquaDark} /> : null}
      <ErrorNote message={error} />
      {onRetry && !busy ? <TextAction title="Retry" onPress={onRetry} /> : null}
      <View style={styles.links}>
        {secondsLeft > 0 ? (
          <Copy style={styles.helper}>{GUEST_COPY.resendIn(secondsLeft)}</Copy>
        ) : (
          <TextAction title={GUEST_COPY.resend} disabled={busy} onPress={onResend} />
        )}
        {Platform.OS === "ios" ? (
          <TextAction title={GUEST_COPY.openMail} onPress={() => void Linking.openURL("message://").catch(() => {})} />
        ) : null}
      </View>
    </>
  );
}

function NameBody({
  name,
  onChange,
  onSubmit,
  editable,
}: {
  name: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  editable: boolean;
}) {
  return (
    <>
      <Field
        label={GUEST_COPY.nameField}
        value={name}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        editable={editable}
        autoFocus
        maxLength={80}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
      />
      <Copy style={styles.helper}>{GUEST_COPY.nameHelper}</Copy>
    </>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center", color: c.muted },
  eventTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, textAlign: "center" },
  tick: { gap: 6 },
  helper: { color: c.muted, fontSize: 14 },
  centerRow: { alignItems: "center" },
  links: { alignItems: "flex-start", gap: 4 },
  code: { position: "relative" },
  cells: { flexDirection: "row", gap: 8 },
  cell: {
    flex: 1,
    maxWidth: 52,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  cellActive: { borderColor: c.aquaDark, borderWidth: 2 },
  digit: { fontFamily: fonts.display, fontSize: 24, color: c.ink },
  codeInput: {
    color: "transparent",
    backgroundColor: "transparent",
    borderWidth: 0,
    fontSize: 24,
    ...(Platform.OS === "web" ? { outlineStyle: "solid" as const, outlineWidth: 0 } : null),
  },
});
