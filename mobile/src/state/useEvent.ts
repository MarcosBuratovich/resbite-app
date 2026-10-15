import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, type LocalPlan } from "./AppState";
import { useAccount } from "./AccountState";
import { useFocusedRefresh, type Run } from "./useFocusedRefresh";
import { cancelPlan, PlanSaveError } from "../domain/plans";
import { reconcileRsvp, type Response, type RsvpAttempt } from "../domain/rsvp";
import { planGateway } from "../services/plans";
import { readEvent, readGuests, readRsvp, writeRsvp, type EventSnapshot, type Guest } from "../services/rsvp";
import { syncReminders } from "../services/deviceReminders";

export type EventRole = "owner" | "invitee";
export type EventPage = {
  plan: LocalPlan | null;
  role: EventRole | null;
  attendee: EventSnapshot["attendee"];
  organizer: string | null;
  guests: Guest[];
  busy: boolean;
  fresh: boolean;
  error: string | null;
  notice: string | null;
  pending: RsvpAttempt | null;
  load: () => Promise<void>;
  respond: (value: Response, retry?: RsvpAttempt) => Promise<void>;
  cancel: () => Promise<void>;
  setNotice: (notice: string | null) => void;
};

/**
 * One event for both roles (UX1). load and respond are invite.tsx's logic, unchanged
 * apart from reading the whole event; cancel is My resbites' (cancelPlan), unchanged.
 */
export function useEvent(planId: string | undefined): EventPage {
  const { session, preview, localPlans, setLocalPlans, signingOut } = useApp();
  const account = useAccount();
  const accountReady = account.status === "approved" && account.reviewed && account.profileReady;
  const userId = session?.user.id;
  const identity = `${userId}:${planId}:${preview}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const working = useRef(false);
  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(!preview),
    [fresh, setFresh] = useState(false);
  const [pending, setPending] = useState<RsvpAttempt | null>(null);
  // UX3: this phone's reminders follow every event load, answer and cancellation; failures wait for the next sync.
  const syncDevice = () => void syncReminders({ userId: userId ?? null, preview }).catch(() => {});
  useEffect(() => {
    setSnapshot(null);
    setPending(null);
    setNotice(null);
    setError(null);
    setFresh(false);
    working.current = false;
  }, [identity]);
  const read = useCallback(
    async (begin: () => Run) => {
      if (!userId || !planId || preview || signingOut || working.current || !accountReady) return;
      const { valid } = begin();
      setBusy(true);
      setFresh(false);
      setError(null);
      try {
        const next = await readEvent(planId, userId);
        if (valid()) {
          setSnapshot(next);
          setFresh(true);
          syncDevice();
        }
      } catch (e) {
        if (valid()) {
          setSnapshot(null);
          setError(e instanceof Error ? e.message : "Invitation unavailable.");
        }
      } finally {
        if (valid()) setBusy(false);
      }
    },
    [planId, userId, preview, signingOut, accountReady],
  );
  const {
    refresh: load,
    begin,
    focused,
  } = useFocusedRefresh(read, { identity, onBackground: () => setFresh(false) });
  const plan = preview ? (localPlans.find((p) => p.id === planId) ?? null) : (snapshot?.plan ?? null);
  const role: EventRole | null = !plan ? null : preview || plan.owner_id === userId ? "owner" : "invitee";
  async function respond(value: Response, retry?: RsvpAttempt) {
    const current = snapshot;
    const attendee = current?.attendee;
    if (!current || !attendee || !userId || preview || !accountReady || working.current || !focused.current) return;
    working.current = true;
    const { valid, assertSession } = begin();
    setBusy(true);
    setError(null);
    setNotice(null);
    setFresh(false);
    const attempt = retry ?? {
      planId: current.plan.id,
      planVersion: current.plan.version,
      version: attendee.version,
      response: value,
    };
    setPending(attempt);
    try {
      let next = await readRsvp(attempt.planId, userId);
      if (!valid()) return;
      const decision = reconcileRsvp(attempt, next);
      if (decision === "retry") {
        try {
          assertSession();
          await writeRsvp(attempt);
        } catch {
          /* Confirm saved state before offering an identical retry. */
        }
        if (!valid()) return;
        next = await readRsvp(attempt.planId, userId);
        if (!valid()) return;
      }
      const confirmed = next;
      setSnapshot((old) => ({
        plan: confirmed.plan,
        attendee: confirmed.attendee,
        organizer: old?.organizer ?? null,
        guests: (old?.guests ?? []).map((g) =>
          g.userId === userId ? { ...g, response: confirmed.attendee.response } : g,
        ),
      }));
      setFresh(true);
      const result = reconcileRsvp(attempt, confirmed);
      if (result === "confirmed") {
        setPending(null);
        setNotice("Your response is saved.");
        syncDevice();
        // UX-P5: answering reveals who's coming; the server now returns the whole list.
        try {
          const list = await readGuests(attempt.planId);
          if (valid()) setSnapshot((old) => (old ? { ...old, guests: list } : old));
        } catch {
          if (valid()) setError("Your answer is saved, but who’s coming couldn’t load. Refresh to try again.");
        }
      } else if (result === "review" || result === "unavailable") {
        setPending(null);
        setError(
          result === "review"
            ? "The plan or your response changed. Review the latest details before choosing again."
            : "This plan is cancelled or has already started. Responses are closed.",
        );
      } else
        setError(
          "Your response is not confirmed. Retry checks the saved response before trying the same choice again.",
        );
    } catch {
      if (valid()) setError("We could not confirm your response. Check your connection, then retry.");
    } finally {
      if (currentIdentity.current === identity) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  async function cancel() {
    const target = plan;
    if (!target || working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    let failure: string | null = null;
    let reload = !preview;
    try {
      if (preview)
        setLocalPlans((all) =>
          all.map((x) => (x.id === target.id ? { ...x, status: "cancelled", version: x.version + 1 } : x)),
        );
      else await cancelPlan(planGateway, { id: target.id, version: target.version });
    } catch (e) {
      failure = e instanceof PlanSaveError ? e.message : "Could not cancel. Refresh and try again.";
      // As on My resbites: a definite failure reloads first; an uncertain one keeps what is shown.
      reload = !preview && e instanceof PlanSaveError && !e.uncertain;
    }
    working.current = false;
    if (reload) await load();
    if (failure) setError(failure);
    else {
      setNotice(preview ? "Preview plan cancelled." : "Your plan is cancelled.");
      syncDevice();
    }
    setBusy(false);
  }
  return {
    plan,
    role,
    attendee: snapshot?.attendee ?? null,
    organizer: snapshot?.organizer ?? null,
    guests: snapshot?.guests ?? [],
    busy,
    fresh: preview || fresh,
    error,
    notice,
    pending,
    load,
    respond,
    cancel,
    setNotice,
  };
}
