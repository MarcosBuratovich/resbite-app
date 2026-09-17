import React from "react";
import {
  View,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Redirect } from "expo-router";
import { ArrowUpRight, Sparkles } from "lucide-react-native";
import { Title, Copy, Button, Reveal, s } from "../src/design/ui";
import { colors as c, fonts } from "../src/design/tokens";
import { useApp } from "../src/state/AppState";
export default function Welcome() {
  const { session, restoring, setPreview } = useApp();
  if (session && !restoring) return <Redirect href="/discover" />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.cream }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 28, paddingBottom: 24 }}
      >
        <Reveal style={{ flex: 1, gap: 26 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Image
              source={require("../assets/brand/resbite-mark.png")}
              style={{ width: 36, height: 36 }}
              resizeMode="contain"
            />
            <Copy style={{ fontFamily: fonts.display, fontSize: 28 }}>
              resbite
            </Copy>
          </View>
          <View style={styles.hero}>
            <View style={styles.circle} />
            <Image
              source={require("../assets/activities/coffee-together.png")}
              style={styles.art}
              resizeMode="contain"
            />
            <View style={styles.note}>
              <Sparkles size={15} color={c.aquaDark} />
              <Copy style={{ fontSize: 12, color: c.aquaDark }}>
                A little time. A real connection.
              </Copy>
            </View>
          </View>
          <View style={{ gap: 14 }}>
            <Title style={{ fontSize: 43, lineHeight: 49 }}>
              Good times start{"\n"}with getting together.
            </Title>
            <Copy style={{ color: c.muted, fontSize: 16, lineHeight: 26 }}>
              Find something you’d love to do.{"\n"}Make it happen with your
              people.
            </Copy>
          </View>
          <View style={{ gap: 12, marginTop: 12 }}>
            <Button
              title="Let’s get together"
              onPress={() => router.push("/auth")}
              loading={restoring}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/auth", params: { mode: "signin" } })
              }
              style={{ padding: 13, alignItems: "center" }}
            >
              <Copy style={{ fontSize: 13 }}>
                Already have an account?{" "}
                <Copy style={{ fontSize: 13, fontFamily: fonts.bold }}>
                  Sign in
                </Copy>
              </Copy>
            </Pressable>
          </View>
        </Reveal>
        {__DEV__ && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setPreview(true);
              router.push("/discover");
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
  hero: {
    height: 245,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  circle: {
    position: "absolute",
    height: 220,
    width: 260,
    borderRadius: 120,
    backgroundColor: "#E8E5E0",
    transform: [{ rotate: "-12deg" }],
  },
  art: { width: "100%", height: 230 },
  note: {
    position: "absolute",
    bottom: 0,
    backgroundColor: c.paper,
    borderRadius: 24,
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    transform: [{ rotate: "-3deg" }],
  },
});
