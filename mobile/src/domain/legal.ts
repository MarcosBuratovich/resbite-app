import { hasHiddenCharacter } from "./chatRules";

/** Where the public documents live (D-10, AS-D8). */
export const LEGAL_SITE = "https://link.resbite.com";

export type LegalUrls = { privacy: string; terms: string; communityRules: string; support: string };

/**
 * An https link with a real host and no blank or hidden character, trimmed; null for anything else. A link that
 * fails this is never opened: the app falls back to the canonical page.
 */
export function httpsUrl(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || /\s/.test(text) || hasHiddenCharacter(text)) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname.includes(".") ? text : null;
  } catch {
    return null;
  }
}

/** The legal links: the canonical pages, with the Terms and Privacy Policy links overridable by the build. */
export function legalUrls(env: { terms: string | undefined; privacy: string | undefined }): LegalUrls {
  const terms = httpsUrl(env.terms) ?? `${LEGAL_SITE}/terms`;
  const privacy = httpsUrl(env.privacy) ?? `${LEGAL_SITE}/privacy`;
  return {
    privacy,
    terms,
    communityRules: `${terms.split("#")[0]}#community-rules`,
    support: `${LEGAL_SITE}/support`,
  };
}

// Dot notation: the one form of process.env.EXPO_PUBLIC_* inlined when the bundle is built.
export const LEGAL_URLS: LegalUrls = legalUrls({
  terms: process.env.EXPO_PUBLIC_TERMS_URL,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL,
});

/** The data protection address. The documents already publish it (AS-D3), so it is a constant. */
export const PRIVACY_ADDRESS = "privacy@resbite.com";

/** AS-D1. No VAT number: it is still an owner placeholder. */
export const COMPANY = {
  name: "Resbite Ltd",
  number: "12450334",
  office: "86-90 Paul Street, London EC2A 4NE, United Kingdom",
} as const;

export const LEGAL_COPY = {
  privacyPolicy: "Privacy Policy",
  termsOfUse: "Terms of Use",
  communityRules: "Community rules",
  support: "Support",
  licences: "Licences",
  aboutLegal: "About and legal",
  companyDetails: "Company details",
  requestData: "Request a copy of my data",
  opensInBrowser: "Opens in your browser",
  opensEmail: (address: string) => `Opens an email to ${address}`,
  requestDataFailed: (address: string) =>
    `Your phone couldn’t open an email. Write to ${address} and ask for a copy of your data.`,
  companyLines: [
    "Resbite is provided by Resbite Ltd, a private limited company registered in England and Wales.",
    "Company number: 12450334",
    "Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom",
  ],
  dataProtection: (address: string) => `Data protection: ${address}`,
  help: (address: string) => `Help and reports: ${address}`,
  licencesIntro: "Resbite is built with open-source software and fonts. Their licences are below.",
  licenceSections: { fonts: "Fonts", packages: "Open-source software", native: "Built into React Native" },
  noLicenceText: (licence: string) => `This package doesn’t include a licence file. Its licence is ${licence}.`,
  nativeLicence: (licence: string) => `React Native builds this library into the app. Its licence is ${licence}.`,
  dataRequestSubject: "Request a copy of my data",
  dataRequestBody: "Please send me a copy of the personal data Resbite holds about me.",
  dataRequestAccount: (id: string) => `My Resbite account ID: ${id}`,
} as const;

export type TermsRun = { text: string; url?: string };

/**
 * Splits a line such as "I agree to the Terms and Privacy Policy." into plain and linked runs. Left to right it
 * links the longest of "Terms of Use" and "Privacy Policy" (whole) and "Terms", only where the next character
 * is not a letter. Adjacent plain runs merge and no run is empty.
 */
export function termsRuns(text: string, urls: Pick<LegalUrls, "terms" | "privacy">): TermsRun[] {
  const names: [string, string][] = [
    ["Terms of Use", urls.terms],
    ["Privacy Policy", urls.privacy],
    ["Terms", urls.terms],
  ];
  const runs: TermsRun[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const hit = names.find(
      ([name]) => text.startsWith(name, i) && !/\p{L}/u.test(text.charAt(i + name.length)),
    );
    if (hit) {
      if (plain) runs.push({ text: plain });
      plain = "";
      runs.push({ text: hit[0], url: hit[1] });
      i += hit[0].length;
    } else {
      plain += text.charAt(i);
      i += 1;
    }
  }
  if (plain) runs.push({ text: plain });
  return runs;
}

/** The "Request a copy of my data" email. The account id is added only when it looks like one (a UUID). */
export function dataRequestMailto(accountId: string | null | undefined): string {
  const lines: string[] = [LEGAL_COPY.dataRequestBody];
  if (typeof accountId === "string" && /^[0-9a-f-]{36}$/i.test(accountId)) {
    lines.push("", LEGAL_COPY.dataRequestAccount(accountId));
  }
  return `mailto:${PRIVACY_ADDRESS}?subject=${encodeURIComponent(LEGAL_COPY.dataRequestSubject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
