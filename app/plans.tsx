import React, { useState, useCallback, useRef } from "react";
import {
  ScrollView,
  View,
  Image,
  RefreshControl,
  Share,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { activities, artwork } from "../src/services/catalogue";
import { supabase } from "../src/services/supabase";
import { useApp, LocalPlan } from "../src/state/AppState";
import { Button, Copy, Title, ErrorNote, Reveal, s } from "../src/design/ui";
import { colors as c } from "../src/design/tokens";
import { BottomNav, PreviewNotice } from "../src/design/Chrome";
export default function Plans() {
  const { created } = useLocalSearchParams(),
    { preview, localPlans, setLocalPlans, session } = useApp(),
    [plans, setPlans] = useState<LocalPlan[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [working, setWorking] = useState<string | null>(null),
    [confirmCancel, setConfirmCancel] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [attendees, setAttendees] = useState<
      {
        plan_id: string;
        user_id: string;
        response: string;
        profiles: { display_name: string } | null;
      }[]
    >([]);
  const identity = useRef(session?.user.id);
  identity.current = session?.user.id;
  const refresh = useCallback(async () => {
    setPlans([]);
    setAttendees([]);
    if (preview || !session) return;
    const uid = session.user.id;
    setBusy(true);
    setError(null);
    try {
      const [p, a] = await Promise.all([
        supabase.from("plans").select("*").order("starts_at"),
        supabase
          .from("attendees")
          .select("plan_id,user_id,response,profiles(display_name)"),
      ]);
      if (identity.current !== uid) return;
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      setPlans(p.data || []);
      setAttendees((a.data || []) as unknown as typeof attendees);
    } catch (e) {
      if (identity.current === uid)
        setError(e instanceof Error ? e.message : "Unable to load your plans.");
    } finally {
      if (identity.current === uid) setBusy(false);
    }
  }, [preview, session?.user.id]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  async function share(p: LocalPlan) {
    if (preview) {
      setNotice(
        "Invitations are disabled in design preview. Real invitations need an approved tester account.",
      );
      return;
    }
    setWorking(p.id);
    setError(null);
    try {
      const token = Array.from(await Crypto.getRandomBytesAsync(32))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { error } = await supabase.rpc("create_invite", {
        p_id: Crypto.randomUUID(),
        p_plan: p.id,
        p_token: token,
      });
      if (error) throw error;
      await Share.share({
        message: `Join my Resbite plan: resbite://invite?token=${token}`,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not prepare an invitation.",
      );
    } finally {
      setWorking(null);
    }
  }
  async function cancel(p: LocalPlan) {
    setWorking(p.id);
    setError(null);
    try {
      if (preview)
        setLocalPlans((all) =>
          all.map((x) =>
            x.id === p.id
              ? { ...x, status: "cancelled", version: x.version + 1 }
              : x,
          ),
        );
      else {
        const { error } = await supabase.rpc("change_plan", {
          p_plan: p.id,
          p_version: p.version,
          p_start: p.starts_at,
          p_zone: p.time_zone,
          p_place: p.place_label,
          p_note: p.note,
          p_cancel: true,
        });
        if (error) throw error;
        await refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not cancel. Refresh and try again.",
      );
    } finally {
      setWorking(null);
    }
  }
  const list = preview ? localPlans : session ? plans : [];
  return (
    <SafeAreaView style={s.page}>
      <PreviewNotice />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl refreshing={busy} onRefresh={refresh} />
        }
      >
        <Copy style={{ color: c.aquaDark }}>TIME WELL SPENT</Copy>
        <Title>Something to look forward to.</Title>
        <Copy style={s.muted}>Your plans, all in one place.</Copy>
        {created === "1" && (
          <Reveal>
            <View
              style={[s.card, { padding: 18, backgroundColor: c.aquaSoft }]}
            >
              <Copy>
                {preview ? "Preview plan saved." : "Your plan is saved."} Time
                to get together.
              </Copy>
            </View>
          </Reveal>
        )}
        <ErrorNote message={error} />
        {Boolean(notice) && <Copy style={s.muted}>{notice}</Copy>}
        {list.length === 0 && !busy ? (
          <View style={{ gap: 20, paddingVertical: 24 }}>
            <Image
              source={artwork["get-out-with-bikes"]}
              style={{ height: 180, width: "100%" }}
              resizeMode="contain"
            />
            <Title style={{ fontSize: 24 }}>Make room for a first plan.</Title>
            <Copy>Pick something you’d enjoy doing together.</Copy>
            <Button
              title="Explore activities"
              onPress={() => router.push("/discover")}
            />
          </View>
        ) : (
          list.map((p) => {
            const a = activities.find((x) => x.id === p.activity_id),
              owner = preview || p.owner_id === session?.user.id;
            return (
              <View key={p.id} style={[s.card, { padding: 20, gap: 14 }]}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Image
                    source={artwork[p.activity_id]}
                    style={{ width: 70, height: 70 }}
                    resizeMode="contain"
                  />
                  <View style={{ flex: 1 }}>
                    <Copy style={{ color: c.aquaDark, fontSize: 12 }}>
                      {p.status === "cancelled"
                        ? "CANCELLED"
                        : owner
                          ? "YOU’RE ORGANISING"
                          : "YOU’RE INVITED"}
                    </Copy>
                    <Title style={{ fontSize: 23, lineHeight: 29 }}>
                      {a?.title || "Your plan"}
                    </Title>
                  </View>
                </View>
                <Copy>
                  {new Date(p.starts_at).toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Copy>
                <Copy>{p.place_label}</Copy>
                {Boolean(p.note) && <Copy style={s.muted}>{p.note}</Copy>}
                {attendees
                  .filter((a) => a.plan_id === p.id)
                  .map((a) => (
                    <Copy key={a.user_id} style={s.muted}>
                      {a.profiles?.display_name || "Tester"} · {a.response}
                    </Copy>
                  ))}
                {p.status === "active" && owner && (
                  <>
                    <Button
                      title="Invite someone"
                      onPress={() => share(p)}
                      loading={working === p.id}
                    />
                    <Button
                      title="Cancel plan"
                      secondary
                      onPress={() => setConfirmCancel(p.id)}
                    />
                  </>
                )}
                {confirmCancel === p.id && p.status === "active" && (
                  <View
                    style={{
                      gap: 12,
                      padding: 14,
                      backgroundColor: c.pinkSoft,
                      borderRadius: 16,
                    }}
                  >
                    <Copy>Cancel this plan for everyone?</Copy>
                    <Button
                      title="Yes, cancel plan"
                      onPress={() => {
                        setConfirmCancel(null);
                        void cancel(p);
                      }}
                    />
                    <Button
                      title="Keep plan"
                      secondary
                      onPress={() => setConfirmCancel(null)}
                    />
                  </View>
                )}
                {!owner && p.status === "active" && (
                  <Button
                    title="View invitation"
                    onPress={() =>
                      router.push({
                        pathname: "/invite",
                        params: { plan: p.id },
                      })
                    }
                  />
                )}
              </View>
            );
          })
        )}
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}
