import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  ScrollView,
  View,
  Image,
  RefreshControl,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { activities, artwork } from "../../src/services/catalogue";
import { EventPictureView, categoryText } from "../../src/design/categories";
import { eventPicture } from "../../src/domain/events";
import { supabase } from "../../src/services/supabase";
import { useApp, LocalPlan } from "../../src/state/AppState";
import {
  ActionRow,
  ActionGroup,
  TextAction,
  Button,
  Copy,
  Title,
  ErrorNote,
  Reveal,
  s,
  useLargeText,
} from "../../src/design/ui";
import { colors as c } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { drafts, type PlanDraft } from "../../src/services/drafts";
import { planGateway } from "../../src/services/plans";
import { canEditPlan, cancelPlan, PlanSaveError } from "../../src/domain/plans";
import { Pencil, Users, X, CalendarDays, MapPin } from "lucide-react-native";
export default function Plans() {
  const largeText = useLargeText();
  const { created, updated } = useLocalSearchParams(),
    { preview, localPlans, setLocalPlans, session } = useApp(),
    [plans, setPlans] = useState<LocalPlan[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [working, setWorking] = useState<string | null>(null),
    [confirmCancel, setConfirmCancel] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [attendees, setAttendees] = useState<
      {
        plan_id: string;
        user_id: string;
        response: string;
        profiles: { display_name: string } | null;
      }[]
    >([]);
  const scope = preview ? "preview" : session?.user.id;
  const [savedDrafts, setSavedDrafts] = useState<PlanDraft[]>([]);
  const [draftLoadError, setDraftLoadError] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setSavedDrafts([]);
      setDraftLoadError(false);
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
    setLoadedFor(undefined);
    setError(null);
    setNotice("");
    setConfirmCancel(null);
    setWorking(null);
    setBusy(false);
  }, [scope]);
  const refresh = useCallback(async () => {
    request.current?.abort();
    if (preview || !session) {
      setPlans([]);
      setAttendees([]);
      setBusy(false);
      return;
    }
    const uid = session.user.id;
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () =>
      identity.current === uid && request.current === controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setBusy(true);
    setError(null);
    try {
      const [p, a] = await Promise.all([
        supabase
          .from("plans")
          .select("*")
          .order("starts_at")
          .abortSignal(controller.signal),
        supabase
          .from("attendees")
          .select("plan_id,user_id,response,profiles(display_name)")
          .abortSignal(controller.signal),
      ]);
      if (!isCurrent()) return;
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      setLoadedFor(uid);
      setPlans(p.data || []);
      setAttendees((a.data || []) as unknown as typeof attendees);
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
  async function share(p: LocalPlan) {
    if (preview) {
      setNotice(
        "Invitations are disabled in design preview. Real invitations need an approved tester account.",
      );
      return;
    }
    router.push({ pathname: "/invitations", params: { plan: p.id } });
  }

  async function cancel(p: LocalPlan) {
    setWorking(p.id);
    setError(null);
    try {
      if (preview)
        setLocalPlans((all) =>
          all.map((x) =>
            x.id === p.id
              ? { ...x, status: "cancelled", version: x.version + 1 }
              : x,
          ),
        );
      else {
        await cancelPlan(planGateway, { id: p.id, version: p.version });
        await refresh();
      }
      router.setParams({ created: "0", updated: "0" });
      setNotice(
        preview ? "Preview plan cancelled." : "Your plan is cancelled.",
      );
    } catch (e) {
      // A definite failure reloads first: refresh() clears the error line.
      if (e instanceof PlanSaveError && !e.uncertain) await refresh();
      setError(
        e instanceof PlanSaveError
          ? e.message
          : "Could not cancel. Refresh and try again.",
      );
    } finally {
      setWorking(null);
    }
  }
  const list = preview
    ? localPlans
    : loadedFor === session?.user.id && session
      ? plans
      : [];
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: 28 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={busy} onRefresh={refresh} />
        }
      >
        <PreviewNotice />
        <Copy style={{ color: c.aquaDark }}>TIME WELL SPENT</Copy>
        <Title>Something to look forward to.</Title>
        <Copy style={s.muted}>Your plans, all in one place.</Copy>
        <Button title="New resbite" onPress={() => router.push("/arrange")} />
        {(created === "1" || updated === "1") && (
          <Reveal>
            <View
              style={[s.card, { padding: 18, backgroundColor: c.aquaSoft }]}
            >
              <Copy>
                {updated === "1"
                  ? preview
                    ? "Preview changes saved."
                    : "Your changes are saved."
                  : preview
                    ? "Preview plan saved."
                    : "Your plan is saved."}{" "}
                Time to get together.
              </Copy>
            </View>
          </Reveal>
        )}
        {draftLoadError && (
          <ErrorNote message="Couldn’t load drafts from this device. Reopen this tab to try again." />
        )}
        {savedDrafts
          .filter((d) => d.scope === scope)
          .map((d) => (
            <View
              key={d.key}
              style={[
                s.card,
                { padding: 20, gap: 14, backgroundColor: c.cream },
              ]}
            >
              <Title style={{ fontSize: 23 }}>
                Pick up where you left off.
              </Title>
              <Copy>
                {d.title?.trim() ||
                  activities.find((a) => a.id === d.activityId)?.title ||
                  "Your resbite"}
              </Copy>
              <Copy style={s.muted}>
                {d.pending
                  ? "A save needs checking before you continue."
                  : "Draft saved on this device."}
              </Copy>
              <Button
                title="Continue draft"
                onPress={() =>
                  router.push({
                    pathname: "/arrange",
                    params: d.planId
                      ? { plan: d.planId }
                      : d.activityId
                        ? { activity: d.activityId }
                        : {},
                  })
                }
              />
            </View>
          ))}
        <ErrorNote message={error} />
        {error && (
          <Button
            title="Refresh plans"
            secondary
            loading={busy}
            onPress={() => void refresh()}
          />
        )}
        {busy && list.length === 0 && (
          <Copy accessibilityLiveRegion="polite">Loading your plans…</Copy>
        )}
        {Boolean(notice) && <Copy style={s.muted}>{notice}</Copy>}
        {list.length === 0 && !busy && !error ? (
          <View style={{ gap: 20, paddingVertical: 24 }}>
            <Image
              source={artwork["get-out-with-bikes"]}
              style={{ height: 180, width: "100%" }}
              resizeMode="contain"
            />
            <Title style={{ fontSize: 24 }}>Make room for a first plan.</Title>
            <Copy>Start your own resbite, or borrow an idea.</Copy>
            <Button
              title="Start your own resbite"
              onPress={() => router.push("/arrange")}
            />
            <Button
              title="Browse ideas"
              secondary
              onPress={() => router.navigate("/create")}
            />
          </View>
        ) : (
          list.map((p) => {
            const owner = preview || p.owner_id === session?.user.id;
            return (
              <View key={p.id} style={[s.card, { padding: 20, gap: 14 }]}>
                <View
                  style={{
                    flexDirection: largeText ? "column" : "row",
                    alignItems: largeText ? "stretch" : "center",
                    gap: 12,
                  }}
                >
                  <EventPictureView picture={eventPicture(p)} size={70} />
                  <View style={{ flex: largeText ? undefined : 1 }}>
                    <Copy style={{ color: c.aquaDark, fontSize: 12 }}>
                      {p.status === "cancelled"
                        ? "CANCELLED"
                        : owner
                          ? "YOU’RE ORGANISING"
                          : "YOU’RE INVITED"}
                    </Copy>
                    <Title style={{ fontSize: 23, lineHeight: 29 }}>
                      {p.title}
                    </Title>
                    <Copy style={{ ...s.muted, fontSize: 12 }}>
                      {categoryText(p.categories)}
                    </Copy>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <CalendarDays size={18} color={c.aquaDark} />
                  <Copy style={{ flex: 1 }}>
                    {new Date(p.starts_at).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Copy>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <MapPin size={18} color="#963F58" />
                  <Copy style={{ flex: 1 }}>{p.place_label}</Copy>
                </View>
                {Boolean(p.note) && <Copy style={s.muted}>{p.note}</Copy>}
                {attendees
                  .filter((a) => a.plan_id === p.id)
                  .map((a) => (
                    <Copy key={a.user_id} style={s.muted}>
                      {a.profiles?.display_name || "Tester"} · {a.response}
                    </Copy>
                  ))}
                {canEditPlan(p, session?.user.id, preview) && (
                  <>
                    <ActionGroup>
                      <ActionRow
                        icon={Pencil}
                        tone="violet"
                        title="Edit plan"
                        disabled={working === p.id}
                        onPress={() =>
                          router.push({
                            pathname: "/arrange",
                            params: { plan: p.id },
                          })
                        }
                      />
                      <ActionRow
                        icon={Users}
                        title="Choose people"
                        disabled={working === p.id}
                        onPress={() =>
                          router.push({
                            pathname: "/people",
                            params: { plan: p.id },
                          })
                        }
                      />
                    </ActionGroup>
                    <Button
                      title="Invite someone"
                      onPress={() => share(p)}
                      loading={working === p.id}
                    />
                    <TextAction
                      icon={X}
                      destructive
                      title="Cancel plan"
                      disabled={working === p.id}
                      onPress={() => setConfirmCancel(p.id)}
                    />
                  </>
                )}
                {confirmCancel === p.id && p.status === "active" && (
                  <View
                    style={{
                      gap: 12,
                      padding: 14,
                      backgroundColor: c.pinkSoft,
                      borderRadius: 16,
                    }}
                  >
                    <Copy>Cancel this plan for everyone?</Copy>
                    <Button
                      title="Yes, cancel plan"
                      onPress={() => {
                        setConfirmCancel(null);
                        void cancel(p);
                      }}
                    />
                    <Button
                      title="Keep plan"
                      secondary
                      onPress={() => setConfirmCancel(null)}
                    />
                  </View>
                )}
                {!owner && p.status === "active" && (
                  <Button
                    title="View invitation"
                    onPress={() =>
                      router.push({
                        pathname: "/invite",
                        params: { plan: p.id },
                      })
                    }
                  />
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
