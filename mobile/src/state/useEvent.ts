import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, type LocalPlan } from "./AppState";
import { useAccount } from "./AccountState";
import { useFocusedRefresh, type Run } from "./useFocusedRefresh";
import { cancelPlan, PlanSaveError } from "../domain/plans";
import { reconcileRsvp, type Response, type RsvpAttempt } from "../domain/rsvp";
import { planGateway } from "../services/plans";
import { readEvent, readGuests, readRsvp, writeRsvp, type EventSnapshot, type Guest } from "../services/rsvp";
import { syncReminders } from "../services/deviceReminders";
import { adminErrorMessage, appointAdmin, removeAdmin } from "../services/admins";
import { muteErrorMessage, readMutedSeries, setPlanMute } from "../services/mutes";
import { EVENT_COPY, viewerRole, type AnswerCounts, type Viewer } from "../domain/eventPage";
import { storedEntry } from "../domain/contactInvites";
import { contactInviteGateway } from "../services/contactInvites";
import { inviteCodeStore, type StoredInvite } from "../services/inviteCodeStore";
import { formatPhone, phoneSendForm } from "../domain/phone";
import { joinRequestGateway, type HostRequest } from "../services/joinRequests";

/** Someone a host invited by personal link who hasn't answered: the stored name, else the number. */
export type InvitedPerson = {
  phone: string;
  e164: string;
  country: string;
  name: string;
  /** This phone's code for them, found under their number or another spelling of it; null when this phone has none. */
  stored: StoredInvite | null;
  /** The key `stored` is saved under (the E.164, or the other spelling), so removing the invitation forgets it. */
  storedKey: string | null;
};

export type EventPage = {
  plan: LocalPlan | null;
  /** The signed-in person's part in this resbite: its host, an admin the host appointed, or a guest. */
  role: Viewer | null;
  /** The ids of the people the host made admins. */
  admins: string[];
  /** This person has muted this resbite's series: the server keeps it, so it holds on every phone. */
  muted: boolean;
  attendee: EventSnapshot["attendee"];
  organizer: string | null;
  guests: Guest[];
  /** The server's Going, Maybe and Can't go numbers for a guest who hasn't answered (they read only their own row). */
  counts: AnswerCounts | null;
  /** Personal-link invitations not answered yet: the hosts' (the owner and the admins); empty for everyone else. */
  invited: InvitedPerson[];
  /** Open-link answers waiting for a host; empty for everyone else. */
  requests: HostRequest[];
  busy: boolean;
  fresh: boolean;
  error: string | null;
  notice: string | null;
  pending: RsvpAttempt | null;
  /** Which side action is running (mute or an admin change), so two taps cannot overlap. */
  acting: "mute" | "admin" | null;
  load: () => Promise<void>;
  respond: (value: Response, retry?: RsvpAttempt) => Promise<boolean>;
  /** True once the resbite is cancelled (false: `error` says why). */
  cancel: (opts?: { stopRepeating?: boolean }) => Promise<boolean>;
  mute: (muted: boolean) => Promise<void>;
  /** Both answer whether the server made the change (false: `error` says why). */
  appoint: (userId: string) => Promise<boolean>;
  demote: (userId: string) => Promise<boolean>;
  setNotice: (notice: string | null) => void;
  clearError: () => void;
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
  const [acting, setActing] = useState<"mute" | "admin" | null>(null);
  const actingRef = useRef(false);
  const [invited, setInvited] = useState<InvitedPerson[]>([]);
  const [requests, setRequests] = useState<HostRequest[]>([]);
  const [mutedSeries, setMutedSeries] = useState<Set<string>>(new Set());
  // UX3: this phone's reminders follow every event load, answer and cancellation; failures wait for the next sync.
  const syncDevice = () => void syncReminders({ userId: userId ?? null, preview }).catch(() => {});
  useEffect(() => {
    setSnapshot(null);
    setInvited([]);
    setRequests([]);
    setMutedSeries(new Set());
    setPending(null);
    setNotice(null);
    setError(null);
    setFresh(false);
    working.current = false;
    actingRef.current = false;
    setActing(null);
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
        // Unanswered personal links and open-link requests are every host's: the owner's and the admins'.
        const host = next.plan.owner_id === userId || next.admins.includes(userId);
        // The invitations list is a convenience, so a failure leaves it empty.
        const people = host ? await readInvited(planId, userId).catch(() => []) : [];
        // Likewise the waiting list: the event still opens if it can't be read.
        const waiting = host ? await joinRequestGateway.forPlan(planId).catch(() => []) : [];
        // Likewise the mute: a failed read leaves the resbite unmuted on screen, and the next load tries again.
        const muted = await readMutedSeries().catch(() => new Set<string>());
        if (valid()) {
          setMutedSeries(muted);
          setInvited(people);
          setRequests(waiting);
          setSnapshot(next);
          setFresh(true);
          syncDevice();
        }
      } catch (e) {
        if (valid()) {
          setSnapshot(null);
          setInvited([]);
          setRequests([]);
          setError(e instanceof Error ? e.message : EVENT_COPY.readFailed);
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
  const admins = snapshot?.admins ?? [];
  const role: Viewer | null = !plan ? null : preview ? "owner" : viewerRole(plan, userId ?? null, admins);
  const muted = plan !== null && mutedSeries.has(plan.series_id);
  /** True only when the answer is saved and confirmed, with nothing left to retry. */
  async function respond(value: Response, retry?: RsvpAttempt): Promise<boolean> {
    const current = snapshot;
    const attendee = current?.attendee;
    if (!current || !attendee || !userId || preview || !accountReady || working.current || actingRef.current || !focused.current) return false;
    working.current = true;
    let ok = false;
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
      if (!valid()) return false;
      const decision = reconcileRsvp(attempt, next);
      if (decision === "retry") {
        try {
          assertSession();
          await writeRsvp(attempt);
        } catch {
          /* Confirm saved state before offering an identical retry. */
        }
        if (!valid()) return false;
        next = await readRsvp(attempt.planId, userId);
        if (!valid()) return false;
      }
      const confirmed = next;
      setSnapshot((old) => ({
        plan: confirmed.plan,
        attendee: confirmed.attendee,
        organizer: old?.organizer ?? null,
        admins: confirmed.plan.admins,
        guests: (old?.guests ?? []).map((g) =>
          g.userId === userId ? { ...g, response: confirmed.attendee.response } : g,
        ),
        counts: old?.counts ?? null,
      }));
      setFresh(true);
      const result = reconcileRsvp(attempt, confirmed);
      if (result === "confirmed") {
        ok = true;
        setPending(null);
        setNotice(EVENT_COPY.responseSaved);
        syncDevice();
        // UX-P5: answering reveals who's coming; the server now returns the whole list, so the counts come from it.
        try {
          const list = await readGuests(attempt.planId);
          if (valid()) setSnapshot((old) => (old ? { ...old, guests: list, counts: null } : old));
        } catch {
          if (valid()) setError(EVENT_COPY.guestsFailed);
        }
      } else if (result === "review" || result === "unavailable") {
        setPending(null);
        setError(result === "review" ? EVENT_COPY.responseReview : EVENT_COPY.responsesClosed);
      } else setError(EVENT_COPY.responseUnconfirmed);
    } catch {
      if (valid()) setError(EVENT_COPY.responseOffline);
    } finally {
      if (currentIdentity.current === identity) {
        working.current = false;
        setBusy(false);
      }
    }
    return ok;
  }
  async function cancel(opts?: { stopRepeating?: boolean }): Promise<boolean> {
    const target = plan;
    if (!target || working.current || actingRef.current) return false;
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
      else await cancelPlan(planGateway, { id: target.id, version: target.version, stopRepeating: opts?.stopRepeating });
    } catch (e) {
      failure = e instanceof PlanSaveError ? e.message : EVENT_COPY.cancelFailed;
      // As on My resbites: a definite failure reloads first; an uncertain one keeps what is shown.
      reload = !preview && e instanceof PlanSaveError && !e.uncertain;
    }
    working.current = false;
    if (reload) await load();
    if (failure) setError(failure);
    else {
      setNotice(preview ? EVENT_COPY.previewCancelled : EVENT_COPY.cancelled);
      syncDevice();
    }
    setBusy(false);
    return failure === null;
  }
  /** Mutes or unmutes this resbite's series on the server; the page shows the state the server answers with. */
  async function mute(next: boolean) {
    const target = plan;
    if (!target || preview || !accountReady || working.current || actingRef.current) return;
    const valid = () => currentIdentity.current === identity;
    actingRef.current = true;
    setActing("mute");
    setError(null);
    try {
      const now = await setPlanMute(target.id, next);
      if (!valid()) return;
      setMutedSeries((old) => {
        const series = new Set(old);
        if (now) series.add(target.series_id);
        else series.delete(target.series_id);
        return series;
      });
      syncDevice();
    } catch (e) {
      if (valid()) setError(muteErrorMessage(e));
    } finally {
      if (valid()) {
        actingRef.current = false;
        setActing(null);
      }
    }
  }
  /** The owner's: make a guest an admin, or take it back. The list is read again so it shows what the server holds. */
  async function changeAdmin(userId: string, appointing: boolean): Promise<boolean> {
    const target = plan;
    if (!target || preview || !accountReady || working.current || actingRef.current) return false;
    const valid = () => currentIdentity.current === identity;
    actingRef.current = true;
    setActing("admin");
    setError(null);
    let changed = false;
    try {
      await (appointing ? appointAdmin : removeAdmin)(target.id, userId);
      changed = true;
    } catch (e) {
      if (valid()) setError(adminErrorMessage(e));
    } finally {
      if (valid()) {
        actingRef.current = false;
        setActing(null);
      }
    }
    // The reload runs once the action has settled, so it is never skipped as "working".
    if (changed && valid()) await load();
    return changed;
  }
  return {
    plan,
    role,
    admins,
    muted,
    attendee: snapshot?.attendee ?? null,
    organizer: snapshot?.organizer ?? null,
    guests: snapshot?.guests ?? [],
    counts: snapshot?.counts ?? null,
    invited,
    requests,
    // Without a plan to read nothing loads: the screens say it isn't available instead of waiting.
    busy: busy && Boolean(planId),
    fresh: preview || fresh,
    error,
    notice,
    pending,
    acting,
    load,
    respond,
    cancel,
    mute,
    appoint: (userId) => changeAdmin(userId, true),
    demote: (userId) => changeAdmin(userId, false),
    setNotice,
    clearError: () => setError(null),
  };
}

async function readInvited(planId: string, userId: string): Promise<InvitedPerson[]> {
  const [rows, stored] = await Promise.all([
    contactInviteGateway.list(planId),
    inviteCodeStore.get(userId, planId).catch((): Record<string, StoredInvite> => ({})),
  ]);
  return rows
    .filter((r) => !r.answered)
    .map((r) => {
      const e164 = phoneSendForm(r.phone);
      const entry = storedEntry(stored, e164);
      const saved = entry?.value ?? null;
      return {
        phone: r.phone,
        e164,
        country: r.country,
        name: saved?.name?.trim() || formatPhone(e164),
        stored: saved,
        storedKey: entry?.key ?? null,
      };
    });
}
