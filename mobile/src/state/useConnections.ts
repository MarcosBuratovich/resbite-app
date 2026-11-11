import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./AppState";
import { useFocusedRefresh, type Run } from "./useFocusedRefresh";
import {
  NO_ERRORS,
  applyDecision,
  keepOnFailure,
  nextErrors,
  requestGone,
  type ActionError,
  type ConnectionDecision,
  type ConnectionErrors,
  type ErrorEvent,
} from "./connectionsModel";
import { connectionErrorMessage, connectionGateway, type MyConnections } from "../services/connections";

export {
  actionErrorFor,
  applyDecision,
  keepOnFailure,
  requestGone,
  type ActionError,
  type ConnectionDecision,
} from "./connectionsModel";

/** The preview has no account: nobody to connect with, and nothing is read or sent. */
const NOBODY: MyConnections = { requests: [], connected: [] };

export type Connections = {
  /**
   * The last list read, with the decisions taken since; null before the first read and after a first read that
   * failed. A failed refresh keeps the list (keepOnFailure), with `readError` above it.
   */
  data: MyConnections | null;
  /** A read is running. */
  busy: boolean;
  /**
   * Why the last read failed: from the failure until a read succeeds, a retry, a sheet and a decision included
   * (nextErrors). Profile shows no badge meanwhile (CO-P6), whatever list is kept.
   */
  readError: string | null;
  /** Why the last decision failed, and whose it was: its card or sheet says so (actionErrorFor). */
  actionError: ActionError | null;
  /** The decision running, and whose request or connection it is about: one runs at a time. */
  acting: { userId: string; decision: ConnectionDecision } | null;
  load: () => Promise<void>;
  /**
   * Each answers whether the server took the decision. False: `actionError` says why and the list is as it was; or,
   * for a request no longer there (withdrawn, or answered elsewhere), no error and the list is read again.
   */
  accept: (userId: string) => Promise<boolean>;
  decline: (userId: string) => Promise<boolean>;
  remove: (userId: string) => Promise<boolean>;
  /** A sheet opened or closed: a decision's error goes, a read's stays. */
  sheetMoved: () => void;
};

/**
 * The signed-in person's Connections (CO-02, CO-P6): read whenever the screen gains focus (useFocusedRefresh); a
 * decision changes the list in place once the server has taken it (applyDecision), so the card or row goes without
 * a second read.
 */
export function useConnections(): Connections {
  const { session, preview, signingOut, captureSession } = useApp();
  const userId = session?.user.id;
  const identity = `${userId}:${preview}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const working = useRef(false);
  const [data, setData] = useState<MyConnections | null>(null);
  const [busy, setBusy] = useState(!preview);
  const [acting, setActing] = useState<Connections["acting"]>(null);
  const [errors, setErrors] = useState<ConnectionErrors>(NO_ERRORS);
  const note = useCallback((event: ErrorEvent) => setErrors((old) => nextErrors(old, event)), []);
  useEffect(() => {
    setData(null);
    setErrors(NO_ERRORS);
    setActing(null);
    working.current = false;
  }, [identity]);
  const read = useCallback(
    async (begin: () => Run) => {
      if (!userId || preview || signingOut || working.current) return;
      const { valid } = begin();
      setBusy(true);
      note({ type: "readStarted" });
      try {
        const next = await connectionGateway.mine();
        if (valid()) {
          setData(next);
          note({ type: "readSucceeded" });
        }
      } catch (e) {
        if (valid()) {
          setData((old) => keepOnFailure(old, true));
          note({ type: "readFailed", message: connectionErrorMessage(e) });
        }
      } finally {
        if (valid()) setBusy(false);
      }
    },
    [userId, preview, signingOut, note],
  );
  const { refresh: load, begin } = useFocusedRefresh(read, { identity });

  async function decide(person: string, decision: ConnectionDecision): Promise<boolean> {
    if (!userId || preview || signingOut || !data || working.current) return false;
    working.current = true;
    // A read still running would land the list as it was before this decision: it no longer counts.
    begin();
    const assertSession = captureSession();
    const mine = identity;
    const current = () => {
      try {
        assertSession();
      } catch {
        return false;
      }
      return currentIdentity.current === mine;
    };
    setActing({ userId: person, decision });
    note({ type: "decisionStarted" });
    let done = false,
      gone = false;
    try {
      if (decision === "accept") await connectionGateway.accept(person);
      else if (decision === "decline") await connectionGateway.decline(person);
      else await connectionGateway.remove(person);
      done = true;
      // Even if the screen lost focus meanwhile: the server has taken it, and the next read agrees.
      if (current()) setData((old) => (old ? applyDecision(old, person, decision) : old));
    } catch (e) {
      gone = requestGone(e);
      if (current() && !gone)
        note({ type: "decisionFailed", userId: person, decision, message: connectionErrorMessage(e) });
    } finally {
      working.current = false;
      setActing(null);
      // Reads wait while a decision runs, and the one it stopped will not finish.
      if (current()) setBusy(false);
    }
    // Quietly: the read takes the card away (a read is skipped off screen, and the next focus reads anyway).
    if (gone && current()) await load();
    return done;
  }

  return {
    data: preview ? NOBODY : data,
    busy: busy && !preview,
    readError: preview ? null : errors.read,
    actionError: errors.action,
    acting,
    load,
    accept: (person) => decide(person, "accept"),
    decline: (person) => decide(person, "decline"),
    remove: (person) => decide(person, "remove"),
    sheetMoved: () => note({ type: "sheet" }),
  };
}
