import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRIVACY_ABOUT, PRIVACY_TOPICS } from "./privacyCopy";
import { PRIVACY_ADDRESS } from "./legal";
import { SAFETY_COPY } from "./safetyCopy";

const topic = (key: string) => {
  const found = PRIVACY_TOPICS.find((t) => t.key === key);
  assert.ok(found, key);
  return found;
};

test("the eight topics, in order, with the agreed copy", () => {
  assert.deepEqual(
    PRIVACY_TOPICS.map((t) => [t.key, t.title]),
    [
      ["account", "Your account"],
      ["contacts", "Contacts and invitations"],
      ["chat", "Resbites and chat"],
      ["connections", "Connections"],
      ["notifications", "Notifications"],
      ["device", "On this device"],
      ["vendors", "Who we work with"],
      ["retention", "How long we keep it"],
    ],
  );
  assert.deepEqual(topic("account").paragraphs, [
    "Every account needs a mobile number, confirmed with a code we text you. Friends find and invite you by it. We never show your number to other people on Resbite.",
    "You can also sign in with an email address and password, with Apple or with Google. We keep your name, your photo if you add one, and a record that you’re 18 or over and accepted our Terms of Use.",
    "Before your photo is uploaded, the app resizes it and removes hidden details, such as where it was taken.",
    `Change your name and photo in Profile. To change the number or email you sign in with, email ${PRIVACY_ADDRESS}.`,
    "You can delete your account at any time with Delete account, below. We finish within 30 days.",
  ]);
  assert.deepEqual(topic("contacts").paragraphs, [
    "Resbite reads your contacts only when you choose to invite from them, and reads only names and phone numbers. Contact names never leave your phone.",
    "When you invite people, Resbite checks only the numbers you pick to see who already uses it. Your address book never leaves your phone.",
    "If someone you invite isn’t on Resbite, we keep their number for that invitation. We delete it when they answer or you withdraw the invitation, or 30 days after the resbite ends.",
    "Anyone on Resbite who has your number can see that you’re on Resbite, and can invite you.",
    "Signing out doesn’t stop links you’ve already shared. Withdraw them from the resbite first if you want them to stop working.",
  ]);
  assert.deepEqual(topic("chat").paragraphs, [
    "Everyone invited to a resbite sees its details, including the exact meeting place, before they answer. Hosts, and guests who answer Going or Maybe, also see the meeting details.",
    "Anyone with an event’s link can ask to join. A host approves each request.",
    "Resbite counts how many times an event’s link is opened in the app. It doesn’t record who opened it.",
    "Chat messages are stored on our servers so everyone in a resbite’s chat can read them, including people who join later. They aren’t end-to-end encrypted.",
    "If you delete your account, the words of your messages are deleted too.",
    SAFETY_COPY.reportsPrivacy,
    SAFETY_COPY.blocksPrivacy,
  ]);
  assert.deepEqual(topic("connections").paragraphs, [
    "When you connect with someone, we keep who asked, the resbite where you met and when. Only the two of you see it.",
    "If you answer “Not now” or remove a connection, we keep a note of it for 12 months. The other person isn’t told. A request nobody answers is deleted after 90 days.",
  ]);
  assert.deepEqual(topic("notifications").paragraphs, [
    "Notifications are optional. If you turn them on, we keep a push token for your phone.",
    "Notifications travel through Expo in the United States, then Apple. A chat notification shows the sender’s first name and the first 120 characters of the message.",
    "To hide what notifications say on your lock screen, go to iPhone Settings → Notifications → Resbite → Show Previews.",
  ]);
  assert.deepEqual(topic("device").paragraphs, [
    "The app keeps your sign-in, people lists, invitation links, recent places and messages waiting to send on this phone, in the iOS Keychain.",
    "Signing out clears almost all of it. A resbite you were creating stays until it’s saved, and an email address waiting to be confirmed stays until you confirm it or choose to forget it.",
    "Deleting the app may not clear the Keychain. To remove everything, sign out or delete your account first.",
    "Resbite doesn’t use your location.",
  ]);
  assert.deepEqual(topic("vendors").paragraphs, [
    "Supabase runs our servers and sign-in, in London. Expo and Apple deliver notifications. Resend sends our emails, and Twilio sends sign-in codes by text. Vercel hosts link.resbite.com.",
    "We don’t sell your data, show ads or track you, and we use no analytics.",
  ]);
  assert.deepEqual(topic("retention").paragraphs, [
    "Your account data stays until you delete your account.",
    "Past resbites are deleted 12 months after they end. One-off chats are deleted 90 days after they close, and group messages once they’re 12 months old.",
    "Backups and server logs last 7 days.",
    "Our Privacy Policy lists every period.",
  ]);
});

test("the chat topic puts the end-to-end line before reports, then blocks", () => {
  const p = topic("chat").paragraphs;
  const e2e = p.findIndex((x) => x.includes("end-to-end"));
  assert.ok(e2e >= 0 && e2e < p.indexOf(SAFETY_COPY.reportsPrivacy));
  assert.ok(p.indexOf(SAFETY_COPY.reportsPrivacy) < p.indexOf(SAFETY_COPY.blocksPrivacy));
});

test("no stale or beta wording, and only curly apostrophes", () => {
  const banned = [
    "stay on this device",
    "not verified",
    "draft",
    "beta",
    "build",
    "sample",
    "Wellness",
    "Preview actions",
    "can join it while the link is on",
    "Privacy Notice",
  ];
  for (const text of [PRIVACY_ABOUT, ...PRIVACY_TOPICS.flatMap((t) => [t.title, ...t.paragraphs])]) {
    for (const word of banned) assert.ok(!text.toLowerCase().includes(word.toLowerCase()), `${word}: ${text}`);
    assert.ok(!text.includes("'"), text);
  }
});

test("the About text names the Privacy Policy", () => {
  assert.equal(
    PRIVACY_ABOUT,
    "This page sums up how Resbite uses your data. Our Privacy Policy has the full details, and you can open it below.",
  );
  assert.ok(PRIVACY_ABOUT.includes("Privacy Policy"));
});

test("every period on the page also appears in the Privacy Policy", () => {
  const policy = readFileSync(fileURLToPath(new URL("../../../docs/legal/privacy-notice.md", import.meta.url)), "utf8");
  const periods = new Set(
    PRIVACY_TOPICS.flatMap((t) => t.paragraphs).flatMap((x) => x.match(/\b\d+ (?:days?|months?|hours?)\b/g) ?? []),
  );
  assert.ok(periods.size > 0);
  for (const period of periods) assert.ok(policy.includes(period), `${period} is not in the Privacy Policy`);
});
