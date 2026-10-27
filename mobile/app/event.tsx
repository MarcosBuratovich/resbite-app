import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import * as Crypto from "expo-crypto";
import { getRandomBytes } from "expo-crypto";
import { newInviteCode, sendOrder } from "../src/domain/contactInvites";
import {
  ArrowLeft,
  Check,
  Ellipsis,
  MapPin,
  Megaphone,
  MessageCircle,
  Pencil,
  RefreshCw,
  Repeat,
  RotateCcw,
  Send,
  Trash2,
  UserMinus,
} from "lucide-react-native";
import { Button, Copy, ErrorNote, Reveal, s } from "../src/design/ui";
import { AvatarStack, Chip, chipToneFor, CoverCard, IconButton, InfoSheet, Segmented, Tile } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { EventDeviceChips, ReminderSheet } from "../src/design/EventDeviceChips";
import { GuestNoteCard, GuestNoteSheet, MeetingDetails } from "../src/design/EventNotes";
import { categoryIcons } from "../src/design/categories";
import { colors as c, fonts } from "../src/design/tokens";
import { categoryLabels } from "../src/domain/categories";
import { eventPicture } from "../src/domain/events";
import { canPostGuestNote, meetingDetailsView } from "../src/domain/eventDetails";
import {
  againConflict,
  againDraft,
  cardChips,
  coverNotice,
  eventPlace,
  EXACT_ADDRESS_LATER,
  guestArea,
  guestGroups,
  mapsUrl,
} from "../src/domain/eventView";
import { linkDate, removeGuestQuestion } from "../src/domain/eventLinks";
import { INVITE_COPY } from "../src/domain/inviteCopy";
import { EventLinkCard } from "../src/design/EventLinkCard";
import { WaitingForYou } from "../src/design/WaitingForYou";
import { joinRequestGateway, type HostRequest } from "../src/services/joinRequests";
import { canEditPlan } from "../src/domain/plans";
import { answerKey, canReadSample, canRespond, responseFor } from "../src/domain/rsvp";
import { drafts } from "../src/services/drafts";
import { setGuestNote } from "../src/services/plans";
import { invitationGateway } from "../src/services/invitations";
import { contactInviteGateway } from "../src/services/contactInvites";
import { inviteCodeStore } from "../src/services/inviteCodeStore";
import { putInviteQuietly, sendPersonalLink } from "../src/services/inviteSend";
import { readProfile } from "../src/services/profile";
import { DEFAULT_ORIGIN } from "../src/state/useContactInvites";
import type { InvitedPerson } from "../src/state/useEvent";
import { useApp } from "../src/state/AppState";
import { useEvent } from "../src/state/useEvent";
import { useEventDevice } from "../src/state/useEventDevice";

// The last saved-edit notice already shown, so a remount or web history restoring the same URL never
// repeats it (as on My resbites). Each save passes a fresh `notice` id (UX2-D1).
let shownNotice: string | undefined;

/** One page for both roles (spec "Event page"): /event?plan=<id>. */
export default function EventPage() {
  const { plan: planId, notice, cover } = useLocalSearchParams<{ plan?: string; notice?: string; cover?: string }>();
  const { session, preview, setLocalPlans } = useApp();
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
  const [more, setMore] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  // GI1: the organizer removes a guest from the Guests sheet.
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Invited by personal link and not answered yet: Send again and Remove act on one person at a time.
  const [invitedBusy, setInvitedBusy] = useState<string | null>(null);
  // Codes made here since the Invited list was read, by number: when WhatsApp won't open, Messages then sends the
  // same new link instead of making another one.
  const minted = useRef<Record<string, NonNullable<InvitedPerson["stored"]>>>({});
  // One Do this again at a time: a quick double tap must not write two copies or stack two editors.
  const againBusy = useRef(false);
  // Open-link approval: one decision at a time; the user it is for, and what went wrong.
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const { plan, role, attendee, guests, invited, requests, busy, fresh, pending } = event;
  // A decision error belongs to the list it came from: once nothing is waiting, it must not return on a later request.
  useEffect(() => {
    if (requests.length === 0) setDecideError(null);
  }, [requests.length]);
  // UX3 Add to calendar and reminders: the organizer and Going or Maybe guests, on upcoming active events.
  const device = useEventDevice(plan, { owner: role === "owner", response: attendee?.response ?? null });
  const scope = preview ? "preview" : session?.user.id;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/plans"));

  if (!plan)
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
  const owner = role === "owner";
  const editable = owner && canEditPlan(current, session?.user.id, preview);
  const allowed = attendee ? canRespond({ plan: current, attendee }) : false;
  const area = guestArea({ owner, response: attendee?.response ?? null, organizer: event.organizer, guests });
  // GI1: until an invitee answers, the area stands in for the exact place, and there is no Open in Maps.
  const place = eventPlace({
    owner,
    response: attendee?.response ?? null,
    place: current.place_label,
    area: current.area,
  });
  const url = place.exact ? mapsUrl(current) : null;
  const chips = cardChips({ owner, status: current.status, response: attendee?.response });
  // UX3-D5/D6: Meeting details reach only the organizer and Going or Maybe guests (the database sends them
  // only to them); the Note to guests is pinned for everyone.
  const details = meetingDetailsView({
    owner,
    response: attendee?.response ?? null,
    // A locked line only while answering can still unlock it.
    hasDetails: Boolean(current.has_meeting_details) && (owner || allowed),
    text: current.note,
  });
  const guestNote = current.guest_note?.trim() ?? "";
  const canNote = owner && canPostGuestNote(current, Date.now());

  function ask(message: string, accept: string, onAccept: () => void) {
    if (Platform.OS === "web") {
      if (window.confirm(message)) onAccept();
    } else
      Alert.alert(message, undefined, [
        { text: "Keep draft", style: "cancel" },
        { text: accept, onPress: onAccept },
      ]);
  }
  // Do this again (benchmark row 5): never over an unconfirmed save, and only after asking over a draft.
  async function again() {
    if (!scope || againBusy.current) return;
    againBusy.current = true;
    setMoreError(null);
    // Held while the drafts are read, and by start() until the editor is pushed or the copy
    // fails. start() takes it synchronously, so no tap gets in between the check and the copy.
    const start = async () => {
      againBusy.current = true;
      try {
        await drafts.put(
          againDraft(current, {
            scope,
            requestId: Crypto.randomUUID(),
            zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            now: new Date(),
          }),
        );
        setMore(false);
        router.push("/arrange");
      } catch {
        setMoreError("Couldn’t start a copy on this device. Try again.");
      } finally {
        againBusy.current = false;
      }
    };
    let conflict: ReturnType<typeof againConflict>;
    try {
      conflict = againConflict(await drafts.list(scope));
    } catch {
      againBusy.current = false;
      setMoreError("Couldn’t start a copy on this device. Try again.");
      return;
    }
    // Released while asking: the question is modal, and Replace runs start(), which takes it again.
    againBusy.current = false;
    if (conflict === "blocked")
      setMoreError("Finish the new resbite that’s waiting on this device first. Open it from My resbites.");
    else if (conflict === "replace")
      ask("Replace the unfinished resbite draft on this device?", "Replace", () => void start());
    else await start();
  }
  function invite() {
    if (preview) {
      event.setNotice("Invitations are disabled in design preview. Real invitations need an approved tester account.");
      return;
    }
    router.push({ pathname: "/invitations", params: { plan: current.id } });
  }
  // Note to guests: preview keeps it on this device; otherwise the database saves it and the page reloads.
  async function saveGuestNote(text: string) {
    const trimmed = text.trim();
    if (preview) {
      const at = trimmed ? new Date().toISOString() : null;
      setLocalPlans((all) =>
        all.map((p) => (p.id === current.id ? { ...p, guest_note: trimmed, guest_note_at: at } : p)),
      );
      return;
    }
    await setGuestNote(current.id, text);
    await event.load();
  }
  // GI1: Remove asks first, then the database removes the guest and the page reloads the list and counts.
  function confirmRemove(guest: { userId: string; name: string }) {
    const question = removeGuestQuestion(guest.name);
    const remove = () => void removeGuest(guest.userId);
    if (Platform.OS === "web") {
      if (window.confirm(question)) remove();
    } else
      Alert.alert(question, undefined, [
        { text: "Keep", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: remove },
      ]);
  }
  async function removeGuest(userId: string) {
    if (removing) return;
    setRemoving(userId);
    setRemoveError(null);
    try {
      await invitationGateway.removeGuest(current.id, userId);
      await event.load();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Couldn’t remove this guest. Try again.");
    } finally {
      setRemoving(null);
    }
  }
  async function decide(request: HostRequest, approve: boolean) {
    if (deciding) return;
    setDeciding(request.user_id);
    setDecideError(null);
    try {
      await joinRequestGateway.decide(current.id, request.user_id, approve);
    } catch (e) {
      // The gateway already worded the failure (joinErrorMessage); wording it again would turn it into the offline line.
      setDecideError(e instanceof Error ? e.message : INVITE_COPY.offline);
    }
    // Reload either way: an approved guest joins the list, and a request someone else decided drops off.
    try {
      await event.load();
    } finally {
      setDeciding(null);
    }
  }
  function confirmDecline(request: HostRequest) {
    const question = INVITE_COPY.declineQuestion(request.name);
    const decline = () => void decide(request, false);
    if (Platform.OS === "web") {
      if (window.confirm(question)) decline();
    } else
      Alert.alert(question, undefined, [
        { text: "Keep", style: "cancel" },
        { text: INVITE_COPY.decline, style: "destructive", onPress: decline },
      ]);
  }
  function confirmRemoveInvite(person: InvitedPerson) {
    const question = INVITE_COPY.removeInvite(person.name);
    const remove = () => void removeInvite(person);
    if (Platform.OS === "web") {
      if (window.confirm(question)) remove();
    } else
      Alert.alert(question, undefined, [
        { text: "Keep", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: remove },
      ]);
  }
  async function removeInvite(person: InvitedPerson) {
    if (invitedBusy || !scope) return;
    setInvitedBusy(person.phone);
    setRemoveError(null);
    try {
      await contactInviteGateway.revoke(current.id, person.phone);
      delete minted.current[person.e164];
      // The link no longer works; the stored code has no use, and a failure to drop it is harmless.
      await inviteCodeStore.remove(scope, current.id, person.e164).catch(() => {});
      await event.load();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : INVITE_COPY.offline);
    } finally {
      setInvitedBusy(null);
    }
  }
  /** Send again by the chosen app: the stored code, or a fresh one when this phone has none for them. */
  async function resendInvite(person: InvitedPerson, via: "whatsapp" | "messages") {
    if (invitedBusy || !scope) return;
    setInvitedBusy(person.phone);
    setRemoveError(null);
    try {
      const host = await readProfile(scope).then(
        (profile) => profile?.display_name?.trim() || null,
        () => null,
      );
      let saved = person.stored ?? minted.current[person.e164];
      if (!saved) {
        // This phone has no code for them (the host changed phones): a fresh code replaces the old link.
        const code = newInviteCode(getRandomBytes(16));
        const [result] = await contactInviteGateway.invite(current.id, [
          { phone: person.phone, country: person.country, code },
        ]);
        if (result?.kind !== "link") {
          await event.load();
          return;
        }
        saved = { code, name: person.name };
        minted.current[person.e164] = saved;
        await putInviteQuietly(scope, current.id, person.e164, saved);
      }
      const failure = await sendPersonalLink({
        scope,
        plan: current.id,
        e164: person.e164,
        name: saved.name,
        code: saved.code,
        via,
        origin: process.env.EXPO_PUBLIC_INVITATION_ORIGIN || DEFAULT_ORIGIN,
        message: {
          host: host ?? INVITE_COPY.hostFallback,
          title: current.title.trim(),
          when: linkDate(current.starts_at, current.ends_at),
        },
      });
      if (failure) setRemoveError(failure);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : INVITE_COPY.offline);
    } finally {
      setInvitedBusy(null);
    }
  }
  // Maps opens only when tapped (benchmark row 6); a failure is said, never swallowed.
  function openMaps(target: string) {
    setMapsError(null);
    Linking.openURL(target).catch(() => setMapsError("Couldn’t open Maps."));
  }

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
        <View style={styles.top}>
          <IconButton icon={ArrowLeft} label="Back" onPress={back} />
          <PreviewNotice dismissible={false} />
        </View>
        {!!notice && toast === notice && (
          <Reveal style={{ alignSelf: "flex-start" }}>
            <View accessibilityLiveRegion="polite">
              <Chip icon={Check} tone="aqua" text={preview ? "Preview changes saved" : "Changes saved"} />
            </View>
          </Reveal>
        )}
        <ErrorNote message={coverNotice(cover)} />
        <CoverCard
          hero
          picture={eventPicture(current)}
          title={current.title}
          startsAt={current.starts_at}
          endsAt={current.ends_at}
          place={place.line}
          dimmed={current.status === "cancelled"}
          pictureLabel={current.cover_description}
          chips={[
            ...chips.map((text) => ({ key: text, text, tone: chipToneFor(text) })),
            ...current.categories.map((key) => ({
              key,
              text: categoryLabels[key],
              category: key,
              icon: categoryIcons[key],
            })),
          ]}
        />
        {/* Only while an answer can still bring the place. */}
        {!place.exact && allowed && <Copy style={s.muted}>{EXACT_ADDRESS_LATER}</Copy>}
        {(device.shown || url) && (
          <View style={styles.chips}>
            <EventDeviceChips device={device} />
            {url && (
              <Chip
                icon={MapPin}
                tone="aqua"
                text="Open in Maps"
                label={`Open ${current.place_label.trim()} in Maps`}
                onPress={() => openMaps(url)}
              />
            )}
          </View>
        )}
        <ErrorNote message={device.error} />
        <ErrorNote message={mapsError} />
        {guestNote ? (
          <GuestNoteCard
            text={guestNote}
            postedAt={current.guest_note_at}
            onEdit={canNote ? () => setNoteOpen(true) : undefined}
          />
        ) : (
          canNote && (
            <Chip
              icon={Megaphone}
              text="Note to guests"
              label="Post a note to guests"
              disabled={busy}
              onPress={() => setNoteOpen(true)}
            />
          )
        )}
        <MeetingDetails view={details} owner={owner} place={current.place_label} />
        {!!current.description && <Copy>{current.description}</Copy>}
        {area.kind === "hidden" ? (
          <View style={{ gap: 6 }}>
            <AvatarStack names={[area.organizer]} label={`${area.organizer} is organizing`} />
            {allowed && <Copy style={s.muted}>Answer to see who’s coming</Copy>}
          </View>
        ) : (
          (area.kind === "list" ? (
            <AvatarStack names={area.names} label={area.label} onPress={() => setGuestsOpen(true)} />
          ) : (
            owner &&
            !preview &&
            invited.length > 0 && (
              <Button
                secondary
                icon={false}
                title={`${INVITE_COPY.invitedGroup} (${invited.length})`}
                onPress={() => setGuestsOpen(true)}
              />
            )
          ))
        )}
        {owner && !preview && (
          <WaitingForYou
            requests={requests}
            deciding={deciding}
            disabled={busy}
            error={decideError}
            onApprove={(r) => void decide(r, true)}
            onDecline={confirmDecline}
          />
        )}
        <ErrorNote message={event.error} />
        {!!event.notice && (
          <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
            {event.notice}
          </Copy>
        )}
        {owner ? (
          <View style={styles.actions}>
            {editable && (
              <>
                <IconButton
                  icon={Pencil}
                  label={`Edit ${current.title}`}
                  disabled={busy}
                  onPress={() => router.push({ pathname: "/arrange", params: { plan: current.id } })}
                />
                {/* GI-D3: inviting from contacts is out of scope, so Choose people has no entry here; People
                    stays on Profile. */}
                <IconButton icon={Send} label="Invite someone" disabled={busy} onPress={invite} />
              </>
            )}
            <IconButton
              icon={Ellipsis}
              label="More actions"
              disabled={busy}
              onPress={() => {
                setConfirming(false);
                setMoreError(null);
                setMore(true);
              }}
            />
            {/* Errors such as an unconfirmed cancel ask the organizer to refresh (as "Refresh plans" did on My resbites). */}
            {!preview && !!event.error && (
              <IconButton icon={RefreshCw} label="Refresh event" busy={busy} onPress={() => void event.load()} />
            )}
          </View>
        ) : (
          attendee && (
            <View style={{ gap: 12 }}>
              {allowed ? (
                <Segmented
                  label="Your answer"
                  options={[
                    { key: "going", text: "Going" },
                    { key: "maybe", text: "Maybe" },
                    { key: "cant", text: "Can’t go" },
                  ] as const}
                  value={answerKey(attendee.response)}
                  onChange={(key) => void event.respond(responseFor(key, attendee.response))}
                  disabled={busy || !fresh || pending !== null}
                />
              ) : (
                <Copy>This plan is cancelled or has already started. Responses are closed.</Copy>
              )}
              <View style={styles.actions}>
                {pending && (
                  <IconButton
                    icon={RotateCcw}
                    label="Retry my response"
                    busy={busy}
                    onPress={() => void event.respond(pending.response, pending)}
                  />
                )}
                <IconButton icon={RefreshCw} label="Refresh invitation" busy={busy} onPress={() => void event.load()} />
                {fresh && !pending && canReadSample({ plan: current, attendee }) && (
                  <Chip
                    icon={MessageCircle}
                    tone="status"
                    text="Sample chat"
                    label="View sample conversation"
                    onPress={() => router.push({ pathname: "/sample-chat", params: { plan: current.id } })}
                  />
                )}
              </View>
            </View>
          )
        )}
        {/* The event's one link: only the organizer of an upcoming, active event shares or turns it off. */}
        {editable && !preview && <EventLinkCard plan={current} />}
      </ScrollView>
      <InfoSheet
        visible={guestsOpen}
        title="Guests"
        onClose={() => {
          setGuestsOpen(false);
          setRemoveError(null);
        }}
      >
        <ErrorNote message={removeError} />
        {guestGroups(guests).map((group) => (
          <View key={group.title} style={{ gap: 2 }}>
            <Copy accessibilityRole="header" style={styles.group}>
              {group.title}
            </Copy>
            {group.guests.map((g) => (
              <View key={g.userId} style={styles.guest}>
                <Copy style={{ flex: 1 }}>{g.name}</Copy>
                {g.note && <Chip text={g.note} />}
                {editable && !preview && g.userId !== session?.user.id && (
                  <IconButton
                    icon={UserMinus}
                    tone="plain"
                    label={`Remove ${g.name}`}
                    busy={removing === g.userId}
                    disabled={removing !== null || busy}
                    onPress={() => confirmRemove(g)}
                  />
                )}
              </View>
            ))}
          </View>
        ))}
        {editable && !preview && invited.length > 0 && (
          <View style={{ gap: 2 }}>
            <Copy accessibilityRole="header" style={styles.group}>
              {INVITE_COPY.invitedGroup}
            </Copy>
            {invited.map((person) => (
              // Under Larger Text the actions move below the name rather than off the screen.
              <View key={person.phone} style={[styles.guest, styles.invited]}>
                <Copy style={{ flex: 1, minWidth: 72 }}>{person.name}</Copy>
                <View style={styles.invitedActions}>
                  {/* Both ways, as Almost there offers them, the one used last first: without WhatsApp, Messages is
                      always next to it. */}
                  {sendOrder(person.stored?.sentVia).map((via) => {
                    const app = via === "whatsapp" ? INVITE_COPY.whatsapp : INVITE_COPY.messages;
                    return (
                      <Chip
                        key={via}
                        text={app}
                        label={INVITE_COPY.resendVia(app, person.name)}
                        hint={INVITE_COPY.resendHint(app, person.name)}
                        disabled={invitedBusy !== null || busy}
                        onPress={() => void resendInvite(person, via)}
                      />
                    );
                  })}
                  <IconButton
                    icon={UserMinus}
                    tone="plain"
                    label={`Remove ${person.name}`}
                    busy={invitedBusy === person.phone}
                    disabled={invitedBusy !== null || busy}
                    onPress={() => confirmRemoveInvite(person)}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </InfoSheet>
      <GuestNoteSheet
        visible={noteOpen}
        current={guestNote}
        onSave={saveGuestNote}
        onClose={() => setNoteOpen(false)}
      />
      <ReminderSheet device={device} />
      <InfoSheet visible={more} title="More" onClose={() => setMore(false)}>
        <Tile
          icon={Repeat}
          title="Do this again"
          hint="Copies the name, description, vibe, place and Meeting details into a new draft"
          onPress={() => void again()}
        />
        <ErrorNote message={moreError} />
        {editable &&
          (confirming ? (
            <View style={styles.confirm}>
              <Copy>Cancel this plan for everyone?</Copy>
              <Button
                title="Yes, cancel plan"
                onPress={() => {
                  setMore(false);
                  setConfirming(false);
                  void event.cancel();
                }}
              />
              <Button title="Keep plan" secondary onPress={() => setConfirming(false)} />
            </View>
          ) : (
            <Tile icon={Trash2} title="Cancel event" onPress={() => setConfirming(true)} />
          ))}
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  guest: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  invited: { flexWrap: "wrap" },
  // Two send chips and Remove: under Larger Text on a narrow screen they wrap rather than run off it.
  invitedActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
    maxWidth: "100%",
  },
  group: { fontFamily: fonts.bold, fontSize: 15, marginTop: 8 },
  confirm: { gap: 12, padding: 14, backgroundColor: c.pinkSoft, borderRadius: 16 },
});
