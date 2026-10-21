import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import { useAccount } from "./AccountState";
import { useApp } from "./AppState";
import { detailsFromMetadata } from "../domain/registration";
import { pendingInviteParams } from "../domain/appLinks";
import {
  readProfile,
  saveProfile,
  signedPhoto,
  photoGateway,
  profilePhotoStore,
  type SavedProfile,
} from "../services/profile";
import { chooseNormalizedPhoto } from "../services/photo";
import {
  finishPhotoChange,
  type PhotoChange,
} from "../services/profilePhotoStore";

/**
 * Profile (UX4): the state, effects and actions moved unchanged from app/(tabs)/profile.tsx
 * so the screen only renders. changeName, photoFailed and signOutAndLeave are the screen's
 * former inline handlers, also unchanged.
 */
export function useProfile() {
  const {
    session,
    preview,
    signOut,
    pendingInvite,
    captureSession,
    signingOut,
  } = useApp();
  const account = useAccount();
  const scope = preview ? "preview" : (session?.user.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false),
    [profile, setProfile] = useState<SavedProfile | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null),
    [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PhotoChange | null>(null);
  const identity = useRef(scope);
  identity.current = scope;
  const dirty = useRef(false),
    focused = useRef(false),
    working = useRef(false),
    generation = useRef(0);
  function guard() {
    const captured = scope,
      focusGeneration = generation.current,
      assertSession = captureSession();
    return () => {
      assertSession();
      if (
        !focused.current ||
        identity.current !== captured ||
        generation.current !== focusGeneration
      )
        throw Error("Profile operation stopped after leaving this screen.");
    };
  }
  useEffect(() => {
    dirty.current = false;
    working.current = false;
    setName("");
    setPhotoUri(null);
    setProfile(null);
    setPending(null);
    setError(null);
    setLoadError(null);
    setSaved(false);
    setBusy(false);
    setPhotoMessage(null);
  }, [scope]);
  const load = useCallback(async () => {
    if (preview || !scope || working.current) return;
    const request = ++generation.current;
    const current = () =>
      focused.current &&
      identity.current === scope &&
      generation.current === request;
    setLoading(true);
    setLoadError(null);
    try {
      const [value, operation] = await Promise.all([
        readProfile(scope),
        profilePhotoStore.read(scope),
      ]);
      if (!current()) return;
      setProfile(value);
      setPending(operation);
      if (!dirty.current) {
        const registeredName = detailsFromMetadata(
          account.user?.user_metadata ?? session?.user.user_metadata,
        ).name;
        setName(
          value?.display_name ||
            (typeof registeredName === "string"
              ? registeredName.slice(0, 80)
              : ""),
        );
      }
      if (value?.avatar_path) {
        const uri = await signedPhoto(value.avatar_path);
        if (current()) setPhotoUri(uri);
      } else setPhotoUri(null);
    } catch {
      if (current())
        setLoadError(
          "Could not refresh your profile. Your typed name is kept. Try again.",
        );
    } finally {
      if (current()) setLoading(false);
    }
  }, [preview, scope]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void load();
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
      });
      return () => {
        focused.current = false;
        generation.current++;
        listener.remove();
      };
    }, [load]),
  );
  /** Saves the name; true once it is saved (the name sheet then closes). */
  async function save(): Promise<boolean> {
    if (working.current) return false;
    if (!name.trim() || name.trim().length > 80) {
      setError("Use a name between 1 and 80 characters.");
      return false;
    }
    const value = name.trim();
    let check: () => void;
    try {
      check = guard();
    } catch {
      return false;
    }
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      check();
      if (!preview) await saveProfile(value, scope);
      check();
      dirty.current = false;
      setName(value);
      setSaved(true);
      if (!preview) account.profileSaved();
      setProfile((old) => ({
        display_name: value,
        avatar_path: old?.avatar_path ?? null,
        avatar_revision: old?.avatar_revision ?? 0,
      }));
      const kept = pendingInviteParams(pendingInvite);
      if (kept && !preview)
        router.replace({ pathname: "/invite", params: kept });
      return true;
    } catch (e) {
      if (identity.current === scope)
        setError(
          e instanceof Error
            ? e.message
            : "Could not save your name. Your changes are kept.",
        );
    } finally {
      if (identity.current === scope) {
        working.current = false;
        setBusy(false);
      }
    }
    return false;
  }
  async function changePhoto(action: "choose" | "remove" | "retry" | "keep") {
    if (working.current) return;
    let check: () => void;
    try {
      check = guard();
    } catch {
      return;
    }
    working.current = true;
    setBusy(true);
    setError(null);
    setPhotoMessage(null);
    try {
      check();
      if (action === "keep" && !preview) {
        const current = await readProfile(scope);
        check();
        if (!current) throw Error("Could not read your saved profile.");
        const uri = current.avatar_path
          ? await signedPhoto(current.avatar_path)
          : null;
        check();
        await profilePhotoStore.clear(scope);
        check();
        setProfile(current);
        setPhotoUri(uri);
        setPending(null);
        setPhotoMessage(
          "Keeping the currently saved photo. An unused uploaded file may remain until cleanup is available.",
        );
        return;
      }
      let operation = pending;
      if (action !== "retry") {
        const chosen =
          action === "choose" ? await chooseNormalizedPhoto() : null;
        check();
        if (action === "choose" && !chosen) return;
        if (preview) {
          setPhotoUri(chosen?.uri ?? null);
          setPhotoMessage(
            "Preview photo stays in memory. Nothing was uploaded.",
          );
          return;
        }
        if (!profile) throw Error("Save your name first. A photo is optional.");
        operation = {
          previous: profile.avatar_path,
          target: chosen ? `${scope}/${Crypto.randomUUID()}.jpg` : null,
          expectedRevision: profile.avatar_revision,
        };
        await profilePhotoStore.begin(
          scope,
          operation,
          chosen?.bytes ?? null,
          check,
        );
        check();
        setPending(operation);
      }
      if (!operation || preview) return;
      const result = await finishPhotoChange(
        operation,
        photoGateway(scope),
        () => profilePhotoStore.bytes(scope),
        check,
      );
      check();
      const uri = result.avatarPath ? await signedPhoto(result.avatarPath) : null;
      check();
      setProfile((old) =>
        old ? {
          ...old,
          avatar_path: result.avatarPath,
          avatar_revision: result.avatarRevision,
        } : old,
      );
      setPhotoUri(uri);
      await profilePhotoStore.clear(scope);
      check();
      setPending(null);
      if (result.cleanupPending)
        setPhotoMessage(
          result.avatarPath
            ? "Your private photo is saved. The previous file remains in private storage until cleanup is enabled."
            : "Your profile photo is removed. The previous file remains in private storage until cleanup is enabled.",
        );
      else {
        setPhotoMessage(
          result.avatarPath
            ? "Your private photo is saved."
            : "Your photo is removed.",
        );
      }
    } catch (e) {
      if (identity.current === scope)
        setError(
          e instanceof Error
            ? e.message
            : "Photo change is unconfirmed. Retry when connected; your previous photo is kept until confirmed.",
        );
    } finally {
      if (identity.current === scope) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  function changeName(value: string) {
    dirty.current = true;
    setName(value);
    setSaved(false);
  }
  function photoFailed() {
    setPhotoUri(null);
    setPhotoMessage(
      "Photo preview could not load. Retry profile to refresh its private link.",
    );
    setLoadError(
      "Photo preview is unavailable. Your saved photo is unchanged.",
    );
  }
  async function signOutAndLeave() {
    try {
      await signOut();
      router.replace("/");
    } catch {
      setError("Could not sign out. Please try again.");
    }
  }
  return {
    preview, session, signingOut, name, busy, loading, error, loadError, saved, profile,
    photoUri, photoMessage, pending, load, save, changePhoto, changeName, photoFailed, signOutAndLeave,
  };
}
