import React from "react";
import { ScrollView, View, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
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
import { useProfile } from "../../src/state/useProfile";
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
    preview, session, signingOut, name, busy, loading, error, loadError, saved, profile,
    photoUri, photoMessage, pending, load, save, changePhoto, changeName, photoFailed, signOutAndLeave,
  } = useProfile();
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
                onError={photoFailed}
                style={{ width: 100, height: 100, borderRadius: 50 }}
              />
            ) : (
              <Title>{name ? name[0].toUpperCase() : "R"}</Title>
            )}
          </View>
          <Field
            label="What should we call you?"
            value={name}
            onChangeText={changeName}
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
            title="Browse ideas"
            icon={Compass}
            onPress={() => router.navigate("/create")}
          />
        </ActionGroup>
        <TextAction
          icon={LogOut}
          title={preview ? "Leave preview" : "Sign out"}
          onPress={() => void signOutAndLeave()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
