import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, type LocalPlan } from "./AppState";
import { useAccount } from "./AccountState";
import { useFocusedRefresh, type Run } from "./useFocusedRefresh";
import { cancelPlan, PlanSaveError } from "../domain/plans";
import { reconcileRsvp, type Response, type RsvpAttempt } from "../domain/rsvp";
import { planGateway } from "../services/plans";
import { readEvent, readGuests, readIsGroup, readRsvp, writeRsvp, type EventSnapshot, type Guest } from "../services/rsvp";
import { syncReminders } from "../services/deviceReminders";
import { leaveGroup, stillCurrent } from "./useGroupLeave";
import { adminErrorMessage, appointAdmin, removeAdmin } from "../services/admins";
import { muteErrorMessage, readMutedSeries, setPlanMute } from "../services/mutes";
import { broughtNames, EVENT_COPY, pageState, readsOwnLinks, showsNames, viewerRole, type AnswerCounts, type Viewer } from "../domain/eventPage";
import { circleOf } from "../domain/circle";
import type { Plan } from "../domain/plans";
import { circleGateway, type Allowance, type BroughtLink } from "../services/circle";
import { storedEntry } from "../domain/contactInvites";
import { contactInviteGateway } from "../services/contactInvites";
import { inviteCodeStore, type StoredInvite } from "../services/inviteCodeStore";
import { formatPhone, phoneSendForm } from "../domain/phone";
import { joinRequestGateway, type HostRequest } from "../services/joinRequests";
import { connectionErrorMessage, connectionGateway, type ConnectionState } from "../services/connections";
import { chatGateway, isNotInChat, type ChatSummary } from "../services/chat";
import { onBlocksChanged, safetyGateway } from "../services/safety";
import { invitationEntry, type InvitationEntry } from "../domain/safetyCopy";
import { readProfile } from "../services/profile";
import { requestGone } from "./connectionsModel";
import { rememberName } from "./knownNames";

/** Nothing read: a shared empty, so a screen with none gets the same value on every render. */
const NO_LINKS: BroughtLink[] = [];
/** No invitation entry: nothing read, someone who has answered, or a host. */
const NO_ENTRY: InvitationEntry = { announcement: null, inviter: null };

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
  /** The signed-in person brought them (`plan_phone_invitations`' `brought`): a host's own brought link is theirs (C31). */
  brought: boolean;
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
   * The resbite is a group's and this person is in it (`readEvent`'s `series_is_group`): names show whatever their reply,
   * the people list shows everyone in it, More offers Leave this group. False in the preview, on a one-off, and when the
   * flag couldn't be read (I4).
   */
  isGroup: boolean;
  /**
   * Personal-link invitations not answered yet: a host's (the owner and the admins) are every one; a guest who has
   * answered gets only the links they sent bringing someone, read only where there can be some (`readsOwnLinks`: the
   * circle lets guests bring, or they are known to have brought someone); empty for everyone else.
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
   * The bringers' first names by account id (`plan_bringers`), for "Brought by Pedro" on the people list (CO-07): read
   * only for the list (`chain`), where names show, landing when it arrives. A failed read keeps the names known. Null
   * until a read lands, where names are hidden and in the preview: the list then names a bringer from their own row.
   */
  bringerNames: Record<string, string> | null;
  /**
   * The links the guests sent bringing someone, for a host (`plan_brought_invitations`): listed by their last digits
   * and counted in "N invited". Empty for everyone else, and when the read fails.
   */
  broughtLinks: BroughtLink[];
  /**
   * The signed-in person's connection with each person on the resbite (CO-01), read where names show, landing after the
   * event when it is slower. Null before the first successful read, where names are hidden and in the preview: the
   * people list then offers no connection actions. A failed read keeps the states read before.
   */
  connections: Record<string, ConnectionState> | null;
  /**
   * The people the signed-in person blocked (`my_blocks`, plan 3), read beside the connection states, where names show.
   * Null until a read lands, where names are hidden and in the preview: the people list then offers no Block, Unblock or
   * Connect (N13). A failed read keeps what was known and says nothing; the next focus reads again. After any block or
   * unblock in the app it is read again (confirmation NOTE 2).
   */
  blocks: ReadonlySet<string> | null;
  /**
   * The owner, for the first row of the people list (a guest connects with the host there too): the organizer's name
   * for everyone else, this account's own (from its profile) for the owner. Null where names are hidden, in the
   * preview, and until the name is known.
   */
  owner: { userId: string; name: string } | null;
  /**
   * The series' chat for the Chat row (`chat_summary`, K-S13), read after the event and landing when it arrives, and
   * again after an answer. Null until then, for someone who isn't in the chat (42501), when a first read or a read after
   * a confirmed answer fails, in the preview and on the people list (`chain`, which has no Chat row): the row hides. A
   * refresh, or a read after an answer that wasn't confirmed, that fails keeps the last one (H36, H38).
   */
  chat: ChatSummary | null;
  /**
   * For an invitee who hasn't answered, the latest "Everyone invited" announcement (`my_chat_overview`): its id and
   * author, for Report and Block (B1), and `text` in full as My resbites' card words it ("Announcement from Ana · …", H37
   * D3). Null for everyone else, until it is read, and after the resbite has ended. A failed read keeps the one known;
   * after a block the overview is read again, and an announcement by someone blocked is gone (NOTE 2).
   */
  announcement: InvitationEntry["announcement"];
  /** For an invitee who hasn't answered, who invited them (the overview's `inviters`, B4), from the same read. */
  inviter: InvitationEntry["inviter"];
  busy: boolean;
  fresh: boolean;
  error: string | null;
  notice: string | null;
  pending: RsvpAttempt | null;
  /** Which side action is running (mute, an admin change, a connection one or a leave), so two taps cannot overlap. */
  acting: "mute" | "admin" | "connection" | "leave" | null;
  load: () => Promise<void>;
  respond: (value: Response, retry?: RsvpAttempt) => Promise<boolean>;
  /** True once the resbite is cancelled (false: `error` says why). */
  cancel: (opts?: { stopRepeating?: boolean }) => Promise<boolean>;
  mute: (muted: boolean) => Promise<void>;
  /**
   * Leaves the group this resbite belongs to (`leaveGroup`, G-N13, I10). True once the server took it: the guest row on
   * the current occurrence is gone, so the page can't be read again; `leaveGroup` syncs the reminders and opens My
   * resbites while this page is in focus. False: `error` says why, and it can be tried again.
   */
  leave: () => Promise<boolean>;
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
export function useEvent(planId: string | undefined, options: { chain?: boolean } = {}): EventPage {
  // Only the people list shows who brought whom, so only it reads the bringers' names (C28).
  const chain = options.chain === true;
  const { session, preview, localPlans, setLocalPlans, signingOut, captureSession } = useApp();
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
  /** The last read of a guest's own links found one, so the next load reads them again whatever the circle says. */
  const linksFound = useRef(false);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [requests, setRequests] = useState<HostRequest[]>([]);
  const [bringerNames, setBringerNames] = useState<Record<string, string> | null>(null);
  const [broughtLinks, setBroughtLinks] = useState<BroughtLink[]>(NO_LINKS);
  // The latest read of the bringers' names wins, as the states' does.
  const bringersRead = useRef(0);
  const [connections, setConnections] = useState<Record<string, ConnectionState> | null>(null);
  const [blocks, setBlocks] = useState<ReadonlySet<string> | null>(null);
  // The latest read of the blocks wins, as the states' does.
  const blocksRead = useRef(0);
  /**
   * What the last read of this page reads again after a block or unblock anywhere (NOTE 2): the states and the blocks
   * where names show, and an unanswered invitee's overview. Keyed by the identity it was read for.
   */
  const afterBlocks = useRef<{ key: string; named: boolean; invitee: Plan | null } | null>(null);
  /** The owner's own name, read for their row on the people list; everyone else has it as `organizer`. */
  const [ownName, setOwnName] = useState<string | null>(null);
  // The latest read of the states wins: a whole-event read and a re-read after a connection action can overlap.
  const statesRead = useRef(0);
  /**
   * The group flag (`readIsGroup`), read beside the event and never waited for (ruling GR6 M7): the page shows as a
   * one-off until it lands, and a reload of the same plan keeps the last answer until the new one lands, so a group's
   * page doesn't flash a one-off's. The latest read wins.
   */
  const groupKnown = useRef<{ key: string; isGroup: boolean } | null>(null);
  const groupRead = useRef(0);
  const [mutedSeries, setMutedSeries] = useState<Set<string>>(new Set());
  const [chat, setChat] = useState<ChatSummary | null>(null);
  // The latest read of the chat wins: an event load and a re-read after an answer can overlap.
  const chatRead = useRef(0);
  /**
   * Reads the series' chat for the Chat row. 'Not in this chat' always hides the row (K-S13). Any other failure keeps
   * the row as it was when `keepOnFailure` (the page's loads, an answer that wasn't confirmed: H36, H38, and any answer
   * in a group, which keeps its members whatever they reply: challenge NOTE 6), and hides it after a one-off's confirmed
   * answer, which can move the person out of the chat. On a page's first read there is nothing to keep.
   */
  const readChat = (series: string, valid: () => boolean, keepOnFailure: boolean) => {
    const ticket = ++chatRead.current;
    void chatGateway.summary(series).then(
      (summary) => {
        if (valid() && ticket === chatRead.current) setChat(summary);
      },
      (error) => {
        if (valid() && ticket === chatRead.current && (!keepOnFailure || isNotInChat(error))) setChat(null);
      },
    );
  };
  const [entry, setEntry] = useState<InvitationEntry>(NO_ENTRY);
  const announcementRead = useRef(0);
  /**
   * An invitee who hasn't answered: the latest "Everyone invited" announcement, in full (H37 D3), and who invited them
   * (B4), from one overview read. A failure keeps what was known.
   */
  const readAnnouncement = (plan: Plan, viewer: string, valid: () => boolean) => {
    const ticket = ++announcementRead.current;
    void chatGateway.overview().then(
      (overview) => {
        if (valid() && ticket === announcementRead.current) setEntry(invitationEntry(plan, overview, viewer, Date.now()));
      },
      () => {},
    );
  };
  const dropAnnouncement = () => {
    announcementRead.current++;
    setEntry(NO_ENTRY);
    if (afterBlocks.current) afterBlocks.current = { ...afterBlocks.current, invitee: null };
  };
  /** The people blocked, as `my_blocks` lists them; a failure keeps what was known and says nothing (N13). */
  const readBlocks = (valid: () => boolean) => {
    const ticket = ++blocksRead.current;
    void safetyGateway.myBlocks().then(
      (list) => {
        if (valid() && ticket === blocksRead.current) setBlocks(new Set(list.map((b) => b.userId)));
      },
      () => {},
    );
  };
  // UX3: this phone's reminders follow every event load, answer and cancellation; failures wait for the next sync.
  const syncDevice = () => void syncReminders({ userId: userId ?? null, preview }).catch(() => {});
  useEffect(() => {
    setSnapshot(null);
    setInvited([]);
    linksFound.current = false;
    setAllowance(null);
    setRequests([]);
    setBringerNames(null);
    setBroughtLinks(NO_LINKS);
    setConnections(null);
    setBlocks(null);
    blocksRead.current++;
    afterBlocks.current = null;
    setOwnName(null);
    setMutedSeries(new Set());
    setChat(null);
    chatRead.current++;
    dropAnnouncement();
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
        const read = await readEvent(planId, userId);
        // Per account and plan: another account's answer is never this one's.
        const flagKey = `${userId}:${planId}`;
        const knownFlag = () => (groupKnown.current?.key === flagKey ? groupKnown.current.isGroup : false);
        const next: EventSnapshot = { ...read, isGroup: knownFlag() };
        // Unanswered personal links and open-link requests are every host's: the owner's and the admins'.
        const host = next.plan.owner_id === userId || next.admins.includes(userId);
        // The connection states, only where names show (the server refuses them elsewhere). The event never waits
        // for them: they land when they arrive, and only a successful read replaces them (a failure keeps those known).
        const ticket = ++statesRead.current;
        const viewer = viewerRole(next.plan, userId, next.admins);
        const readStates = () =>
          void connectionGateway.statesFor(planId).then(
            (states) => {
              if (valid() && ticket === statesRead.current) setConnections(states);
            },
            () => {},
          );
        // Likewise the bringers' names for the chain (CO-07): only on the people list, where names show; a failure keeps
        // those known.
        const bringersTicket = ++bringersRead.current;
        const readBringers = () =>
          void circleGateway.bringers(planId).then(
            (names) => {
              if (valid() && bringersTicket === bringersRead.current) setBringerNames(names);
            },
            () => {},
          );
        let named = showsNames(viewer, next.attendee?.response ?? null, next.isGroup);
        // The blocks (plan 3) beside the states, where names show: a block changes what the people list offers.
        const blocksTicket = blocksRead.current + 1;
        if (named) readStates();
        if (named) readBlocks(valid);
        if (named && chain) readBringers();
        // The group flag lands when it arrives (GR6 M7): a member then sees names, so what names need is read then. It
        // lands for the account and plan it was read for even when an answer started a run of its own meanwhile, so the
        // page stays a group's for the visit (GR8 R2); only a later flag read, or another account or plan, stops it.
        const groupTicket = ++groupRead.current;
        const flagIdentity = currentIdentity.current;
        void readIsGroup(next.plan.series_id).then((isGroup) => {
          if (groupTicket !== groupRead.current || currentIdentity.current !== flagIdentity) return;
          groupKnown.current = { key: flagKey, isGroup };
          setSnapshot((s) => (s && s.plan.id === next.plan.id ? { ...s, isGroup, counts: isGroup ? null : s.counts } : s));
          if (isGroup && !named) {
            named = true;
            readStates();
            readBlocks(valid);
            if (chain) readBringers();
            if (afterBlocks.current?.key === flagKey) afterBlocks.current = { ...afterBlocks.current, named: true };
          }
        });
        // Likewise the Chat row (K-S13), on the resbite page only (not the people list): the page never waits for the
        // series' chat; a refusal hides the row, and a failure keeps what was known (H36).
        if (!chain) readChat(next.plan.series_id, valid, true);
        // An invitee who hasn't answered isn't in the chat: the page shows them the announcement sent to everyone invited.
        const waitingAnswer = !chain && !host && next.attendee?.response === "pending";
        if (waitingAnswer) readAnnouncement(next.plan, userId, valid);
        afterBlocks.current = { key: flagKey, named, invitee: waitingAnswer ? next.plan : null };
        // Likewise the owner's own name for their row: it lands when it arrives; a failure keeps the one known.
        if (next.plan.owner_id === userId)
          void readProfile(userId).then(
            (profile) => {
              const name = profile?.display_name?.trim();
              if (valid() && name) setOwnName(name);
            },
            () => {},
          );
        // A guest's Bring someone row: what they may bring, and the links they sent bringing someone (once they have
        // answered; the server lists only their own), read only where there can be some (readsOwnLinks). The event never
        // waits for them: they land when they arrive, and until then the row shows what was known. A failure gives no
        // allowance and no links.
        const answered = !!next.attendee && next.attendee.response !== "pending";
        if (!host) {
          void readAllowance(next.plan, false, next.attendee?.response ?? null).then((bring) => {
            if (valid()) setAllowance(bring);
          });
          if (answered)
            void readOwnLinks(next, planId, userId, linksFound.current).then(
              (links) => {
                if (!valid()) return;
                linksFound.current = links.length > 0;
                setInvited(links);
              },
              () => valid() && setInvited([]),
            );
        }
        // The hosts' invitations list is a convenience, so a failure leaves it empty; likewise the links their guests
        // sent bringing someone (CO-07), read with it.
        const [people, links] = host
          ? await Promise.all([
              readInvited(planId, userId).catch((): InvitedPerson[] => []),
              circleGateway.broughtLinks(planId).catch((): BroughtLink[] => []),
            ])
          : [null, NO_LINKS];
        // Likewise the waiting list: the event still opens if it can't be read.
        const waiting = host ? await joinRequestGateway.forPlan(planId).catch(() => []) : [];
        // Likewise the mute: a failed read leaves the resbite unmuted on screen, and the next load tries again.
        const muted = await readMutedSeries().catch(() => new Set<string>());
        if (valid()) {
          // Bring mode, opened from here, names the organizer without reading it again (C23); only from a current read.
          rememberName(userId, next.plan.owner_id, next.organizer);
          setMutedSeries(muted);
          if (people) {
            setInvited(people);
            setAllowance(null);
          } else if (!answered) setInvited([]);
          setRequests(waiting);
          setBroughtLinks(links);
          // Names hidden: no states and no bringers at all, whatever was known before.
          if (!named && ticket === statesRead.current) setConnections(null);
          if (!named && blocksTicket > blocksRead.current) setBlocks(null);
          if (!named && bringersTicket === bringersRead.current) setBringerNames(null);
          if (!waitingAnswer) dropAnnouncement();
          // With the flag as known now: it may have landed while the rest was read.
          const isGroup = knownFlag();
          setSnapshot({ ...next, isGroup, counts: isGroup ? null : next.counts });
          setFresh(true);
          syncDevice();
        }
      } catch (e) {
        if (valid()) {
          setSnapshot(null);
          chatRead.current++;
          setChat(null);
          setInvited([]);
          setAllowance(null);
          setRequests([]);
          setBroughtLinks(NO_LINKS);
          setError(e instanceof Error ? e.message : EVENT_COPY.readFailed);
        }
      } finally {
        if (valid()) setBusy(false);
      }
    },
    [planId, userId, preview, signingOut, accountReady, chain],
  );
  const {
    refresh: load,
    begin,
    focused,
  } = useFocusedRefresh(read, { identity, onBackground: () => setFresh(false) });
  // After a block or unblock anywhere in the app, while this page is mounted, focused or not (NOTE 2, B3): the blocks
  // again, the states again where they are read at all (a block ended any connection; after Unblock the server answers
  // `none`, not `connected`), and for an unanswered invitee the overview again, so the announcement and the inviter go.
  useEffect(
    () =>
      onBlocksChanged(() => {
        const again = afterBlocks.current;
        if (!again || !userId || !planId || again.key !== `${userId}:${planId}`) return;
        const mine = currentIdentity.current;
        const valid = () => currentIdentity.current === mine;
        if (again.named) {
          readBlocks(valid);
          const ticket = ++statesRead.current;
          void connectionGateway.statesFor(planId).then(
            (states) => {
              if (valid() && ticket === statesRead.current) setConnections(states);
            },
            () => {},
          );
        }
        if (again.invitee) readAnnouncement(again.invitee, userId, valid);
      }),
    // The handler reads the latest refs; the setters and the gateways don't change.
    [userId, planId],
  );
  const plan = preview ? (localPlans.find((p) => p.id === planId) ?? null) : (snapshot?.plan ?? null);
  const admins = snapshot?.admins ?? [];
  const role: Viewer | null = !plan ? null : preview ? "owner" : viewerRole(plan, userId ?? null, admins);
  const muted = plan !== null && mutedSeries.has(plan.series_id);
  const ownerId = snapshot?.plan.owner_id;
  const ownerName = role === "owner" ? ownName : snapshot?.organizer?.trim() || null;
  const isGroup = !preview && snapshot?.isGroup === true;
  const namesShown = role !== null && showsNames(role, snapshot?.attendee?.response ?? null, isGroup);
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
        isGroup: old?.isGroup ?? false,
      }));
      setFresh(true);
      const result = reconcileRsvp(attempt, confirmed);
      if (result === "confirmed") {
        ok = true;
        setPending(null);
        setNotice(EVENT_COPY.responseSaved);
        syncDevice();
        // The answer moves the person into a one-off's chat (Going, Maybe) or out of it (Can't go): the row follows,
        // and the announcement is the chat's to show now. In a group it moves nobody, so a failed read keeps the row
        // as it was (challenge NOTE 6); a refusal still hides it.
        if (!chain) readChat(confirmed.plan.series_id, valid, current.isGroup);
        dropAnnouncement();
        // UX-P5: answering reveals who's coming; the server now returns the whole list, so the counts come from it.
        // Read with it, what the guest may now bring: Going or Maybe may bring someone, Can't go no longer may.
        const host = confirmed.plan.owner_id === userId || confirmed.plan.admins.includes(userId);
        const [list, bring] = await Promise.all([
          readGuests(attempt.planId).catch(() => null),
          readAllowance(confirmed.plan, host, confirmed.attendee.response),
        ]);
        if (valid()) {
          if (list) setSnapshot((old) => (old ? { ...old, guests: list, counts: null } : old));
          else setError(EVENT_COPY.guestsFailed);
          setAllowance(bring);
        }
      } else {
        if (result === "review" || result === "unavailable") {
          setPending(null);
          setError(result === "review" ? EVENT_COPY.responseReview : EVENT_COPY.responsesClosed);
        } else setError(EVENT_COPY.responseUnconfirmed);
        // Not confirmed, so it can't have changed who is in the chat: the chat is read again, keeping the row on a
        // failure as a refresh does (H38).
        if (!chain) readChat(confirmed.plan.series_id, valid, true);
      }
    } catch {
      if (valid()) {
        setError(EVENT_COPY.responseOffline);
        // Not confirmed (offline), so the row stays: the chat is read again, keeping it on a failure (H38).
        if (!chain) readChat(current.plan.series_id, valid, true);
      }
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
  async function leave(): Promise<boolean> {
    const target = plan;
    if (!target || preview || !accountReady || working.current || actingRef.current) return false;
    const valid = () => currentIdentity.current === identity;
    actingRef.current = true;
    setActing("leave");
    setError(null);
    // It syncs the reminders, which follow the guest row the leave took away (review I2); a calendar entry the guest
    // added stays in their calendar, as after a host's removal. What it does once it went through belongs to this session
    // only (ruling GR6 M1).
    const result = await leaveGroup(target.series_id, { userId: userId ?? null, preview }, stillCurrent(captureSession()));
    if (valid()) {
      if (result && !result.left) setError(result.error);
      actingRef.current = false;
      setActing(null);
    }
    return result?.left === true;
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
    isGroup,
    invited,
    allowance: preview ? null : allowance,
    broughtNames: role === "guest" && !preview ? broughtNames({ guests: snapshot?.guests ?? [], invited, userId: userId ?? null }) : [],
    requests,
    bringerNames: preview ? null : bringerNames,
    broughtLinks: preview ? NO_LINKS : broughtLinks,
    connections: preview ? null : connections,
    blocks: preview ? null : blocks,
    owner,
    chat: preview ? null : chat,
    announcement: preview ? null : entry.announcement,
    inviter: preview ? null : entry.inviter,
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
    leave,
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

/**
 * A guest's own links, read only when readsOwnLinks says there can be some: the circle lets guests bring, or the guest
 * is known to have brought someone (a guest row they brought, a link the last read found, or a code this phone keeps
 * for the resbite). Otherwise none, with no request.
 */
async function readOwnLinks(next: EventSnapshot, planId: string, userId: string, found: boolean): Promise<InvitedPerson[]> {
  const stored = await inviteCodeStore.get(userId, planId).catch((): Record<string, StoredInvite> => ({}));
  const known = found || Object.keys(stored).length > 0;
  if (!readsOwnLinks({ invites: circleOf(next.plan).invites, userId, guests: next.guests, known })) return [];
  return readInvited(planId, userId, stored);
}

async function readInvited(planId: string, userId: string, codes?: Record<string, StoredInvite>): Promise<InvitedPerson[]> {
  const [rows, stored] = await Promise.all([
    contactInviteGateway.list(planId),
    codes ?? inviteCodeStore.get(userId, planId).catch((): Record<string, StoredInvite> => ({})),
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
        brought: r.brought,
      };
    });
}
