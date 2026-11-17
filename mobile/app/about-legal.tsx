import React from "react";
import { router } from "expo-router";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BookOpen, FileText, LifeBuoy, ScrollText, UsersRound } from "lucide-react-native";
import { Back, Copy, Title, s } from "../src/design/ui";
import { Row, RowGroup } from "../src/design/kit";
import { fonts } from "../src/design/tokens";
import { LEGAL_COPY, LEGAL_URLS, PRIVACY_ADDRESS } from "../src/domain/legal";
import { supportAddress } from "../src/domain/safetyCopy";
import { openExternal } from "../src/services/externalLinks";

const address = supportAddress(process.env.EXPO_PUBLIC_SUPPORT_ADDRESS);

/**
 * About and legal (B1, DOC-3, UGC-4): the four public pages, Licences and the company details. The help line shows only
 * when the build has a support address.
 */
export default function AboutLegal() {
  const open = (url: string) => () => {
    void openExternal(url);
  };
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <Back label="Privacy" />
        <Title>{LEGAL_COPY.aboutLegal}</Title>
        <RowGroup>
          <Row title={LEGAL_COPY.privacyPolicy} icon={FileText} hint={LEGAL_COPY.opensInBrowser} onPress={open(LEGAL_URLS.privacy)} />
          <Row title={LEGAL_COPY.termsOfUse} icon={ScrollText} hint={LEGAL_COPY.opensInBrowser} onPress={open(LEGAL_URLS.terms)} />
          <Row title={LEGAL_COPY.communityRules} icon={UsersRound} hint={LEGAL_COPY.opensInBrowser} onPress={open(LEGAL_URLS.communityRules)} />
          <Row title={LEGAL_COPY.support} icon={LifeBuoy} hint={LEGAL_COPY.opensInBrowser} onPress={open(LEGAL_URLS.support)} />
        </RowGroup>
        <RowGroup>
          <Row title={LEGAL_COPY.licences} icon={BookOpen} onPress={() => router.push("/licences")} />
        </RowGroup>
        <Copy accessibilityRole="header" style={{ fontFamily: fonts.medium }}>
          {LEGAL_COPY.companyDetails}
        </Copy>
        {LEGAL_COPY.companyLines.map((line) => (
          <Copy key={line} selectable>
            {line}
          </Copy>
        ))}
        <Copy selectable>{LEGAL_COPY.dataProtection(PRIVACY_ADDRESS)}</Copy>
        {address ? <Copy selectable>{LEGAL_COPY.help(address)}</Copy> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
