import React, { useState, useCallback, useRef, useEffect } from "react";
import { AppState, Image, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams, usePathname } from "expo-router";
import { Check, Lightbulb, Plus, RotateCcw, UserRound } from "lucide-react-native";
import { artwork } from "../../src/services/catalogue";
import { eventPicture } from "../../src/domain/events";
import { supabase } from "../../src/services/supabase";
import { useApp, LocalPlan } from "../../src/state/AppState";
import { Copy, Title, ErrorNote, Reveal, s, useLargeText } from "../../src/design/ui";
import { Chip, chipToneFor, CoverCard, Fab, IconButton, Segmented, Tile } from "../../src/design/kit";
import { fonts } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { createJournal } from "../../src/services/journal";
import { planGateway } from "../../src/services/plans";
import { reconcilePendingCreate } from "../../src/services/pendingCreate";
import { createdNotice } from "../../src/domain/planCopy";
import { planCoverStore } from "../../src/services/planCovers";
import {
  cardChips,
  cardLabel,
  coverNotice,
  eventPlace,
  groupPlans,
  invitationCards,
  withoutInvitations,
} from "../../src/domain/eventView";
import { INVITE_COPY } from "../../src/domain/inviteCopy";
import { RequestCard } from "../../src/design/GuestSteps";
import { NotificationAsk } from "../../src/design/NotificationAsk";
import { useNotificationAsk } from "../../src/state/useNotificationAsk";
import { joinRequestGateway, type MyRequest } from "../../src/services/joinRequests";
import { ANSWER_OPTIONS, reconcileRsvp, responseFor, type AnswerKey, type RsvpAttempt } from "../../src/domain/rsvp";
import { readRsvp, writeRsvp } from "../../src/services/rsvp";

// The last save notice already shown, so a remount or web history restoring the same URL never
// repeats a saved toast. Each save passes a fresh `notice` id.
let shownNotice: string | undefined;
// The last "gone" note tap already shown (its `n`), kept apart from the saved notice id.
let shownGone: string | undefined;

type Attendee = {
  plan_id: string;
  user_id: string;
  response: string;
  version: number;
  profiles: { display_name: string } | null;
};

export default function Plans() {
  const largeText = useLargeText();
  const { created, cover, notice, n } = useLocalSearchParams(),
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
    [answerError, setAnswerError] = useState<{ plan: string; message: string } | null>(null),
    // The last answer confirmed from an Invitations row: Going or Maybe brings the notification ask.
    [answered, setAnswered] = useState<{ scope: string; response: string } | null>(null);
  const scope = preview ? "preview" : session?.user.id;
  // A create whose reply was lost is finished here, by reading first; the notice says it exists.
  const [createdTitle, setCreatedTitle] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (scope && scope !== "preview")
        void reconcilePendingCreate(scope, planGateway, createJournal)
          .then(({ plan }) => {
            if (active && plan) setCreatedTitle(plan.title);
          })
          .catch(() => {});
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
      if (result === "confirmed") setAnswered({ scope: uid, response: attempt.response });
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
  const [gone, setGone] = useState(false);
  useEffect(() => {
    // Leaving /plans ends the toast; a notice id is shown at most once.
    if (pathname !== "/plans") {
      setToastNotice(undefined);
      setGone(false);
    } else if (noticeId === "gone") {
      // A tapped notification's note: shown once per tap (its `n`), so Back to the same URL never brings it again.
      if (typeof n === "string" && n !== shownGone) {
        shownGone = n;
        setGone(true);
      }
    } else if (noticeId && noticeId !== shownNotice) {
      shownNotice = noticeId;
      setToastNotice(noticeId);
    }
  }, [noticeId, n, pathname]);
  const toast =
    !noticeId || toastNotice !== noticeId
      ? null
      : created === "1"
        ? preview
          ? "Preview saved"
          : "Resbite saved"
        : null;
  // A tapped notification for an event that can't be read any more (usePushRouting).
  const goneNote = gone ? INVITE_COPY.goneNotice : null;
  // Plan 4: "Get notified?" after creating an event, or after a Going or Maybe answer from an Invitations row.
  const ask = useNotificationAsk({
    created: created === "1",
    response: answered && answered.scope === scope ? answered.response : null,
  });
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
        <ErrorNote message={goneNote} />
        <ErrorNote message={ask.error} />
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
                    options={ANSWER_OPTIONS}
                    value={null}
                    disabled={answering !== null}
                    onChange={(key) => void answer(p, key)}
                  />
                  {answerError?.plan === p.id && <ErrorNote message={answerError.message} />}
                </View>
              );
            })}
            {waiting.map((q) => (
              <RequestCard key={`request-${q.plan_id}`} request={q} now={new Date(now)} />
            ))}
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
        {createdTitle && (
          <Reveal style={{ alignSelf: "flex-start" }}>
            <View accessibilityLiveRegion="polite">
              <Chip icon={Check} tone="aqua" text={createdNotice(createdTitle)} />
            </View>
          </Reveal>
        )}
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
      <NotificationAsk ask={ask} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  invitationsHeading: { fontFamily: fonts.display, fontSize: 22 },
  empty: { gap: 20, paddingVertical: 24 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, textAlign: "center" },
  emptyTiles: { flexDirection: "row", gap: 12 },
  emptyTile: { flex: 1 },
  fabLayer: { position: "absolute", right: 20, bottom: 20 },
});
