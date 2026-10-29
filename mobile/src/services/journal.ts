import { storage } from "./supabase";
import { createJournalStore } from "./createJournal";
// Native uses the existing chunked Keychain/Keystore adapter. Browser QA uses sessionStorage.
export const createJournal = createJournalStore(storage);
