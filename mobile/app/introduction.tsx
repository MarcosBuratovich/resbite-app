import React, { useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Copy, TextAction } from "../src/design/ui";
import { Chip, StepScreen, useFocusOnChange } from "../src/design/kit";
import { colors as c, depth } from "../src/design/tokens";
import { introSlides } from "../src/domain/accountCopy";

// Today's illustrations, one per slide, on a soft tint. The picture has no text over it.
const pictures = [
  { image: require("../assets/activities/get-out-with-bikes.png"), tint: c.aquaSoft },
  { image: require("../assets/activities/coffee-together.png"), tint: c.pinkSoft },
  { image: require("../assets/activities/painting.png"), tint: c.purpleSoft },
];

/**
 * The introduction (UX4-D3): three slides as steps, each a picture card, a two-word title and
 * one line. Close on the first slide (or Previous step later) goes back; Skip and the last
 * slide's "Create account" open sign-up.
 */
export default function Introduction() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const scroll = useRef<ScrollView>(null);
  const title = useRef<Text>(null);
  useFocusOnChange(title, step);
  const slide = introSlides[step];
  const picture = pictures[step];
  const last = step === introSlides.length - 1;
  const start = () => router.replace("/auth/phone");
  function move(next: number) {
    setDirection(next > step ? "forward" : "back");
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  return (
    <StepScreen
      step={step + 1}
      total={introSlides.length}
      title={slide.title}
      titleRef={title}
      scrollRef={scroll}
      direction={direction}
      onBack={step ? () => move(step - 1) : undefined}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      header={<Chip text="Skip" label="Skip introduction" onPress={start} />}
      primary={
        <View style={{ gap: 4 }}>
          <Button
            large
            icon={false}
            title={last ? "Create account" : "Next"}
            onPress={() => (last ? start() : move(step + 1))}
          />
          <View style={styles.center}>
            <TextAction
              title="I have an account"
              onPress={() => router.replace("/auth")}
            />
          </View>
        </View>
      }
    >
      <View style={[styles.picture, { backgroundColor: picture.tint }]}>
        <Image source={picture.image} accessible={false} style={styles.art} resizeMode="contain" />
      </View>
      <Copy style={styles.line}>{slide.line}</Copy>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  picture: { borderRadius: 36, padding: 22, boxShadow: depth.card },
  art: { width: "100%", height: 190 },
  line: { color: c.muted, fontSize: 17, lineHeight: 26 },
  center: { alignItems: "center" },
});
