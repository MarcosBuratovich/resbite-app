import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { supportContact } from "./supportContact";
import { SAFETY_COPY } from "./safetyCopy";

test("no Contact topic while the build has no address, or a value that isn't one (G-N10, N9)", () => {
  for (const env of [undefined, "", "   ", "help", "a b@x.example", "help@", "@x.example", "help@x", "help​@x.example", "help@x.example\u0085x"])
    assert.equal(supportContact(env), null, JSON.stringify(env));
});

test("an address gives the contact line, the address and its mailto: link", () => {
  assert.deepEqual(supportContact(" help@x.example "), {
    address: "help@x.example",
    line: "Questions, or something wrong in a chat? Write to help@x.example.",
    mailto: "mailto:help@x.example",
  });
  assert.equal(supportContact("help@x.example")?.line, SAFETY_COPY.contact("help@x.example"));
});

test("the mailto: link keeps the address whole: a ?, # or % in it is escaped, a + or a dot is not", () => {
  assert.equal(supportContact("team+resbite@support.example.com")?.mailto, "mailto:team+resbite@support.example.com");
  assert.equal(supportContact("a?b#c%d@x.example")?.mailto, "mailto:a%3Fb%23c%25d@x.example");
  // The line and the copied address are the address as written.
  assert.equal(supportContact("a?b#c%d@x.example")?.address, "a?b#c%d@x.example");
});

const mobile = fileURLToPath(new URL("../../", import.meta.url));
const source = (path: string) => readFileSync(join(mobile, path), "utf8");

test("Data & privacy reads the build's address with dot notation, the one form inlined when the bundle is built", () => {
  const page = source("app/data-privacy.tsx");
  assert.match(page, /supportContact\(process\.env\.EXPO_PUBLIC_SUPPORT_ADDRESS\)/);
  // Nowhere in the app is it read another way (bracket or destructured reads are left undefined in a build).
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(join(mobile, "app"));
  walk(join(mobile, "src"));
  const readers = files.filter((f) => readFileSync(f, "utf8").includes("EXPO_PUBLIC_SUPPORT_ADDRESS"));
  for (const f of readers)
    for (const line of readFileSync(f, "utf8").split("\n"))
      if (line.includes("EXPO_PUBLIC_SUPPORT_ADDRESS") && !/^\s*(\*|\/\/|\/\*)/.test(line))
        assert.match(line, /process\.env\.EXPO_PUBLIC_SUPPORT_ADDRESS\b/, `${relative(mobile, f)}: ${line.trim()}`);
});

test("the Chat messages topic keeps chat core's words, then says what a report keeps (G-S11)", () => {
  const page = source("app/data-privacy.tsx");
  const start = page.indexOf('title="Chat messages"');
  const end = page.indexOf("<TopicRow", start);
  assert.ok(start > 0 && end > start, "the Chat messages topic is followed by another topic");
  const topic = page.slice(start, end);
  const core = topic.indexOf("Chat messages are stored on Resbite’s servers");
  const hedge = topic.indexOf("deletion’s availability in this build under Delete account.");
  const reports = topic.indexOf("SAFETY_COPY.reportsPrivacy");
  assert.ok(core > 0 && hedge > core, "chat core's paragraph, with its hedge, stays");
  assert.ok(reports > hedge, "the reports line follows it, in the same topic");
});

test("Blocked people: a row on Data & privacy after the topics, and a screen in the signed-in stack beside the chat", () => {
  const page = source("app/data-privacy.tsx");
  const row = page.indexOf('router.push("/blocked-people")');
  assert.ok(row > page.lastIndexOf("<TopicRow"), "the row comes after the topics");
  assert.ok(row < page.indexOf('router.push("/delete-account")'), "and before Delete account");
  const layout = source("app/_layout.tsx");
  const chat = layout.indexOf('<Stack.Screen name="chat" />');
  const blocked = layout.indexOf('<Stack.Screen name="blocked-people" />');
  assert.ok(chat > 0 && blocked > chat, "its Stack entry sits beside the chat's");
  assert.ok(blocked < layout.indexOf("</Stack.Protected>", chat), "inside the same protected group");
});
