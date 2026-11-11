import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./AppState";
import { useFocusedRefresh, type Run } from "./useFocusedRefresh";
import { applyDecision, keepOnFailure, requestGone, type ConnectionDecision } from "./connectionsModel";
import { connectionErrorMessage, connectionGateway, type MyConnections } from "../services/connections";

export { applyDecision, keepOnFailure, requestGone, type ConnectionDecision } from "./connectionsModel";

/** The preview has no account: nobody to connect with, and nothing is read or sent. */
const NOBODY: MyConnections = { requests: [], connected: [] };

export type Connections = {
  /**
   * The last list read, with the decisions taken since; null before the first read and after a first read that
   * failed. A failed refresh keeps the list (keepOnFailure): the Connections screen shows `error` above it.
   */
  data: MyConnections | null;
  /** A read is running. */
  busy: boolean;
  /**
   * The last read failed: from the failure until a read succeeds, a retry included. Profile shows no badge
   * meanwhile (CO-P6), whatever list is kept.
   */
  failed: boolean;
  /** The decision running, and whose request or connection it is about: one runs at a time. */
  acting: { userId: string; decision: ConnectionDecision } | null;
  error: string | null;
  load: () => Promise<void>;
  /**
   * Each answers whether the server took the decision. False: `error` says why and the list is as it was; or, for a
   * request no longer there (withdrawn, or answered elsewhere), no error and the list is read again.
   */
  accept: (userId: string) => Promise<boolean>;
  decline: (userId: string) => Promise<boolean>;
  remove: (userId: string) => Promise<boolean>;
  clearError: () => void;
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
  const [failed, setFailed] = useState(false);
  const [acting, setActing] = useState<Connections["acting"]>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setFailed(false);
    setError(null);
    setActing(null);
    working.current = false;
  }, [identity]);
  const read = useCallback(
    async (begin: () => Run) => {
      if (!userId || preview || signingOut || working.current) return;
      const { valid } = begin();
      setBusy(true);
      setError(null);
      try {
        const next = await connectionGateway.mine();
        if (valid()) {
          setData(next);
          setFailed(false);
        }
      } catch (e) {
        if (valid()) {
          setData((old) => keepOnFailure(old, true));
          setFailed(true);
          setError(connectionErrorMessage(e));
        }
      } finally {
        if (valid()) setBusy(false);
      }
    },
    [userId, preview, signingOut],
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
    setError(null);
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
      if (current() && !gone) setError(connectionErrorMessage(e));
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
    failed: failed && !preview,
    acting,
    error,
    load,
    accept: (person) => decide(person, "accept"),
    decline: (person) => decide(person, "decline"),
    remove: (person) => decide(person, "remove"),
    clearError: () => setError(null),
  };
}
