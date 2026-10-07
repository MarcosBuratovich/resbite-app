import React, { useState, useRef, useCallback, useEffect } from "react";
import { ScrollView, View, Image, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import { useAccount } from "../../src/state/AccountState";
import { detailsFromMetadata } from "../../src/domain/registration";
import { useApp } from "../../src/state/AppState";
import {
  Button,
  Copy,
  Title,
  Field,
  ErrorNote,
  ActionRow,
  ActionGroup,
  TextAction,
  s,
} from "../../src/design/ui";
import { PreviewNotice } from "../../src/design/Chrome";
import { colors as c } from "../../src/design/tokens";
import {
  readProfile,
  saveProfile,
  signedPhoto,
  photoGateway,
  profilePhotoStore,
  type SavedProfile,
} from "../../src/services/profile";
import { chooseNormalizedPhoto } from "../../src/services/photo";
import {
  finishPhotoChange,
  type PhotoChange,
} from "../../src/services/profilePhotoStore";
import {
  UserRound,
  Users,
  Bell,
  ShieldCheck,
  MessageCircle,
  Compass,
  Camera,
  Trash2,
  LogOut,
} from "lucide-react-native";
export default function Profile() {
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
  async function save() {
    if (working.current) return;
    if (!name.trim() || name.trim().length > 80) {
      setError("Use a name between 1 and 80 characters.");
      return;
    }
    const value = name.trim();
    let check: () => void;
    try {
      check = guard();
    } catch {
      return;
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
      if (pendingInvite && !preview)
        router.replace({
          pathname: "/invite",
          params: { token: pendingInvite },
        });
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
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[s.body, { paddingBottom: 28 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <PreviewNotice />
        <Copy style={{ color: c.aquaDark }}>YOUR LITTLE CORNER</Copy>
        <Title>Hello, you.</Title>
        <Copy style={s.muted}>
          {preview
            ? "Design preview"
            : session?.user.email || "Sign in to set up your profile."}
        </Copy>
        <View style={[s.card, { padding: 16, gap: 12 }]}>
          <View
            style={{
              minWidth: 64,
              minHeight: 64,
              padding: 16,
              alignSelf: "flex-start",
              borderRadius: 42,
              backgroundColor: c.pinkSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                accessibilityLabel="Your profile photo"
                onError={() => {
                  setPhotoUri(null);
                  setPhotoMessage(
                    "Photo preview could not load. Retry profile to refresh its private link.",
                  );
                  setLoadError(
                    "Photo preview is unavailable. Your saved photo is unchanged.",
                  );
                }}
                style={{ width: 100, height: 100, borderRadius: 50 }}
              />
            ) : (
              <Title>{name ? name[0].toUpperCase() : "R"}</Title>
            )}
          </View>
          <Field
            label="What should we call you?"
            value={name}
            onChangeText={(value) => {
              dirty.current = true;
              setName(value);
              setSaved(false);
            }}
            editable={!busy}
            maxLength={80}
            autoComplete="name"
          />
          <ErrorNote message={error} />
          {loadError && (
            <>
              <ErrorNote message={loadError} />
              <Button
                title="Retry profile"
                secondary
                onPress={() => void load()}
                disabled={busy}
              />
            </>
          )}
          {loading && <Copy>Loading your profile…</Copy>}
          <Copy style={s.muted}>An optional photo, just for your profile.</Copy>
          {!preview && !profile && !loading && (
            <Copy style={s.muted}>Save your name first to add a photo.</Copy>
          )}
          {pending ? (
            <>
              <Copy>
                {pending.expectedRevision === undefined
                  ? "This photo change was prepared by an older app. Keep the saved photo, then choose again."
                  : "A photo change needs confirmation. Retry checks the saved photo before changing anything."}
              </Copy>
              <Button
                title="Keep saved photo"
                secondary
                onPress={() => void changePhoto("keep")}
                disabled={busy || loading || signingOut}
              />
              {pending.expectedRevision !== undefined && <Button
                title="Retry photo change"
                onPress={() => void changePhoto("retry")}
                disabled={busy || loading || signingOut}
              />}
            </>
          ) : (
            <>
              <ActionRow
                icon={Camera}
                tone="rose"
                title={photoUri ? "Change photo" : "Add optional photo"}
                onPress={() => void changePhoto("choose")}
                disabled={
                  busy ||
                  loading ||
                  signingOut ||
                  (!preview && (!profile || !!loadError))
                }
              />
              {!!(photoUri || profile?.avatar_path) && (
                <TextAction
                  icon={Trash2}
                  destructive
                  title="Remove photo"
                  onPress={() => void changePhoto("remove")}
                  disabled={busy || loading || signingOut}
                />
              )}
            </>
          )}
          {photoMessage && <Copy style={s.muted}>{photoMessage}</Copy>}
          {saved && (
            <Copy style={{ color: c.aquaDark }}>
              {preview ? "Preview name saved." : "Your profile is saved."}
            </Copy>
          )}
          <Button
            title="Save profile"
            onPress={save}
            loading={busy}
            disabled={loading || signingOut}
          />
        </View>
        <Copy style={s.muted}>YOUR SPACE</Copy>
        <ActionGroup>
          {!preview && (
            <ActionRow
              title="Account details"
              description="Edit or remove your optional personal details"
              icon={UserRound}
              tone="rose"
              onPress={() => router.push("/account-details")}
            />
          )}
          <ActionRow
            title="People & groups"
            description="Your favourite company"
            icon={Users}
            onPress={() => router.push("/people")}
          />
          <View style={s.divider} />
          <ActionRow
            title="Notification settings"
            icon={Bell}
            tone="amber"
            onPress={() => router.push("/notifications")}
          />
          <View style={s.divider} />
          <ActionRow
            title="Your data & privacy"
            icon={ShieldCheck}
            tone="violet"
            onPress={() => router.push("/data-privacy")}
          />
        </ActionGroup>
        <ActionGroup>
          {preview && (
            <ActionRow
              title="Explore sample conversation"
              icon={MessageCircle}
              tone="rose"
              onPress={() => router.push("/sample-chat")}
            />
          )}
          <ActionRow
            title="Explore activities"
            icon={Compass}
            onPress={() => router.navigate("/discover")}
          />
        </ActionGroup>
        <TextAction
          icon={LogOut}
          title={preview ? "Leave preview" : "Sign out"}
          onPress={async () => {
            try {
              await signOut();
              router.replace("/");
            } catch {
              setError("Could not sign out. Please try again.");
            }
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
