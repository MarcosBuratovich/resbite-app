import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useApp } from "../src/state/AppState";
import { supabase } from "../src/services/supabase";
import { Button, Copy, Title, Field, ErrorNote, s } from "../src/design/ui";
import { BottomNav, PreviewNotice } from "../src/design/Chrome";
import { colors as c } from "../src/design/tokens";
export default function Profile() {
  const { session, preview, signOut, pendingInvite } = useApp(),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState(false);
  async function save() {
    if (!name.trim()) {
      setError("Tell us what to call you.");
      return;
    }
    setBusy(true);
    setError(null);
    if (!preview) {
      const { error } = await supabase.rpc("save_profile", {
        p_name: name.trim(),
      });
      if (error) {
        setError(
          error.message.includes("tester")
            ? "Your account is signed in, but private tester access has not been opened yet."
            : error.message,
        );
        setBusy(false);
        return;
      }
    }
    setSaved(true);
    setBusy(false);
    if (pendingInvite && !preview)
      router.replace({ pathname: "/invite", params: { token: pendingInvite } });
  }
  return (
    <SafeAreaView style={s.page}>
      <PreviewNotice />
      <ScrollView contentContainerStyle={s.body}>
        <Copy style={{ color: c.aquaDark }}>YOUR LITTLE CORNER</Copy>
        <Title>Hello, you.</Title>
        <Copy style={s.muted}>
          {preview
            ? "Design preview"
            : session?.user.email || "Sign in to set up your profile."}
        </Copy>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: c.pinkSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Title>{name ? name[0].toUpperCase() : "R"}</Title>
        </View>
        <Field
          label="What should we call you?"
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoComplete="name"
        />
        <ErrorNote message={error} />
        {saved && (
          <Copy style={{ color: c.aquaDark }}>
            {preview ? "Preview name saved." : "Your profile is saved."}
          </Copy>
        )}
        <Button title="Save profile" onPress={save} loading={busy} />
        <Button
          title="Explore activities"
          secondary
          onPress={() => router.push("/discover")}
        />
        <View style={[s.card, { padding: 20, gap: 10 }]}>
          <Title style={{ fontSize: 22 }}>Your choices matter.</Title>
          <Copy style={s.muted}>
            Location is requested when choosing a meeting place. Contacts and
            notification settings will be connected in the next build.
          </Copy>
        </View>
        <Button
          title={preview ? "Leave preview" : "Sign out"}
          secondary
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
      <BottomNav />
    </SafeAreaView>
  );
}
