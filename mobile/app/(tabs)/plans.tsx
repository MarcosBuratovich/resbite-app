import React, { useState, useCallback, useRef, useEffect } from "react";
import { AppState, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams, usePathname } from "expo-router";
import { Check, Lightbulb, Plus, RotateCcw, Trash2, UserRound } from "lucide-react-native";
import { activities, artwork } from "../../src/services/catalogue";
import { EventPictureView } from "../../src/design/categories";
import { eventPicture } from "../../src/domain/events";
import { supabase } from "../../src/services/supabase";
import { useApp, LocalPlan } from "../../src/state/AppState";
import { Copy, Title, ErrorNote, Reveal, s, useLargeText } from "../../src/design/ui";
import { Chip, chipToneFor, CoverCard, Fab, IconButton, Segmented, Tile } from "../../src/design/kit";
import { colors as c, fonts, r } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { drafts, type PlanDraft } from "../../src/services/drafts";
import { planCoverStore } from "../../src/services/planCovers";
import {
  cardChips,
  cardLabel,
  coverNotice,
  draftRoute,
  eventPlace,
  groupPlans,
  invitationCards,
  withoutInvitations,
} from "../../src/domain/eventView";
import { INVITE_COPY } from "../../src/domain/inviteCopy";
import { areaLine, linkPicture, requestChip } from "../../src/domain/joinView";
import { joinRequestGateway, type MyRequest } from "../../src/services/joinRequests";
import { reconcileRsvp, responseFor, type AnswerKey, type RsvpAttempt } from "../../src/domain/rsvp";
import { readRsvp, writeRsvp } from "../../src/services/rsvp";
import { canDiscardDraft } from "../../src/domain/draftAutosave";
import { confirmDiscardDraft } from "../../src/state/usePlanEditor";

// The last save notice already shown, so a remount or web history restoring the same URL never
// repeats a saved toast. Each save passes a fresh `notice` id.
let shownNotice: string | undefined;

type Attendee = {
  plan_id: string;
  user_id: string;
  response: string;
  version: number;
  profiles: { display_name: string } | null;
};

export default function Plans() {
  const largeText = useLargeText();
  const { created, cover, notice } = useLocalSearchParams(),
    { preview, localPlans, session } = useApp(),
    [plans, setPlans] = useState<LocalPlan[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [segment, setSegment] = useState<"upcoming" | "past">("upcoming"),
    [attendees, setAttendees] = useState<Attendee[]>([]),
    // Plan 3: the open-link requests still waiting for their host, or declined.
    [requests, setRequests] = useState<MyRequest[]>([]),
    [hosts, setHosts] = useState<Record<string, string>>({}),
    [answering, setAnswering] = useState<string | null>(null),
    [answerError, setAnswerError] = useState<{ plan: string; message: string } | null>(null);
  const scope = preview ? "preview" : session?.user.id;
  const [savedDrafts, setSavedDrafts] = useState<PlanDraft[]>([]);
  const [draftLoadError, setDraftLoadError] = useState(false);
  const [draftRemoveError, setDraftRemoveError] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setSavedDrafts([]);
      setDraftLoadError(false);
      setDraftRemoveError(false);
      if (scope)
        void drafts
          .list(scope)
          .then((items) => {
            if (active) setSavedDrafts(items);
          })
          .catch(() => {
            if (active) setDraftLoadError(true);
          });
      return () => {
        active = false;
      };
    }, [scope]),
  );
  const identity = useRef(scope);
  identity.current = scope;
  const [loadedFor, setLoadedFor] = useState<string>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setPlans([]);
    setAttendees([]);
    setRequests([]);
    setHosts({});
    setLoadedFor(undefined);
    setError(null);
    setBusy(false);
  }, [scope]);
  const refresh = useCallback(async () => {
    request.current?.abort();
    if (preview || !session) {
      setPlans([]);
      setAttendees([]);
      setRequests([]);
      setBusy(false);
      return;
    }
    const uid = session.user.id;
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () => identity.current === uid && request.current === controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setBusy(true);
    setError(null);
    try {
      const [p, a, q] = await Promise.all([
        supabase.from("plans").select("*").order("starts_at").abortSignal(controller.signal),
        supabase
          .from("attendees")
          .select("plan_id,user_id,response,version,profiles(display_name)")
          .abortSignal(controller.signal),
        // Requests never block My resbites: a failed read keeps the last list.
        joinRequestGateway.mine().catch(() => null),
      ]);
      if (!isCurrent()) return;
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      setLoadedFor(uid);
      setPlans(p.data || []);
      if (q) setRequests(q);
      // Cover changes for cancelled or started plans can never complete; drop them quietly.
      void planCoverStore.discardStaleCoverJournals(uid, p.data || []).catch(() => {});
      const mine = (a.data || []) as unknown as Attendee[];
      setAttendees(mine);
      // The host's name for each invitation card; without it the card says "Your host invited you".
      const owners = [
        ...new Set(invitationCards(p.data || [], mine, uid, Date.now()).map((x) => x.owner_id ?? "").filter(Boolean)),
      ];
      if (owners.length) {
        const names = await supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", owners)
          .abortSignal(controller.signal)
          .then(
            (r) => r.data ?? [],
            () => [],
          );
        if (!isCurrent()) return;
        setHosts(Object.fromEntries(names.map((n) => [n.id, n.display_name])));
      } else setHosts({});
    } catch (e) {
      if (isCurrent())
        setError(
          "We couldn’t refresh your plans. Previously loaded details may be out of date. Try again when you’re connected.",
        );
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) setBusy(false);
    }
  }, [preview, session?.user.id]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      let previous = AppState.currentState;
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active" && previous !== "active") void refresh();
        previous = next;
      });
      return () => {
        subscription.remove();
        request.current?.abort();
        request.current = null;
      };
    }, [refresh]),
  );
  const list = preview ? localPlans : loadedFor === session?.user.id && session ? plans : [];
  const now = Date.now();
  const invitations = preview || !session ? [] : invitationCards(list, attendees, session.user.id, now);
  // A plan the account can already read (invited in person since) shows as itself, not as a request.
  const waiting =
    preview || !session || loadedFor !== session.user.id
      ? []
      : requests.filter((q) => !list.some((p) => p.id === q.plan_id));
  const { upcoming: ahead, past } = groupPlans(list, now);
  const upcoming = withoutInvitations(ahead, invitations);
  const shown = segment === "upcoming" ? upcoming : past;
  const myDrafts = savedDrafts.filter((d) => d.scope === scope);
  // Removes a draft from this device after "Discard draft?", exactly as the editor's Discard draft.
  const removeDraft = (draft: PlanDraft) =>
    confirmDiscardDraft(() => {
      setDraftRemoveError(false);
      drafts.remove(draft.scope, draft.key).then(
        () => setSavedDrafts((all) => all.filter((d) => !(d.scope === draft.scope && d.key === draft.key))),
        () => setDraftRemoveError(true),
      );
    });
  // Answers an invitation exactly as the event page does: read, reconcile, write when still needed, confirm.
  async function answer(p: LocalPlan, key: AnswerKey) {
    const me = attendees.find((a) => a.plan_id === p.id && a.user_id === session?.user.id);
    const uid = session?.user.id;
    if (!me || !uid || answering) return;
    const attempt: RsvpAttempt = {
      planId: p.id,
      planVersion: p.version,
      version: me.version,
      response: responseFor(key, me.response),
    };
    const valid = () => identity.current === uid;
    setAnswering(p.id);
    setAnswerError(null);
    try {
      let next = await readRsvp(p.id, uid);
      if (!valid()) return;
      if (reconcileRsvp(attempt, next) === "retry") {
        try {
          await writeRsvp(attempt);
        } catch {
          /* Confirm saved state before saying anything. */
        }
        if (!valid()) return;
        next = await readRsvp(p.id, uid);
        if (!valid()) return;
      }
      const result = reconcileRsvp(attempt, next);
      if (result !== "confirmed")
        setAnswerError({
          plan: p.id,
          message:
            result === "unavailable"
              ? "This plan is cancelled or has already started. Responses are closed."
              : result === "review"
                ? "The plan or your response changed. Open it to review the latest details."
                : "Your response is not confirmed. Try again.",
        });
      await refresh();
    } catch {
      if (valid())
        setAnswerError({ plan: p.id, message: "We could not confirm your response. Check your connection, then retry." });
    } finally {
      if (valid()) setAnswering(null);
    }
  }
  const start = () => router.push("/arrange");
  const open = (p: LocalPlan) => {
    router.setParams({ created: "0", cover: "none" });
    router.push({ pathname: "/event", params: { plan: p.id } });
  };
  const noticeId = typeof notice === "string" ? notice : undefined;
  const pathname = usePathname();
  const [toastNotice, setToastNotice] = useState<string>();
  useEffect(() => {
    // Leaving /plans ends the toast; a notice id is shown at most once.
    if (pathname !== "/plans") setToastNotice(undefined);
    else if (noticeId && noticeId !== shownNotice) {
      shownNotice = noticeId;
      setToastNotice(noticeId);
    }
  }, [noticeId, pathname]);
  const toast =
    !noticeId || toastNotice !== noticeId
      ? null
      : created === "1"
        ? preview
          ? "Preview saved"
          : "Resbite saved"
        : null;
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: 110 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={busy} onRefresh={refresh} />}
      >
        <View style={styles.header}>
          <Title>My resbites</Title>
          <IconButton icon={UserRound} label="Your profile" onPress={() => router.navigate("/profile")} />
        </View>
        <PreviewNotice />
        {(invitations.length > 0 || waiting.length > 0) && (
          <View style={{ gap: 12 }}>
            <Copy accessibilityRole="header" style={styles.invitationsHeading}>
              {INVITE_COPY.invitationsHeading}
            </Copy>
            {invitations.map((p) => {
              const host = hosts[p.owner_id ?? ""]?.trim() || INVITE_COPY.hostFallback;
              const place = eventPlace({ owner: false, response: "pending", place: p.place_label, area: p.area }).line;
              const chips = cardChips({ owner: false, status: p.status, response: "pending" });
              return (
                <View key={p.id} style={{ gap: 8 }}>
                  <CoverCard
                    picture={eventPicture(p)}
                    title={p.title}
                    startsAt={p.starts_at}
                    endsAt={p.ends_at}
                    place={place}
                    byline={INVITE_COPY.invitedYou(host)}
                    chips={chips.map((text) => ({ key: text, text, tone: chipToneFor(text) }))}
                    label={`${INVITE_COPY.invitedYou(host)}, ${cardLabel(
                      { title: p.title, startsAt: p.starts_at, endsAt: p.ends_at, place: place ?? "", chips, photo: p.cover_description },
                      new Date(now),
                    )}`}
                    onPress={() => open(p)}
                  />
                  <Segmented
                    label={INVITE_COPY.yourAnswer(p.title)}
                    options={[
                      { key: "going", text: "Going" },
                      { key: "maybe", text: "Maybe" },
                      { key: "cant", text: "Can’t go" },
                    ] as const}
                    value={null}
                    disabled={answering !== null}
                    onChange={(key) => void answer(p, key)}
                  />
                  {answerError?.plan === p.id && <ErrorNote message={answerError.message} />}
                </View>
              );
            })}
            {waiting.map((q) => {
              const chip = requestChip(q);
              const place = areaLine(q.area);
              return (
                <CoverCard
                  key={`request-${q.plan_id}`}
                  picture={linkPicture(q.image)}
                  title={q.title}
                  startsAt={q.starts_at || null}
                  endsAt={q.ends_at}
                  place={place}
                  chips={[{ key: chip.text, text: chip.text, tone: chip.tone }]}
                  label={cardLabel(
                    { title: q.title, startsAt: q.starts_at || null, endsAt: q.ends_at, place: place ?? "", chips: [chip.text] },
                    new Date(now),
                  )}
                  onPress={() => router.push({ pathname: "/waiting", params: { plan: q.plan_id } })}
                />
              );
            })}
          </View>
        )}
        <Segmented
          label="Show"
          options={[
            { key: "upcoming", text: "Upcoming" },
            { key: "past", text: "Past" },
          ] as const}
          value={segment}
          onChange={setSegment}
        />
        <Fab placement="inline" onPress={start} />
        {toast && (
          <Reveal style={{ alignSelf: "flex-start" }}>
            <View accessibilityLiveRegion="polite">
              <Chip icon={Check} tone="aqua" text={toast} />
            </View>
          </Reveal>
        )}
        <ErrorNote message={coverNotice(cover)} />
        {draftLoadError && (
          <ErrorNote message="Couldn’t load drafts from this device. Reopen this tab to try again." />
        )}
        {segment === "upcoming" && myDrafts.length > 0 && (
          <ScrollView
            horizontal={!largeText}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.drafts}
          >
            {myDrafts.map((d) => (
              <DraftTile key={d.key} draft={d} onRemove={() => removeDraft(d)} />
            ))}
          </ScrollView>
        )}
        {draftRemoveError && <ErrorNote message="Couldn’t discard the draft. Try again." />}
        <ErrorNote message={error} />
        {error && <IconButton icon={RotateCcw} label="Refresh plans" busy={busy} onPress={() => void refresh()} />}
        {busy && list.length === 0 && <Copy accessibilityLiveRegion="polite">Loading your plans…</Copy>}
        {shown.length === 0 && !busy && !error ? (
          segment === "upcoming" ? (
            <View style={styles.empty}>
              <Image
                source={artwork["get-out-with-bikes"]}
                style={{ height: 180, width: "100%" }}
                resizeMode="contain"
              />
              <Copy style={styles.emptyTitle}>Nothing planned</Copy>
              <View style={[styles.emptyTiles, largeText && { flexDirection: "column" }]}>
                <View style={styles.emptyTile}>
                  <Tile icon={Plus} title="Start" label="Start a new resbite" onPress={start} />
                </View>
                <View style={styles.emptyTile}>
                  <Tile icon={Lightbulb} title="Ideas" label="Browse ideas" onPress={() => router.navigate("/create")} />
                </View>
              </View>
            </View>
          ) : (
            <Copy style={s.muted}>Nothing here yet.</Copy>
          )
        ) : (
          shown.map((p) => {
            const owner = preview || p.owner_id === session?.user.id;
            const mine = attendees.find((a) => a.plan_id === p.id && a.user_id === session?.user.id);
            const going = attendees.filter((a) => a.plan_id === p.id && a.response === "accepted").length;
            const chips = cardChips({ owner, status: p.status, response: mine?.response ?? "pending", going });
            // GI1: as on the event page, an invitee who hasn’t answered sees the area (or no place), never the place.
            const place = eventPlace({ owner, response: mine?.response ?? null, place: p.place_label, area: p.area }).line;
            return (
              <CoverCard
                key={p.id}
                picture={eventPicture(p)}
                title={p.title}
                startsAt={p.starts_at}
                endsAt={p.ends_at}
                place={place}
                dimmed={p.status === "cancelled"}
                chips={chips.map((text) => ({ key: text, text, tone: chipToneFor(text) }))}
                label={cardLabel(
                  { title: p.title, startsAt: p.starts_at, endsAt: p.ends_at, place: place ?? "", chips, photo: p.cover_description },
                  new Date(now),
                )}
                onPress={() => open(p)}
              />
            );
          })
        )}
      </ScrollView>
      <SafeAreaView edges={["bottom"]} pointerEvents="box-none" style={styles.fabLayer}>
        <Fab placement="float" onPress={start} />
      </SafeAreaView>
    </SafeAreaView>
  );
}

/**
 * A compact draft tile: "Draft" chip and title; tapping continues it. Its remove button
 * discards the draft after confirming; a "Check save" draft has none, as its write needs checking.
 */
function DraftTile({ draft, onRemove }: { draft: PlanDraft; onRemove: () => void }) {
  const title =
    draft.title?.trim() || activities.find((a) => a.id === draft.activityId)?.title || "Your resbite";
  const removable = canDiscardDraft(draft);
  return (
    <View style={[styles.draft, removable && { paddingRight: 6 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={draft.pending ? `Continue draft, ${title}, a save needs checking` : `Continue draft, ${title}`}
        onPress={() => router.push({ pathname: "/arrange", params: draftRoute(draft) })}
        style={({ pressed }) => [styles.draftOpen, pressed && { opacity: 0.85 }]}
      >
        <EventPictureView
          picture={eventPicture({ activity_id: draft.activityId, categories: draft.categories ?? [] })}
          size={44}
        />
        <View style={{ flexShrink: 1, gap: 6 }}>
          <Chip text={draft.pending ? "Check save" : "Draft"} tone={draft.pending ? "pink" : "status"} />
          <Copy style={{ fontFamily: fonts.medium, fontSize: 14 }} numberOfLines={2}>
            {title}
          </Copy>
        </View>
      </Pressable>
      {removable && (
        <IconButton icon={Trash2} tone="plain" label={`Remove draft, ${title}`} onPress={onRemove} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  invitationsHeading: { fontFamily: fonts.display, fontSize: 22 },
  drafts: { gap: 10 },
  draft: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 320,
    borderRadius: r.tile,
    backgroundColor: c.cream,
  },
  draftOpen: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 12,
    minHeight: 72,
    padding: 12,
    borderRadius: r.tile,
  },
  empty: { gap: 20, paddingVertical: 24 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, textAlign: "center" },
  emptyTiles: { flexDirection: "row", gap: 12 },
  emptyTile: { flex: 1 },
  fabLayer: { position: "absolute", right: 20, bottom: 20 },
});
