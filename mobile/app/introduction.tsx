import React, { useRef, useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Compass, Users, CalendarHeart } from "lucide-react-native";
import { Button, Copy, Title, Reveal, TextAction, s } from "../src/design/ui";
import { colors as c, depth } from "../src/design/tokens";

const slides = [
  {
    eyebrow: "MAKE ROOM FOR SOMETHING GOOD",
    title: "Little plans.\nLovely possibilities.",
    description:
      "A coffee, a bike ride, a little creativity. Discover simple ways to spend time doing something you love.",
    detail: "Find your next idea",
    note: "Browse activities and choose what feels right for you.",
    image: require("../assets/activities/get-out-with-bikes.png"),
    color: c.aquaSoft,
    Icon: Compass,
  },
  {
    eyebrow: "YOUR PEOPLE, YOUR PLANS",
    title: "Better with\nsomeone you know.",
    description:
      "Turn “we should catch up” into a real invitation. Choose your people and share a plan, one small moment at a time.",
    detail: "Bring your people together",
    note: "You choose who to invite and when to share the link.",
    image: require("../assets/activities/coffee-together.png"),
    color: c.pinkSoft,
    Icon: Users,
  },
  {
    eyebrow: "LESS PLANNING, MORE LIVING",
    title: "Pick a time.\nMake a memory.",
    description:
      "Set the date, choose a meeting place and keep everyone’s responses together. Make space for time well spent.",
    detail: "A little time, together",
    note: "Your plans and invitation responses, all in one place.",
    image: require("../assets/activities/painting.png"),
    color: c.purpleSoft,
    Icon: CalendarHeart,
  },
];
export default function Introduction() {
  const [step, setStep] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const slide = slides[step];
  const start = () =>
    router.replace({ pathname: "/auth", params: { mode: "register" } });
  function move(next: number) {
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  return (
    <SafeAreaView style={[s.page, { backgroundColor: c.cream }]}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[s.body, { flexGrow: 1, paddingBottom: 28 }]}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <TextAction
            title="Back"
            onPress={() => (step ? move(step - 1) : router.back())}
          />
          <TextAction title="Skip introduction" onPress={start} />
        </View>
        <Reveal key={step} style={{ gap: 24, flex: 1 }}>
          <View
            style={{
              backgroundColor: slide.color,
              borderRadius: 36,
              padding: 22,
              boxShadow: depth.card,
            }}
          >
            <Image
              source={slide.image}
              accessible={false}
              style={{ width: "100%", height: 190 }}
              resizeMode="contain"
            />
          </View>
          <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
            <Copy style={{ color: c.aquaDark, fontSize: 12 }}>
              {slide.eyebrow}
            </Copy>
            <Title style={{ fontSize: 30, lineHeight: 36 }}>
              {slide.title}
            </Title>
            <Copy style={{ color: c.muted, lineHeight: 26 }}>
              {slide.description}
            </Copy>
          </View>
          <View
            style={[
              s.card,
              {
                padding: 16,
                gap: 12,
                flexDirection: "row",
                alignItems: "center",
              },
            ]}
          >
            <View
              style={{
                alignSelf: "flex-start",
                padding: 12,
                borderRadius: 16,
                backgroundColor: slide.color,
              }}
            >
              <slide.Icon color={c.ink} size={24} />
            </View>
            <Copy style={{ flex: 1 }}>{slide.detail}</Copy>
          </View>
        </Reveal>
        <View style={{ gap: 16, paddingTop: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {slides.map((_, i) => (
              <View
                key={i}
                accessible={false}
                style={{
                  width: i === step ? 28 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i === step ? c.aquaDark : c.line,
                }}
              />
            ))}
            <Copy style={{ color: c.muted, fontSize: 12, marginLeft: 6 }}>
              Introduction {step + 1} of 3
            </Copy>
          </View>
          <Button
            title={step === 2 ? "Create my account" : "Continue"}
            onPress={() => (step === 2 ? start() : move(step + 1))}
          />
          <TextAction
            title="Already have an account? Sign in"
            onPress={() => router.replace("/auth")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
