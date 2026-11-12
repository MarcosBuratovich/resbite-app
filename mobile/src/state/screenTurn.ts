import { useEffect, useState } from "react";

/**
 * Whether a screen is still the one that started some work (C25): mounted, and showing what it showed then (the same
 * account and resbite), without having shown anything else in between. Work that awaits checks it before it sets the
 * screen's state, so a late answer never lands on another account's or resbite's screen, or on a closed one. Losing
 * focus doesn't end a turn: sending a link opens WhatsApp, and its answer still belongs on the screen.
 */
export function createScreenTurn() {
  let mounted = false;
  let shown: string | null = null;
  let turn = 0;
  return {
    /** What the screen shows now, given on every render; something else starts a new turn. */
    show(identity: string) {
      if (identity === shown) return;
      shown = identity;
      turn += 1;
    },
    /** Mounted from now; the cleanup it returns closes it (StrictMode's remount opens it again). */
    mount() {
      mounted = true;
      return () => {
        mounted = false;
      };
    },
    /** The check for work that starts now. */
    begin(): () => boolean {
      const at = turn;
      return () => mounted && turn === at;
    },
  };
}

/** A screen's turn: `identity` names what it shows (account and resbite); it returns `begin`. */
export function useScreenTurn(identity: string): () => () => boolean {
  const [screen] = useState(createScreenTurn);
  screen.show(identity);
  useEffect(() => screen.mount(), [screen]);
  return screen.begin;
}
