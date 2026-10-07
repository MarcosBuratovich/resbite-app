import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { MapPin, MessageCircle, CalendarDays } from "lucide-react-native";
import { activities } from "../src/services/catalogue";
import { useCatalogue } from "../src/state/useCatalogue";
import { drafts, type PlanDraft } from "../src/services/drafts";
import { planGateway } from "../src/services/plans";
import { useApp, type LocalPlan } from "../src/state/AppState";
import {
  Back,
  Button,
  Copy,
  Title,
  Field,
  ErrorNote,
  useReduceMotion,
  s,
} from "../src/design/ui";
import { PreviewNotice } from "../src/design/Chrome";
import { EventDetailsFields } from "../src/design/EventDetailsFields";
import { EventPictureView } from "../src/design/categories";
import {
  completeEventFields,
  eventPicture,
  fieldsFromActivity,
  legacyEventFields,
  validateEventFields,
  type EventFields,
} from "../src/domain/events";
import { PlanSchedule } from "../src/design/PlanSchedule";
import { colors as c } from "../src/design/tokens";
import { validatePlan } from "../src/domain/rules";
import {
  canEditPlan,
  localDateTime,
  parseLocalDateTime,
  PlanSaveError,
  writePlan,
  reconcilePlan,
  type PlanWrite,
} from "../src/domain/plans";

export default function Arrange() {
  const { activity, plan: planId } = useLocalSearchParams<{
    activity?: string;
    plan?: string;
  }>();
  const { preview, session, localPlans, setLocalPlans } = useApp();
  const navigation = useNavigation();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.4;
  const scroll = useRef<ScrollView>(null);
  const reduceMotion = useReduceMotion();
  const requestId = useRef(Crypto.randomUUID());
  const saving = useRef(false);
  const mounted = useRef(true);
  const placeRevision = useRef(0);
  const [original, setOriginal] = useState<LocalPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [start, setStart] = useState(() =>
    localDateTime(new Date(Date.now() + 86400000)),
  );
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [fields, setFields] = useState<EventFields>({
    title: "",
    description: "",
    categories: [],
  });
  const needsPrefill = useRef(false);
  const [initial, setInitial] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<LocalPlan | null | undefined>(undefined);
  const [pending, setPending] = useState<PlanWrite | null>(null);
  const [saved, setSaved] = useState(false);
  const [zone, setZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const scope = preview ? "preview" : session?.user.id;
  const draftKey = planId
    ? `edit-${planId}`
    : activity
      ? `new-${activity}`
      : "new";
  const [draftStatus, setDraftStatus] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const stopped = useRef(false);
  const discarded = useRef(false);
  const draftSnapshot = useRef<PlanDraft | null>(null);
  const mode: "edit" | "idea" | "blank" = planId
    ? "edit"
    : activity
      ? "idea"
      : "blank";
  const catalogue = useCatalogue(activity ?? "", mode === "idea");
  const sourceId = original ? original.activity_id : (activity ?? null);
  const historicalActivity = sourceId
    ? activities.find((x) => x.id === sourceId)
    : undefined;
  // A new event from an idea needs its current publication; edits and unconfirmed saves do not.
  const idea =
    mode === "idea" && !preview && !pending
      ? catalogue.items[0]
      : (catalogue.items[0] ?? historicalActivity);
  const snapshotOf = (f: EventFields, s: string, p: string, n: string) =>
    JSON.stringify([f.title, f.description, f.categories, s, p, n]);
  const dirty =
    initial !== null && initial !== snapshotOf(fields, start, place, note);
  const locked = busy || pending !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollToEnd({ animated: !reduceMotion }),
    );
    return () => cancelAnimationFrame(frame);
  }, [error, latest, reduceMotion]);
  function applyPlan(plan: LocalPlan) {
    const text = localDateTime(new Date(plan.starts_at));
    const planFields = {
      title: plan.title,
      description: plan.description,
      categories: plan.categories,
    };
    setOriginal(plan);
    setFields(planFields);
    setStart(text);
    setPlace(plan.place_label);
    setNote(plan.note);
    setInitial(snapshotOf(planFields, text, plan.place_label, plan.note));
    setLatest(undefined);
    setError(null);
    setPending(null);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setDraftReady(false);
    setError(null);
    stopped.current = false;
    void (async () => {
      try {
        if (!scope) throw new Error("Sign in to resume your draft.");
        const stored = (await drafts.list(scope)).find(
          (d) => d.key === draftKey,
        );
        if (!active) return;
        if (stored) {
          requestId.current = stored.requestId;
          // Saves recorded before custom events lack event fields; fill them from the idea.
          const legacy = stored.activityId
            ? activities.find((x) => x.id === stored.activityId)
            : undefined;
          const fallback = legacy ? legacyEventFields(legacy) : null;
          const restoredOriginal = stored.original && {
            ...stored.original,
            ...completeEventFields(stored.original, fallback),
          };
          setOriginal(restoredOriginal);
          setFields(completeEventFields(stored, fallback));
          const currentZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          setStart(
            stored.zone !== currentZone && stored.startInstant
              ? localDateTime(new Date(stored.startInstant))
              : stored.start,
          );
          setPlace(stored.place);
          setNote(stored.note);
          setZone(currentZone);
          setInitial(stored.initial);
          setPending(
            stored.pending && {
              ...stored.pending,
              details: {
                ...stored.pending.details,
                ...completeEventFields(stored.pending.details, fallback),
              },
            },
          );
          setDraftStatus(
            stored.pending
              ? "Unconfirmed save restored. Check and retry to finish."
              : "Draft restored from this device.",
          );
          // Preview plans are temporary; restore the editing baseline with its draft.
          if (preview && restoredOriginal)
            setLocalPlans((all) =>
              all.some((p) => p.id === restoredOriginal.id)
                ? all
                : [...all, restoredOriginal],
            );
        } else if (planId) {
          const plan = preview
            ? localPlans.find((p) => p.id === planId)
            : await planGateway.read(planId);
          if (!active) return;
          if (!plan || !canEditPlan(plan, session?.user.id, preview))
            throw new Error(
              "Only the organizer can edit an upcoming, active plan.",
            );
          applyPlan(plan);
        } else if (mode === "blank") {
          setInitial(snapshotOf(fields, start, place, note));
        } else {
          // An idea prefills once it is available (effect below).
          needsPrefill.current = true;
        }
        if (active) setDraftReady(true);
      } catch {
        if (active)
          setError(
            "We couldn’t load your plan or saved draft. Try again before making changes.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // Draft restoration runs once per route/account, not when context refreshes.
  }, [planId, activity, scope, loadAttempt]);
  useEffect(() => {
    if (!needsPrefill.current || !draftReady || !idea) return;
    needsPrefill.current = false;
    const prefilled = fieldsFromActivity(idea);
    setFields(prefilled);
    setInitial(snapshotOf(prefilled, start, place, note));
  }, [draftReady, idea]);

  draftSnapshot.current =
    scope && initial !== null
      ? {
          schema: 1,
          scope,
          key: draftKey,
          activityId: sourceId,
          planId,
          requestId: requestId.current,
          original,
          initial,
          title: fields.title,
          description: fields.description,
          categories: fields.categories,
          start,
          place,
          note,
          zone,
          startInstant: parseLocalDateTime(start)?.toISOString(),
          pending,
          updatedAt: new Date().toISOString(),
        }
      : null;
  async function keepDraft(snapshot = draftSnapshot.current) {
    if (!snapshot) throw new Error("Draft unavailable");
    await drafts.put(snapshot);
  }
  useEffect(() => {
    if (initial === null || !draftReady || saved || busy || stopped.current) return;
    setDraftStatus("Saving draft on this device…");
    let active = true;
    const timer = setTimeout(() => {
      if (saving.current || stopped.current) return;
      void keepDraft()
        .then(() => {
          if (active) {
            setDraftStatus("Draft saved on this device.");
            setDraftError(null);
          }
        })
        .catch(() => {
          if (active)
            setDraftError(
              "Couldn’t save your draft on this device. Keep this screen open and try again.",
            );
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    draftReady,
    start,
    place,
    note,
    zone,
    pending,
    original,
    dirty,
    busy,
    saved,
    initial,
    fields,
  ]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (
        next !== "active" &&
        draftReady &&
        (dirty || pending) &&
        !saving.current &&
        !stopped.current
      )
        void keepDraft().catch(() =>
          setDraftError("Couldn’t save your draft on this device."),
        );
    });
    return () => sub.remove();
  }, [draftReady, dirty, pending]);

  usePreventRemove(
    (dirty || busy || pending !== null) && !saved,
    ({ data }) => {
      if (busy) return;
      const message =
        "Keep this draft on this device and leave? You can resume it from My resbites.";
      const leave = async () => {
        try {
          await keepDraft();
          navigation.dispatch(data.action);
        } catch {
          setDraftError("Couldn’t keep the draft. Stay here and try again.");
        }
      };
      if (Platform.OS === "web") {
        if (window.confirm(message)) void leave();
      } else {
        Alert.alert("Leave this plan?", message, [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Leave",
            onPress: () => void leave(),
          },
        ]);
      }
    },
  );
  useEffect(() => {
    if (saved)
      router.dismissTo({
        pathname: "/plans",
        params: {
          created: !discarded.current && !planId ? "1" : "0",
          updated: !discarded.current && planId ? "1" : "0",
        },
      });
  }, [saved, planId]);

  function discardDraft() {
    const discard = async () => {
      try {
        stopped.current = true;
        await drafts.remove(scope!, draftKey);
        discarded.current = true;
        setSaved(true);
      } catch {
        stopped.current = false;
        setDraftError("Couldn’t discard the draft. Try again.");
      }
    };
    const message = "Delete this draft from this device?";
    if (Platform.OS === "web") {
      if (window.confirm(message)) void discard();
    } else
      Alert.alert("Discard draft?", message, [
        { text: "Keep draft", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => void discard(),
        },
      ]);
  }

  async function locate() {
    if (locating || locked) return;
    const revision = placeRevision.current;
    setLocating(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted")
        throw new Error("Location is off. You can still type a meeting place.");
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [address] = await Location.reverseGeocodeAsync(position.coords);
      if (mounted.current && revision === placeRevision.current) {
        setPlace(
          address
            ? [
                ...new Set(
                  [address.name, address.street, address.city].filter(Boolean),
                ),
              ].join(", ")
            : `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
        );
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not find your location. Type a meeting place instead.",
        );
    } finally {
      if (mounted.current) setLocating(false);
    }
  }

  async function save() {
    if (saving.current || locating) return;
    if (
      !preview &&
      mode === "idea" &&
      !pending &&
      (catalogue.loading || catalogue.error || !idea)
    )
      return;
    let write = pending;
    if (!write) {
      const invalidEvent = validateEventFields(fields);
      if (invalidEvent) {
        setError(invalidEvent);
        return;
      }
      const date = parseLocalDateTime(start);
      const invalid = validatePlan(date?.toISOString() ?? "", place);
      if (invalid) {
        setError(invalid);
        return;
      }
      if (original && !canEditPlan(original, session?.user.id, preview)) {
        setError("This plan is no longer editable. Your draft is unchanged.");
        return;
      }
      write = {
        id: original?.id ?? requestId.current,
        activityId: sourceId,
        version: original?.version,
        details: {
          title: fields.title.trim(),
          description: fields.description,
          categories: fields.categories,
          starts_at: date!.toISOString(),
          time_zone: zone,
          place_label: place.trim(),
          note,
        },
      };
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    try {
      try {
        await keepDraft({ ...draftSnapshot.current!, pending: write });
      } catch {
        throw new PlanSaveError(
          "Couldn’t protect this save on your device. Nothing was sent; try again.",
        );
      }
      setPending(write);
      if (preview) {
        if (original) {
          const current = localPlans.find((p) => p.id === original.id);
          if (
            !current ||
            current.version !== write.version ||
            !canEditPlan(current, undefined, true)
          ) {
            throw new PlanSaveError(
              "This plan changed. Your draft is still here. Review the saved details.",
              false,
              current ?? null,
            );
          }
          setLocalPlans((all) =>
            all.map((p) =>
              p.id === current.id
                ? { ...p, ...write!.details, version: p.version + 1 }
                : p,
            ),
          );
        } else {
          const newPlan: LocalPlan = {
            id: write.id,
            activity_id: write.activityId,
            ...write.details,
            status: "active",
            version: 1,
          };
          setLocalPlans((all) =>
            all.some((p) => p.id === newPlan.id) ? all : [newPlan, ...all],
          );
        }
      } else if (pending) await reconcilePlan(planGateway, write);
      else await writePlan(planGateway, write);
      stopped.current = true;
      await drafts.remove(scope!, draftKey);
      if (mounted.current) {
        setPending(null);
        setSaved(true);
      }
    } catch (e) {
      if (mounted.current) {
        const failure =
          e instanceof PlanSaveError
            ? e
            : new PlanSaveError(
                "We couldn’t confirm the save. Retry when you’re connected.",
                true,
              );
        setError(failure.message);
        setLatest(failure.latest);
        const nextPending = failure.uncertain ? write : null;
        setPending(nextPending);
        stopped.current = false;
        try {
          await keepDraft({ ...draftSnapshot.current!, pending: nextPending });
        } catch {
          setDraftError(
            "Couldn’t update the saved draft. The original save will be checked when you resume.",
          );
        }
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (
    mode === "idea" &&
    !preview &&
    !pending &&
    (catalogue.loading || catalogue.error || !idea)
  )
    return (
      <SafeAreaView style={s.page}>
        <ScrollView contentContainerStyle={s.body}>
          <Back />
          <Title>
            {catalogue.loading
              ? "Checking your activity…"
              : "Activity unavailable"}
          </Title>
          {catalogue.loading ? (
            <ActivityIndicator
              accessibilityLabel="Checking activity"
              color={c.aquaDark}
            />
          ) : (
            <>
              <ErrorNote
                message={
                  catalogue.error ??
                  "This activity is not available to plan right now. Any saved draft stays on this device."
                }
              />
              <Button
                title="Check activity again"
                onPress={catalogue.refresh}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  const preparing = loading || (initial === null && needsPrefill.current);
  if (loading || !draftReady || initial === null || (planId && !original))
    return (
      <SafeAreaView style={s.page}>
        <View style={s.body}>
          <Back />
          <Title>
            {preparing ? "Getting your plan…" : "Let’s take another look."}
          </Title>
          {preparing ? (
            <ActivityIndicator
              accessibilityLabel="Loading plan"
              color={c.aquaDark}
            />
          ) : (
            <>
              <ErrorNote message={error ?? "We couldn’t open this plan. Try again."} />
              {
                <Button
                  title="Try loading again"
                  onPress={() => setLoadAttempt((n) => n + 1)}
                />
              }
            </>
          )}
        </View>
      </SafeAreaView>
    );
  const saveAction = (
    <View style={[s.actionFooter, largeText && { paddingHorizontal: 0 }]}>
      <Button
        title={
          pending
            ? "Retry save"
            : planId
              ? "Save changes"
              : preview
                ? "Save preview plan"
                : "Save plan"
        }
        onPress={save}
        loading={busy}
        disabled={
          locating ||
          latest !== undefined ||
          (Boolean(planId) && !dirty && !pending)
        }
      />
      <Copy style={{ ...s.muted, fontSize: 11, textAlign: "center" }}>
        {preview
          ? "Preview only · no invitations are sent"
          : planId
            ? "Your changes appear after the save is confirmed"
            : "Invite people after your plan is saved"}
      </Copy>
    </View>
  );
  return (
    <SafeAreaView style={s.page}>
      {!largeText && <PreviewNotice dismissible={false} />}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[s.body, { paddingBottom: 28 }]}
        >
          {largeText && <PreviewNotice dismissible={false} />}
          <Back
            label={planId ? "My resbites" : mode === "idea" ? "Idea" : "Back"}
          />
          <View style={styles.activity}>
            <EventPictureView
              picture={eventPicture({
                activity_id: sourceId,
                categories: fields.categories,
              })}
              size={66}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <Copy style={s.muted}>
                {planId ? "YOUR PLAN" : "LET’S GET TOGETHER"}
              </Copy>
              <Title style={{ fontSize: 22, lineHeight: 28 }}>
                {fields.title.trim() || "Your resbite"}
              </Title>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Title>
              {planId ? "A little change of plan." : "Make it a date."}
            </Title>
            <Copy style={s.muted}>
              {planId
                ? "Adjust the details. Existing RSVPs stay as they are."
                : "A time, a place, and something to look forward to."}
            </Copy>
          </View>
          <EventDetailsFields
            value={fields}
            onChange={setFields}
            disabled={locked}
            sourceTitle={
              sourceId ? (idea?.title ?? historicalActivity?.title) : undefined
            }
          />
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <CalendarDays size={19} color={c.aquaDark} />
              <Title style={styles.sectionTitle}>When works?</Title>
            </View>
            <PlanSchedule value={start} onChange={setStart} disabled={locked} />
            <Copy style={{ ...s.muted, fontSize: 12 }}>
              Times shown in {zone.replaceAll("_", " ")}.
            </Copy>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <MapPin size={19} color={c.aquaDark} />
              <Title style={styles.sectionTitle}>Meet you there.</Title>
            </View>
            <Field
              label="Meeting place"
              placeholder="A café, a park, your place…"
              value={place}
              onChangeText={(text) => {
                placeRevision.current++;
                setPlace(text);
              }}
              maxLength={300}
              editable={!locked}
              returnKeyType="done"
            />
            <Button
              title="Use my location"
              secondary
              icon={false}
              onPress={locate}
              loading={locating}
              disabled={locked}
            />
            <Copy style={s.muted}>
              A name or address is enough. Location is optional.
            </Copy>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <MessageCircle size={19} color={c.aquaDark} />
              <Title style={styles.sectionTitle}>One more thing?</Title>
            </View>
            <Field
              label="A note for everyone (optional)"
              placeholder="What to bring, where to find you…"
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
              style={{ minHeight: 110 }}
              maxLength={2000}
              editable={!locked}
            />
          </View>
          <Copy style={s.muted} accessibilityLiveRegion="polite">
            {draftStatus}
          </Copy>
          <ErrorNote message={draftError} />
          {draftError && (
            <Button
              title="Retry keeping draft"
              secondary
              onPress={() => {
                void keepDraft()
                  .then(() => {
                    setDraftError(null);
                    setDraftStatus("Draft saved on this device.");
                  })
                  .catch(() => {});
              }}
            />
          )}
          <ErrorNote message={error} />
          {latest !== undefined && (
            <View style={[styles.section, { backgroundColor: c.pinkSoft }]}>
              <Title style={styles.sectionTitle}>Latest saved plan</Title>
              {latest ? (
                <>
                  <Copy>{latest.title}</Copy>
                  <Copy>{new Date(latest.starts_at).toLocaleString()}</Copy>
                  <Copy>{latest.place_label}</Copy>
                  <Copy>{latest.note || "No note"}</Copy>
                  {canEditPlan(latest, session?.user.id, preview) ? (
                    <>
                      <Copy style={s.muted}>
                        Using these details replaces your unsaved draft.
                      </Copy>
                      <Button
                        title="Use latest saved details"
                        secondary
                        onPress={() => applyPlan(latest)}
                      />
                    </>
                  ) : (
                    <Copy>This plan is no longer editable.</Copy>
                  )}
                </>
              ) : (
                <Copy>This plan is no longer available to your account.</Copy>
              )}
            </View>
          )}
          {pending && (
            <Copy style={s.muted}>
              The fields are held while the save is unconfirmed, so retrying
              sends exactly the same details.
            </Copy>
          )}
          {!pending && !busy && (
            <Button title="Discard draft" secondary onPress={discardDraft} />
          )}
          {largeText && saveAction}
        </ScrollView>
        {!largeText && saveAction}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  activity: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    gap: 13,
    borderRadius: 24,
    backgroundColor: c.cream,
  },
  section: {
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 24,
    backgroundColor: c.paper,
  },
  sectionHeading: { flexDirection: "row", gap: 10, alignItems: "center" },
  sectionTitle: { fontSize: 23, lineHeight: 30, flexShrink: 1 },
});
