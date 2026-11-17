import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// Browser checks for App Store readiness plan 3's screens. Section (l*) per task; Task 1 is l1 to l3.
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const TERMS = process.env.EXPECT_TERMS_URL || "https://link.resbite.com/terms";
const PRIVACY = "https://link.resbite.com/privacy";
const SUPPORT = "https://link.resbite.com/support";
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/*.supabase.co/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  // react-native-web's Linking.openURL calls window.open(url, "_blank", "noopener").
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (u) => {
      window.__opened.push(String(u));
      return null;
    };
  });
  const opened = () => page.evaluate(() => window.__opened);
  const link = (name) => page.getByRole("link", { name, exact: true });
  const visible = async (locator) => {
    await expect(locator).toBeVisible();
    return locator;
  };
  const three = async (label) => {
    await page.evaluate(() => (window.__opened = []));
    for (const name of ["Privacy Policy", "Terms of Use", "Support"]) {
      const l = await visible(link(name));
      const box = await l.boundingBox();
      assert.ok(box && box.height >= 44, `${label}: ${name} is at least 44 px tall (${box?.height})`);
    }
    for (const name of ["Privacy Policy", "Terms of Use", "Support"]) await link(name).click();
    assert.deepEqual(await opened(), [PRIVACY, TERMS, SUPPORT], `${label}: the three links open their pages`);
  };

  // (l1) The welcome screen.
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "Get together", exact: true })).toBeVisible();
  await three("welcome");
  console.log("PASS (l1) the welcome screen links Privacy Policy, Terms of Use and Support");

  // (l2) Email sign-in, then phone sign-in.
  await page.goto(`${base}/auth?mode=login`);
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await three("email sign-in");
  await page.goto(`${base}/auth/phone?intent=signin`);
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await three("phone sign-in");
  console.log("PASS (l2) both sign-in screens link the three pages");

  // (l3) Phone sign-up: the tick line links Terms and Privacy Policy, and nothing else.
  await page.goto(`${base}/auth/phone`);
  await expect(page.getByRole("heading", { name: "Your number", exact: true })).toBeVisible();
  await page.evaluate(() => (window.__opened = []));
  await (await visible(link("Terms"))).click();
  await (await visible(link("Privacy Policy"))).click();
  assert.deepEqual(await opened(), [TERMS, PRIVACY]);
  await expect(link("Support")).toHaveCount(0);
  await expect(link("Terms of Use")).toHaveCount(0);
  await expect(page.getByRole("checkbox").first()).not.toBeChecked();
  console.log("PASS (l3) the sign-up tick line links Terms and Privacy Policy and stays unticked");

  assert.deepEqual(errors, [], `no page errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
