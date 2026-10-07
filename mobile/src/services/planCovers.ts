import { Platform } from "react-native";
import { storage, supabase } from "./supabase";
import { withDeadline } from "./plans";
import { bounded, capturedProfileClient } from "./profile";
import {
  createPhotoChangeStore,
  type VersionedPhotoGateway,
} from "./profilePhotoStore";
import { fromBase64, toBase64, MAX_PHOTO_BYTES } from "./photo";
import { createSignedUrlCache } from "./signedUrlCache";
import { COVER_BUCKET, coverPhotoLayout } from "../domain/covers";

async function coverFile(scope: string) {
  if (!coverPhotoLayout.validScope(scope)) throw Error("Invalid cover owner.");
  const { File, Paths } = await import("expo-file-system");
  return new File(Paths.document, `resbite-cover-${scope.replace("/", "-")}.jpg`);
}
const webKey = (scope: string) => `resbite.cover-bytes.${scope.replace("/", ".")}`;

/** Device journal for unconfirmed cover changes, one per owner and plan. */
export const planCoverStore = createPhotoChangeStore(
  storage,
  {
    async write(scope, bytes) {
      if (bytes.byteLength > MAX_PHOTO_BYTES) throw Error("Cover photo is too large.");
      if (Platform.OS === "web") sessionStorage.setItem(webKey(scope), toBase64(bytes));
      else (await coverFile(scope)).write(bytes);
    },
    async read(scope) {
      if (Platform.OS === "web") {
        const raw = sessionStorage.getItem(webKey(scope));
        if (!raw) throw Error("Prepared cover is unavailable. Keep the saved cover and choose again.");
        return fromBase64(raw);
      }
      return (await coverFile(scope)).bytes();
    },
    async clear(scope) {
      if (Platform.OS === "web") sessionStorage.removeItem(webKey(scope));
      else {
        const file = await coverFile(scope);
        if (file.exists) file.delete();
      }
    },
  },
  coverPhotoLayout,
);

/** 300-second signed links, reused for 240 seconds. */
export const signedCovers = createSignedUrlCache(async (path) => {
  const { data, error } = await bounded(
    supabase.storage.from(COVER_BUCKET).createSignedUrl(path, 300),
  );
  if (error) throw error;
  return data.signedUrl;
});

/** Cover reads and writes bound to the organizer's captured session. */
export function coverGateway(ownerId: string, planId: string): VersionedPhotoGateway {
  let captured: ReturnType<typeof capturedProfileClient> | undefined;
  const client = () => (captured ??= capturedProfileClient(ownerId));
  return {
    async read() {
      const bound = await client();
      const { data, error } = await withDeadline((signal) =>
        bound
          .from("plans")
          .select("cover_path,cover_revision")
          .eq("id", planId)
          .abortSignal(signal)
          .maybeSingle(),
      );
      if (error) throw error;
      return data ? { path: data.cover_path, revision: data.cover_revision } : null;
    },
    async upload(path, bytes) {
      if (!path.startsWith(`${ownerId}/${planId}/`) || bytes.byteLength > MAX_PHOTO_BYTES)
        throw Error("Invalid prepared cover.");
      const bound = await client();
      const { error } = await bounded(
        bound.storage.from(COVER_BUCKET).upload(
          path,
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
          { contentType: "image/jpeg", upsert: true, cacheControl: "60" },
        ),
      );
      if (error) throw error;
    },
    async link(path, expectedPath, expectedRevision) {
      const bound = await client();
      const { error } = await withDeadline((signal) =>
        bound
          .rpc("set_plan_cover_if_current", {
            p_plan: planId,
            p_path: path,
            p_expected_path: expectedPath,
            p_expected_revision: expectedRevision,
          })
          .abortSignal(signal),
      );
      if (error) throw error;
    },
  };
}
