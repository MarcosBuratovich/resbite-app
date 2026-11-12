import { useCallback, useEffect, useReducer, useRef } from "react";
import { useApp } from "./AppState";
import { useFocusedRefresh, type Run } from "./useFocusedRefresh";
import { BLOCKED_PEOPLE_START, blockedPeopleStep, blockedPeopleView, type BlockedPeopleView } from "./blockedPeople";
import { safetyErrorMessage, safetyGateway } from "../services/safety";

export type BlockedPeople = {
  view: BlockedPeopleView;
  /** Reads the list again (Try again). */
  load: () => Promise<void>;
  /** Unblocks one person at once, through the safety gateway, so a chat open beneath hears it (B3). */
  unblock: (userId: string) => Promise<void>;
};

/**
 * The signed-in person's Blocked people (G-S10): `my_blocks`, read whenever the screen gains focus (useFocusedRefresh).
 * An unblock goes through the gateway, which tells every mounted chat session that the blocks changed. It ends any
 * read still running, whose answer predates it and would bring the row back. The preview reads and sends nothing.
 */
export function useBlockedPeople(): BlockedPeople {
  const { session, preview, signingOut, captureSession } = useApp();
  const userId = session?.user.id;
  const identity = `${userId}:${preview}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const working = useRef(false);
  const [state, dispatch] = useReducer(blockedPeopleStep, BLOCKED_PEOPLE_START);
  const shownFor = useRef(identity);
  useEffect(() => {
    if (shownFor.current === identity) return;
    shownFor.current = identity;
    working.current = false;
    // Another account's list is never shown: it is read again from the start.
    dispatch({ type: "reset" });
  }, [identity]);
  const read = useCallback(
    async (begin: () => Run) => {
      if (!userId || preview || signingOut || working.current) return;
      const { valid } = begin();
      dispatch({ type: "readStarted" });
      try {
        const people = await safetyGateway.myBlocks();
        if (valid()) dispatch({ type: "readSucceeded", people });
      } catch (e) {
        if (valid()) dispatch({ type: "readFailed", message: safetyErrorMessage(e) });
      }
    },
    [userId, preview, signingOut],
  );
  const { refresh: load, begin } = useFocusedRefresh(read, { identity });

  async function unblock(person: string): Promise<void> {
    if (!userId || preview || signingOut || working.current) return;
    working.current = true;
    // A read still running would land the list as it was before this unblock: it no longer counts.
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
    dispatch({ type: "unblockStarted", userId: person });
    try {
      await safetyGateway.unblock(person);
      // Even if the screen lost focus meanwhile: the server has taken it, and the next read agrees.
      if (current()) dispatch({ type: "unblockSucceeded", userId: person });
    } catch (e) {
      if (current()) dispatch({ type: "unblockFailed", userId: person, message: safetyErrorMessage(e) });
    } finally {
      working.current = false;
    }
  }

  return { view: blockedPeopleView(state, { preview }), load, unblock };
}
