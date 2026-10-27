import React, { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { Check, ContactRound, Settings2 } from "lucide-react-native";
import { Button, Copy, ErrorNote, Field, s } from "./ui";
import { Chip, IconButton, InfoSheet, Tile } from "./kit";
import { colors as c } from "./tokens";
import { INVITE_COPY as T } from "../domain/inviteCopy";
import { groupContacts, type ContactNumber } from "../domain/contactInvites";
import type { Outcome, Sendable } from "../state/useContactInvites";

const chipName = (n: ContactNumber) => (n.name === n.label ? n.label : n.name.split(" ")[0] || n.name);

type Contacts = ReturnType<typeof import("../state/useContactInvites").useContactInvites>;

type Group = ReturnType<typeof groupContacts>[number];

function Row({ g, chosen, badge, onPress }: { g: Group; chosen?: ContactNumber; badge: boolean; onPress: () => void }) {
  const detail = chosen?.label ?? (g.numbers.length > 1 ? T.numbersCount(g.numbers.length) : g.numbers[0].label);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${g.name}, ${detail}${badge ? `, ${T.onResbite}` : ""}`}
      accessibilityHint={T.rowHint}
      aria-checked={!!chosen}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.who}>
        <Copy style={styles.name}>{g.name}</Copy>
        {badge ? <Chip text={T.onResbite} tone="aqua" /> : g.name !== detail ? <Copy style={s.muted}>{detail}</Copy> : null}
      </View>
      <View style={[styles.box, !!chosen && styles.boxOn]}>{!!chosen && <Check size={14} color={c.paper} />}</View>
    </Pressable>
  );
}

/** Step 1: search, picked chips, contact list, manual number, and the Invite button. */
export function PickStep({ k, previewing }: { k: Contacts; previewing: boolean }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<Group | null>(null);
  const groups = groupContacts(k.visible);
  const web = k.access === "web" || Platform.OS === "web";
  function add() {
    const bad = k.addNumber(name, number);
    setProblem(bad);
    if (!bad) {
      setName("");
      setNumber("");
    }
  }
  const settings = () => void Linking.openSettings().catch(() => k.setError(T.settingsFailed));
  return (
    <View style={{ gap: 14 }}>
      {previewing && <Copy>{T.previewNotice}</Copy>}
      {k.selected.length > 0 && (
        <View style={styles.chips}>
          {k.selected.map((n) => (
            <Chip key={n.key} text={`${chipName(n)} ✕`} label={T.removeChip(n.name)} onPress={() => k.toggle(n)} />
          ))}
        </View>
      )}
      <Field label={T.search} value={k.query} onChangeText={k.setQuery} />
      <ErrorNote message={k.error} />
      {!web && (
        <View style={styles.inline}>
          <View style={{ flex: 1 }}>
            <Tile icon={ContactRound} title={T.chooseContacts} disabled={k.busy} onPress={() => void k.loadContacts()} />
          </View>
          {k.access === "denied" && (
            <IconButton icon={Settings2} label={T.contactsSettings} onPress={settings} />
          )}
        </View>
      )}
      {web && <Copy style={s.muted}>{T.webContacts}</Copy>}
      {k.limited && (
        <>
          <Chip text={T.limitedAccess} label={T.limitedLabel} />
          <Button title={T.allowMore} secondary disabled={k.busy} onPress={() => void k.loadContacts(0, true)} />
        </>
      )}
      {k.skipped > 0 && <Chip text={T.skipped(k.skipped)} label={T.skippedLabel(k.skipped)} />}
      {groups.length > 0 ? (
        <View style={[s.card, { paddingVertical: 4, paddingHorizontal: 14 }]}>
          {groups.map((g) => {
            const chosen = k.picked[g.contact];
            return (
              <Row
                key={g.contact}
                g={g}
                chosen={chosen}
                badge={!!chosen && k.onResbite.has(chosen.e164.replace(/\D/g, ""))}
                onPress={() => (g.numbers.length === 1 ? k.toggle(g.numbers[0]) : setChoosing(g))}
              />
            );
          })}
        </View>
      ) : (
        k.access === "ready" && <Copy style={s.muted}>{T.noContacts}</Copy>
      )}
      {k.more && <Button title={T.loadMore} secondary disabled={k.busy} onPress={() => void k.loadContacts(k.offset)} />}
      <View style={[s.card, { padding: 16, gap: 12 }]}>
        <Copy style={styles.heading}>{T.addNumber}</Copy>
        <Field label={T.nameLabel} value={name} onChangeText={setName} maxLength={80} />
        <Field
          label={T.numberLabel}
          value={number}
          onChangeText={setNumber}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <ErrorNote message={problem} />
        <Button title={T.addButton} secondary disabled={!number.trim()} onPress={add} />
      </View>
      <View style={{ gap: 6 }}>
        <Button
          title={T.invite(k.selected.length)}
          hint={T.inviteHint}
          disabled={k.selected.length === 0 || k.busy || previewing}
          loading={k.busy}
          onPress={() => void k.invite()}
        />
        <Copy style={[s.muted, { textAlign: "center", fontSize: 12 }]}>{T.lookupNote}</Copy>
      </View>
      <InfoSheet visible={!!choosing} title={T.chooseNumber} onClose={() => setChoosing(null)}>
        {choosing?.numbers.map((n) => (
          <Tile
            key={n.key}
            title={n.label}
            subtitle={choosing.name}
            role="checkbox"
            selected={k.picked[n.contact]?.key === n.key}
            onPress={() => {
              k.choose(n);
              setChoosing(null);
            }}
          />
        ))}
      </InfoSheet>
    </View>
  );
}

function LinkRow({ item, onSend }: { item: Sendable; onSend: (via: "whatsapp" | "messages") => void }) {
  const sent = item.sentVia ? (item.sentVia === "whatsapp" ? T.sentWhatsapp : T.sentMessages) : null;
  return (
    <View style={styles.row}>
      <View style={styles.who}>
        <Copy style={styles.name}>{item.number.name}</Copy>
        {item.number.name !== item.number.label && <Copy style={s.muted}>{item.number.label}</Copy>}
        {sent && <Chip icon={Check} tone="aqua" text={sent} />}
        <View style={styles.chips}>
          <Chip text={T.whatsapp} label={`${T.whatsapp}: ${item.number.name}`} hint={T.whatsappHint} onPress={() => onSend("whatsapp")} />
          <Chip text={T.messages} label={`${T.messages}: ${item.number.name}`} hint={T.messagesHint} onPress={() => onSend("messages")} />
        </View>
      </View>
    </View>
  );
}

/** Step 2: who is invited in the app, and each personal link to send from this phone. */
export function SendStep({
  outcome,
  error,
  onSend,
  onDone,
}: {
  outcome: Outcome;
  error: string | null;
  onSend: (item: Sendable, via: "whatsapp" | "messages") => void;
  onDone: () => void;
}) {
  return (
    <View style={{ gap: 14 }}>
      {outcome.inApp.length > 0 && (
        <View style={styles.ok} accessibilityLiveRegion="polite">
          <Copy style={{ color: c.aquaDark }}>{T.invitedInApp(outcome.inApp)}</Copy>
        </View>
      )}
      {outcome.already.length > 0 && (
        <Copy style={s.muted}>{`${T.alreadyInvited}: ${outcome.already.join(", ")}`}</Copy>
      )}
      <ErrorNote message={error} />
      {outcome.links.length > 0 && (
        <>
          <Copy style={styles.heading}>{T.notYet}</Copy>
          <View style={[s.card, { paddingVertical: 4, paddingHorizontal: 14 }]}>
            {outcome.links.map((l) => (
              <LinkRow key={l.number.key} item={l} onSend={(via) => onSend(l, via)} />
            ))}
          </View>
          <Copy style={[s.muted, { fontSize: 12 }]}>{T.linkNote}</Copy>
        </>
      )}
      <Button title={T.done} secondary onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.line,
  },
  who: { flex: 1, gap: 4, alignItems: "flex-start" },
  name: { fontWeight: "600" },
  heading: { fontWeight: "700", color: c.muted, textTransform: "uppercase", fontSize: 12 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: "#cfc9d6", alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: c.aquaDark, borderColor: c.aquaDark },
  ok: { backgroundColor: c.aquaSoft, borderRadius: 14, padding: 12 },
});
