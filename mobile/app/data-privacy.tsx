import React, { useState } from "react";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { AccessibilityInfo, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Copy as CopyIcon,
  Info,
  Mail,
  MessageCircle,
  Smartphone,
  Sparkles,
  Trash2,
  UserRound,
  UserRoundX,
} from "lucide-react-native";
import { Back, Copy, Title, s } from "../src/design/ui";
import { Chip, IconButton, InfoSheet, Row, RowGroup, TopicRow } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { categoryPalette, colors as c, fonts, r } from "../src/design/tokens";
import { SAFETY_COPY } from "../src/domain/safetyCopy";
import { supportContact, type SupportContact } from "../src/domain/supportContact";

/**
 * The build's support address (G-N10). `EXPO_PUBLIC_*` is inlined when the bundle is built, and only when read with dot
 * notation, so the topic follows the build: none while it is unset or not an address.
 */
const contact = supportContact(process.env.EXPO_PUBLIC_SUPPORT_ADDRESS);

/**
 * Privacy (UX4): one row per topic, each opening a sheet with today's text word for word, and
 * a red Delete account row. The account deletion paragraph now sits in Delete account's
 * "What happens" sheet. Chat messages (K-N5): what deleting an account does to them is said with the
 * deletion copy's tense and hedge, since the deletion lifecycle isn't live on the hosted service yet; then what a
 * report keeps (chat plan 3, G-S11). Contact (G-N10) shows only when the build has a support address. Blocked people
 * (G-S10) follows the topics.
 */
export default function DataPrivacy() {
  const [about, setAbout] = useState(false);
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
          <TopicRow
            title="On this device"
            icon={Smartphone}
            tint={categoryPalette.mindful.tint}
            ink={categoryPalette.mindful.ink}
          >
            <Copy>
              Contacts are read only when you choose them. Groups, selected
              contact details and prepared invitation links stay on this device.
              Your address book is not uploaded.
            </Copy>
            <Copy>
              When you invite people, Resbite checks only the numbers you pick
              to see who already uses it. Your address book never leaves your
              phone.
            </Copy>
            <Copy>
              Signing out removes local groups, selections and invitation records.
              It does not revoke links already shared. Revoke those links from
              your plan before signing out if you want them to stop working.
            </Copy>
            <Copy>
              Unfinished plan drafts are kept separately for your account so you
              can continue when you sign back in. Use Discard in the plan editor
              to remove a draft.
            </Copy>
          </TopicRow>
          <TopicRow
            title="Account & shared plans"
            icon={UserRound}
            tint={categoryPalette.intellectual.tint}
            ink={categoryPalette.intellectual.ink}
          >
            <Copy>
              Registration stores your name and sign-in identity with our account
              service. Date of birth, phone number, city and interests are
              optional account details. They are not included in shared plans.
              Phone numbers entered here are not verified and do not enable SMS
              sign-in. Edit or remove optional details in Profile → Account details.
            </Copy>
            <Copy>
              With an account, Resbite stores your profile, plans,
              invitations and responses with its hosted service. Access is
              restricted to the organizer and authorized participants. Your
              sign-in identity is used to check access.
            </Copy>
            <Copy>
              A profile photo is optional. The selected image is resized and
              metadata is removed before upload to private storage. Removing it
              clears your profile’s photo. Previous uploads remain in private
              storage until file cleanup is enabled. Previously opened photo
              links can remain valid for up to five minutes.
            </Copy>
            <Copy>
              Anyone with an event’s link can join it while the link is on.
            </Copy>
            <Copy>
              Resbite counts how many times an event’s link is opened in the app.
              It does not record who opened it.
            </Copy>
          </TopicRow>
          <TopicRow
            title="Chat messages"
            icon={MessageCircle}
            tint={categoryPalette.community.tint}
            ink={categoryPalette.community.ink}
          >
            <Copy>
              Chat messages are stored on Resbite’s servers so everyone in a
              resbite’s chat can read them, including people who join later.
              They are not end-to-end encrypted. Deleting your account removes
              the text of your messages as cleanup finishes. Review account
              deletion’s availability in this build under Delete account.
            </Copy>
            <Copy>{SAFETY_COPY.reportsPrivacy}</Copy>
          </TopicRow>
          <TopicRow
            title="Preview & samples"
            icon={Sparkles}
            tint={categoryPalette.uplifting.tint}
            ink={categoryPalette.uplifting.ink}
          >
            <Copy>
              Preview actions stay on this device. Wellness figures are
              fictional, and there is no wellness tracking.
            </Copy>
          </TopicRow>
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
        <Copy>
          Resbite is in private development. This page describes the current
          build; access comes with an invitation link or a tester invitation.
        </Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}

/**
 * The contact line, selectable so the address can be copied from it; the address as a `mailto:` link; and Copy address,
 * which says Copied (G-N10). On the web the link is a real `<a href>` (react-native-web) that the browser opens itself;
 * on the phone a tap opens it through `Linking`, and a phone with no mail app keeps the address to copy.
 */
function ContactTopic({ contact }: { contact: SupportContact }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    setCopied(false);
    let done = false;
    try {
      // Always true on the phone; on the web, whether the browser took it.
      done = await Clipboard.setStringAsync(contact.address);
    } catch {
      done = false;
    }
    // Nothing is said when it didn't take: the line above stays selectable.
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
