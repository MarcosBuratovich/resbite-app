import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { getRandomBytes } from "expo-crypto";
import { readPhoneRows, hasContactAccess, expandContactAccess } from "../services/contacts";
import { contactInviteGateway, inviteConnections, type InviteKind, type UserResult } from "../services/contactInvites";
import { connectionGateway, type ConnectionPerson } from "../services/connections";
import { inviteCodeStore, type StoredInvite } from "../services/inviteCodeStore";
import { putInviteQuietly, sendPersonalLink } from "../services/inviteSend";
import {
  contactNumbers,
  hostRegion,
  inviteItems,
  newInviteCode,
  storedFor,
  usersToInvite,
  type ContactNumber,
} from "../domain/contactInvites";
import { CONNECTIONS_COPY } from "../domain/connectionsCopy";
import { INVITE_COPY } from "../domain/inviteCopy";
import { deviceRegion, INVALID_PHONE, parsePhone, phoneKey } from "../domain/phone";

export { inviteItems } from "../domain/contactInvites";
export const DEFAULT_ORIGIN = "https://link.resbite.com";
const digitsOf = (e164: string) => e164.replace(/\D/g, "");

export type Access = "idle" | "loading" | "ready" | "denied" | "web";
export type Sendable = { number: ContactNumber; code: string; sentVia?: StoredInvite["sentVia"] };
export type Outcome = { inApp: string[]; already: string[]; links: Sendable[] };
type Message = { host: string; title: string; when: string };

/**
 * Contact invitations for one event: the contact pages, the picked numbers, the "On Resbite" lookup (picked
 * numbers only, debounced), the host's Resbite connections and the ones picked (CO-P4), the invite calls and the
 * sending of each personal link from this phone.
 */
export function useContactInvites(a: {
  planId: string | undefined;
  scope: string | undefined;
  userPhone: string | null | undefined;
  message: Message;
  enabled: boolean;
  /** The user ids already on the resbite (its owner and guests): their connections read "Invited". */
  onPlan?: string[];
}) {
  const { planId, scope, userPhone, message, enabled, onPlan } = a;
  const hostDefault = useMemo(() => hostRegion(userPhone, deviceRegion()), [userPhone]);
  // The region a number without a country code is read in: the host's own, until the host picks another.
  const [assumedRegion, setAssumedRegionState] = useState(hostDefault);
  const regionChosen = useRef(false);
  // The region of the last completed read from offset 0: a different assumed region means a re-read is due.
  const loadedRegion = useRef<string | null>(null);
  useEffect(() => {
    if (!regionChosen.current) setAssumedRegionState(hostDefault);
  }, [hostDefault]);
  const origin = process.env.EXPO_PUBLIC_INVITATION_ORIGIN || DEFAULT_ORIGIN;
  const context = `${scope ?? ""}:${planId ?? ""}`;
  const current = useRef(context);
  current.current = context;
  const mounted = useRef(true);
  const alive = (ctx: string) => mounted.current && current.current === ctx;

  const [access, setAccess] = useState<Access>("idle");
  const [loaded, setLoaded] = useState<ContactNumber[]>([]);
  const [manual, setManual] = useState<ContactNumber[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [limited, setLimited] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Record<string, ContactNumber>>({});
  const [onResbite, setOnResbite] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [connections, setConnections] = useState<ConnectionPerson[]>([]);
  const [chosenUsers, setChosenUsers] = useState<Set<string>>(new Set());
  const invitedUsers = useMemo(() => new Set(onPlan ?? []), [onPlan]);
  const touched = useRef(false);
  const working = useRef(false);
  const checked = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A different account or event starts clean.
  useEffect(() => {
    setAccess("idle");
    setLoaded([]);
    setManual([]);
    setOffset(0);
    setMore(false);
    setLimited(false);
    setSkipped(0);
    setQuery("");
    setPicked({});
    setOnResbite(new Set());
    setOutcome(null);
    setConnections([]);
    setChosenUsers(new Set());
    setError(null);
    setNotice("");
    setBusy(false);
    working.current = false;
    touched.current = false;
    checked.current = new Set();
    regionChosen.current = false;
    loadedRegion.current = null;
    setAssumedRegionState(hostDefault);
  }, [context]);

  // The host's connections, read once a host may invite here. Without them (a failed read included) the section is
  // simply absent: the numbers and the event link still work.
  useEffect(() => {
    if (!enabled || !scope) return;
    const ctx = current.current;
    connectionGateway.mine().then(
      ({ connected }) => {
        if (alive(ctx)) setConnections(connected);
      },
      () => {},
    );
  }, [enabled, scope, context]);

  const clearContacts = useCallback(() => {
    setLoaded([]);
    setOffset(0);
    setMore(false);
    setLimited(false);
    setSkipped(0);
    setQuery("");
  }, []);

  const loadContacts = useCallback(
    async (next = 0, expand = false) => {
      if (!enabled || working.current) return;
      const ctx = current.current;
      working.current = true;
      touched.current = true;
      setBusy(true);
      setError(null);
      if (next === 0) setAccess("loading");
      try {
        if (expand) await expandContactAccess();
        const page = await readPhoneRows(next, !expand && next === 0);
        if (!alive(ctx)) return;
        const { numbers, skipped: bad } = contactNumbers(page.rows, assumedRegion);
        setLoaded((old) => {
          if (!next) return numbers;
          const seen = new Set(old.map((n) => n.key));
          return [...old, ...numbers.filter((n) => !seen.has(n.key))];
        });
        setSkipped((old) => (next ? old + bad : bad));
        setOffset(page.nextOffset);
        setMore(page.more);
        setLimited(page.limited);
        if (!next) loadedRegion.current = assumedRegion;
        setAccess("ready");
      } catch (e) {
        if (!alive(ctx)) return;
        clearContacts();
        const web = Platform.OS === "web";
        setAccess(web ? "web" : "denied");
        if (!web) setError(e instanceof Error ? e.message : INVITE_COPY.contactsOff);
      } finally {
        if (alive(ctx)) {
          working.current = false;
          setBusy(false);
        }
      }
    },
    [enabled, assumedRegion, clearContacts],
  );

  // Coming back from Settings: the allowed contacts may have changed, so read them again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !touched.current || working.current) return;
      const ctx = current.current;
      void hasContactAccess()
        .then((allowed) => {
          if (!alive(ctx)) return;
          if (allowed) void loadContacts(0);
          else {
            clearContacts();
            setAccess("denied");
          }
        })
        .catch(() => alive(ctx) && clearContacts());
    });
    return () => sub.remove();
  }, [loadContacts, clearContacts]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...manual, ...loaded].filter((n) => !seen.has(n.key) && !!seen.add(n.key));
  }, [loaded, manual]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((n) => `${n.name} ${n.label}`.toLowerCase().includes(q)) : all;
  }, [all, query]);
  const selected = useMemo(() => Object.values(picked), [picked]);
  /** What Invite N counts: the picked numbers and the picked connections not already on the resbite. */
  const inviteCount = selected.length + usersToInvite(chosenUsers, invitedUsers).length;

  /** Picks a connection, or clears the pick; someone already on the resbite can't be picked. */
  function toggleUser(userId: string) {
    if (invitedUsers.has(userId)) return;
    setChosenUsers((old) => {
      const next = new Set(old);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });
  }

  /** Picks this number for its contact (replacing another of theirs); picking the same one again clears it. */
  function toggle(n: ContactNumber) {
    setPicked((old) => {
      if (old[n.contact]?.key === n.key) {
        const { [n.contact]: _gone, ...rest } = old;
        return rest;
      }
      return { ...old, [n.contact]: n };
    });
  }
  /** Picks this number for its contact; choosing again replaces it. */
  function choose(n: ContactNumber) {
    setPicked((old) => ({ ...old, [n.contact]: n }));
  }
  /** Parses a typed number with the host's region; picks it on success. Returns an error message otherwise. */
  function addNumber(name: string, input: string, region?: string): string | null {
    const parsed = parsePhone(input, region ?? assumedRegion);
    if (!parsed.ok) return parsed.message;
    const n = contactNumbers([{ fullName: name, phones: [{ number: parsed.e164 }] }], region ?? assumedRegion).numbers[0];
    if (!n) return INVALID_PHONE;
    setManual((old) => (old.some((x) => x.key === n.key) ? old : [n, ...old]));
    setPicked((old) => ({ ...old, [n.contact]: n }));
    return null;
  }

  /** Chooses the region for numbers without a code and reads the contacts again in it. */
  function setAssumedRegion(next: string) {
    regionChosen.current = true;
    if (next !== assumedRegion) {
      // Contacts' picks were read under the old region and would sit beside the same people re-picked under their new
      // keys, so they go. Typed numbers were read with the card's own country: they and their picks stay.
      const typed = (n: ContactNumber) => manual.some((m) => m.key === n.key && m.contact === n.contact);
      setPicked((old) => Object.fromEntries(Object.entries(old).filter(([, n]) => typed(n))));
    }
    setAssumedRegionState(next);
  }
  // A region chosen after the contacts were read: read them again from the start in the new region.
  useEffect(() => {
    if (access === "ready" && !busy && loadedRegion.current !== assumedRegion) void loadContacts(0);
  }, [assumedRegion, access, busy, loadContacts]);

  // "On Resbite" for the picked numbers only, after 400 ms without a change.
  useEffect(() => {
    if (!enabled || !planId) return;
    const pending = selected.filter((n) => !checked.current.has(n.key));
    if (!pending.length) return;
    const fresh = pending.map((n) => digitsOf(n.e164));
    const ctx = current.current;
    const timer = setTimeout(() => {
      contactInviteGateway.onResbite(fresh).then(
        (found) => {
          if (!alive(ctx)) return;
          pending.forEach((n) => checked.current.add(n.key));
          setOnResbite((old) => new Set([...old, ...found]));
        },
        // The badge is a convenience: without it every pick is still invited correctly.
        () => {},
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [selected, enabled, planId]);

  async function invite() {
    if (!planId || !scope || !inviteCount || working.current) return;
    const ctx = current.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      // Only the numbers have codes kept on this phone.
      const stored = selected.length ? await inviteCodeStore.get(scope, planId) : {};
      const { numbers, phones, users } = inviteItems(
        selected,
        chosenUsers,
        invitedUsers,
        (n) => storedFor(stored, n.e164)?.code ?? newInviteCode(getRandomBytes(16)),
      );
      const out: Outcome = { inApp: [], already: [], links: [] };
      // The numbers first: a failure here shows on the Pick step, and nothing else is sent.
      if (phones.length) {
        const results = await contactInviteGateway.invite(planId, phones);
        if (!alive(ctx)) return;
        for (const [i, n] of numbers.entries()) {
          const kind: InviteKind | undefined = results.find((r) => "phone" in r && phoneKey(r.phone) === n.key)?.kind;
          if (kind === "link") {
            const prior = storedFor(stored, n.e164);
            const value: StoredInvite = { code: phones[i].code, name: n.name, sentVia: prior?.code === phones[i].code ? prior.sentVia : undefined };
            await putInviteQuietly(scope, planId, n.e164, value);
            out.links.push({ number: n, code: phones[i].code, sentVia: value.sentVia });
          } else if (kind === "app" || kind === "already") {
            await inviteCodeStore.remove(scope, planId, n.e164).catch(() => {});
            (kind === "app" ? out.inApp : out.already).push(n.name);
          } else if (kind === "self") {
            await inviteCodeStore.remove(scope, planId, n.e164).catch(() => {});
          }
        }
      }
      // Then the connections, in calls of their own, so a refusal there never loses the numbers' invitations.
      let note: string | null = null;
      if (users.length) {
        let sent: { results: UserResult[]; refused: string[] } | null = null;
        try {
          sent = await inviteConnections(contactInviteGateway, planId, users.map((u) => u.user));
        } catch (e) {
          // Nothing was sent: the Pick step says why, as it does for the numbers.
          if (!phones.length) throw e;
          // The numbers went: Almost there shows them, with why the connections didn't go.
          note = e instanceof Error ? e.message : INVITE_COPY.offline;
        }
        if (sent) {
          for (const r of sent.results) {
            const name = connections.find((p) => p.userId === r.user)?.name;
            if (name && r.kind === "app") out.inApp.push(name);
            else if (name && r.kind === "already") out.already.push(name);
          }
          if (sent.refused.length) {
            // Everyone picked was refused: stay on the Pick step.
            if (!phones.length && !sent.results.length) throw Error(CONNECTIONS_COPY.failed);
            note = CONNECTIONS_COPY.inviteRefused;
          }
        }
      }
      if (!alive(ctx)) return;
      setOutcome(out);
      setError(note);
    } catch (e) {
      if (alive(ctx)) setError(e instanceof Error ? e.message : INVITE_COPY.offline);
    } finally {
      if (alive(ctx)) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  const sending = useRef(false);
  async function send(item: Sendable, via: "whatsapp" | "messages"): Promise<string | null> {
    if (!planId || !scope || sending.current) return null;
    sending.current = true;
    const ctx = current.current;
    try {
      const failure = await sendPersonalLink({
        scope,
        plan: planId,
        e164: item.number.e164,
        name: item.number.name,
        code: item.code,
        via,
        origin,
        message,
      });
      if (failure) return failure;
      if (alive(ctx))
        setOutcome((o) =>
          o && { ...o, links: o.links.map((l) => (l.number.key === item.number.key ? { ...l, sentVia: via } : l)) },
        );
      return null;
    } finally {
      sending.current = false;
    }
  }

  return {
    assumedRegion, setAssumedRegion, access, visible, selected, picked, onResbite, query, setQuery, more, limited, skipped, offset,
    busy, error, setError, notice, setNotice, outcome, loadContacts, toggle, choose, addNumber, invite, send,
    connections, chosenUsers, toggleUser, invitedUsers, inviteCount,
  };
}
