import { useCallback, useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { useApp } from "./AppState";
import { chooseNormalizedPhoto } from "../services/photo";
import {
  CoverDescriptionConflict,
  coverDescriptionGateway,
  coverGateway,
  planCoverStore,
  signedCovers,
} from "../services/planCovers";
import { finishVersionedPhotoChange, type PhotoChange } from "../services/profilePhotoStore";
import {
  COVER_DESCRIPTION_MAX,
  COVER_MAX_DIMENSION,
  coverPhotoLayout,
  coverScope,
  coverTarget,
} from "../domain/covers";

export type CoverOutcome = "none" | "saved" | "pending" | "failed" | "description";
export type CoverControls = {
  uri: string | null;
  /** UX2: the photo description VoiceOver reads; "" when there is none. */
  description: string;
  pending: PhotoChange | null;
  busy: boolean;
  ready: boolean;
  message: string | null;
  choose(): Promise<void>;
  remove(): Promise<void>;
  retry(): Promise<void>;
  keep(): Promise<void>;
  /** Saves the description (or holds it until the resbite exists). Resolves to an error message, or null. */
  describe(text: string): Promise<string | null>;
  commitAfterCreate(planId: string): Promise<CoverOutcome>;
};

const DESCRIPTION_TOO_LONG = "Keep the description to 200 characters.";
const DESCRIPTION_CONFLICT = "The photo changed elsewhere. Reopen this resbite, then describe it again.";
const DESCRIPTION_UNCONFIRMED = "The photo description didn’t save. Check your connection and try again.";

/**
 * Cover photo for the plan editor (CE2), with its description (UX2).
 * - New resbite: a chosen cover and its description stay on the device; the cover uploads after the plan
 *   is created, then the description is saved.
 * - Existing resbite: changes apply at once through the versioned cover pointer; a new or removed photo
 *   clears its description (the database does the same).
 * - Preview: covers and descriptions stay in memory.
 */
export function useCoverPhoto(options: {
  planId: string | null;
  preview: boolean;
  previewUri?: string | null;
  previewDescription?: string;
  onPreviewChange?: (uri: string | null) => void;
  onPreviewDescribe?: (description: string) => void;
}): CoverControls {
  const { planId, preview, onPreviewChange, onPreviewDescribe } = options;
  const { session, captureSession } = useApp();
  const ownerId = session?.user.id ?? null;
  const scope = (() => {
    if (preview || !ownerId || !planId) return null;
    try {
      return coverScope(ownerId, planId);
    } catch {
      return null;
    }
  })();
  const [uri, setUri] = useState<string | null>(preview ? (options.previewUri ?? null) : null);
  const [description, setDescriptionState] = useState(preview ? (options.previewDescription ?? "") : "");
  const [pending, setPending] = useState<PhotoChange | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(preview || !planId);
  const [message, setMessage] = useState<string | null>(null);
  const saved = useRef<{ path: string | null; revision: number }>({ path: null, revision: 0 });
  const chosen = useRef<{ bytes: Uint8Array; uri: string } | null>(null);
  // The latest description, for commitAfterCreate, which runs outside a render.
  const described = useRef(description);
  const setDescription = (text: string) => {
    described.current = text;
    setDescriptionState(text);
  };
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const guard = useCallback(() => {
    const assertSession = captureSession();
    return () => {
      assertSession();
      if (!mounted.current) throw Error("Cover change cancelled.");
    };
  }, [captureSession]);

  // Existing resbite: the server is the truth for the saved cover; a journal means a change needs confirmation.
  useEffect(() => {
    if (!scope || !ownerId || !planId) return;
    let active = true;
    setReady(false);
    setMessage(null);
    void (async () => {
      try {
        const journal = await planCoverStore.read(scope);
        const current = await coverDescriptionGateway(ownerId, planId).read();
        if (!current) throw Error(coverPhotoLayout.copy.missing);
        const next = current.path ? await signedCovers.get(current.path) : null;
        if (!active) return;
        saved.current = { path: current.path, revision: current.revision };
        setPending(journal);
        setUri(next);
        setDescription(current.description);
        setReady(true);
      } catch {
        if (active) setMessage("The cover photo needs a connection. Reopen this plan to try again.");
      }
    })();
    return () => {
      active = false;
    };
  }, [scope, ownerId, planId]);

  async function run(action: (check: () => void) => Promise<void>) {
    if (working.current) return;
    let check: () => void;
    try {
      check = guard();
    } catch {
      return;
    }
    working.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action(check);
    } catch (e) {
      if (mounted.current)
        setMessage(e instanceof Error ? e.message : coverPhotoLayout.copy.unconfirmed);
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function finish(change: PhotoChange, check: () => void) {
    const result = await finishVersionedPhotoChange(
      change,
      coverGateway(ownerId!, planId!),
      () => planCoverStore.bytes(scope!),
      check,
      coverPhotoLayout.copy,
    );
    check();
    saved.current = { path: result.path, revision: result.revision };
    const next = result.path ? await signedCovers.get(result.path) : null;
    check();
    await planCoverStore.clear(scope!);
    setUri(next);
    // The database cleared the previous photo's description.
    setDescription("");
    setPending(null);
    setMessage(
      (result.path ? "Cover photo saved." : "Cover photo removed.") +
        (result.cleanupPending
          ? " The previous file stays in private storage until cleanup is available."
          : ""),
    );
  }
  async function apply(target: string | null, bytes: Uint8Array | null, check: () => void) {
    const change: PhotoChange = {
      previous: saved.current.path,
      target,
      expectedRevision: saved.current.revision,
    };
    await planCoverStore.begin(scope!, change, bytes, check);
    check();
    setPending(change);
    await finish(change, check);
  }
  const choose = () =>
    run(async (check) => {
      const photo = await chooseNormalizedPhoto(COVER_MAX_DIMENSION);
      check();
      if (!photo) return;
      if (preview) {
        setUri(photo.uri);
        onPreviewChange?.(photo.uri);
        setDescription("");
        onPreviewDescribe?.("");
        setMessage("Preview cover stays in memory. Nothing is uploaded.");
        return;
      }
      if (!planId) {
        chosen.current = photo;
        setUri(photo.uri);
        setDescription("");
        setMessage("Your cover uploads after the resbite is saved.");
        return;
      }
      await apply(coverTarget(scope!, Crypto.randomUUID()), photo.bytes, check);
    });
  const remove = () =>
    run(async (check) => {
      if (preview) {
        setUri(null);
        onPreviewChange?.(null);
        setDescription("");
        onPreviewDescribe?.("");
        return;
      }
      if (!planId) {
        chosen.current = null;
        setUri(null);
        setDescription("");
        return;
      }
      await apply(null, null, check);
    });
  const retry = () =>
    run(async (check) => {
      if (pending) await finish(pending, check);
    });
  const keep = () =>
    run(async (check) => {
      const current = await coverDescriptionGateway(ownerId!, planId!).read();
      check();
      if (!current) throw Error(coverPhotoLayout.copy.missing);
      saved.current = { path: current.path, revision: current.revision };
      const next = current.path ? await signedCovers.get(current.path) : null;
      check();
      await planCoverStore.clear(scope!);
      setUri(next);
      setDescription(current.description);
      setPending(null);
      setMessage("Keeping the saved cover. An unused uploaded file may remain until cleanup is available.");
    });
  async function describe(text: string): Promise<string | null> {
    const next = text.trim();
    if (next.length > COVER_DESCRIPTION_MAX) return DESCRIPTION_TOO_LONG;
    if (preview) {
      setDescription(next);
      onPreviewDescribe?.(next);
      return null;
    }
    // Before the resbite exists, the description waits with the chosen photo (commitAfterCreate).
    if (!planId) {
      setDescription(next);
      return null;
    }
    if (working.current || !ownerId) return DESCRIPTION_UNCONFIRMED;
    let check: () => void;
    try {
      check = guard();
    } catch {
      return DESCRIPTION_UNCONFIRMED;
    }
    working.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await coverDescriptionGateway(ownerId, planId).save(next, saved.current.revision);
      check();
      saved.current = { path: result.path, revision: result.revision };
      setDescription(result.description);
      setMessage(result.description ? "Photo description saved." : "Photo description removed.");
      return null;
    } catch (e) {
      // A lost reply is safe to retry: the same text at the next revision is acknowledged.
      return e instanceof CoverDescriptionConflict ? DESCRIPTION_CONFLICT : DESCRIPTION_UNCONFIRMED;
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function commitAfterCreate(newPlanId: string): Promise<CoverOutcome> {
    const photo = chosen.current;
    if (preview || !photo || !ownerId) return "none";
    let check: () => void;
    let newScope: string;
    try {
      check = guard();
      newScope = coverScope(ownerId, newPlanId);
    } catch {
      return "failed";
    }
    const change: PhotoChange = {
      previous: null,
      target: coverTarget(newScope, Crypto.randomUUID()),
      expectedRevision: 0,
    };
    try {
      await planCoverStore.begin(newScope, change, photo.bytes, check);
    } catch {
      return "failed";
    }
    try {
      const result = await finishVersionedPhotoChange(
        change,
        coverGateway(ownerId, newPlanId),
        () => planCoverStore.bytes(newScope),
        check,
        coverPhotoLayout.copy,
      );
      await planCoverStore.clear(newScope);
      chosen.current = null;
      // The description waits for its photo; if it fails, the photo stays saved without it.
      const text = described.current;
      if (!text) return "saved";
      try {
        await coverDescriptionGateway(ownerId, newPlanId).save(text, result.revision);
        return "saved";
      } catch {
        return "description";
      }
    } catch {
      return "pending";
    }
  }
  return { uri, description, pending, busy, ready, message, choose, remove, retry, keep, describe, commitAfterCreate };
}
