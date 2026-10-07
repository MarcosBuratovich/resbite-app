import { storage } from "./supabase";
import { createRecentPlacesStore } from "./recentPlacesStore";
// Native uses the chunked Keychain/Keystore adapter. Browser QA uses sessionStorage.
export const recentPlaces = createRecentPlacesStore(storage);
