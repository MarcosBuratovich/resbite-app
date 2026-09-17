import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { chunkedStorage } from "./secureChunks";
const nativeStorage = chunkedStorage(
  {
    getItem: SecureStore.getItemAsync,
    setItem: SecureStore.setItemAsync,
    removeItem: SecureStore.deleteItemAsync,
  },
  Crypto.randomUUID,
);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
// Native session tokens stay in Keychain/Keystore. Browser review uses session storage only.
export const storage = {
  getItem: async (k: string) =>
    Platform.OS === "web"
      ? typeof sessionStorage === "undefined"
        ? null
        : sessionStorage.getItem(k)
      : nativeStorage.getItem(k),
  setItem: async (k: string, v: string) => {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(k, v);
    } else await nativeStorage.setItem(k, v);
  },
  removeItem: async (k: string) => {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(k);
    } else await nativeStorage.removeItem(k);
  },
};
export const supabase = createClient(
  url || "https://unconfigured.supabase.co",
  key || "unconfigured",
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
);
if (Platform.OS !== "web")
  AppState.addEventListener("change", (state) =>
    state === "active"
      ? supabase.auth.startAutoRefresh()
      : supabase.auth.stopAutoRefresh(),
  );
