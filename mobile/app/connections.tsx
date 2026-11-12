import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, Ban, Ellipsis, Flag, Unlink2 } from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction, s, useLargeText } from "../src/design/ui";
import { IconButton, focusHeading } from "../src/design/kit";
import { GrabberSheet } from "../src/design/GrabberSheet";
import { MenuRow } from "../src/design/MenuRow";
import { BlockQuestion, ReportSheet } from "../src/design/ReportSheet";
import { useAnnounce } from "../src/design/useAnnounce";
import { colors as c, depth, fonts, r, space } from "../src/design/tokens";
import { CONNECTIONS_COPY as C, requestLine } from "../src/domain/connectionsCopy";
import { EVENT_COPY } from "../src/domain/eventPage";
import { SAFETY_COPY, shownName } from "../src/domain/safetyCopy";
import type { ConnectionPerson } from "../src/services/connections";
import { actionErrorFor, useConnections } from "../src/state/useConnections";

const SEPARATOR = " · ";

/** Where a connection began. */
const metLine = (p: ConnectionPerson) => (p.title === null ? C.metOnResbite : C.metAt(p.title));

/**
 * A person's sheet: a connection's (Remove connection, then Block) or, plan 3, a request card's (Report, then Block),
 * with Remove's question, the report or the block confirm in place (challenge I3).
 */
type Sheet = { person: ConnectionPerson; from: "request" | "connection"; view: "menu" | "remove" | "report" | "block" };

/**
 * Connections (CO-02, CO-P6): /connections, from Profile or a connection push. Requests first, newest first, each a
 * card with Accept and Not now (stacked under Larger Text); then the connections by name, each with the three dots
 * for Remove connection and its in-place confirm. A decision the server takes changes the list at once. A read that
 * fails says why above the list it kept, with Try again; that line stays while a retry runs and goes only when a read
 * succeeds, whatever sheet opens or closes. A decision that fails says why in its own card or sheet (Ruling 8).
 */
export default function Connections() {
  const k = useConnections();
  const largeText = useLargeText();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // After a block (ruling SR6 Q4): "Blocked <name>." in a polite live region (said aloud on iPhone), and focus on the next
  // card or row, else a heading, once the sheet has gone.
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  useAnnounce(blockedNotice);
  const nameRefs = useRef(new Map<string, View>());
  const requestsHeading = useRef<Text | null>(null);
  const connectedHeading = useRef<Text | null>(null);
  const titleRef = useRef<Text | null>(null);
  const focusNext = useRef<(() => View | Text | null) | null>(null);
  const moveFocus = () => {
    const target = focusNext.current?.() ?? null;
    focusNext.current = null;
    if (target) focusHeading(target);
  };
  // Android's Modal says nothing when it has closed: there focus moves as soon as the sheet is off.
  useEffect(() => {
    if (Platform.OS === "android" && !sheet) moveFocus();
  });
  // Keep after the block confirm gives focus back to Block (H32 Q53, ruling SR6 D1).
  const blockRow = useRef<View | null>(null);
  const backToBlock = useRef(false);
  useEffect(() => {
    if (sheet?.view !== "menu" || !backToBlock.current) return;
    backToBlock.current = false;
    const frame = requestAnimationFrame(() => focusHeading(blockRow.current));
    return () => cancelAnimationFrame(frame);
  }, [sheet?.view, sheet?.person.userId]);
  const data = k.data;
  const off = k.acting !== null;
  const loading = !data && k.busy && !k.readError;
  const retry = () => void k.load();
  const open = (person: ConnectionPerson, from: Sheet["from"] = "connection") => {
    k.sheetMoved();
    setBlockedNotice(null);
    setSheet({ person, from, view: "menu" });
  };
  const close = () => {
    if (off) return;
    setSheet(null);
    k.sheetMoved();
  };
  /** On success the sheet closes over the shorter list; on failure it stays and says why. */
  const confirmRemove = async (person: ConnectionPerson) => {
    if (await k.remove(person.userId)) setSheet(null);
  };
  const current = sheet?.person ?? null;
  const free = largeText && styles.free;
  /**
   * After a block the sheet closes and the list is read again: the server no longer lists them (I3). It says so by name,
   * and focus goes to the next card or row in the same group, else that group's heading while it still has someone,
   * else the other group's heading, else the screen's title (ruling SR6 Q4).
   */
  const afterBlock = () => {
    if (sheet && data) {
      const { person, from } = sheet;
      const group = from === "request" ? data.requests : data.connected;
      const other = from === "request" ? data.connected : data.requests;
      const next = group[group.findIndex((p) => p.userId === person.userId) + 1] ?? null;
      const heading = (which: "request" | "connection") => (which === "request" ? requestsHeading.current : connectedHeading.current);
      focusNext.current = () =>
        next
          ? (nameRefs.current.get(next.userId) ?? null)
          : group.length > 1
            ? heading(from)
            : other.length > 0
              ? heading(from === "request" ? "connection" : "request")
              : titleRef.current;
      setBlockedNotice(SAFETY_COPY.blockedName(shownName(person.name)));
    }
    setSheet(null);
    k.sheetMoved();
    void k.load();
  };
  /** Each card's and row's name, so focus can move to it after a block. */
  const nameRef = (userId: string) => (node: View | null) => {
    if (node) nameRefs.current.set(userId, node);
    else nameRefs.current.delete(userId);
  };
  return (
    <View style={s.page}>
      <Bar titleRef={titleRef} />
      {!data ? (
        <View style={styles.state}>
          <ErrorNote message={k.readError} />
          {loading ? <ActivityIndicator accessibilityLabel={C.loading} color={c.aquaDark} /> : null}
          {k.readError ? (
            <Button
              icon={false}
              secondary
              title={EVENT_COPY.tryAgain}
              loading={k.busy}
              disabled={off}
              onPress={retry}
            />
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {k.readError ? (
            <View>
              <ErrorNote message={k.readError} />
              <TextAction title={EVENT_COPY.tryAgain} busy={k.busy} disabled={off} onPress={retry} />
            </View>
          ) : null}
          {blockedNotice ? (
            <Copy accessibilityLiveRegion="polite" style={styles.notice}>
              {blockedNotice}
            </Copy>
          ) : null}
          {data.requests.length > 0 ? (
            <View style={styles.group}>
              <Text ref={requestsHeading} accessibilityRole="header" style={[styles.groupTitle, free]}>
                {`${C.requests}${SEPARATOR}${data.requests.length}`}
              </Text>
              {data.requests.map((person) => {
                const deciding = k.acting?.userId === person.userId ? k.acting.decision : null;
                return (
                  <View key={person.userId} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Avatar name={person.name} />
                      <View
                        ref={nameRef(person.userId)}
                        style={styles.name}
                        accessible
                        accessibilityLabel={`${person.name}, ${requestLine(person.context, person.title)}`}
                      >
                        <Text style={[styles.nameText, free]}>{person.name}</Text>
                        <Text style={[styles.sub, free]}>{requestLine(person.context, person.title)}</Text>
                      </View>
                      {/* Plan 3 (I3): Report and Block for the person asking. */}
                      <IconButton
                        icon={Ellipsis}
                        tone="plain"
                        label={`${EVENT_COPY.actionsFor}${person.name}`}
                        disabled={off}
                        onPress={() => open(person, "request")}
                      />
                    </View>
                    <View style={[styles.pills, largeText && styles.pillsStacked]}>
                      <View style={!largeText && styles.pill}>
                        <Button
                          title={C.accept}
                          label={C.acceptFrom(person.name)}
                          icon={false}
                          loading={deciding === "accept"}
                          disabled={off}
                          onPress={() => void k.accept(person.userId)}
                        />
                      </View>
                      <View style={!largeText && styles.pill}>
                        <Button
                          title={C.notNow}
                          label={C.notNowFrom(person.name)}
                          icon={false}
                          secondary
                          loading={deciding === "decline"}
                          disabled={off}
                          onPress={() => void k.decline(person.userId)}
                        />
                      </View>
                    </View>
                    <ErrorNote message={actionErrorFor(k.actionError, person.userId, "card")} />
                  </View>
                );
              })}
            </View>
          ) : null}
          {data.connected.length > 0 ? (
            <View style={styles.group}>
              <Text ref={connectedHeading} accessibilityRole="header" style={[styles.groupTitle, free]}>
                {`${C.connected}${SEPARATOR}${data.connected.length}`}
              </Text>
              <View style={{ gap: 2 }}>
                {data.connected.map((person) => (
                  <View key={person.userId} style={styles.person}>
                    <Avatar name={person.name} />
                    <View ref={nameRef(person.userId)} style={styles.name} accessible accessibilityLabel={`${person.name}, ${metLine(person)}`}>
                      <Text style={[styles.nameText, free]}>{person.name}</Text>
                      <Text style={[styles.sub, free]}>{metLine(person)}</Text>
                    </View>
                    <IconButton
                      icon={Ellipsis}
                      tone="plain"
                      label={`${EVENT_COPY.actionsFor}${person.name}`}
                      disabled={off}
                      onPress={() => open(person)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {data.requests.length === 0 && data.connected.length === 0 ? (
            <Copy>{C.empty}</Copy>
          ) : (
            <Copy style={styles.hint}>{C.noSearch}</Copy>
          )}
        </ScrollView>
      )}
      <GrabberSheet visible={sheet !== null} onClose={close} onDismissed={moveFocus} label={current?.name}>
        {current ? (
          <>
            <View style={styles.head}>
              <Avatar name={current.name} big />
              <View style={{ flex: 1 }}>
                <Text style={[styles.headName, free]}>{current.name}</Text>
                <Text style={[styles.headSub, free]}>
                  {sheet?.from === "request" ? requestLine(current.context, current.title) : metLine(current)}
                </Text>
              </View>
            </View>
            {sheet?.view === "report" && current.seriesId ? (
              // Report the person, on the resbite the request came from (G-S9's waiting-request clause).
              <ReportSheet
                target={{ kind: "user", userId: current.userId, series: current.seriesId, name: current.name }}
                onDone={close}
              />
            ) : sheet?.view === "block" ? (
              <BlockQuestion
                userId={current.userId}
                name={current.name}
                youHost={false}
                theyHost={false}
                onBlocked={afterBlock}
                onKeep={() => {
                  backToBlock.current = true;
                  setSheet({ ...sheet, view: "menu" });
                }}
              />
            ) : sheet?.view === "menu" ? (
              <View>
                {sheet.from === "connection" ? (
                  <MenuRow
                    title={C.remove}
                    icon={Unlink2}
                    destructive
                    disabled={off}
                    onPress={() => setSheet({ ...sheet, view: "remove" })}
                  />
                ) : current.seriesId ? (
                  // A connection has no Report: the ruling gives Report to request cards only (I3).
                  <MenuRow
                    title={SAFETY_COPY.reportPerson(shownName(current.name))}
                    icon={Flag}
                    disabled={off}
                    onPress={() => setSheet({ ...sheet, view: "report" })}
                  />
                ) : null}
                <MenuRow
                  ref={blockRow}
                  title={SAFETY_COPY.block(shownName(current.name))}
                  icon={Ban}
                  destructive
                  disabled={off}
                  onPress={() => setSheet({ ...sheet, view: "block" })}
                />
              </View>
            ) : (
              <View style={{ gap: space.m }}>
                <Copy accessibilityRole="header">{C.removeQuestion(current.name)}</Copy>
                <Button
                  title={EVENT_COPY.remove}
                  destructive
                  loading={k.acting?.decision === "remove"}
                  disabled={off}
                  onPress={() => void confirmRemove(current)}
                />
                <Button title={C.keep} secondary disabled={off} onPress={() => sheet && setSheet({ ...sheet, view: "menu" })} />
              </View>
            )}
            <ErrorNote message={actionErrorFor(k.actionError, current.userId, "sheet")} />
          </>
        ) : null}
      </GrabberSheet>
    </View>
  );
}

/** The title bar, as on the people list. Back returns to where Connections was opened from, else to Profile. */
function Bar({ titleRef }: { titleRef?: React.MutableRefObject<Text | null> }) {
  const insets = useSafeAreaInsets();
  const own = useRef<Text | null>(null);
  const title = titleRef ?? own;
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusHeading(title.current));
    return () => cancelAnimationFrame(frame);
  }, []);
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/profile");
  };
  return (
    <View style={[styles.bar, { minHeight: insets.top + 56, paddingTop: insets.top }]}>
      <View style={[styles.back, { top: insets.top + 6 }]}>
        <IconButton icon={ArrowLeft} label={EVENT_COPY.back} onPress={back} />
      </View>
      <Text ref={title} accessibilityRole="header" style={styles.barTitle}>
        {C.heading}
      </Text>
    </View>
  );
}

function Avatar({ name, big = false }: { name: string; big?: boolean }) {
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" style={[styles.avatar, big && styles.avatarBig]}>
      <Text style={[styles.avatarText, big && { fontSize: 15 }]}>{(name.trim()[0] ?? "?").toLocaleUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { justifyContent: "center", alignItems: "center", paddingHorizontal: 16 + 44 + space.m },
  back: { position: "absolute", left: 16 },
  barTitle: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 22, color: c.ink, textAlign: "center" },
  state: { paddingHorizontal: 20, gap: space.m },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  group: { gap: 10 },
  groupTitle: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: c.muted, letterSpacing: 0.4, textTransform: "uppercase", marginTop: 6 },
  card: {
    gap: space.m,
    padding: 14,
    borderRadius: r.tile,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    backgroundColor: c.paper,
    boxShadow: depth.card,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  pills: { flexDirection: "row", gap: space.s },
  // Under Larger Text the pills stack, each as wide as the card.
  pillsStacked: { flexDirection: "column" },
  pill: { flex: 1 },
  person: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 6 },
  name: { flex: 1, gap: 1 },
  nameText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: c.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: c.muted },
  free: { lineHeight: undefined },
  hint: { fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 4 },
  notice: { fontFamily: fonts.medium, fontSize: 14 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.aquaSoft, alignItems: "center", justifyContent: "center" },
  avatarBig: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { fontFamily: fonts.bold, fontSize: 13, color: c.aquaDark },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headName: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: c.ink },
  headSub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.muted },
});
