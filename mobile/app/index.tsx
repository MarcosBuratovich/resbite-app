import {
  accountDeletionEnabled,
  loadRecentDeletionReceipt,
} from "../src/services/accountDeletion";
import React, { useEffect, useState } from "react";
import { View, Image, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Redirect } from "expo-router";
import { ArrowUpRight, ShieldCheck } from "lucide-react-native";
import { Title, Copy, Button, Reveal, TextAction } from "../src/design/ui";
import { Chip } from "../src/design/kit";
import { colors as c, depth, fonts } from "../src/design/tokens";
import { useApp } from "../src/state/AppState";
export default function Welcome() {
  const { session, restoring, setPreview } = useApp();
  const [hasDeletionReceipt, setHasDeletionReceipt] = useState(false);
  useEffect(() => {
    let active = true;
    if (accountDeletionEnabled)
      void loadRecentDeletionReceipt()
        .then((value) => {
          if (active) setHasDeletionReceipt(Boolean(value));
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (session && !restoring) return <Redirect href="/account" />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.cream }}>
      <ScrollView contentContainerStyle={styles.page}>
        <Reveal style={{ flex: 1, gap: 24 }}>
          <View style={styles.brand}>
            <Image
              source={require("../assets/brand/resbite-mark.png")}
              style={{ width: 36, height: 36 }}
              resizeMode="contain"
            />
            <Copy style={{ fontFamily: fonts.display, fontSize: 28 }}>
              resbite
            </Copy>
          </View>
          <View style={styles.picture}>
            <Image
              source={require("../assets/activities/coffee-together.png")}
              accessible={false}
              style={styles.art}
              resizeMode="contain"
            />
          </View>
          <View style={{ gap: 10 }}>
            <Title style={{ fontSize: 40, lineHeight: 46 }}>Get together</Title>
            <Copy style={styles.line}>Small plans with your people.</Copy>
          </View>
          <View style={{ gap: 4 }}>
            <Button
              large
              icon={false}
              title="Get started"
              onPress={() => router.push("/introduction")}
              loading={restoring}
            />
            <View style={styles.center}>
              <TextAction
                title="I have an account"
                onPress={() =>
                  router.push({ pathname: "/auth/phone", params: { intent: "signin" } })
                }
              />
            </View>
          </View>
        </Reveal>
        {hasDeletionReceipt && (
          <View style={[styles.center, { paddingTop: 12 }]}>
            <Chip
              text="Check account deletion"
              icon={ShieldCheck}
              tone="aqua"
              onPress={() => router.push("/delete-account")}
            />
          </View>
        )}
        {__DEV__ && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setPreview(true);
              router.push("/create");
            }}
            style={{
              paddingTop: 18,
              alignSelf: "center",
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
            }}
          >
            <Copy style={{ fontSize: 12, color: c.muted }}>
              Preview the design
            </Copy>
            <ArrowUpRight size={15} color={c.muted} />
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 28, paddingBottom: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  picture: {
    borderRadius: 36,
    padding: 22,
    backgroundColor: c.pinkSoft,
    boxShadow: depth.card,
  },
  art: { width: "100%", height: 210 },
  line: { color: c.muted, fontSize: 17, lineHeight: 26 },
  center: { alignItems: "center" },
});
