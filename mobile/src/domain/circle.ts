import { CIRCLE_COPY } from "./circleCopy";
import type { Plan } from "./plans";

export type BringInvites = 0 | 1 | 2 | 3;
export type BringLevels = 1 | 2 | 3;
/** A resbite's circle of trust: how many people each guest may bring (0 is Nobody), and how many levels deep. */
export type Circle = { invites: BringInvites; levels: BringLevels };

const INVITES: readonly number[] = [0, 1, 2, 3];
const LEVELS: readonly number[] = [1, 2, 3];

/** The first word of a display name; "" for a blank one. */
export function firstName(displayName: string | null | undefined): string {
  return (displayName ?? "").trim().split(/\s+/)[0] ?? "";
}

/** The plan's circle. A plan read without the columns (a cached or preview plan) reads as Nobody, one level. */
export function circleOf(plan: Pick<Plan, "bring_invites" | "bring_levels">): Circle {
  const invites = plan.bring_invites;
  const levels = plan.bring_levels;
  return {
    invites: typeof invites === "number" && INVITES.includes(invites) ? invites : 0,
    levels: typeof levels === "number" && LEVELS.includes(levels) ? levels : 1,
  };
}

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);
const those = (n: number) => (n === 1 ? "that person" : "each of them");

/** What the two choices mean, said of one guest (CO-04); "" for Nobody. */
export function circleSentence({ name, invites, levels }: { name: string } & Circle): string {
  if (invites === 0) return "";
  const first = `${name} can bring ${people(invites)}`;
  if (levels === 1) return `${first}. ${CIRCLE_COPY.accountsOnly}`;
  if (levels === 2) return `${first}, and ${those(invites)} can bring ${invites} more. ${CIRCLE_COPY.accountsOnly}`;
  return `${first}, and each of them can bring ${invites} more, and so on for 3 levels. ${CIRCLE_COPY.accountsOnly}`;
}

/**
 * The name the sentence uses: the first name of the first guest who is going and isn't a host (the owner and admins
 * invite; they never bring), else `CIRCLE_COPY.eachGuest`.
 */
export function firstGuestName(
  guests: readonly { userId: string; name: string; response: string }[],
  hosts: readonly (string | undefined)[],
): string {
  for (const g of guests) {
    if (g.response !== "accepted" || hosts.includes(g.userId)) continue;
    const name = firstName(g.name);
    if (name) return name;
  }
  return CIRCLE_COPY.eachGuest;
}

/** The card's state: the circle the server has, the one shown, and whether a save is in flight. */
export type CircleSaveState = { saved: Circle; shown: Circle; saving: boolean };
export type CircleSaveEvent = { type: "tap"; value: Circle } | { type: "saved"; value: Circle } | { type: "failed" };

const same = (a: Circle, b: Circle) => a.invites === b.invites && a.levels === b.levels;

/**
 * Each change saves at once. A tap shows its value and starts a save; a tap while one is in flight, or on what is
 * shown, returns the state unchanged (the same object), so the caller sends nothing. A failure shows the saved
 * value again, never one tapped before.
 */
export function circleSave(state: CircleSaveState, event: CircleSaveEvent): CircleSaveState {
  switch (event.type) {
    case "tap":
      if (state.saving || same(state.shown, event.value)) return state;
      return { saved: state.saved, shown: event.value, saving: true };
    case "saved":
      return { saved: event.value, shown: event.value, saving: false };
    case "failed":
      return { saved: state.saved, shown: state.saved, saving: false };
  }
}
