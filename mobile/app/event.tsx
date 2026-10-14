import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  ArrowLeft,
  Check,
  Ellipsis,
  MapPin,
  MessageCircle,
  Pencil,
  RefreshCw,
  Repeat,
  RotateCcw,
  Send,
  Trash2,
  Users,
} from "lucide-react-native";
import { Button, Copy, ErrorNote, Reveal, s } from "../src/design/ui";
import { AvatarStack, Chip, chipToneFor, CoverCard, IconButton, InfoSheet, Segmented, Tile } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { categoryIcons } from "../src/design/categories";
import { colors as c, fonts } from "../src/design/tokens";
import { categoryLabels } from "../src/domain/categories";
import { eventPicture } from "../src/domain/events";
import { againConflict, againDraft, cardChips, coverNotice, guestArea, guestGroups, mapsUrl } from "../src/domain/eventView";
import { canEditPlan } from "../src/domain/plans";
import { answerKey, canReadSample, canRespond, responseFor } from "../src/domain/rsvp";
import { drafts } from "../src/services/drafts";
import { useApp } from "../src/state/AppState";
import { useEvent } from "../src/state/useEvent";

// The last saved-edit notice already shown, so a remount or web history restoring the same URL never
// repeats it (as on My resbites). Each save passes a fresh `notice` id (UX2-D1).
let shownNotice: string | undefined;

/** One page for both roles (spec "Event page"): /event?plan=<id>. */
export default function EventPage() {
  const { plan: planId, notice, cover } = useLocalSearchParams<{ plan?: string; notice?: string; cover?: string }>();
  const { session, preview } = useApp();
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
  // One Do this again at a time: a quick double tap must not write two copies or stack two editors.
  const againBusy = useRef(false);
  const { plan, role, attendee, guests, busy, fresh, pending } = event;
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
  const url = mapsUrl(current);
  const chips = cardChips({ owner, status: current.status, response: attendee?.response });

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
          place={current.place_label}
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
        {url && (
          <Chip
            icon={MapPin}
            tone="aqua"
            text="Open in Maps"
            label={`Open ${current.place_label.trim()} in Maps`}
            onPress={() => openMaps(url)}
          />
        )}
        <ErrorNote message={mapsError} />
        {!!current.description && <Copy>{current.description}</Copy>}
        {!!current.note && <Copy style={s.muted}>{current.note}</Copy>}
        {area.kind === "hidden" ? (
          <View style={{ gap: 6 }}>
            <AvatarStack names={[area.organizer]} label={`${area.organizer} is organizing`} />
            <Copy style={s.muted}>Answer to see who’s coming</Copy>
          </View>
        ) : (
          area.kind === "list" && (
            <AvatarStack names={area.names} label={area.label} onPress={() => setGuestsOpen(true)} />
          )
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
                <IconButton icon={Send} label="Invite someone" disabled={busy} onPress={invite} />
                <IconButton
                  icon={Users}
                  label="Choose people"
                  disabled={busy}
                  onPress={() => router.push({ pathname: "/people", params: { plan: current.id } })}
                />
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
                    { key: "cant", text: "Can’t make it" },
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
      </ScrollView>
      <InfoSheet visible={guestsOpen} title="Guests" onClose={() => setGuestsOpen(false)}>
        {guestGroups(guests).map((group) => (
          <View key={group.title} style={{ gap: 2 }}>
            <Copy accessibilityRole="header" style={styles.group}>
              {group.title}
            </Copy>
            {group.guests.map((g) => (
              <View key={g.userId} style={styles.guest}>
                <Copy style={{ flex: 1 }}>{g.name}</Copy>
                {g.note && <Chip text={g.note} />}
              </View>
            ))}
          </View>
        ))}
      </InfoSheet>
      <InfoSheet visible={more} title="More" onClose={() => setMore(false)}>
        <Tile
          icon={Repeat}
          title="Do this again"
          hint="Copies the name, description, vibe, place and note into a new draft"
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
  guest: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  group: { fontFamily: fonts.bold, fontSize: 15, marginTop: 8 },
  confirm: { gap: 12, padding: 14, backgroundColor: c.pinkSoft, borderRadius: 16 },
});
