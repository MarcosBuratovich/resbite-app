import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { Field, useLargeText } from "./ui";
import { colors as c, fonts } from "./tokens";
import { CONNECTIONS_COPY as C } from "../domain/connectionsCopy";
import type { ConnectionPerson } from "../services/connections";

type Contacts = ReturnType<typeof import("../state/useContactInvites").useContactInvites>;

/** More than this many connections bring a search field above them. */
const SEARCH_FROM = 8;
const SEPARATOR = " · ";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** Lower case without accents, so "ines" finds Inés. */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * "Your connections · N" on Invite people (CO-03, CO-P4): each connection by first name, alphabetical, with a tick;
 * someone already on the resbite reads "Invited" in place of the tick and can't be picked again. More than eight
 * bring a search field. With no connections (or none read) the section is absent.
 */
export function ConnectionsPicker({ k }: { k: Contacts }) {
  const largeText = useLargeText();
  const free = largeText && styles.free;
  const [query, setQuery] = useState("");
  const people = useMemo(() => [...k.connections].sort((a, b) => a.name.localeCompare(b.name)), [k.connections]);
  const searching = people.length > SEARCH_FROM;
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return searching && q ? people.filter((p) => fold(p.name).includes(q)) : people;
  }, [people, query, searching]);
  if (!people.length) return null;
  return (
    <View style={styles.section}>
      <SectionTitle>{`${C.yourConnections}${SEPARATOR}${people.length}`}</SectionTitle>
      {searching && <Field label={C.searchConnections} value={query} onChangeText={setQuery} autoCorrect={false} />}
      <View>
        {shown.map((p) =>
          k.invitedUsers.has(p.userId) ? (
            <View key={p.userId} style={styles.person} accessible accessibilityLabel={`${p.name}, ${C.invitedAlready}`}>
              <Avatar name={p.name} />
              <Text style={[styles.name, free]}>{firstName(p.name)}</Text>
              <Text style={[styles.invited, free]}>{C.invitedAlready}</Text>
            </View>
          ) : (
            <PickRow
              key={p.userId}
              person={p}
              on={k.chosenUsers.has(p.userId)}
              disabled={k.busy}
              capped={k.atCap && !k.chosenUsers.has(p.userId)}
              free={free}
              onPress={() => k.toggleUser(p.userId)}
            />
          ),
        )}
      </View>
    </View>
  );
}

/** A section's title on Invite people, as the people lists' group titles. */
export function SectionTitle({ children }: { children: string }) {
  const largeText = useLargeText();
  return (
    <Text accessibilityRole="header" style={[styles.groupTitle, largeText && styles.free]}>
      {children}
    </Text>
  );
}

/**
 * The whole row is the 44 pt (or taller) target; the box drawn in it is 24 pt. `capped`: bring mode's cap is reached
 * and this person isn't picked, so the row is disabled and dimmed (`Pressable` sets `accessibilityState.disabled`).
 */
function PickRow({
  person,
  on,
  disabled,
  capped,
  free,
  onPress,
}: {
  person: ConnectionPerson;
  on: boolean;
  disabled: boolean;
  capped: boolean;
  free: false | { lineHeight: undefined };
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={C.selectPerson(person.name)}
      aria-checked={on}
      disabled={disabled || capped}
      onPress={onPress}
      style={[styles.person, capped && styles.off]}
    >
      <Avatar name={person.name} />
      <Text style={[styles.name, free]}>{firstName(person.name)}</Text>
      <View testID="tick-box" style={[styles.box, on && styles.boxOn]}>
        {on && <Check size={14} strokeWidth={3} color={c.paper} />}
      </View>
    </Pressable>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.avatar}>
      <Text style={styles.avatarText}>{(name.trim()[0] ?? "?").toLocaleUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  groupTitle: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: c.muted, letterSpacing: 0.4, textTransform: "uppercase" },
  person: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 5 },
  name: { flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: c.ink },
  invited: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: c.muted },
  free: { lineHeight: undefined },
  off: { opacity: 0.55 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: c.ink, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: c.ink },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.aquaSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.bold, fontSize: 13, color: c.aquaDark },
});
