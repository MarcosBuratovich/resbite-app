import React from "react";
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Back, Button, Copy, Title, s } from "../src/design/ui";
import { PreviewNotice } from "../src/design/Chrome";
import { colors } from "../src/design/tokens";

export default function DataPrivacy() {
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <PreviewNotice />
        <Back label="Profile" />
        <Copy style={{ color: colors.aquaDark }}>YOUR CHOICES</Copy>
        <Title>Your data & privacy</Title>
        <Copy>
          Resbite is in private development. This page describes the current
          build; access is limited to approved testers.
        </Copy>
        <View style={[s.card, { padding: 20, gap: 12 }]}>
          <Title style={{ fontSize: 23 }}>On this device</Title>
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
        </View>
        <View style={[s.card, { padding: 20, gap: 12 }]}>
          <Title style={{ fontSize: 23 }}>Your account and shared plans</Title>
          <Copy>
            Registration stores your name and sign-in identity with our account
            service. Date of birth, phone number, city and interests are
            optional account details. They are not included in shared plans.
            Phone numbers entered here are not verified and do not enable SMS
            sign-in. Edit or remove optional details in Profile → Account details.
          </Copy>
          <Copy>
            With an eligible account, Resbite stores your profile, plans,
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
            An invitation link can be claimed by the first eligible account that
            opens it. Share each link only with its intended recipient.
          </Copy>
        </View>
        <View style={[s.card, { padding: 20, gap: 12 }]}>
          <Title style={{ fontSize: 23 }}>Preview and samples</Title>
          <Copy>
            Preview actions stay on this device. Sample conversations and
            wellness figures are fictional. There is no live messaging or
            wellness tracking, and this build does not send push notifications.
          </Copy>
        </View>
        <View style={[s.card, { padding: 20, gap: 12 }]}>
          <Title style={{ fontSize: 23 }}>Account deletion</Title>
          <Copy>
            Signing out does not delete your account or shared plans. Review
            what permanent deletion removes and its availability in this build.
            Backup retention and restore handling must also be verified before
            tester access opens.
          </Copy>
          <Button
            title="Review account deletion"
            secondary
            onPress={() => router.push("/delete-account")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
