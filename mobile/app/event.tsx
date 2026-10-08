import React, { useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  ArrowLeft,
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
import { Button, Copy, ErrorNote, s } from "../src/design/ui";
import { AvatarStack, Chip, chipToneFor, CoverCard, IconButton, InfoSheet, Segmented, Tile } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { categoryIcons } from "../src/design/categories";
import { colors as c } from "../src/design/tokens";
import { categoryLabels } from "../src/domain/categories";
import { eventPicture } from "../src/domain/events";
import { againConflict, againDraft, cardChips, mapsUrl, responseText } from "../src/domain/eventView";
import { canEditPlan } from "../src/domain/plans";
import { answerKey, canReadSample, canRespond, cantMakeItResponse } from "../src/domain/rsvp";
import { drafts } from "../src/services/drafts";
import { useApp } from "../src/state/AppState";
import { useEvent } from "../src/state/useEvent";

/** One page for both roles (spec "Event page"): /event?plan=<id>. */
export default function EventPage() {
  const { plan: planId } = useLocalSearchParams<{ plan?: string }>();
  const { session, preview } = useApp();
  const event = useEvent(planId);
  const [more, setMore] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [mapsError, setMapsError] = useState<string | null>(null);
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
  const going = guests.filter((g) => g.response === "accepted");
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
    if (!scope) return;
    setMoreError(null);
    const start = async () => {
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
      }
    };
    try {
      const conflict = againConflict(await drafts.list(scope));
      if (conflict === "blocked")
        setMoreError("Finish the new resbite that’s waiting on this device first. Open it from My resbites.");
      else if (conflict === "replace")
        ask("Replace the unfinished resbite draft on this device?", "Replace", () => void start());
      else await start();
    } catch {
      setMoreError("Couldn’t start a copy on this device. Try again.");
    }
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
        <CoverCard
          hero
          picture={eventPicture(current)}
          title={current.title}
          startsAt={current.starts_at}
          place={current.place_label}
          dimmed={current.status === "cancelled"}
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
        {guests.length > 0 && (
          <AvatarStack names={going.map((g) => g.name)} label={`${going.length} going`} onPress={() => setGuestsOpen(true)} />
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
          </View>
        ) : (
          attendee && (
            <View style={{ gap: 12 }}>
              {allowed ? (
                <Segmented
                  label="Your answer"
                  options={[
                    { key: "going", text: "Going" },
                    { key: "cant", text: "Can’t make it" },
                  ] as const}
                  value={answerKey(attendee.response)}
                  onChange={(key) =>
                    void event.respond(key === "going" ? "accepted" : cantMakeItResponse(attendee.response))
                  }
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
        {guests.map((g) => (
          <View key={g.userId} style={styles.guest}>
            <Copy style={{ flex: 1 }}>{g.name}</Copy>
            <Chip text={responseText(g.response)} tone={g.response === "accepted" ? "aqua" : "neutral"} />
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
  confirm: { gap: 12, padding: 14, backgroundColor: c.pinkSoft, borderRadius: 16 },
});
