import { PlanSaveError, reconcilePlan, type Plan, type PlanGateway } from "../domain/plans";
import { createJournal } from "./createJournal";

/**
 * Finish a create that a lost connection left unconfirmed. Reads by id first, so it never creates twice.
 * An unknown outcome keeps the entry for the next launch; a definite refusal drops it.
 */
export async function reconcilePendingCreate(
  scope: string,
  gateway: PlanGateway,
  journal: Pick<typeof createJournal, "read" | "clear"> = createJournal,
): Promise<{ plan: Plan | null }> {
  const entry = await journal.read(scope);
  if (!entry) return { plan: null };
  try {
    await reconcilePlan(gateway, entry.write);
    await journal.clear(scope);
    return { plan: await gateway.read(entry.write.id) };
  } catch (error) {
    if (error instanceof PlanSaveError && error.uncertain) return { plan: null };
    await journal.clear(scope);
    return { plan: null };
  }
}
