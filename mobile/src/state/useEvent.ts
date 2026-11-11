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
import { broughtNames, EVENT_COPY, pageState, showsNames, viewerRole, type AnswerCounts, type Viewer } from "../domain/eventPage";
import { circleOf } from "../domain/circle";
import type { Plan } from "../domain/plans";
import { circleGateway, type Allowance } from "../services/circle";
import { storedEntry } from "../domain/contactInvites";
import { contactInviteGateway } from "../services/contactInvites";
import { inviteCodeStore, type StoredInvite } from "../services/inviteCodeStore";
import { formatPhone, phoneSendForm } from "../domain/phone";
import { joinRequestGateway, type HostRequest } from "../services/joinRequests";
import { connectionErrorMessage, connectionGateway, type ConnectionState } from "../services/connections";
import { readProfile } from "../services/profile";
import { requestGone } from "./connectionsModel";

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
  /**
   * Personal-link invitations not answered yet: a host's (the owner and the admins) are every one; a guest who has
   * answered gets only the links they sent bringing someone; empty for everyone else.
   */
  invited: InvitedPerson[];
  /**
   * What the signed-in guest may bring (`my_bring_allowance`), read only for a guest who is Going or Maybe on an open
   * resbite whose circle isn't Nobody; null otherwise, and when the read fails.
   */
  allowance: Allowance | null;
  /** Whom the signed-in guest brought and who is still in, for "You brought …" (`broughtNames`); empty for hosts. */
  broughtNames: string[];
  /** Open-link answers waiting for a host; empty for everyone else. */
  requests: HostRequest[];
  /**
   * The signed-in person's connection with each person on the resbite (CO-01), read where names show, landing after the
   * event when it is slower. Null before the first successful read, where names are hidden and in the preview: the
   * people list then offers no connection actions. A failed read keeps the states read before.
   */
  connections: Record<string, ConnectionState> | null;
  /**
   * The owner, for the first row of the people list (a guest connects with the host there too): the organizer's name
   * for everyone else, this account's own (from its profile) for the owner. Null where names are hidden, in the
   * preview, and until the name is known.
   */
  owner: { userId: string; name: string } | null;
  busy: boolean;
  fresh: boolean;
  error: string | null;
  notice: string | null;
  pending: RsvpAttempt | null;
  /** Which side action is running (mute, an admin change or a connection one), so two taps cannot overlap. */
  acting: "mute" | "admin" | "connection" | null;
  load: () => Promise<void>;
  respond: (value: Response, retry?: RsvpAttempt) => Promise<boolean>;
  /** True once the resbite is cancelled (false: `error` says why). */
  cancel: (opts?: { stopRepeating?: boolean }) => Promise<boolean>;
  mute: (muted: boolean) => Promise<void>;
  /** Both answer whether the server made the change (false: `error` says why). */
  appoint: (userId: string) => Promise<boolean>;
  demote: (userId: string) => Promise<boolean>;
  /**
   * The people list's connection actions (CO-01); after each only the states are read again. True once the server
   * has taken it, or when the request was no longer there to answer (withdrawn, or answered elsewhere): nothing to say,
   * the states show where it stands. False: `error` says why.
   */
  connect: (userId: string) => Promise<boolean>;
  cancelRequest: (userId: string) => Promise<boolean>;
  acceptConnection: (userId: string) => Promise<boolean>;
  declineConnection: (userId: string) => Promise<boolean>;
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
  const [acting, setActing] = useState<EventPage["acting"]>(null);
  const actingRef = useRef(false);
  const [invited, setInvited] = useState<InvitedPerson[]>([]);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [requests, setRequests] = useState<HostRequest[]>([]);
  const [connections, setConnections] = useState<Record<string, ConnectionState> | null>(null);
  /** The owner's own name, read for their row on the people list; everyone else has it as `organizer`. */
  const [ownName, setOwnName] = useState<string | null>(null);
  // The latest read of the states wins: a whole-event read and a re-read after a connection action can overlap.
  const statesRead = useRef(0);
  const [mutedSeries, setMutedSeries] = useState<Set<string>>(new Set());
  // UX3: this phone's reminders follow every event load, answer and cancellation; failures wait for the next sync.
  const syncDevice = () => void syncReminders({ userId: userId ?? null, preview }).catch(() => {});
  useEffect(() => {
    setSnapshot(null);
    setInvited([]);
    setAllowance(null);
    setRequests([]);
    setConnections(null);
    setOwnName(null);
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
        // The connection states, only where names show (the server refuses them elsewhere). The event never waits
        // for them: they land when they arrive, and only a successful read replaces them (a failure keeps those known).
        const ticket = ++statesRead.current;
        const named = showsNames(viewerRole(next.plan, userId, next.admins), next.attendee?.response ?? null);
        if (named)
          void connectionGateway.statesFor(planId).then(
            (states) => {
              if (valid() && ticket === statesRead.current) setConnections(states);
            },
            () => {},
          );
        // Likewise the owner's own name for their row: it lands when it arrives; a failure keeps the one known.
        if (next.plan.owner_id === userId)
          void readProfile(userId).then(
            (profile) => {
              const name = profile?.display_name?.trim();
              if (valid() && name) setOwnName(name);
            },
            () => {},
          );
        // The invitations list is a convenience, so a failure leaves it empty. A guest who has answered gets the links
        // they sent bringing someone (the server lists only their own). Likewise what this guest may bring: without it
        // there is no Bring someone row.
        const answered = !!next.attendee && next.attendee.response !== "pending";
        const [people, bring] = await Promise.all([
          host || answered ? readInvited(planId, userId).catch((): InvitedPerson[] => []) : [],
          readAllowance(next.plan, host, next.attendee?.response ?? null),
        ]);
        // Likewise the waiting list: the event still opens if it can't be read.
        const waiting = host ? await joinRequestGateway.forPlan(planId).catch(() => []) : [];
        // Likewise the mute: a failed read leaves the resbite unmuted on screen, and the next load tries again.
        const muted = await readMutedSeries().catch(() => new Set<string>());
        if (valid()) {
          setMutedSeries(muted);
          setInvited(people);
          setAllowance(bring);
          setRequests(waiting);
          // Names hidden: no states at all, whatever was known before.
          if (!named && ticket === statesRead.current) setConnections(null);
          setSnapshot(next);
          setFresh(true);
          syncDevice();
        }
      } catch (e) {
        if (valid()) {
          setSnapshot(null);
          setInvited([]);
          setAllowance(null);
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
  const ownerId = snapshot?.plan.owner_id;
  const ownerName = role === "owner" ? ownName : snapshot?.organizer?.trim() || null;
  const namesShown = role !== null && showsNames(role, snapshot?.attendee?.response ?? null);
  const owner = !preview && ownerId && ownerName && namesShown ? { userId: ownerId, name: ownerName } : null;
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
        // Going or Maybe may now bring someone; Can't go no longer may.
        const host = confirmed.plan.owner_id === userId || confirmed.plan.admins.includes(userId);
        const bring = await readAllowance(confirmed.plan, host, confirmed.attendee.response);
        if (valid()) setAllowance(bring);
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
  /**
   * Ask, take back a request, accept or refuse (CO-01), then read the states again, and only them: the rest of the
   * event hasn't changed. A request no longer there (42501 'No request', from accept and decline) is no failure: the
   * re-read shows where it stands, as on the Connections screen. Any other failure reads nothing again: `error` says why.
   */
  async function changeConnection(person: string, change: "request" | "cancel" | "accept" | "decline"): Promise<boolean> {
    const target = plan;
    if (!target || preview || !accountReady || working.current || actingRef.current) return false;
    const valid = () => currentIdentity.current === identity;
    actingRef.current = true;
    setActing("connection");
    setError(null);
    let settled = false;
    try {
      if (change === "request") await connectionGateway.request(person, target.id);
      else await connectionGateway[change](person);
      settled = true;
    } catch (e) {
      settled = requestGone(e);
      if (valid() && !settled) setError(connectionErrorMessage(e));
    } finally {
      if (valid()) {
        actingRef.current = false;
        setActing(null);
      }
    }
    if (settled && valid()) {
      const ticket = ++statesRead.current;
      try {
        const states = await connectionGateway.statesFor(target.id);
        if (valid() && ticket === statesRead.current) setConnections(states);
      } catch {
        // The states stay as they were (asking again is harmless); the next read of the event tries again.
      }
    }
    return settled;
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
    allowance: preview ? null : allowance,
    broughtNames: role === "guest" && !preview ? broughtNames({ guests: snapshot?.guests ?? [], invited, userId: userId ?? null }) : [],
    requests,
    connections: preview ? null : connections,
    owner,
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
    connect: (userId) => changeConnection(userId, "request"),
    cancelRequest: (userId) => changeConnection(userId, "cancel"),
    acceptConnection: (userId) => changeConnection(userId, "accept"),
    declineConnection: (userId) => changeConnection(userId, "decline"),
    setNotice,
    clearError: () => setError(null),
  };
}

/**
 * What the signed-in guest may bring, read only where the Bring someone row could show: a guest (not a host) who is
 * Going or Maybe on an open resbite whose circle isn't Nobody. Null otherwise, and when the read fails.
 */
async function readAllowance(plan: Plan, host: boolean, response: string | null): Promise<Allowance | null> {
  if (host || (response !== "accepted" && response !== "maybe")) return null;
  if (pageState(plan) !== "open" || circleOf(plan).invites === 0) return null;
  return circleGateway.allowance(plan.id).catch(() => null);
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
