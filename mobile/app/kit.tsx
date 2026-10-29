import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CalendarDays,
  Eye,
  Info,
  LogOut,
  Mail,
  MailCheck,
  MapPin,
  Pencil,
  Share2,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  Ellipsis,
  Check,
} from "lucide-react-native";
import {
  AvatarStack,
  Chip,
  CoverCard,
  DateBadge,
  Fab,
  FieldCard,
  IconButton,
  InfoSheet,
  Row,
  RowGroup,
  Segmented,
  StatusCard,
  StepScreen,
  Tile,
  TopicRow,
  type CardChip,
} from "../src/design/kit";
import { ActionBar, ReplyPill } from "../src/design/ActionBar";
import { ContentPage } from "../src/design/ContentPage";
import { GrabberSheet } from "../src/design/GrabberSheet";
import { MenuRow, MenuSeparator } from "../src/design/MenuRow";
import { OpenRow } from "../src/design/OpenRow";
import { TaskScreen } from "../src/design/TaskScreen";
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
  const [task, setTask] = useState(false);
  const [grabber, setGrabber] = useState(false);
  const [page, setPage] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pressed, setPressed] = useState("");
  const [field, setField] = useState("");
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
  if (page)
    return (
      <ContentPage
        title="Picnic in the park"
        picture={{ kind: "placeholder", category: "natural" }}
        pictureLabel="A picnic blanket under a tree"
        onBack={() => setPage(false)}
        bottom={
          <ActionBar
            lead={<ReplyPill text="Going" onChange={() => setPressed("change")} />}
            actions={[
              { key: "invite", title: "Invite", icon: UserPlus, onPress: () => setPressed("invite") },
              { key: "more", title: "More", icon: Ellipsis, onPress: () => setMenu(true) },
            ]}
          />
        }
      >
        {Array.from({ length: 30 }, (_, i) => (
          <Copy key={i}>{`Page paragraph ${i + 1} sits here so the cover can scroll away.`}</Copy>
        ))}
        <GrabberSheet visible={menu} label="More" onClose={() => setMenu(false)}>
          <MenuRow title="Share the link" icon={Share2} onPress={() => setPressed("share")} />
          <MenuSeparator />
          <MenuRow title="Cancel this resbite" label="Cancel this resbite, for everyone" icon={Trash2} destructive onPress={() => setPressed("cancel")} />
        </GrabberSheet>
      </ContentPage>
    );
  if (task)
    return (
      <TaskScreen
        title="New resbite"
        onClose={() => setTask(false)}
        line="Add a date and time to go on."
        footer={<Button title="Save" onPress={() => setTask(false)} />}
      >
        <Copy>Task content sits here.</Copy>
      </TaskScreen>
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
        <CoverCard
          picture={{ kind: "placeholder", category: "uplifting" }}
          title="It’s on!"
          startsAt={startsAt}
          place="Riverside park"
          extra="Weekly"
        />
        <View style={{ gap: 10 }}>
          <OpenRow
            icon={CalendarDays}
            label="When"
            placeholder="Add a date and time"
            value={null}
            state="missing"
            message="Add a date and time to go on"
            accessibilityLabel="When, Add a date and time"
            onPress={() => setPressed("when")}
          />
          <OpenRow
            icon={MapPin}
            label="Where"
            placeholder="Add a place"
            value={null}
            state="open"
            accessibilityLabel="Where, Add a place"
            onPress={() => setPressed("where")}
          />
          <OpenRow
            icon={MapPin}
            label="Place"
            placeholder="Add a place"
            value="Riverside park"
            hint="Tap to change"
            state="filled"
            accessibilityLabel="Place, Riverside park, change it"
            onPress={() => setPressed("place")}
          />
        </View>
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
        <RowGroup>
          <Row title="People & groups" icon={Users} onPress={() => setPressed("row")} />
          <TopicRow title="On this device" icon={Smartphone}>
            <Copy>Topic text sits here, word for word.</Copy>
          </TopicRow>
          <Row title="Sign out" icon={LogOut} destructive onPress={() => setPressed("sign out")} />
        </RowGroup>
        <FieldCard
          label="Email address"
          icon={Mail}
          value={field}
          onChangeText={setField}
          accessory={<IconButton icon={Eye} label="Show password" tone="plain" onPress={() => setPressed("eye")} />}
        />
        <StatusCard icon={MailCheck} title="Check your inbox">
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            <Chip text="Resend" label="Resend confirmation email" onPress={() => setPressed("resend")} />
          </View>
        </StatusCard>
        <Button title="Show step screen" secondary onPress={() => setStep(true)} />
        <Button title="Show task screen" secondary onPress={() => setTask(true)} />
        <Button title="Show sheet" secondary onPress={() => setGrabber(true)} />
        <Button title="Show content page" secondary onPress={() => setPage(true)} />
        <ActionBar actions={[{ key: "going", title: "I’m going", icon: Check, primary: true, onPress: () => setPressed("going") }]} />
        <ReplyPill text="No reply yet" />
        {pressed ? <Copy accessibilityLiveRegion="polite">{`Pressed ${pressed}`}</Copy> : null}
      </ScrollView>
      <InfoSheet visible={sheet} title="Cover photos" onClose={() => setSheet(false)}>
        <Copy>Only add photos you’re comfortable sharing with the people you invite.</Copy>
      </InfoSheet>
      <GrabberSheet
        visible={grabber}
        title="When"
        icon={CalendarDays}
        onClose={() => setGrabber(false)}
        footer={<Button title="Done" onPress={() => setGrabber(false)} />}
      >
        <Copy>Sheet content sits here.</Copy>
      </GrabberSheet>
    </SafeAreaView>
  );
}
