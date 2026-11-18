import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Copy } from "./ui";
import { colors as c } from "./tokens";
import { LEGAL_COPY, LEGAL_URLS } from "../domain/legal";
import { openExternal } from "../services/externalLinks";

/** A link to a public page that opens in the browser, at least 44 pt tall. */
export function ExternalLink({ title, url }: { title: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={LEGAL_COPY.opensInBrowser}
      onPress={() => void openExternal(url)}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.65 : 1 }]}
    >
      <Copy style={styles.text}>{title}</Copy>
    </Pressable>
  );
}

/** Privacy Policy, Terms of Use and Support, for the screens a person sees before signing in. */
export function LegalLinks({ align = "center" }: { align?: "center" | "start" }) {
  return (
    <View style={[styles.row, { justifyContent: align === "center" ? "center" : "flex-start" }]}>
      <ExternalLink title={LEGAL_COPY.privacyPolicy} url={LEGAL_URLS.privacy} />
      <ExternalLink title={LEGAL_COPY.termsOfUse} url={LEGAL_URLS.terms} />
      <ExternalLink title={LEGAL_COPY.support} url={LEGAL_URLS.support} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8 },
  link: { minHeight: 44, paddingHorizontal: 4, justifyContent: "center" },
  text: { fontSize: 13, color: c.aquaDark },
});
