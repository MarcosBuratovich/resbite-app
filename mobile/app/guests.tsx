import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check, Ellipsis, Send, UserMinus, UserPlus, X } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Button, Copy, ErrorNote, s, useLargeText } from "../src/design/ui";
import { IconButton, focusHeading } from "../src/design/kit";
import { GrabberSheet } from "../src/design/GrabberSheet";
import { MenuRow, MenuSeparator } from "../src/design/MenuRow";
import { colors as c, fonts, space } from "../src/design/tokens";
import { EVENT_COPY, peopleGroups, type PersonAction, type PersonRow } from "../src/domain/eventPage";
import { removeGuestQuestion } from "../src/domain/eventLinks";
import { INVITE_COPY } from "../src/domain/inviteCopy";
import { invitationGateway } from "../src/services/invitations";
import { contactInviteGateway } from "../src/services/contactInvites";
import { joinRequestGateway } from "../src/services/joinRequests";
import { useEvent, type EventPage } from "../src/state/useEvent";
import { useResend } from "../src/state/useResend";

const ACTION_ICON: Partial<Record<PersonAction, LucideIcon>> = {
  makeAdmin: UserPlus,
  removeAdmin: UserMinus,
  sendAgain: Send,
  approve: Check,
  decline: X,
  remove: X,
  removeInvite: X,
};

/** The people list (spec CR-P4, CR-P16): /guests?plan=<id>. Everyone who answered, and for hosts the rest, with a sheet of actions per person. */
export default function Guests() {
  const { plan: planId } = useLocalSearchParams<{ plan?: string }>();
  const event = useEvent(planId);
  return event.plan ? <People event={event} plan={event.plan} /> : <Bar error={event.error} />;
}

function Bar({ error = null }: { error?: string | null }) {
  const insets = useSafeAreaInsets();
  const title = useRef<Text | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusHeading(title.current));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <View style={s.page}>
      <View style={[styles.bar, { height: insets.top + 56, paddingTop: insets.top }]}>
        <View style={[styles.back, { top: insets.top + 6 }]}>
          <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        </View>
        <Text ref={title} accessibilityRole="header" style={styles.barTitle}>
          {EVENT_COPY.people}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <ErrorNote message={error} />
      </View>
    </View>
  );
}

type Sheet = { row: PersonRow; view: "menu" | "remove" | "decline" };

function People({ event, plan }: { event: EventPage; plan: NonNullable<EventPage["plan"]> }) {
  const { role, guests, invited, requests, admins } = event;
  const resend = useResend(plan, event.load);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = role !== "guest";
  const groups = peopleGroups({
    role: role ?? "guest",
    guests,
    invited,
    requests,
    admins,
    sentHere: resend.sentHere,
  });
  const off = working || event.acting !== null || resend.busy !== null;
  const open = (row: PersonRow) => {
    setError(null);
    setSheet({ row, view: "menu" });
  };
  const close = () => {
    if (working) return;
    setSheet(null);
    setError(null);
  };
  /** One action at a time; on success the sheet closes and the list is read again, on failure the sheet says why. */
  async function run(task: () => Promise<boolean | void>) {
    if (off) return;
    setWorking(true);
    setError(null);
    try {
      const done = await task();
      if (done === false) return;
      setSheet(null);
      await event.load();
    } catch (e) {
      setError(e instanceof Error ? e.message : INVITE_COPY.offline);
    } finally {
      setWorking(false);
    }
  }
  const invitee = (row: PersonRow) => invited.find((p) => p.phone === row.phone);
  const perform = (row: PersonRow, action: PersonAction) => {
    switch (action) {
      case "makeAdmin":
        return run(() => event.appoint(row.userId!));
      case "removeAdmin":
        return run(() => event.demote(row.userId!));
      case "approve":
        return run(async () => void (await joinRequestGateway.decide(plan.id, row.userId!, true)));
    }
  };
  const confirmRemove = (row: PersonRow) =>
    run(async () => {
      if (row.kind === "linkInvite") {
        const person = invitee(row);
        await contactInviteGateway.revoke(plan.id, row.phone!);
        if (person) await resend.forget(person.e164);
      } else await invitationGateway.removeGuest(plan.id, row.userId!);
    });
  const confirmDecline = (row: PersonRow) => run(async () => void (await joinRequestGateway.decide(plan.id, row.userId!, false)));

  const current = sheet?.row ?? null;
  const shownError = error ?? resend.error ?? event.error;
  return (
    <View style={s.page}>
      <Bar />
      <ScrollView contentContainerStyle={styles.list}>
        {!sheet && <ErrorNote message={event.error} />}
        {groups.map((group) => (
          <View key={group.title} style={{ gap: 2 }}>
            <Text accessibilityRole="header" style={styles.groupTitle}>
              {group.title}
            </Text>
            {group.rows.map((row) => (
              <View key={row.key} style={styles.person}>
                <Avatar name={row.name} />
                <View style={styles.name} accessible accessibilityLabel={nameLabel(row)}>
                  <View style={styles.nameLine}>
                    <Text style={styles.nameText}>{row.name}</Text>
                    {row.admin ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{EVENT_COPY.adminBadge}</Text>
                      </View>
                    ) : null}
                  </View>
                  {row.status ? <Text style={styles.sub}>{row.status}</Text> : null}
                </View>
                {host && row.actions.length > 0 ? (
                  <IconButton
                    icon={Ellipsis}
                    tone="plain"
                    label={`${EVENT_COPY.actionsFor}${row.name}`}
                    onPress={() => open(row)}
                  />
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
      <GrabberSheet visible={sheet !== null} onClose={close} label={current?.name}>
        {current ? (
          <>
            <View style={styles.head}>
              <Avatar name={current.name} big />
              <View style={{ flex: 1 }}>
                <Text style={styles.headName}>{current.name}</Text>
                {current.status ? <Text style={styles.headSub}>{current.status}</Text> : null}
              </View>
            </View>
            {sheet?.view === "menu" ? (
              <View>
                {current.actions.flatMap((action) =>
                  action === "sendAgain"
                    ? sendVias(invitee(current)?.stored?.sentVia).map((via) => (
                        <Row
                          key={`${action}:${via}`}
                          action={action}
                          row={current}
                          disabled={off}
                          via={via}
                          onPress={() => {
                            const person = invitee(current);
                            if (person) void run(() => resend.resend(person, via));
                          }}
                        />
                      ))
                    : [
                        <Row
                          key={action}
                          action={action}
                          row={current}
                          disabled={off}
                          onPress={() => {
                            if (action === "remove" || action === "removeInvite") setSheet({ row: current, view: "remove" });
                            else if (action === "decline") setSheet({ row: current, view: "decline" });
                            else void perform(current, action);
                          }}
                        />,
                      ],
                )}
              </View>
            ) : (
              <View style={{ gap: space.m }}>
                <Copy accessibilityRole="header">
                  {sheet?.view === "decline"
                    ? INVITE_COPY.declineQuestion(current.name)
                    : current.kind === "linkInvite"
                      ? INVITE_COPY.removeInvite(current.name)
                      : removeGuestQuestion(current.name)}
                </Copy>
                <Button
                  title={sheet?.view === "decline" ? EVENT_COPY.decline : EVENT_COPY.remove}
                  destructive
                  loading={working}
                  disabled={off}
                  onPress={() => void (sheet?.view === "decline" ? confirmDecline(current) : confirmRemove(current))}
                />
                <Button
                  title={EVENT_COPY.keepPerson}
                  secondary
                  disabled={off}
                  onPress={() => setSheet({ row: current, view: "menu" })}
                />
              </View>
            )}
            {sheet ? <ErrorNote message={shownError} /> : null}
          </>
        ) : null}
      </GrabberSheet>
    </View>
  );
}

/** Send again goes by the app the invitation went by; with none recorded, either. */
const sendVias = (sent?: "whatsapp" | "messages"): ("whatsapp" | "messages")[] => (sent ? [sent] : ["whatsapp", "messages"]);

const nameLabel = (row: PersonRow) =>
  [row.name, row.admin ? EVENT_COPY.adminBadge : null, row.status].filter(Boolean).join(", ");

function Row({
  action,
  row,
  disabled,
  onPress,
  via,
}: {
  action: PersonAction;
  row: PersonRow;
  disabled: boolean;
  onPress: () => void;
  via?: "whatsapp" | "messages";
}) {
  const destructive = action === "remove" || action === "removeInvite";
  const text: Record<PersonAction, string> = {
    makeAdmin: EVENT_COPY.makeAdmin,
    removeAdmin: EVENT_COPY.removeAdmin,
    remove: row.kind === "guest" || row.kind === "appInvite" ? EVENT_COPY.removeFromResbite : EVENT_COPY.remove,
    removeInvite: EVENT_COPY.remove,
    sendAgain: via === "messages" ? EVENT_COPY.sendAgainMessages : EVENT_COPY.sendAgainWhatsApp,
    approve: EVENT_COPY.approve,
    decline: EVENT_COPY.decline,
  };
  return (
    <>
      {destructive ? <MenuSeparator /> : null}
      <MenuRow title={text[action]} icon={ACTION_ICON[action] ?? X} destructive={destructive} disabled={disabled} onPress={onPress} />
    </>
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
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  groupTitle: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: c.muted, letterSpacing: 0.4, textTransform: "uppercase", marginTop: 6 },
  person: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 6 },
  name: { flex: 1, gap: 1 },
  nameLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  nameText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: c.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: c.muted },
  badge: { backgroundColor: c.aquaSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  badgeText: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 16, color: c.aquaDark },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.aquaSoft, alignItems: "center", justifyContent: "center" },
  avatarBig: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { fontFamily: fonts.bold, fontSize: 13, color: c.aquaDark },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headName: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: c.ink },
  headSub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.muted },
});
