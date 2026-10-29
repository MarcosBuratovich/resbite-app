import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Calendar,
  CalendarPlus,
  CalendarX,
  Check,
  ChevronRight,
  Copy as CopyIcon,
  Ellipsis,
  MapPin,
  MessageCircle,
  Pencil,
  RefreshCw,
  Repeat,
  Send,
} from "lucide-react-native";
import { Button, Copy, ErrorNote, Reveal, s } from "../src/design/ui";
import { MenuRow, MenuSeparator } from "../src/design/MenuRow";
import { ActionBar, ReplyPill, type BarAction } from "../src/design/ActionBar";
import { AvatarStack, Chip, chipToneFor, IconButton, Segmented } from "../src/design/kit";
import { ContentPage } from "../src/design/ContentPage";
import { GrabberSheet } from "../src/design/GrabberSheet";
import { PreviewNotice } from "../src/design/Chrome";
import { NotificationAsk } from "../src/design/NotificationAsk";
import { MeetingDetails } from "../src/design/EventNotes";
import { categoryIcons } from "../src/design/categories";
import { colors as c, fonts, space } from "../src/design/tokens";
import { categoryLabels } from "../src/domain/categories";
import { eventPicture } from "../src/domain/events";
import { meetingDetailsView } from "../src/domain/eventDetails";
import { coverNotice, mapsUrl } from "../src/domain/eventView";
import {
  bottomRow,
  byline,
  cancelQuestion,
  EVENT_COPY,
  hostLabel,
  moreRows,
  namesLine,
  pageState,
  peopleCounts,
  peopleRowText,
  placeLine,
  showsNames,
  stateChip,
  whenLines,
} from "../src/domain/eventPage";
import { ANSWER_OPTIONS, answerKey, canRespond, responseFor } from "../src/domain/rsvp";
import { useApp } from "../src/state/AppState";
import { useEvent } from "../src/state/useEvent";
import { useEventDevice } from "../src/state/useEventDevice";

// The last saved-edit notice already shown, so a remount or web history restoring the same URL never
// repeats it (as on My resbites). Each save passes a fresh `notice` id (UX2-D1).
let shownNotice: string | undefined;

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** One page for both roles (spec CR-06, CR-06a, CR-07): /event?plan=<id>. */
export default function EventPage() {
  const { plan: planId, notice, cover } = useLocalSearchParams<{ plan?: string; notice?: string; cover?: string }>();
  const { preview } = useApp();
  const event = useEvent(planId);
  const pathname = usePathname();
  const [toast, setToast] = useState<string>();
  useEffect(() => {
    // Leaving the event page ends the toast; a notice id is shown at most once.
    if (pathname !== "/event") setToast(undefined);
    else if (notice && notice !== shownNotice) {
      shownNotice = notice;
      setToast(notice);
    }
  }, [notice, pathname]);
  const [moreOpen, setMoreOpen] = useState(false);
  // The More sheet changes its own content (GL 5): the rows, the answer control, or the cancel question.
  const [moreView, setMoreView] = useState<"rows" | "reply" | "cancel">("rows");
  const [answerOpen, setAnswerOpen] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  // One Do this again at a time: a quick double tap must not stack two plan screens. Back on this page lets it go again.
  const againOpen = useRef(false);
  useEffect(() => {
    if (pathname === "/event") againOpen.current = false;
  }, [pathname]);
  const { plan, role, attendee, guests, invited, requests, busy, fresh, pending } = event;
  const device = useEventDevice(plan, { owner: role === "owner", response: attendee?.response ?? null });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/plans"));

  if (!plan || !role)
    return (
      <SafeAreaView style={s.page}>
        <ScrollView contentContainerStyle={s.body}>
          <IconButton icon={ArrowLeft} label="Back" onPress={back} />
          <ErrorNote message={event.error} />
          {busy ? (
            <Copy accessibilityLiveRegion="polite">Opening your resbite…</Copy>
          ) : (
            !event.error && <Copy>This resbite isn’t available.</Copy>
          )}
          {!preview && (
            <IconButton icon={RefreshCw} label="Refresh invitation" busy={busy} onPress={() => void event.load()} />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  const current = plan;
  const host = role !== "guest";
  const response = attendee?.response ?? null;
  const allowed = attendee ? canRespond({ plan: current, attendee }) : false;
  const state = pageState(current);
  const zone = current.time_zone ?? deviceZone();
  const when = whenLines(current, zone);
  const where = placeLine(current, { role, response });
  const mapsTarget = where.maps ? mapsUrl(current) : null;
  const stateText = stateChip(current);
  // UX3-D5/D6: Meeting details reach only the organizer and Going or Maybe guests (the database sends them
  // only to them); the Note to guests is pinned for everyone.
  const details = meetingDetailsView({
    owner: host,
    response,
    // A locked line only while answering can still unlock it.
    hasDetails: Boolean(current.has_meeting_details) && (host || allowed),
    text: current.note,
  });
  const guestNote = current.guest_note?.trim() ?? "";
  const tag = hostLabel(role);
  const organizer = event.organizer?.trim();
  const counts = peopleCounts({ guests, invited, requests });
  const answeredGuest = showsNames(role, response);
  const going = guests.filter((g) => g.response === "accepted").map((g) => g.name);
  const row = bottomRow({ role, state, response });
  const rows = moreRows({ role, state, muted: event.muted, response });
  const hasMore = rows.length > 0;
  const closeMore = () => setMoreOpen(false);

  // Do this again: the plan screen opens on a copy of this resbite, with no date yet.
  function again() {
    if (againOpen.current) return;
    againOpen.current = true;
    closeMore();
    router.push({ pathname: "/arrange", params: { again: current.id } });
  }
  function invite() {
    if (preview) {
      event.setNotice("Invitations are disabled in design preview. Real invitations need an approved tester account.");
      return;
    }
    router.push({ pathname: "/invitations", params: { plan: current.id } });
  }
  // Maps opens only when tapped (benchmark row 6); a failure is said, never swallowed.
  function openMaps(target: string) {
    setMapsError(null);
    Linking.openURL(target).catch(() => setMapsError("Couldn’t open Maps."));
  }
  function openPeople() {
    // /guests arrives with the people list (Task 6); until its route exists the typed route does not know it.
    router.push({ pathname: "/guests" as never, params: { plan: current.id } });
  }
  const answerControl = (after?: () => void | Promise<void>) =>
    attendee ? (
      <Segmented
        label={EVENT_COPY.yourAnswer}
        options={ANSWER_OPTIONS}
        value={answerKey(attendee.response)}
        onChange={(key) => {
          void (async () => {
            await event.respond(responseFor(key, attendee.response));
            await after?.();
          })();
        }}
        disabled={busy || !fresh || pending !== null}
      />
    ) : null;
  // An admin who can't go stops being one on the server; the page reloads and shows the guest view.
  const afterMoreReply = async () => {
    closeMore();
    if (role === "admin" && response !== null) await event.load();
  };
  const question = cancelQuestion(current, zone);
  function cancelResbite(stop: boolean) {
    closeMore();
    void event.cancel({ stopRepeating: stop });
  }
  const calendarTitle = device.calendarUpdate ? EVENT_COPY.updateCalendar : EVENT_COPY.addToCalendar;
  const acting = event.acting !== null;
  const moreRow = (row: (typeof rows)[number]) => {
    switch (row) {
      case "calendar":
        return (
          <MenuRow
            key={row}
            title={calendarTitle}
            icon={CalendarPlus}
            onPress={() => {
              closeMore();
              device.addToCalendar();
            }}
          />
        );
      case "mute":
      case "unmute":
        return (
          <MenuRow
            key={row}
            title={row === "mute" ? EVENT_COPY.mute : EVENT_COPY.unmute}
            icon={row === "mute" ? BellOff : Bell}
            onPress={() => {
              if (!acting) void event.mute(row === "mute");
            }}
          />
        );
      case "again":
        return <MenuRow key={row} title={EVENT_COPY.doThisAgain} icon={CopyIcon} onPress={again} />;
      case "changeReply":
        return attendee ? (
          <MenuRow key={row} title={EVENT_COPY.changeMyReply} icon={MessageCircle} onPress={() => setMoreView("reply")} />
        ) : null;
      case "cancel":
        return (
          <React.Fragment key={row}>
            <MenuSeparator />
            <MenuRow title={EVENT_COPY.cancelResbite} icon={CalendarX} destructive onPress={() => setMoreView("cancel")} />
          </React.Fragment>
        );
    }
  };
  const more: BarAction = {
    key: "more",
    title: EVENT_COPY.moreButton,
    icon: Ellipsis,
    onPress: () => {
      setMoreView("rows");
      setMoreOpen(true);
    },
  };

  let bottom: React.ReactNode = null;
  if (row.kind === "host")
    bottom = (
      <ActionBar
        actions={[
          { key: "invite", title: EVENT_COPY.invite, icon: Send, primary: true, onPress: invite },
          {
            key: "edit",
            title: EVENT_COPY.edit,
            icon: Pencil,
            label: `${EVENT_COPY.edit} ${current.title}`,
            onPress: () => router.push({ pathname: "/arrange", params: { plan: current.id } }),
          },
          more,
        ]}
      />
    );
  else if (row.kind === "again")
    bottom = (
      <ActionBar actions={[{ key: "again", title: EVENT_COPY.doThisAgain, icon: Repeat, primary: true, onPress: again }]} />
    );
  else if (row.kind === "reply")
    bottom = (
      <ActionBar
        lead={<ReplyPill text={row.text} onChange={row.change ? () => setAnswerOpen(true) : undefined} />}
        actions={hasMore ? [more] : []}
      />
    );
  else if (row.kind === "answer")
    bottom = (
      <View style={styles.answer}>{answerControl()}</View>
    );

  return (
    <>
      <ContentPage
        title={current.title}
        picture={eventPicture(current)}
        pictureLabel={current.cover_description}
        dimmed={current.status === "cancelled"}
        onBack={back}
        topRight={<PreviewNotice dismissible={false} />}
        bottom={bottom}
      >
        {!!notice && toast === notice && (
          <Reveal style={{ alignSelf: "flex-start" }}>
            <View accessibilityLiveRegion="polite">
              <Chip icon={Check} tone="aqua" text={preview ? "Preview changes saved" : "Changes saved"} />
            </View>
          </Reveal>
        )}
        <ErrorNote message={coverNotice(cover)} />
        {!!stateText && (
          <View style={styles.chips}>
            <Chip text={stateText} tone={chipToneFor(stateText)} />
          </View>
        )}
        {tag ? (
          <View style={{ alignSelf: "flex-start" }}>
            <Chip tone="aqua" text={tag} />
          </View>
        ) : (
          !!organizer && <Copy style={s.muted}>{byline(organizer)}</Copy>
        )}
        <View style={styles.row}>
          <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Calendar size={24} strokeWidth={1.8} color={c.ink} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.small}>{EVENT_COPY.when}</Text>
            <Copy style={styles.value}>{when.line}</Copy>
            {!!when.second && <Copy style={s.muted}>{when.second}</Copy>}
          </View>
        </View>
        <PlaceRow
          text={where.text}
          onOpen={mapsTarget ? () => openMaps(mapsTarget) : undefined}
          label={`Open ${current.place_label.trim()} in Maps`}
        />
        <ErrorNote message={mapsError} />
        <ErrorNote message={device.error} />
        {!!guestNote && (
          <View style={{ gap: 2 }}>
            <Text style={styles.small}>{EVENT_COPY.noteToGuests}</Text>
            <Copy>{guestNote}</Copy>
          </View>
        )}
        <MeetingDetails view={details} owner={host} place={current.place_label} />
        <PeopleRow
          text={peopleRowText(counts, host)}
          names={answeredGuest ? going : []}
          onOpen={answeredGuest ? openPeople : undefined}
        />
        {!!current.description && <Copy>{current.description}</Copy>}
        {current.categories.length > 0 && (
          <View style={styles.chips}>
            {current.categories.map((key) => (
              <Chip key={key} text={categoryLabels[key]} category={key} icon={categoryIcons[key]} />
            ))}
          </View>
        )}
        <ErrorNote message={event.error} />
        {!!event.notice && (
          <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
            {event.notice}
          </Copy>
        )}
        {pending && (
          <Button
            icon={false}
            secondary
            title="Retry my response"
            disabled={busy}
            onPress={() => void event.respond(pending.response, pending)}
          />
        )}
        {!preview && !!event.error && (
          <Button icon={false} secondary title="Refresh invitation" disabled={busy} onPress={() => void event.load()} />
        )}
      </ContentPage>
      <NotificationAsk ask={device.ask} />
      <GrabberSheet
        visible={moreOpen}
        title={moreView === "reply" ? EVENT_COPY.yourAnswer : moreView === "cancel" ? question.title : undefined}
        label={EVENT_COPY.moreButton}
        onClose={closeMore}
      >
        {moreView === "rows" && rows.map(moreRow)}
        {moreView === "reply" && answerControl(afterMoreReply)}
        {moreView === "cancel" && (
          <>
            {!!question.line && <Copy>{question.line}</Copy>}
            {question.actions.map((action) => (
              <Button
                key={action.key}
                large
                icon={false}
                title={action.title}
                destructive={!action.stop}
                secondary={action.stop}
                errorInk={action.stop}
                onPress={() => cancelResbite(action.stop)}
              />
            ))}
            <Button large icon={false} secondary title={question.keep} onPress={() => setMoreView("rows")} />
          </>
        )}
      </GrabberSheet>
      <GrabberSheet visible={answerOpen} title={EVENT_COPY.yourAnswer} onClose={() => setAnswerOpen(false)}>
        {answerControl(() => setAnswerOpen(false))}
      </GrabberSheet>
    </>
  );
}

/** The Where row: the place as text, and a button to open Maps only when the exact place is known. */
function PlaceRow({ text, onOpen, label }: { text: string; onOpen?: () => void; label: string }) {
  const body = (
    <>
      <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <MapPin size={24} strokeWidth={1.8} color={c.ink} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.small}>{EVENT_COPY.where}</Text>
        <Copy style={styles.value}>{text}</Copy>
      </View>
      {onOpen && (
        <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <ChevronRight size={20} strokeWidth={1.8} color={c.muted} />
        </View>
      )}
    </>
  );
  if (!onOpen) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen} style={styles.row}>
      {body}
    </Pressable>
  );
}

/** The people row: the counts in bold, then avatars and first names; a button to the people list when `onOpen` is given. */
function PeopleRow({ text, names, onOpen }: { text: string; names: string[]; onOpen?: () => void }) {
  const body = (
    <>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.counts}>{text}</Text>
        {names.length > 0 && <AvatarStack names={names} label={namesLine(names)} />}
      </View>
      {onOpen && (
        <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <ChevronRight size={20} strokeWidth={1.8} color={c.muted} />
        </View>
      )}
    </>
  );
  if (!onOpen) return <View style={styles.card}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[text, namesLine(names)].filter(Boolean).join(". ")}
      onPress={onOpen}
      style={styles.card}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingVertical: 6 },
  rowText: { flex: 1, gap: 2 },
  small: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  value: { fontFamily: fonts.medium, fontSize: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 16,
    backgroundColor: c.paper,
  },
  counts: { fontFamily: fonts.bold, fontSize: 15, color: c.ink },
  answer: {
    paddingHorizontal: space.l,
    paddingTop: space.m,
    paddingBottom: space.l,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.paper,
  },
});
