import { PlanSaveError, reconcilePlan, type Plan, type PlanGateway } from "../domain/plans";
import type { JournalStore } from "./createJournal";

/**
 * Finish a create that a lost connection left unconfirmed. Reads by id first, so it never creates twice.
 * An unknown outcome keeps the entry for the next launch; a definite refusal drops it.
 */
export async function reconcilePendingCreate(
  scope: string,
  gateway: PlanGateway,
  journal: JournalStore,
): Promise<{ plan: Plan | null }> {
  const entry = await journal.read(scope);
  if (!entry) return { plan: null };
  try {
    await reconcilePlan(gateway, entry.write);
  } catch (error) {
    if (error instanceof PlanSaveError && error.uncertain) return { plan: null };
    await journal.clear(scope);
    return { plan: null };
  }
  // A failed read here keeps the entry: the next launch finds the plan and clears it then.
  let plan: Plan | null;
  try {
    plan = await gateway.read(entry.write.id);
  } catch {
    return { plan: null };
  }
  await journal.clear(scope);
  return { plan };
}
