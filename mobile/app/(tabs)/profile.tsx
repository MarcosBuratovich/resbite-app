import React, { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Bell, Camera, LogOut, MessageCircle, Pencil, ShieldCheck, Trash2, UserRound, Users } from "lucide-react-native";
import { Button, Copy, ErrorNote, Title, s } from "../../src/design/ui";
import { FieldCard, IconButton, InfoSheet, Row, RowGroup } from "../../src/design/kit";
import { PreviewNotice } from "../../src/design/Chrome";
import { categoryPalette, colors as c, depth, fonts, r } from "../../src/design/tokens";
import { formatPhone } from "../../src/domain/phone";
import { useProfile } from "../../src/state/useProfile";

/**
 * Profile (UX4-D2, "B · Grouped rows"): a centred photo and name, then one card of rows, and
 * Sign out in its own card. All logic is useProfile's, unchanged. Until a name is saved the
 * name field sits in the card (first run); afterwards ✎ opens it in a sheet.
 */
export default function Profile() {
  const p = useProfile();
  const [editing, setEditing] = useState(false);
  const firstRun = !p.profile && !p.loading;
  const shownName = p.profile?.display_name || p.name;
  const photoBlocked = p.busy || p.loading || p.signingOut || (!p.preview && (!p.profile || !!p.loadError));
  const nameField = (
    <FieldCard
      label="What should we call you?"
      icon={Pencil}
      display
      placeholder="Your name"
      value={p.name}
      onChangeText={p.changeName}
      editable={!p.busy}
      maxLength={80}
      autoComplete="name"
    />
  );
  // A save closes the name sheet; an error keeps it open with the typed name.
  const saveName = (
    <Button
      title="Save"
      onPress={async () => {
        if (await p.save()) setEditing(false);
      }}
      loading={p.busy}
      disabled={p.loading || p.signingOut}
    />
  );
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[s.body, { paddingBottom: 28 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <PreviewNotice />
        <Title>Profile</Title>
        <View style={styles.card}>
          {p.pending ? (
            <View style={{ gap: 12, alignSelf: "stretch" }}>
              <Copy>
                {p.pending.expectedRevision === undefined
                  ? "This photo change was prepared by an older app. Keep the saved photo, then choose again."
                  : "A photo change needs confirmation. Retry checks the saved photo before changing anything."}
              </Copy>
              <Button
                title="Keep saved photo"
                secondary
                onPress={() => void p.changePhoto("keep")}
                disabled={p.busy || p.loading || p.signingOut}
              />
              {p.pending.expectedRevision !== undefined && (
                <Button
                  title="Retry photo change"
                  onPress={() => void p.changePhoto("retry")}
                  disabled={p.busy || p.loading || p.signingOut}
                />
              )}
            </View>
          ) : (
            <View style={styles.photoRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={p.photoUri ? "Change photo" : "Add optional photo"}
                accessibilityHint="An optional photo, just for your profile."
                aria-disabled={photoBlocked}
                disabled={photoBlocked}
                onPress={() => void p.changePhoto("choose")}
                style={({ pressed }) => [styles.avatar, { opacity: photoBlocked ? 0.55 : pressed ? 0.8 : 1 }]}
              >
                {p.photoUri ? (
                  <Image
                    source={{ uri: p.photoUri }}
                    accessibilityIgnoresInvertColors
                    onError={p.photoFailed}
                    style={styles.photo}
                  />
                ) : (
                  <Text style={styles.initial}>{shownName ? shownName[0].toUpperCase() : "R"}</Text>
                )}
                <View style={styles.camera}>
                  <Camera size={18} strokeWidth={2.2} color={categoryPalette.creative.ink} />
                </View>
              </Pressable>
              {!!(p.photoUri || p.profile?.avatar_path) && (
                <View style={styles.remove}>
                  <IconButton
                    icon={Trash2}
                    label="Remove photo"
                    onPress={() => void p.changePhoto("remove")}
                    disabled={p.busy || p.loading || p.signingOut}
                  />
                </View>
              )}
            </View>
          )}
          {firstRun ? (
            <View style={{ gap: 12, alignSelf: "stretch" }}>
              {nameField}
              <ErrorNote message={p.error} />
              {saveName}
            </View>
          ) : p.loading && !p.profile ? null : (
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={2}>
                {shownName}
              </Text>
              <IconButton
                icon={Pencil}
                label="Edit name"
                tone="plain"
                disabled={p.busy || p.signingOut}
                onPress={() => setEditing(true)}
              />
            </View>
          )}
          {!p.preview && !!p.session?.user.email ? (
            <Text style={styles.email}>{p.session.user.email}</Text>
          ) : !p.preview && !!p.session?.user.phone ? (
            <Text style={styles.email}>{formatPhone(p.session.user.phone)}</Text>
          ) : null}
        </View>
        {!firstRun && !editing && <ErrorNote message={p.error} />}
        {p.loadError && (
          <>
            <ErrorNote message={p.loadError} />
            <Button title="Retry profile" secondary onPress={() => void p.load()} disabled={p.busy} />
          </>
        )}
        {p.loading && <Copy>Loading your profile…</Copy>}
        {!p.preview && !p.profile && !p.loading && (
          <Copy style={s.muted}>Save your name first to add a photo.</Copy>
        )}
        {p.photoMessage && <Copy style={s.muted}>{p.photoMessage}</Copy>}
        {p.saved && (
          <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
            {p.preview ? "Preview name saved." : "Your profile is saved."}
          </Copy>
        )}
        <RowGroup>
          <Row
            title="People & groups"
            icon={Users}
            tint={categoryPalette.mindful.tint}
            ink={categoryPalette.mindful.ink}
            onPress={() => router.push("/people")}
          />
          {!p.preview && (
            <Row
              title="Account details"
              icon={UserRound}
              tint={categoryPalette.intellectual.tint}
              ink={categoryPalette.intellectual.ink}
              onPress={() => router.push("/account-details")}
            />
          )}
          <Row
            title="Notifications"
            icon={Bell}
            tint={categoryPalette.creative.tint}
            ink={categoryPalette.creative.ink}
            onPress={() => router.push("/notifications")}
          />
          <Row
            title="Data & privacy"
            icon={ShieldCheck}
            tint={categoryPalette.natural.tint}
            ink={categoryPalette.natural.ink}
            onPress={() => router.push("/data-privacy")}
          />
          {p.preview && (
            <Row
              title="Sample conversation"
              icon={MessageCircle}
              tint={categoryPalette.creative.tint}
              ink={categoryPalette.creative.ink}
              onPress={() => router.push("/sample-chat")}
            />
          )}
        </RowGroup>
        <RowGroup>
          <Row
            title={p.preview ? "Leave preview" : "Sign out"}
            icon={LogOut}
            destructive
            disabled={p.signingOut}
            onPress={() => void p.signOutAndLeave()}
          />
        </RowGroup>
      </ScrollView>
      <InfoSheet visible={editing} title="Your name" onClose={() => setEditing(false)}>
        {nameField}
        <ErrorNote message={p.error} />
        {saveName}
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 24,
    gap: 14,
    alignItems: "center",
    borderRadius: r.card,
    backgroundColor: c.paper,
    boxShadow: depth.card,
  },
  photoRow: { alignItems: "center" },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: categoryPalette.intellectual.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: 104, height: 104, borderRadius: 52 },
  initial: { fontFamily: fonts.display, fontSize: 44, color: categoryPalette.intellectual.ink },
  camera: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: depth.small,
  },
  remove: { position: "absolute", right: -64, top: 30 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, maxWidth: "100%" },
  email: { color: c.muted, fontSize: 14, textAlign: "center" },
  name: { flexShrink: 1, fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: c.ink, textAlign: "center" },
});
