import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useApp, LocalPlan } from "../src/state/AppState";
import { supabase } from "../src/services/supabase";
import { Back, Button, Copy, Title, ErrorNote, s } from "../src/design/ui";
import { activities } from "../src/services/catalogue";
export default function Invite() {
  const { token, plan } = useLocalSearchParams<{
      token?: string;
      plan?: string;
    }>(),
    { session, restoring, rememberInvite } = useApp(),
    [details, setDetails] = useState<LocalPlan | null>(null),
    [version, setVersion] = useState(1),
    [response, setResponse] = useState("pending"),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    setDetails(null);
    setError(null);
    if (token && /^[a-f0-9]{64}$/.test(token)) void rememberInvite(token);
    if (!session) {
      setBusy(false);
      return;
    }
    let active = true;
    async function load() {
      try {
        let id = plan;
        if (token) {
          if (!/^[a-f0-9]{64}$/.test(token))
            throw new Error("This invitation link is incomplete.");
          const { data, error } = await supabase.rpc("claim_invite", {
            p_token: token,
          });
          if (error) throw error;
          id = data;
          await rememberInvite(null);
        }
        if (!id) throw new Error("Invitation unavailable.");
        const { data, error } = await supabase
          .from("plans")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        const result = await supabase
          .from("attendees")
          .select("version,response")
          .eq("plan_id", id)
          .eq("user_id", session!.user.id)
          .single();
        if (result.error) throw result.error;
        if (active) {
          setDetails(data);
          setVersion(result.data.version);
          setResponse(result.data.response);
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Invitation unavailable.");
      } finally {
        if (active) setBusy(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [session, token, plan]);
  async function respond(value: string) {
    if (!details) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("respond", {
      p_plan: details.id,
      p_response: value,
      p_version: version,
    });
    if (error) setError(error.message);
    else {
      setVersion(data);
      setResponse(value);
    }
    setBusy(false);
  }
  return (
    <SafeAreaView style={s.page}>
      <View style={s.body}>
        <Back />
        <Title>You’re invited.</Title>
        {restoring || busy ? (
          <ActivityIndicator />
        ) : !session ? (
          <>
            <Copy>
              Sign in with your tester account. We’ll keep this invitation ready
              while you finish setting up.
            </Copy>
            <Button title="Sign in" onPress={() => router.push("/auth")} />
          </>
        ) : null}
        <ErrorNote message={error} />
        {session && details && (
          <>
            <Title style={{ fontSize: 24 }}>
              {activities.find((a) => a.id === details.activity_id)?.title}
            </Title>
            <Copy>{new Date(details.starts_at).toLocaleString()}</Copy>
            <Copy>{details.place_label}</Copy>
            <Copy>{details.note}</Copy>
            <Copy>Your response: {response}</Copy>
            {details.status === "active" && (
              <>
                <Button
                  title="I’ll be there"
                  onPress={() => respond("accepted")}
                  loading={busy}
                />
                <Button
                  title="Can’t make it"
                  secondary
                  onPress={() => respond("declined")}
                  disabled={busy}
                />
                {response === "accepted" && (
                  <Button
                    title="Withdraw my RSVP"
                    secondary
                    onPress={() => respond("withdrawn")}
                    disabled={busy}
                  />
                )}
              </>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
