import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { getRandomBytes } from "expo-crypto";
import { readPhoneRows, hasContactAccess, expandContactAccess } from "../services/contacts";
import { contactInviteGateway, type InviteKind } from "../services/contactInvites";
import { inviteCodeStore, type StoredInvite } from "../services/inviteCodeStore";
import { putInviteQuietly, sendPersonalLink } from "../services/inviteSend";
import {
  contactNumbers,
  hostRegion,
  newInviteCode,
  type ContactNumber,
} from "../domain/contactInvites";
import { INVITE_COPY } from "../domain/inviteCopy";
import { deviceRegion, INVALID_PHONE, parsePhone } from "../domain/phone";

export const DEFAULT_ORIGIN = "https://link.resbite.com";
const digitsOf = (e164: string) => e164.replace(/\D/g, "");

export type Access = "idle" | "loading" | "ready" | "denied" | "web";
export type Sendable = { number: ContactNumber; code: string; sentVia?: StoredInvite["sentVia"] };
export type Outcome = { inApp: string[]; already: string[]; links: Sendable[] };
type Message = { host: string; title: string; when: string };

/**
 * Contact invitations for one event: the contact pages, the picked numbers, the "On Resbite" lookup (picked
 * numbers only, debounced), the invite call and the sending of each personal link from this phone.
 */
export function useContactInvites(a: {
  planId: string | undefined;
  scope: string | undefined;
  userPhone: string | null | undefined;
  message: Message;
  enabled: boolean;
}) {
  const { planId, scope, userPhone, message, enabled } = a;
  const region = useMemo(() => hostRegion(userPhone, deviceRegion()), [userPhone]);
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
    setError(null);
    setNotice("");
    setBusy(false);
    working.current = false;
    touched.current = false;
    checked.current = new Set();
  }, [context]);

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
        const { numbers, skipped: bad } = contactNumbers(page.rows, region);
        setLoaded((old) => {
          if (!next) return numbers;
          const seen = new Set(old.map((n) => n.key));
          return [...old, ...numbers.filter((n) => !seen.has(n.key))];
        });
        setSkipped((old) => (next ? old + bad : bad));
        setOffset(page.nextOffset);
        setMore(page.more);
        setLimited(page.limited);
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
    [enabled, region, clearContacts],
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
  function addNumber(name: string, input: string): string | null {
    const parsed = parsePhone(input, region);
    if (!parsed.ok) return parsed.message;
    const n = contactNumbers([{ fullName: name, phones: [{ number: parsed.e164 }] }], region).numbers[0];
    if (!n) return INVALID_PHONE;
    setManual((old) => (old.some((x) => x.key === n.key) ? old : [n, ...old]));
    setPicked((old) => ({ ...old, [n.contact]: n }));
    return null;
  }

  // "On Resbite" for the picked numbers only, after 400 ms without a change.
  useEffect(() => {
    if (!enabled || !planId) return;
    const fresh = selected.map((n) => digitsOf(n.e164)).filter((d) => !checked.current.has(d));
    if (!fresh.length) return;
    const ctx = current.current;
    const timer = setTimeout(() => {
      contactInviteGateway.onResbite(fresh).then(
        (found) => {
          if (!alive(ctx)) return;
          fresh.forEach((d) => checked.current.add(d));
          setOnResbite((old) => new Set([...old, ...found]));
        },
        // The badge is a convenience: without it every pick is still invited correctly.
        () => {},
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [selected, enabled, planId]);

  async function invite() {
    if (!planId || !scope || !selected.length || working.current) return;
    const ctx = current.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const stored = await inviteCodeStore.get(scope, planId);
      const items = selected.map((n) => ({
        phone: digitsOf(n.e164),
        country: n.country,
        code: stored[n.e164]?.code ?? newInviteCode(getRandomBytes(16)),
      }));
      const results = await contactInviteGateway.invite(planId, items);
      if (!alive(ctx)) return;
      const out: Outcome = { inApp: [], already: [], links: [] };
      for (const [i, n] of selected.entries()) {
        const kind: InviteKind | undefined = results.find((r) => r.phone === items[i].phone)?.kind;
        if (kind === "link") {
          const prior = stored[n.e164];
          const value: StoredInvite = { code: items[i].code, name: n.name, sentVia: prior?.code === items[i].code ? prior.sentVia : undefined };
          await putInviteQuietly(scope, planId, n.e164, value);
          out.links.push({ number: n, code: items[i].code, sentVia: value.sentVia });
        } else if (kind === "app" || kind === "already") {
          await inviteCodeStore.remove(scope, planId, n.e164).catch(() => {});
          (kind === "app" ? out.inApp : out.already).push(n.name);
        } else if (kind === "self") {
          await inviteCodeStore.remove(scope, planId, n.e164).catch(() => {});
        }
      }
      if (!alive(ctx)) return;
      setOutcome(out);
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
    region, access, visible, selected, picked, onResbite, query, setQuery, more, limited, skipped, offset,
    busy, error, setError, notice, setNotice, outcome, loadContacts, toggle, choose, addNumber, invite, send,
  };
}
