import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check, Clock, Ellipsis, Link2, Send, UserMinus, UserPlus, X } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Button, Copy, ErrorNote, s } from "../src/design/ui";
import { IconButton, focusHeading } from "../src/design/kit";
import { GrabberSheet } from "../src/design/GrabberSheet";
import { MenuLabel, MenuRow, MenuSeparator } from "../src/design/MenuRow";
import { colors as c, fonts, space } from "../src/design/tokens";
import { EVENT_COPY, pageState, peopleGroups, type PersonAction, type PersonRow } from "../src/domain/eventPage";
import { CONNECTIONS_COPY } from "../src/domain/connectionsCopy";
import { removeGuestQuestion } from "../src/domain/eventLinks";
import { INVITE_COPY } from "../src/domain/inviteCopy";
import { invitationGateway } from "../src/services/invitations";
import { contactInviteGateway } from "../src/services/contactInvites";
import { joinRequestGateway } from "../src/services/joinRequests";
import { useApp } from "../src/state/AppState";
import { useEvent, type EventPage } from "../src/state/useEvent";
import { useResend } from "../src/state/useResend";

const ACTION_ICON: Partial<Record<PersonAction, LucideIcon>> = {
  connect: Link2,
  cancelRequest: X,
  acceptConnection: Check,
  declineConnection: X,
  makeAdmin: UserPlus,
  removeAdmin: UserMinus,
  sendAgain: Send,
  approve: Check,
  decline: X,
  remove: X,
  removeInvite: X,
};

/**
 * The people list (spec CR-P4, CR-P16, CO-01): /guests?plan=<id>. Everyone who answered, and for hosts the rest, with a
 * sheet of actions per person: the connection ones for everyone, then the hosts' own.
 */
export default function Guests() {
  const { plan: planId } = useLocalSearchParams<{ plan?: string }>();
  const event = useEvent(planId);
  if (event.plan) return <People event={event} plan={event.plan} />;
  const loading = event.busy && !event.error;
  return (
    <View style={s.page}>
      <Bar planId={planId} />
      <View style={{ paddingHorizontal: 20, gap: space.m }}>
        <ErrorNote message={event.error} />
        {loading ? <ActivityIndicator accessibilityLabel={EVENT_COPY.loading} color={c.aquaDark} /> : null}
        {!loading && !event.error ? <Copy>{EVENT_COPY.unavailable}</Copy> : null}
        {!!planId && !!event.error ? (
          <Button icon={false} secondary title={EVENT_COPY.tryAgain} disabled={event.busy} onPress={() => void event.load()} />
        ) : null}
      </View>
    </View>
  );
}

/** The title bar. Back returns to where the list was opened from, else to the resbite (else My resbites). */
function Bar({ planId }: { planId?: string }) {
  const insets = useSafeAreaInsets();
  const title = useRef<Text | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusHeading(title.current));
    return () => cancelAnimationFrame(frame);
  }, []);
  const back = () => {
    if (router.canGoBack()) router.back();
    else if (planId) router.replace({ pathname: "/event", params: { plan: planId } });
    else router.replace("/plans");
  };
  return (
    <View style={[styles.bar, { minHeight: insets.top + 56, paddingTop: insets.top }]}>
      <View style={[styles.back, { top: insets.top + 6 }]}>
        <IconButton icon={ArrowLeft} label={EVENT_COPY.back} onPress={back} />
      </View>
      <Text ref={title} accessibilityRole="header" style={styles.barTitle}>
        {EVENT_COPY.people}
      </Text>
    </View>
  );
}

type Sheet = { row: PersonRow; view: "menu" | "remove" | "decline" };

function People({ event, plan }: { event: EventPage; plan: NonNullable<EventPage["plan"]> }) {
  const { role, guests, invited, requests, admins, owner, connections } = event;
  const me = useApp().session?.user.id ?? null;
  const resend = useResend(plan, event.load);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After the end, or once cancelled, the hosts' actions go; connecting stays (CO rule 7).
  const groups = peopleGroups({
    role: role ?? "guest",
    state: pageState(plan),
    guests,
    invited,
    requests,
    admins,
    owner,
    userId: me,
    connections,
  });
  const off = working || event.acting !== null || resend.busy !== null;
  const open = (row: PersonRow) => {
    setError(null);
    resend.clearError();
    event.clearError();
    setSheet({ row, view: "menu" });
  };
  const close = () => {
    if (working) return;
    setSheet(null);
    setError(null);
  };
  /** One action at a time; on success the sheet closes and the list is read again (unless the action already did), on failure the sheet says why. */
  async function run(task: () => Promise<boolean | void>, reload = true) {
    if (off) return;
    setWorking(true);
    setError(null);
    try {
      const done = await task();
      if (done === false) return;
      setSheet(null);
      if (reload) await event.load();
    } catch (e) {
      setError(e instanceof Error ? e.message : INVITE_COPY.offline);
    } finally {
      setWorking(false);
    }
  }
  const invitee = (row: PersonRow) => invited.find((p) => p.phone === row.phone);
  /** The connection actions and the admin ones read again what they changed themselves; their errors are the event's. */
  const perform = (row: PersonRow, action: PersonAction) => {
    switch (action) {
      case "connect":
        return run(() => event.connect(row.userId!), false);
      case "cancelRequest":
        return run(() => event.cancelRequest(row.userId!), false);
      case "acceptConnection":
        return run(() => event.acceptConnection(row.userId!), false);
      case "declineConnection":
        return run(() => event.declineConnection(row.userId!), false);
      case "makeAdmin":
        return run(() => event.appoint(row.userId!), false);
      case "removeAdmin":
        return run(() => event.demote(row.userId!), false);
      case "approve":
        return run(async () => void (await joinRequestGateway.decide(plan.id, row.userId!, true)));
    }
  };
  const confirmRemove = (row: PersonRow) =>
    run(async () => {
      if (row.kind === "linkInvite") {
        const person = invitee(row);
        await contactInviteGateway.revoke(plan.id, row.phone!);
        if (person) await resend.forget(person);
      } else await invitationGateway.removeGuest(plan.id, row.userId!);
    });
  const confirmDecline = (row: PersonRow) => run(async () => void (await joinRequestGateway.decide(plan.id, row.userId!, false)));

  const current = sheet?.row ?? null;
  const shownError = error ?? resend.error ?? event.error;
  return (
    <View style={s.page}>
      <Bar planId={plan.id} />
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
                    {row.kind === "owner" ? <Badge text={EVENT_COPY.hostingBadge} /> : null}
                    {row.admin ? <Badge text={EVENT_COPY.adminBadge} /> : null}
                    {row.connection === "connected" ? <Badge text={CONNECTIONS_COPY.connectedBadge} /> : null}
                  </View>
                  {row.status ? <Text style={styles.sub}>{row.status}</Text> : null}
                </View>
                {!row.me && row.actions.length > 0 ? (
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
                {/* The group title is out of sight inside the sheet: the head says the answer, or how they were invited. */}
                {(current.status ?? current.reply) ? <Text style={styles.headSub}>{current.status ?? current.reply}</Text> : null}
              </View>
            </View>
            {sheet?.view === "menu" ? (
              <View>
                {current.connection === "connected" ? <MenuLabel title={CONNECTIONS_COPY.connectedBadge} icon={Link2} /> : null}
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
                            if (person) void run(() => resend.resend(person, via), false);
                          }}
                        />
                      ))
                    : [
                        // Asked already (or refused unseen, which reads the same, CO-P3): said, then Cancel request.
                        ...(action === "cancelRequest"
                          ? [<MenuLabel key="requestSent" title={CONNECTIONS_COPY.requestSent} icon={Clock} />]
                          : []),
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
                    : current.kind === "guest"
                      ? removeGuestQuestion(current.name)
                      : INVITE_COPY.removeInvite(current.name)}
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
  [
    row.name,
    row.kind === "owner" ? EVENT_COPY.hostingBadge : null,
    row.admin ? EVENT_COPY.adminBadge : null,
    row.connection === "connected" ? CONNECTIONS_COPY.connectedBadge : null,
    row.status,
  ]
    .filter(Boolean)
    .join(", ");

/** A small chip on the name line: Hosting, Admin, Connected. */
function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

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
    connect: CONNECTIONS_COPY.connect,
    cancelRequest: CONNECTIONS_COPY.cancelRequest,
    acceptConnection: CONNECTIONS_COPY.acceptFrom(row.name),
    declineConnection: CONNECTIONS_COPY.notNow,
    makeAdmin: EVENT_COPY.makeAdmin,
    removeAdmin: EVENT_COPY.removeAdmin,
    // An answered guest is removed from the resbite; an invitation not answered yet (in the app or by link) is removed.
    remove: row.kind === "guest" ? EVENT_COPY.removeFromResbite : EVENT_COPY.remove,
    removeInvite: EVENT_COPY.remove,
    sendAgain: via === "messages" ? EVENT_COPY.sendAgainMessages : EVENT_COPY.sendAgainWhatsApp,
    approve: EVENT_COPY.approve,
    decline: EVENT_COPY.decline,
  };
  return (
    <>
      {destructive ? <MenuSeparator /> : null}
      <MenuRow
        title={text[action]}
        hint={action === "connect" ? CONNECTIONS_COPY.connectHint(row.name) : undefined}
        icon={ACTION_ICON[action] ?? X}
        destructive={destructive}
        disabled={disabled}
        onPress={onPress}
      />
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
