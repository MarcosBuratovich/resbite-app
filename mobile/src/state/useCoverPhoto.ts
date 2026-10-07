import { useCallback, useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { useApp } from "./AppState";
import { chooseNormalizedPhoto } from "../services/photo";
import { coverGateway, planCoverStore, signedCovers } from "../services/planCovers";
import { finishVersionedPhotoChange, type PhotoChange } from "../services/profilePhotoStore";
import { COVER_MAX_DIMENSION, coverPhotoLayout, coverScope, coverTarget } from "../domain/covers";

export type CoverOutcome = "none" | "saved" | "pending" | "failed";
export type CoverControls = {
  uri: string | null;
  pending: PhotoChange | null;
  busy: boolean;
  ready: boolean;
  message: string | null;
  choose(): Promise<void>;
  remove(): Promise<void>;
  retry(): Promise<void>;
  keep(): Promise<void>;
  commitAfterCreate(planId: string): Promise<CoverOutcome>;
};

/**
 * Cover photo for the plan editor (CE2).
 * - New resbite: a chosen cover stays on the device and uploads after the plan is created.
 * - Existing resbite: changes apply at once through the versioned cover pointer.
 * - Preview: covers stay in memory as data URIs.
 */
export function useCoverPhoto(options: {
  planId: string | null;
  preview: boolean;
  previewUri?: string | null;
  onPreviewChange?: (uri: string | null) => void;
}): CoverControls {
  const { planId, preview, onPreviewChange } = options;
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
  const [pending, setPending] = useState<PhotoChange | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(preview || !planId);
  const [message, setMessage] = useState<string | null>(null);
  const saved = useRef<{ path: string | null; revision: number }>({ path: null, revision: 0 });
  const chosen = useRef<{ bytes: Uint8Array; uri: string } | null>(null);
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
        const current = await coverGateway(ownerId, planId).read();
        if (!current) throw Error(coverPhotoLayout.copy.missing);
        const next = current.path ? await signedCovers.get(current.path) : null;
        if (!active) return;
        saved.current = current;
        setPending(journal);
        setUri(next);
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
        setMessage("Preview cover stays in memory. Nothing is uploaded.");
        return;
      }
      if (!planId) {
        chosen.current = photo;
        setUri(photo.uri);
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
        return;
      }
      if (!planId) {
        chosen.current = null;
        setUri(null);
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
      const current = await coverGateway(ownerId!, planId!).read();
      check();
      if (!current) throw Error(coverPhotoLayout.copy.missing);
      saved.current = current;
      const next = current.path ? await signedCovers.get(current.path) : null;
      check();
      await planCoverStore.clear(scope!);
      setUri(next);
      setPending(null);
      setMessage("Keeping the saved cover. An unused uploaded file may remain until cleanup is available.");
    });
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
      await finishVersionedPhotoChange(
        change,
        coverGateway(ownerId, newPlanId),
        () => planCoverStore.bytes(newScope),
        check,
        coverPhotoLayout.copy,
      );
      await planCoverStore.clear(newScope);
      chosen.current = null;
      return "saved";
    } catch {
      return "pending";
    }
  }
  return { uri, pending, busy, ready, message, choose, remove, retry, keep, commitAfterCreate };
}
