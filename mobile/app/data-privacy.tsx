import React, { useState } from "react";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { AccessibilityInfo, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  Clock,
  Contact,
  Copy as CopyIcon,
  FileDown,
  FileText,
  Info,
  Landmark,
  Link2,
  Mail,
  MessageCircle,
  Server,
  Smartphone,
  Trash2,
  UserRound,
  UserRoundX,
  type LucideIcon,
} from "lucide-react-native";
import { Back, Copy, Title, s } from "../src/design/ui";
import { Chip, IconButton, InfoSheet, Row, RowGroup, TopicRow } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { categoryPalette, colors as c, fonts, r } from "../src/design/tokens";
import { useApp } from "../src/state/AppState";
import { LEGAL_COPY, LEGAL_URLS, PRIVACY_ADDRESS, dataRequestMailto } from "../src/domain/legal";
import { PRIVACY_ABOUT, PRIVACY_TOPICS, type PrivacyTopicKey } from "../src/domain/privacyCopy";
import { SAFETY_COPY } from "../src/domain/safetyCopy";
import { copyConfirmed, supportContact, type SupportContact } from "../src/domain/supportContact";
import { openExternal } from "../src/services/externalLinks";

/**
 * The build's support address (G-N10). `EXPO_PUBLIC_*` is inlined when the bundle is built, and only when read with dot
 * notation, so the topic follows the build: none while it is unset or not an address.
 */
const contact = supportContact(process.env.EXPO_PUBLIC_SUPPORT_ADDRESS);

type Look = { icon: LucideIcon; palette: keyof typeof categoryPalette };
// Each topic's tint differs from its neighbours'.
const LOOKS: Record<PrivacyTopicKey, Look> = {
  account: { icon: UserRound, palette: "intellectual" },
  contacts: { icon: Contact, palette: "mindful" },
  chat: { icon: MessageCircle, palette: "community" },
  connections: { icon: Link2, palette: "creative" },
  notifications: { icon: Bell, palette: "uplifting" },
  device: { icon: Smartphone, palette: "natural" },
  vendors: { icon: Server, palette: "physical" },
  retention: { icon: Clock, palette: "mindful" },
};

/**
 * Privacy (B5): one row per topic from PRIVACY_TOPICS, which a test checks against the Privacy Policy; then the Privacy
 * Policy, Request a copy of my data and About and legal. Contact (G-N10) shows only when the build has a support
 * address. Blocked people (G-S10) and the red Delete account row follow.
 */
export default function DataPrivacy() {
  const { session } = useApp();
  const [about, setAbout] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  async function requestCopy() {
    setRequestFailed(false);
    const opened = await openExternal(dataRequestMailto(session?.user.id));
    if (!opened) setRequestFailed(true);
  }
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <PreviewNotice />
        <Back label="Profile" />
        <View style={styles.header}>
          <Title style={{ flexShrink: 1 }}>Privacy</Title>
          <IconButton icon={Info} label="About this page" onPress={() => setAbout(true)} />
        </View>
        <RowGroup>
          {PRIVACY_TOPICS.map((topic) => {
            const look = LOOKS[topic.key];
            return (
              <TopicRow
                key={topic.key}
                title={topic.title}
                icon={look.icon}
                tint={categoryPalette[look.palette].tint}
                ink={categoryPalette[look.palette].ink}
              >
                {topic.paragraphs.map((paragraph) => (
                  <Copy key={paragraph}>{paragraph}</Copy>
                ))}
              </TopicRow>
            );
          })}
          {contact ? (
            <TopicRow
              title="Contact"
              icon={Mail}
              tint={categoryPalette.natural.tint}
              ink={categoryPalette.natural.ink}
            >
              <ContactTopic contact={contact} />
            </TopicRow>
          ) : null}
        </RowGroup>
        <RowGroup>
          <Row
            title={LEGAL_COPY.privacyPolicy}
            icon={FileText}
            hint={LEGAL_COPY.opensInBrowser}
            onPress={() => void openExternal(LEGAL_URLS.privacy)}
          />
          <Row
            title={LEGAL_COPY.requestData}
            icon={FileDown}
            hint={LEGAL_COPY.opensEmail(PRIVACY_ADDRESS)}
            onPress={() => void requestCopy()}
          />
          <Row title={LEGAL_COPY.aboutLegal} icon={Landmark} onPress={() => router.push("/about-legal")} />
        </RowGroup>
        {requestFailed ? (
          <Copy selectable accessibilityLiveRegion="polite">
            {LEGAL_COPY.requestDataFailed(PRIVACY_ADDRESS)}
          </Copy>
        ) : null}
        <RowGroup>
          <Row
            title={SAFETY_COPY.blockedPeople}
            icon={UserRoundX}
            tint={categoryPalette.physical.tint}
            ink={categoryPalette.physical.ink}
            onPress={() => router.push("/blocked-people")}
          />
        </RowGroup>
        <RowGroup>
          <Row
            title="Delete account"
            icon={Trash2}
            destructive
            chevron
            onPress={() => router.push("/delete-account")}
          />
        </RowGroup>
      </ScrollView>
      <InfoSheet visible={about} title="About this page" onClose={() => setAbout(false)}>
        <Copy>{PRIVACY_ABOUT}</Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}

/**
 * The contact line, selectable so the address can be copied from it; the address as a `mailto:` link; and Copy address,
 * which says Copied once the copy is confirmed (G-N10, ruling SR4). On the web the link is a real `<a href>` (react-native-web) that the browser opens itself;
 * on the phone a tap opens it through `Linking`, and a phone with no mail app keeps the address to copy.
 */
function ContactTopic({ contact }: { contact: SupportContact }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    setCopied(false);
    const done = await copyConfirmed(contact.address, {
      web: Platform.OS === "web",
      clipboard: typeof navigator === "undefined" ? undefined : navigator.clipboard,
      setStringAsync: Clipboard.setStringAsync,
    });
    // Nothing is said when the copy isn't confirmed (ruling SR4): the line above stays selectable.
    if (!done) return;
    setCopied(true);
    // VoiceOver ignores live regions; TalkBack reads the line below by itself, and the web's live region speaks it.
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(SAFETY_COPY.copied);
  }
  const web = Platform.OS === "web";
  const opens = web
    ? { href: contact.mailto }
    : { onPress: () => void Linking.openURL(contact.mailto).catch(() => {}) };
  return (
    <View style={{ gap: 12 }}>
      <Copy selectable>{contact.line}</Copy>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={contact.address}
          {...opens}
          style={({ pressed }) => [styles.mail, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Mail size={15} strokeWidth={1.8} color={c.aquaDark} />
          <Text style={styles.mailText}>{contact.address}</Text>
        </Pressable>
        <Chip icon={CopyIcon} tone="aqua" text={SAFETY_COPY.copyAddress} onPress={() => void copy()} />
      </View>
      {copied ? (
        <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
          {SAFETY_COPY.copied}
        </Copy>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  mail: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: r.chip,
    backgroundColor: c.aquaSoft,
    flexShrink: 1,
  },
  mailText: { fontFamily: fonts.body, fontSize: 13, color: c.aquaDark, flexShrink: 1 },
});
