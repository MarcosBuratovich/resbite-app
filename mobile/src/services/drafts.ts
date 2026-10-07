import { storage } from "./supabase";
import { createDraftStore } from "./draftStore";
// Native uses the existing chunked Keychain/Keystore adapter. Browser QA uses sessionStorage.
export const drafts = createDraftStore(storage);
export type { PlanDraft } from "./draftStore";
