import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, Info, MapPin, Pencil } from "lucide-react-native";
import {
  AvatarStack,
  Chip,
  CoverCard,
  DateBadge,
  Fab,
  IconButton,
  InfoSheet,
  Segmented,
  StepScreen,
  Tile,
  type CardChip,
} from "../src/design/kit";
import { categoryIcons } from "../src/design/categories";
import { Button, Copy, Title, s } from "../src/design/ui";
import { cardLabel, reviewLabels } from "../src/domain/eventView";

/** Development-only gallery of the UX1 kit, exercised by scripts/verify-kit.mjs. */
export default function Kit() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Gallery />;
}

const startsAt = new Date(2099, 9, 10, 10, 0).toISOString();
const chips: CardChip[] = [
  { key: "hosting", text: "Hosting", tone: "aqua" },
  { key: "going", text: "3 going" },
];

function Gallery() {
  const [checked, setChecked] = useState(false);
  const [day, setDay] = useState(false);
  const [segment, setSegment] = useState<"upcoming" | "past">("upcoming");
  const [sheet, setSheet] = useState(false);
  const [step, setStep] = useState(false);
  const [pressed, setPressed] = useState("");
  const now = new Date();
  if (step)
    return (
      <StepScreen
        step={2}
        title="When?"
        hint="Required"
        onBack={() => setStep(false)}
        onClose={() => setStep(false)}
        status="Draft saved on this device."
        primary={<Button title="Next" onPress={() => setStep(false)} />}
      >
        <Copy>Step content sits here.</Copy>
      </StepScreen>
    );
  return (
    <SafeAreaView style={s.page}>
      <ScrollView testID="kit" contentContainerStyle={[s.body, { gap: 20 }]}>
        <Title>Kit</Title>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip text="Hosting" tone="aqua" />
          <Chip text="Natural" category="natural" icon={categoryIcons.natural} />
          <Chip
            text="Open in Maps"
            icon={MapPin}
            tone="aqua"
            label="Open Riverside park in Maps"
            onPress={() => setPressed("maps")}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Tile
              role="checkbox"
              title="Natural"
              category="natural"
              icon={categoryIcons.natural}
              selected={checked}
              onPress={() => setChecked(!checked)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Tile
              role="checkbox"
              title="Creative"
              category="creative"
              icon={categoryIcons.creative}
              disabled
              hint="Two categories are already chosen"
              onPress={() => {}}
            />
          </View>
        </View>
        <Tile
          title="Tomorrow"
          label="Tomorrow, Thursday 8 October"
          icon={CalendarDays}
          selected={day}
          onPress={() => setDay(!day)}
        />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <IconButton icon={Pencil} label="Edit Picnic in the park" onPress={() => setPressed("edit")} />
          <IconButton icon={Info} label="About cover photos" onPress={() => setSheet(true)} />
          <DateBadge startsAt={startsAt} />
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Fab placement="float" onPress={() => setPressed("fab")} />
        </View>
        <Fab placement="inline" onPress={() => setPressed("fab")} />
        <CoverCard
          picture={{ kind: "placeholder", category: "natural" }}
          title="Picnic in the park"
          startsAt={startsAt}
          place="Riverside park"
          chips={chips}
          label={cardLabel(
            { title: "Picnic in the park", startsAt, place: "Riverside park", chips: chips.map((chip) => chip.text) },
            now,
          )}
          onPress={() => setPressed("card")}
        />
        <CoverCard
          picture={{ kind: "placeholder", category: "community" }}
          title="Picnic in the park"
          startsAt={startsAt}
          place="Riverside park"
          chips={[
            { key: "natural", text: "Natural", category: "natural" },
            { key: "community", text: "Community", category: "community" },
          ]}
          onPressPart={(part) => setPressed(part)}
          partLabels={reviewLabels(
            { title: "Picnic in the park", startsAt, place: "Riverside park", categories: ["natural", "community"] },
            now,
          )}
        />
        <AvatarStack names={["Alex", "Bea", "Cai", "Dee"]} label="4 going" onPress={() => setPressed("guests")} />
        <Segmented
          label="Show"
          options={[
            { key: "upcoming", text: "Upcoming" },
            { key: "past", text: "Past" },
          ] as const}
          value={segment}
          onChange={setSegment}
        />
        <Button title="Show step screen" secondary onPress={() => setStep(true)} />
        {pressed ? <Copy accessibilityLiveRegion="polite">{`Pressed ${pressed}`}</Copy> : null}
      </ScrollView>
      <InfoSheet visible={sheet} title="Cover photos" onClose={() => setSheet(false)}>
        <Copy>Only add photos you’re comfortable sharing with the people you invite.</Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}
