import { useEffect, useRef, useState } from "react";
import { AppState, Alert, Keyboard, Platform } from "react-native";
import { router } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { activities } from "../services/catalogue";
import { useCatalogue } from "./useCatalogue";
import { drafts, type PlanDraft } from "../services/drafts";
import { planGateway } from "../services/plans";
import { recentPlaces } from "../services/recentPlaces";
import { useApp, type LocalPlan } from "./AppState";
import { useCoverPhoto, type CoverControls, type CoverOutcome } from "./useCoverPhoto";
import {
  completeEventFields,
  fieldsFromActivity,
  legacyEventFields,
  validateEventFields,
  type EventFields,
} from "../domain/events";
import { canDiscardDraft, draftAutosaveAction } from "../domain/draftAutosave";
import { defaultStart } from "../domain/schedule";
import { validatePlan, type Activity } from "../domain/rules";
import {
  canEditPlan,
  localDateTime,
  parseLocalDateTime,
  PlanSaveError,
  writePlan,
  reconcilePlan,
  type PlanWrite,
} from "../domain/plans";

export type PlanEditorMode = "edit" | "idea" | "blank";

export type PlanEditor = {
  mode: PlanEditorMode;
  preview: boolean;
  /** "preview" or the signed-in account id; undefined while signed out. */
  scope: string | undefined;
  catalogue: ReturnType<typeof useCatalogue>;
  idea: Activity | undefined;
  historicalActivity: Activity | undefined;
  /** The idea this event comes from, or null for a blank event. */
  sourceId: string | null;
  original: LocalPlan | null;
  /** An idea that must be re-checked before a new event can use it. */
  ideaBlocked: boolean;
  loading: boolean;
  preparing: boolean;
  /** The draft, plan or idea has loaded and the fields can be shown. */
  ready: boolean;
  /** A draft from this device was restored when the editor opened. */
  restored: boolean;
  retryLoad: () => void;
  fields: EventFields;
  setFields: (next: EventFields) => void;
  start: string;
  setStart: (next: string) => void;
  place: string;
  /** Typing or choosing a place; a running "Use my location" then never overwrites it. */
  changePlace: (next: string) => void;
  note: string;
  setNote: (next: string) => void;
  zone: string;
  dirty: boolean;
  locked: boolean;
  busy: boolean;
  locating: boolean;
  saved: boolean;
  /** Set when a new event is created; the editor then shows the Invite screen. */
  created: { planId: string; cover: CoverOutcome } | null;
  error: string | null;
  latest: LocalPlan | null | undefined;
  latestEditable: boolean;
  pending: PlanWrite | null;
  draftStatus: string;
  draftError: string | null;
  draftRetryLabel: "Retry keeping draft" | "Try again";
  cover: CoverControls;
  save: () => Promise<void>;
  locate: () => Promise<void>;
  discardDraft: () => void;
  retryDraft: () => void;
  applyPlan: (plan: LocalPlan) => void;
};

/** Asks before deleting a draft from this device, then calls `discard` (the editor and My resbites). */
export function confirmDiscardDraft(discard: () => void) {
  const message = "Delete this draft from this device?";
  if (Platform.OS === "web") {
    if (window.confirm(message)) discard();
  } else
    Alert.alert("Discard draft?", message, [
      { text: "Keep draft", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: discard,
      },
    ]);
}

/**
 * All of the plan editor's state and behaviour: draft restore and autosave, the
 * leave guard, the cover hook, validation, save, pending writes, reconciliation and
 * post-save routing. Moved unchanged from app/arrange.tsx (UX1); screens only render.
 */
export function usePlanEditor({
  activity,
  plan: planId,
}: {
  activity?: string;
  plan?: string;
}): PlanEditor {
  const { preview, session, localPlans, setLocalPlans, captureSession } = useApp();
  const navigation = useNavigation();
  const requestId = useRef(Crypto.randomUUID());
  const saving = useRef(false);
  const mounted = useRef(true);
  const placeRevision = useRef(0);
  const [original, setOriginal] = useState<LocalPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // A new event starts tomorrow at 10:00; the blank and idea baselines are taken from it, so an untouched editor stays clean.
  const [start, setStart] = useState(() => defaultStart(new Date()));
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [fields, setFields] = useState<EventFields>({
    title: "",
    description: "",
    categories: [],
  });
  const needsPrefill = useRef(false);
  const coverOutcome = useRef<CoverOutcome>("none");
  const createdId = useRef<string | null>(null);
  const [created, setCreated] = useState<{ planId: string; cover: CoverOutcome } | null>(null);
  const cover = useCoverPhoto({
    planId: planId ?? null,
    preview,
    previewUri: preview && planId ? (localPlans.find((p) => p.id === planId)?.cover_path ?? null) : null,
    previewDescription: preview && planId ? (localPlans.find((p) => p.id === planId)?.cover_description ?? "") : "",
    onPreviewDescribe: (text) => {
      if (planId)
        setLocalPlans((all) => all.map((p) => (p.id === planId ? { ...p, cover_description: text } : p)));
    },
    onPreviewChange: (uri) => {
      if (planId)
        setLocalPlans((all) => all.map((p) => (p.id === planId ? { ...p, cover_path: uri } : p)));
    },
  });
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
  // UX1: a restored draft opens at Review when complete, else at its first missing step.
  const [restored, setRestored] = useState(false);
  const stopped = useRef(false);
  const discarded = useRef(false);
  const draftSnapshot = useRef<PlanDraft | null>(null);
  // A draft was written or restored in this editor session; counts writes so a removal never outlives a newer put.
  const persisted = useRef(false);
  const draftWrites = useRef(0);
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
    persisted.current = false;
    setRestored(false);
    void (async () => {
      try {
        if (!scope) throw new Error("Sign in to resume your draft.");
        const stored = (await drafts.list(scope)).find(
          (d) => d.key === draftKey,
        );
        if (!active) return;
        if (stored) {
          persisted.current = true;
          setRestored(true);
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
          original:
            original &&
            (({ cover_path: _cover, cover_revision: _revision, cover_description: _description, ...rest }) => rest)(original),
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
    // Marked when issued: the store is FIFO, so a later removal is ordered after this put.
    persisted.current = true;
    draftWrites.current += 1;
    await drafts.put(snapshot);
  }
  // Removes this session's draft; a newer put keeps the persisted flag set.
  async function removeDraft(target = { scope, key: draftKey }) {
    if (!target.scope) throw new Error("Draft unavailable");
    const writes = draftWrites.current;
    await drafts.remove(target.scope, target.key);
    if (draftWrites.current === writes) persisted.current = false;
  }
  // A removal waiting on the debounce, flushed if the screen unmounts first.
  const dueRemoval = useRef<{ scope: string | undefined; key: string } | null>(null);
  useEffect(
    () => () => {
      const due = dueRemoval.current;
      dueRemoval.current = null;
      if (due && !saving.current && !stopped.current && !savedRef.current)
        void removeDraft(due).catch(() => {});
    },
    [],
  );
  const savedRef = useRef(false);
  savedRef.current = saved;
  useEffect(() => {
    if (initial === null || !draftReady || saved || busy || stopped.current) return;
    const action = draftAutosaveAction({ dirty, pending, persisted: persisted.current });
    dueRemoval.current = null;
    if (action === "skip") {
      setDraftStatus("");
      setDraftError(null);
      return;
    }
    let active = true;
    if (action === "remove") {
      dueRemoval.current = { scope, key: draftKey };
      const timer = setTimeout(() => {
        dueRemoval.current = null;
        if (saving.current || stopped.current || !scope) return;
        void removeDraft()
          .then(() => {
            if (active) {
              setDraftStatus("");
              setDraftError(null);
            }
          })
          .catch(() => {
            if (active)
              setDraftError(
                "Couldn’t update your draft on this device. Keep this screen open and try again.",
              );
          });
      }, 350);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
    setDraftStatus("Saving draft on this device…");
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
    (dirty || busy || cover.busy || pending !== null) && !saved,
    ({ data }) => {
      if (busy || cover.busy) return;
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
          // Discarding is reachable from every step, not only Review, under the same condition
          // as Review's button; it asks "Discard draft?" first. On the web, Review's button and
          // the My resbites tile discard instead.
          ...(canDiscardDraft({ pending, busy })
            ? [{ text: "Discard draft", style: "destructive" as const, onPress: discardDraft }]
            : []),
        ]);
      }
    },
  );
  useEffect(() => {
    if (!saved) return;
    // UX1: a new event shows the Invite screen (benchmark row 1), whose "Later" dismisses
    // to My resbites with created=1. Edits return to the event page (UX2-D1), discards to My resbites.
    if (!discarded.current && !planId && createdId.current) {
      setCreated({ planId: createdId.current, cover: coverOutcome.current });
      return;
    }
    const notice = Date.now().toString(36);
    // UX2-D1: a saved edit returns to its event page; a discard returns to My resbites.
    if (!discarded.current && planId)
      router.dismissTo({ pathname: "/event", params: { plan: planId, notice, cover: coverOutcome.current } });
    else router.dismissTo({ pathname: "/plans", params: { created: "0", notice, cover: coverOutcome.current } });
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
    confirmDiscardDraft(() => void discard());
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
    if (saving.current || locating || cover.busy) return;
    if (
      !preview &&
      mode === "idea" &&
      !pending &&
      (catalogue.loading || catalogue.error || !idea)
    )
      return;
    // Captured before the first await so a sign-out during the save is detected (UX-P6).
    const assertSession = captureSession();
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
          // An unchanged start keeps the event's own zone, so an edit from another zone is not a time change.
          time_zone:
            original && Date.parse(original.starts_at) === date!.getTime()
              ? original.time_zone
              : zone,
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
            cover_path: cover.uri,
            cover_description: cover.description,
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
      if (!preview && !original) coverOutcome.current = await cover.commitAfterCreate(write.id);
      if (!original) createdId.current = write.id;
      stopped.current = true;
      await drafts.remove(scope!, draftKey);
      // Recent places (UX-P6) are a convenience on this device; they never fail the save.
      void recentPlaces
        .remember(scope!, write.details.place_label, assertSession)
        .catch(() => {});
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
  const latestEditable = latest ? canEditPlan(latest, session?.user.id, preview) : false;
  // The draft-error retry, moved verbatim from arrange.tsx's inline onPress.
  function retryDraft() {
    const action = draftAutosaveAction({
      dirty,
      pending,
      persisted: persisted.current,
    });
    if (action === "skip") {
      setDraftError(null);
      setDraftStatus("");
      return;
    }
    if (action === "remove") {
      void removeDraft()
        .then(() => {
          setDraftError(null);
          setDraftStatus("");
        })
        .catch(() => {});
      return;
    }
    void keepDraft()
      .then(() => {
        setDraftError(null);
        setDraftStatus("Draft saved on this device.");
      })
      .catch(() => {});
  }
  return {
    mode,
    preview,
    scope,
    catalogue,
    idea,
    historicalActivity,
    sourceId,
    original,
    ideaBlocked:
      mode === "idea" &&
      !preview &&
      !pending &&
      (catalogue.loading || Boolean(catalogue.error) || !idea),
    loading,
    preparing: loading || (initial === null && needsPrefill.current),
    ready: !loading && draftReady && initial !== null && !(planId && !original),
    restored,
    retryLoad: () => setLoadAttempt((n) => n + 1),
    fields,
    setFields,
    start,
    setStart,
    place,
    changePlace: (text: string) => {
      placeRevision.current++;
      setPlace(text);
    },
    note,
    setNote,
    zone,
    dirty,
    locked,
    busy,
    locating,
    saved,
    created,
    error,
    latest,
    latestEditable,
    pending,
    draftStatus,
    draftError,
    draftRetryLabel:
      draftAutosaveAction({ dirty, pending, persisted: persisted.current }) === "write"
        ? "Retry keeping draft"
        : "Try again",
    cover,
    save,
    locate,
    discardDraft,
    retryDraft,
    applyPlan,
  };
}
