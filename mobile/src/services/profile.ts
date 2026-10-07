import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { supabase, storage } from "./supabase";
import { withDeadline } from "./plans";
import {
  createProfilePhotoStore,
  type PhotoGateway,
} from "./profilePhotoStore";
import { fromBase64, toBase64, MAX_PHOTO_BYTES } from "./photo";
export type SavedProfile = { display_name: string; avatar_path: string | null; avatar_revision: number };
async function photoFile(scope: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(scope)) throw Error("Invalid photo owner.");
  const { File, Paths } = await import("expo-file-system");
  return new File(Paths.document, `resbite-photo-${scope}.jpg`);
}
export const profilePhotoStore = createProfilePhotoStore(storage, {
  async write(scope, bytes) {
    if (bytes.byteLength > MAX_PHOTO_BYTES) throw Error("Photo is too large.");
    if (Platform.OS === "web")
      sessionStorage.setItem(`resbite.photo-bytes.${scope}`, toBase64(bytes));
    else (await photoFile(scope)).write(bytes);
  },
  async read(scope) {
    if (Platform.OS === "web") {
      const raw = sessionStorage.getItem(`resbite.photo-bytes.${scope}`);
      if (!raw)
        throw Error(
          "Prepared photo is unavailable. Keep the current photo and choose again.",
        );
      return fromBase64(raw);
    }
    return (await photoFile(scope)).bytes();
  },
  async clear(scope) {
    if (Platform.OS === "web")
      sessionStorage.removeItem(`resbite.photo-bytes.${scope}`);
    else {
      const file = await photoFile(scope);
      if (file.exists) file.delete();
    }
  },
});
export async function readProfile(id: string, client = supabase): Promise<SavedProfile | null> {
  const { data, error } = await withDeadline((signal) =>
    client
      .from("profiles")
      .select("display_name,avatar_path,avatar_revision")
      .eq("id", id)
      .abortSignal(signal)
      .maybeSingle(),
  );
  if (error) throw error;
  return data;
}
export async function saveProfile(name: string, expectedAccountId: string) {
  const clean = name.trim();
  if (!clean || clean.length > 80)
    throw Error("Use a name between 1 and 80 characters.");
  const client = await capturedProfileClient(expectedAccountId);
  const { error } = await withDeadline((signal) =>
    client.rpc("save_profile", { p_name: clean }).abortSignal(signal),
  );
  if (error) throw error;
}
export async function capturedProfileClient(expectedAccountId: string) {
  const { data, error } = await bounded(supabase.auth.getSession());
  if (error) throw error;
  if (!expectedAccountId || data.session?.user.id !== expectedAccountId || !data.session.access_token)
    throw Error("Account changed. Reopen your profile before trying again.");
  // No later SDK session lookup can adopt another account for set_avatar(null)
  // or save_profile. A new retry captures a fresh token for this same owner.
  const token = data.session.access_token;
  return createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "unconfigured",
    { accessToken: async () => token },
  );
}
export async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error("Photo request timed out. Retry to check the saved photo."),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function signedPhoto(path: string): Promise<string> {
  const { data, error } = await bounded(
    supabase.storage.from("profile-photos").createSignedUrl(path, 300),
  );
  if (error) throw error;
  return data.signedUrl;
}
export function photoGateway(id: string): PhotoGateway {
  let captured: Promise<Awaited<ReturnType<typeof capturedProfileClient>>> | undefined;
  const client = () => captured ??= capturedProfileClient(id);
  return {
    read: async () => readProfile(id, await client()),
    async upload(path, bytes) {
      if (!path.startsWith(`${id}/`) || bytes.byteLength > MAX_PHOTO_BYTES)
        throw Error("Invalid prepared photo.");
      const bound = await client();
      const { error } = await bounded(
        bound.storage.from("profile-photos").upload(
          path,
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
          { contentType: "image/jpeg", upsert: true, cacheControl: "60" },
        ),
      );
      if (error) throw error;
    },
    async link(path, expectedPath, expectedRevision) {
      const bound = await client();
      const { error } = await withDeadline((signal) =>
        bound.rpc("set_avatar_if_current", {
          p_path: path,
          p_expected_path: expectedPath,
          p_expected_revision: expectedRevision,
        }).abortSignal(signal),
      );
      if (error) throw error;
    },
  };
}
