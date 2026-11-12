import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Copy, ErrorNote, TextAction, s } from "./ui";
import { focusHeading } from "./kit";
import { colors as c, fonts, space } from "./tokens";
import { CHAT_COPY } from "../domain/chatCopy";
import { INVITE_COPY } from "../domain/inviteCopy";
import {
  SAFETY_COPY,
  blockLines,
  shownName,
  supportAddress,
  thanksLines,
  type ReportReason,
  type ReportTarget,
} from "../domain/safetyCopy";
import { safetyErrorMessage, safetyGateway, showsBlockedLine } from "../services/safety";

/** The longest optional line a report takes (Decision 4, CH-P13). */
export const REPORT_DETAILS_MAX = 500;

const REASONS = Object.keys(SAFETY_COPY.reasons) as ReportReason[];

function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

/** Says a line aloud on iPhone; TalkBack reads the live region by itself, and the web's focus says it (useAnnounce). */
function sayOnIos(line: string) {
  if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(line);
}

/**
 * Report (G-N6, Decision 4), drawn inside the sheet it was opened from: what is reported, the four reasons as radios,
 * the optional line of up to 500 characters, and Send report, disabled with its hint until a reason is picked. Sent,
 * the thanks (and the contact line when the build has a support address) take its place, said aloud, and Done closes
 * it; refused or offline, the sheet stays with what was typed and says why (`safetyErrorMessage`). Reporting stops
 * nothing else: the reporter goes on using the chat.
 */
export function ReportSheet({
  target,
  onDone,
  unavailable = false,
}: {
  target: ReportTarget;
  onDone: () => void;
  /**
   * What is reported can't be any more (a message taken down while the sheet is open, ruling SR6 Q1): the sheet stays
   * with what was typed, says so, and Send report is off.
   */
  unavailable?: boolean;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const mounted = useMounted();
  const title = useRef<Text | null>(null);
  const thanks = useRef<Text | null>(null);
  // Never an address the build doesn't hold, and never a broken one (G-N10, N9).
  const lines = thanksLines(supportAddress(process.env.EXPO_PUBLIC_SUPPORT_ADDRESS));
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusHeading(sent ? thanks.current : title.current));
    if (sent) sayOnIos(lines.join(" "));
    return () => cancelAnimationFrame(frame);
    // The heading on opening, the thanks once sent.
  }, [sent]);
  const send = async () => {
    if (!reason || sending || unavailable) return;
    setSending(true);
    setError(null);
    try {
      if (target.kind === "message") await safetyGateway.reportMessage(target.id, reason, details);
      else await safetyGateway.reportUser(target.userId, target.series, reason, details);
      if (mounted.current) setSent(true);
    } catch (e) {
      if (mounted.current) setError(safetyErrorMessage(e));
    } finally {
      if (mounted.current) setSending(false);
    }
  };
  if (sent)
    return (
      <View style={styles.block}>
        <View accessibilityLiveRegion="polite" style={styles.lines}>
          {lines.map((line, i) => (
            <Copy key={i} ref={i === 0 ? thanks : undefined} selectable={i > 0} style={i === 0 ? styles.thanks : undefined}>
              {line}
            </Copy>
          ))}
        </View>
        <Button icon={false} secondary title={INVITE_COPY.done} onPress={onDone} />
      </View>
    );
  const heading = target.kind === "message" ? SAFETY_COPY.reportMessage : SAFETY_COPY.reportPerson(shownName(target.name));
  return (
    <View style={styles.block}>
      <Text ref={title} accessibilityRole="header" style={styles.title}>
        {heading}
      </Text>
      <Text style={styles.label}>{SAFETY_COPY.why}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={SAFETY_COPY.why}>
        {REASONS.map((key) => {
          const on = reason === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityLabel={SAFETY_COPY.reasons[key]}
              accessibilityState={{ checked: on, disabled: sending }}
              aria-checked={on}
              disabled={sending}
              onPress={() => setReason(key)}
              style={styles.radioRow}
            >
              <View style={styles.radio}>{on ? <View style={styles.radioDot} /> : null}</View>
              <Text style={styles.radioText}>{SAFETY_COPY.reasons[key]}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        multiline
        value={details}
        onChangeText={setDetails}
        maxLength={REPORT_DETAILS_MAX}
        editable={!sending}
        placeholder={SAFETY_COPY.detailsLabel}
        accessibilityLabel={SAFETY_COPY.detailsLabel}
        placeholderTextColor="#99929F"
        {...(Platform.OS === "web" ? { rows: 3 } : null)}
        style={[s.field, styles.details]}
      />
      <ErrorNote message={unavailable ? SAFETY_COPY.unavailable : error} />
      <Button
        icon={false}
        title={SAFETY_COPY.sendReport}
        hint={reason || unavailable ? undefined : SAFETY_COPY.pickReason}
        loading={sending}
        disabled={!reason || sending || unavailable}
        onPress={() => void send()}
      />
      <View style={styles.centre}>
        <TextAction title={CHAT_COPY.cancel} disabled={sending} onPress={onDone} />
      </View>
    </View>
  );
}

/**
 * The block confirm, in place (G-N9): the question for the person by name (`blockLines`, NOTE 7), and for a host of the
 * resbite the line on what a block doesn't do (R-Q6); Block in red, then Keep. The block goes through the safety gateway,
 * so every open chat hears it (B3). Refused or offline, it stays with the reason; never anything that tells the blocked
 * person (CH-P13). Answered that nothing was stored, it calls `onClosed` and the sheet closes saying nothing (ruling SR9).
 */
export function BlockQuestion({
  userId,
  name,
  youHost,
  theyHost,
  onBlocked,
  onKeep,
  onClosed,
}: {
  userId: string;
  name: string;
  youHost: boolean;
  theyHost: boolean;
  onBlocked: () => void;
  onKeep: () => void;
  /** The server stored nothing (ruling SR9): the screen closes the sheet, with no line of any kind. */
  onClosed: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useMounted();
  const question = useRef<Text | null>(null);
  const [ask, note] = blockLines(name, youHost, theyHost);
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusHeading(question.current));
    return () => cancelAnimationFrame(frame);
  }, []);
  const confirm = async () => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await safetyGateway.block(userId);
      if (mounted.current) (showsBlockedLine(result) ? onBlocked : onClosed)();
    } catch (e) {
      if (mounted.current) setError(safetyErrorMessage(e));
    } finally {
      if (mounted.current) setWorking(false);
    }
  };
  return (
    <View style={styles.block}>
      <Copy ref={question} accessibilityRole="header" style={styles.question}>
        {ask}
      </Copy>
      {note ? <Copy>{note}</Copy> : null}
      <Button icon={false} destructive title={SAFETY_COPY.block(shownName(name))} loading={working} disabled={working} onPress={() => void confirm()} />
      <Button icon={false} secondary title={CHAT_COPY.keep} disabled={working} onPress={onKeep} />
      <ErrorNote message={error} />
    </View>
  );
}

/**
 * After an unblock, the sheet's result line, "Unblocked <name>.": focus moves to it and it is said aloud, as Blocked
 * people does (final review M4).
 */
export function UnblockedLine({ name }: { name: string }) {
  const line = useRef<Text | null>(null);
  const words = SAFETY_COPY.unblocked(shownName(name));
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusHeading(line.current));
    sayOnIos(words);
    return () => cancelAnimationFrame(frame);
    // Once, when it appears.
  }, []);
  return (
    <Copy ref={line} accessibilityLiveRegion="polite" style={styles.blocked}>
      {words}
    </Copy>
  );
}

/** After a block, the sheet's result line, "Blocked": focus moves to it and it is said aloud (G-N7). */
export function BlockedLine() {
  const line = useRef<Text | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusHeading(line.current));
    sayOnIos(SAFETY_COPY.blocked);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <Copy ref={line} accessibilityLiveRegion="polite" style={styles.blocked}>
      {SAFETY_COPY.blocked}
    </Copy>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.m },
  lines: { gap: space.s },
  title: { fontFamily: fonts.display, fontSize: 22, color: c.ink },
  label: { fontFamily: fonts.medium, fontSize: 13, color: c.ink },
  radioRow: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 48 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.ink, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: c.ink },
  radioText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 15, color: c.ink },
  details: { minHeight: 84, borderRadius: 18, textAlignVertical: "top" },
  thanks: { fontFamily: fonts.medium, fontSize: 16 },
  question: { fontFamily: fonts.medium, fontSize: 17 },
  blocked: { fontFamily: fonts.medium, fontSize: 16 },
  centre: { alignItems: "center" },
});
