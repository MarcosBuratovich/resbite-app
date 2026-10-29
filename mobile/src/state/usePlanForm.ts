import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import * as Crypto from "expo-crypto";
import type { NavigationAction } from "expo-router/react-navigation";
import { useApp } from "./AppState";
import { useCatalogue } from "./useCatalogue";
import { useCoverPhoto, type CoverControls, type CoverOutcome } from "./useCoverPhoto";
import {
  afterSaveNotice,
  createWrite,
  editChangesTimeOrPlace,
  editWrite,
  hasUnsavedChanges,
  modeFor,
  submitCheck,
  type PlanFormMode,
  type SubmitCheck,
} from "./planFormModel";
import { fieldsFromActivity } from "../domain/events";
import {
  EMPTY_FORM,
  formForAgain,
  formFromIdea,
  formFromPlan,
  notifyCount as countNotified,
  type MissingItem,
  type PlanForm,
} from "../domain/planForm";
import { PLAN_COPY } from "../domain/planCopy";
import type { PlanFormField } from "../domain/videoLinks";
import { canEditPlan, PlanSaveError, reconcilePlan, writePlan, type Plan, type PlanWrite } from "../domain/plans";
import { planGateway, setGuestNote } from "../services/plans";
import { readGuests } from "../services/rsvp";
import { recentPlaces } from "../services/recentPlaces";
import { createJournal } from "../services/journal";
import { syncReminders } from "../services/deviceReminders";
import { coverDescriptionGateway, coverGateway, signedCovers } from "../services/planCovers";

export type PlanFormController = {
  mode: PlanFormMode;
  form: PlanForm;
  set<K extends keyof PlanForm>(key: K, value: PlanForm[K]): void;
  patch(p: Partial<PlanForm>): void;
  original: Plan | null;
  loading: boolean;
  loadError: string | null;
  dirty: boolean;
  attempted: boolean;
  missing: MissingItem[];
  videoFields: PlanFormField[];
  /** The start is not in the future (then `when` is in `missing`). */
  whenPast: boolean;
  /** The check a save runs now; `missing`, `videoFields` and `whenPast` are the same as of the last render. */
  check(): SubmitCheck;
  zone: string;
  cover: CoverControls;
  /** Edit: guests a change reaches (accepted, maybe, pending). */
  notifyCount: number;
  /** Edit: the form changes the start, end, zone or place. */
  timeOrPlaceChanged: boolean;
  busy: boolean;
  error: string | null;
  /** Set when a new resbite exists. */
  created: Plan | null;
  /** How the new resbite's cover photo went; "none" until created or without a photo. */
  coverOutcome: CoverOutcome;
  submit(): Promise<void>;
  leave: { asked: boolean; keep(): void; discard(): void };
};

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const messageOf = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** The picture an "again" plan starts with: the original's cover, copied to the new plan unless a new photo is chosen. */
type CoverFallback = { path: string; uri: string | null; description: string };

/**
 * The plan screen's one hook: loads the idea or plan, holds the form, checks it and saves it.
 * Every decision lives in planFormModel and the domain; this orchestrates the reads and writes.
 */
export function usePlanForm(params: { activity?: string; plan?: string; again?: string }): PlanFormController {
  const mode = modeFor(params);
  const sourceId = params.plan ?? params.again ?? null;
  const { preview, session, localPlans, setLocalPlans, captureSession } = useApp();
  const navigation = useNavigation();
  const scope = preview ? "preview" : session?.user.id;
  const ownerId = session?.user.id ?? null;
  const [zone] = useState(deviceZone);
  const requestId = useRef(Crypto.randomUUID());
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [initial, setInitial] = useState<PlanForm>(EMPTY_FORM);
  const [original, setOriginal] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(mode !== "blank");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [fallback, setFallback] = useState<CoverFallback | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Plan | null>(null);
  const [coverOutcome, setCoverOutcome] = useState<CoverOutcome>("none");
  // The idea a create carries; dropped when the server says it was withdrawn, so the next Create goes without it.
  const [ideaId, setIdeaId] = useState<string | null>(mode === "idea" ? (params.activity ?? null) : null);

  // Preview keeps plans in memory, so the resbite being edited is there on the first render, photo and all.
  const editedId = mode === "edit" ? (params.plan ?? null) : null;
  const previewPlan = preview && editedId ? (localPlans.find((p) => p.id === editedId) ?? null) : null;
  const updatePreviewPlan = (change: Partial<Plan>) => {
    // Only an edit changes a saved resbite's photo; a new one (Do this again too) holds its photo until Create.
    if (editedId) setLocalPlans((all) => all.map((p) => (p.id === editedId ? { ...p, ...change } : p)));
  };
  const cover = useCoverPhoto({
    planId: editedId,
    preview,
    previewUri: previewPlan?.cover_path ?? null,
    previewDescription: previewPlan?.cover_description ?? "",
    onPreviewChange: (uri) => updatePreviewPlan({ cover_path: uri }),
    onPreviewDescribe: (text) => updatePreviewPlan({ cover_description: text }),
  });
  const coverRef = useRef(cover);
  coverRef.current = cover;

  function begin(next: PlanForm) {
    setForm(next);
    setInitial(next);
  }

  // An idea fills the title, description and categories once it has loaded.
  const catalogue = useCatalogue(params.activity ?? "", mode === "idea");
  const idea = catalogue.items[0];
  const ideaLoaded = useRef(false);
  useEffect(() => {
    if (mode !== "idea" || ideaLoaded.current || catalogue.loading) return;
    if (catalogue.error) {
      setLoadError(catalogue.error);
      setLoading(false);
    } else if (idea) {
      ideaLoaded.current = true;
      begin(formFromIdea(fieldsFromActivity(idea)));
      setLoadError(null);
      setLoading(false);
    } else {
      setLoadError(PLAN_COPY.ideaUnavailable);
      setLoading(false);
    }
  }, [mode, catalogue.loading, catalogue.error, idea]);

  // Edit and again read the plan; edit also reads its guests, again the original's picture.
  useEffect(() => {
    if (mode !== "edit" && mode !== "again") return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const plan = preview
          ? (localPlans.find((p) => p.id === sourceId) ?? null)
          : await planGateway.read(sourceId!);
        if (!active) return;
        if (!plan) throw new Error(PLAN_COPY.loadFailed);
        if (mode === "edit") {
          if (!canEditPlan(plan, ownerId ?? undefined, preview)) throw new Error(PLAN_COPY.notEditable);
          const guests = preview ? [] : await readGuests(plan.id);
          if (!active) return;
          setGuestCount(countNotified(guests));
          setOriginal(plan);
          begin(formFromPlan(plan));
        } else {
          setOriginal(plan);
          begin(formForAgain(plan));
          const picture = preview
            ? { path: plan.cover_path ?? null, description: plan.cover_description ?? "" }
            : ownerId
              ? await coverDescriptionGateway(ownerId, plan.id).read()
              : null;
          if (!active) return;
          if (picture?.path) {
            const uri = preview ? picture.path : await signedCovers.get(picture.path).catch(() => null);
            if (active) setFallback({ path: picture.path, uri, description: picture.description });
          }
        }
      } catch (e) {
        if (active) setLoadError(messageOf(e, PLAN_COPY.loadFailed));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // Reads once per plan and account, not when context refreshes.
  }, [mode, sourceId, scope]);

  const dirty = hasUnsavedChanges(mode, form, initial, cover);
  // Read at every render: whether the start has passed depends on the time, not only on the form.
  const check = () => submitCheck(form, zone, Date.now(), mode === "edit" ? original : null);
  const { missing, videoFields, past: whenPast } = check();
  const timeOrPlaceChanged = mode === "edit" && original ? editChangesTimeOrPlace(form, zone, original) : false;

  // The leave guard keeps the navigation action until the host decides.
  const [asked, setAsked] = useState(false);
  const pendingLeave = useRef<NavigationAction | null>(null);
  usePreventRemove(dirty && !created && !busy, ({ data }) => {
    pendingLeave.current = data.action;
    setAsked(true);
  });
  const leave = {
    asked,
    keep: () => {
      pendingLeave.current = null;
      setAsked(false);
    },
    discard: () => {
      const action = pendingLeave.current;
      pendingLeave.current = null;
      setAsked(false);
      if (action) navigation.dispatch(action);
    },
  };

  // A new resbite from "again" takes the original's picture unless a new one was chosen.
  async function copyFallbackCover(planId: string, description: string) {
    if (!ownerId || !fallback) return;
    await coverGateway(ownerId, planId).link(fallback.path, null, 0);
    const text = description.trim();
    if (!text) return;
    const gateway = coverDescriptionGateway(ownerId, planId);
    const current = await gateway.read();
    if (current) await gateway.save(text, current.revision);
  }

  async function create(assertSession: () => void) {
    const live = coverRef.current;
    const stored = await createJournal.read(scope!);
    // A journaled request is finished by reading first, never by creating a second time.
    const journaled = stored && stored.requestId === requestId.current ? stored : null;
    const write: PlanWrite =
      journaled?.write ??
      createWrite(form, zone, requestId.current, mode, ideaId);
    const note = form.guestNote.trim();
    let plan: Plan;
    if (preview) {
      plan = {
        id: write.id,
        activity_id: write.activityId,
        cover_path: live.uri ?? fallback?.uri ?? null,
        cover_description: live.description || fallback?.description || "",
        ...write.details,
        guest_note: note,
        series_id: "",
        repeats_from: null,
        status: "active",
        version: 1,
      };
      setLocalPlans((all) => (all.some((p) => p.id === plan.id) ? all : [plan, ...all]));
      if (!form.placeTbd && form.place.trim())
        void recentPlaces.remember(scope!, form.place.trim(), assertSession).catch(() => {});
    } else {
      if (!journaled) {
        try {
          await createJournal.put(scope!, { requestId: requestId.current, write, savedAt: new Date().toISOString() });
        } catch {
          throw new PlanSaveError(PLAN_COPY.notProtected);
        }
      }
      try {
        if (journaled) await reconcilePlan(planGateway, write);
        else await writePlan(planGateway, write);
      } catch (e) {
        // A definite refusal wrote nothing; an uncertain one keeps the journal for the retry and the next launch.
        if (e instanceof PlanSaveError && !e.uncertain) await createJournal.clear(scope!, requestId.current).catch(() => {});
        throw e;
      }
      // The plan exists from here on; what follows never turns the create into a failure.
      const withNew = live.uri !== null;
      const outcome = await live.commitAfterCreate(write.id).catch((): CoverOutcome => "failed");
      if (mounted.current) setCoverOutcome(outcome);
      if (!withNew)
        await copyFallbackCover(write.id, live.description || fallback?.description || "").catch(() => {});
      const noteFailed = note ? await setGuestNote(write.id, note).then(() => null, (e) => messageOf(e, PLAN_COPY.unconfirmed)) : null;
      if (!form.placeTbd && form.place.trim())
        void recentPlaces.remember(scope!, form.place.trim(), assertSession).catch(() => {});
      await createJournal.clear(scope!, requestId.current).catch(() => {});
      if (noteFailed && mounted.current) setError(noteFailed);
      plan = (await planGateway.read(write.id).catch(() => null)) ?? {
        id: write.id,
        activity_id: write.activityId,
        ...write.details,
        status: "active",
        version: 1,
        series_id: "",
        repeats_from: null,
      };
    }
    // This phone's reminders follow the new plan now, not at the next app-active.
    void syncReminders({ userId: ownerId, preview }).catch(() => {});
    if (mounted.current) setCreated(plan);
  }

  async function edit(plan: Plan) {
    const write = editWrite(form, zone, plan);
    const note = form.guestNote.trim();
    const noteChanged = note !== (plan.guest_note ?? "");
    if (preview) {
      setLocalPlans((all) =>
        all.map((p) =>
          p.id === plan.id
            ? { ...p, ...write.details, guest_note: note, version: p.version + 1 }
            : p,
        ),
      );
    } else {
      await writePlan(planGateway, write);
      if (noteChanged) await setGuestNote(plan.id, note);
    }
    // The saved plan is the new baseline, so the guard lets the screen go.
    if (mounted.current) setInitial(form);
    void syncReminders({ userId: ownerId, preview }).catch(() => {});
    router.dismissTo({
      pathname: "/event",
      params: { plan: plan.id, notice: afterSaveNotice("edit") },
    });
  }

  async function submit() {
    if (saving.current || created) return;
    setAttempted(true);
    const now = check();
    if (now.missing.length > 0 || now.videoFields.length > 0) return;
    if (!scope || (mode === "edit" && !original)) return;
    if (mode === "edit" && original && !canEditPlan(original, ownerId ?? undefined, preview)) {
      setError(PLAN_COPY.notEditable);
      return;
    }
    // Nothing changed: Save leaves as a save does, without writing and without a notice.
    if (mode === "edit" && original && !dirty) {
      router.dismissTo({ pathname: "/event", params: { plan: original.id } });
      return;
    }
    // Captured before the first await so a sign-out during the save is detected.
    const assertSession = captureSession();
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      // A photo still being chosen, removed or described finishes first, so the save goes with it.
      await coverRef.current.idle();
      if (mode === "edit") await edit(original!);
      else await create(assertSession);
    } catch (e) {
      if (mounted.current) {
        if (mode === "edit" && e instanceof PlanSaveError && e.latest) {
          // Someone saved first: show their version, from which the next Save starts.
          setOriginal(e.latest);
          begin(formFromPlan(e.latest));
          setError(PLAN_COPY.editConflict);
        } else {
          if (e instanceof PlanSaveError && e.reason === "idea") setIdeaId(null);
          // Note failures after an edit's plan saved carry their own message; a save error maps as writePlan did.
          setError(e instanceof PlanSaveError ? e.message : messageOf(e, PLAN_COPY.unconfirmed));
        }
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const shownCover: CoverControls =
    fallback && !cover.uri
      ? { ...cover, uri: fallback.uri, description: cover.description || fallback.description }
      : cover;

  return {
    mode,
    form,
    set: (key, value) => setForm((f) => ({ ...f, [key]: value })),
    patch: (p) => setForm((f) => ({ ...f, ...p })),
    original,
    loading,
    loadError,
    dirty,
    attempted,
    missing,
    videoFields,
    whenPast,
    check,
    zone,
    cover: shownCover,
    notifyCount: guestCount,
    timeOrPlaceChanged,
    busy,
    error,
    created,
    coverOutcome,
    submit,
    leave,
  };
}
