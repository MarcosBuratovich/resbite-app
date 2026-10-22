import React, { useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Info, Smartphone, Sparkles, Trash2, UserRound } from "lucide-react-native";
import { Back, Copy, Title, s } from "../src/design/ui";
import { IconButton, InfoSheet, Row, RowGroup, TopicRow } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { categoryPalette } from "../src/design/tokens";

/**
 * Privacy (UX4): one row per topic, each opening a sheet with today's text word for word, and
 * a red Delete account row. The account deletion paragraph now sits in Delete account's
 * "What happens" sheet.
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
            title="Preview & samples"
            icon={Sparkles}
            tint={categoryPalette.uplifting.tint}
            ink={categoryPalette.uplifting.ink}
          >
            <Copy>
              Preview actions stay on this device. Sample conversations and
              wellness figures are fictional. There is no live messaging or
              wellness tracking, and this build does not send push notifications.
            </Copy>
          </TopicRow>
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

const styles = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
});
