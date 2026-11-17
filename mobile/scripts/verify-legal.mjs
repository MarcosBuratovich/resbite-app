import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// Browser checks for App Store readiness plan 3's screens. Section (l*) per task; Task 1 is l1 to l3, Task 4 is l4.
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

  // (l4) Licences: sections, a font's text, react-native's text, then Larger Text at 320 px.
  const scrollTo = async (target, name) => {
    const found = target.getByRole("button", { name, exact: true });
    for (let i = 0; i < 400 && !(await found.count()); i++) {
      await target.mouse.wheel(0, 700);
      await target.waitForTimeout(40);
    }
    for (let i = 0; i < 5; i++) {
      try {
        await found.first().scrollIntoViewIfNeeded({ timeout: 2000 });
        break;
      } catch {
        await target.waitForTimeout(200);
      }
    }
    return found.first();
  };
  await page.goto(`${base}/licences`);
  await expect(page.getByRole("heading", { name: "Licences", exact: true })).toBeVisible();
  await expect(page.getByText("Resbite is built with open-source software and fonts. Their licences are below.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fonts", exact: true })).toBeVisible();
  const montserrat = page.getByRole("button", { name: "Montserrat, OFL-1.1", exact: true });
  const box = await montserrat.boundingBox();
  assert.ok(box && box.height >= 44, `a licence row is at least 44 px tall (${box?.height})`);
  await montserrat.click();
  await expect(page.getByText("SIL Open Font License, Version 1.1").first()).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await (await scrollTo(page, "react-native 0.86.3, MIT")).click();
  await expect(page.getByText("Meta Platforms").first()).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  // Scrolling from the top, the three headers come in this order.
  await page.goto(`${base}/licences`);
  const order = [];
  for (let i = 0; i < 600 && order.length < 3; i++) {
    for (const name of ["Fonts", "Open-source software", "Built into React Native"]) {
      if (!order.includes(name) && (await page.getByRole("heading", { name, exact: true }).count())) order.push(name);
    }
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(40);
  }
  assert.deepEqual(order, ["Fonts", "Open-source software", "Built into React Native"]);
  {
    const large = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    large.on("pageerror", (e) => errors.push(e.message));
    await large.route("**/*.supabase.co/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await large.goto(`${base}/licences?largeText=1`);
    await large.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await expect(large.getByRole("heading", { name: "Licences", exact: true })).toBeVisible();
    await (await scrollTo(large, "@react-native-community/datetimepicker 9.1.0, MIT")).waitFor();
    const fits = await large.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.ok(fits, "Licences fits at 320 px under Larger Text");
    const clipped = await large.evaluate(() =>
      [...document.querySelectorAll("[role=button],[role=link],[role=heading],h1,h2,h3,input,textarea")]
        .filter((el) => !el.closest("[role=tablist],[aria-hidden=true]") && el.getBoundingClientRect().width > 0)
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.left < -1 || b.right > window.innerWidth + 1;
        })
        .map((el) => (el.getAttribute("role") || el.tagName.toLowerCase()) + " " + (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40))),
    );
    assert.deepEqual(clipped, [], "nothing is clipped on Licences at 320 px under Larger Text");
    await large.close();
  }
  console.log("PASS (l4) Licences lists the three sections, opens the font and react-native texts, and fits at 320 px under Larger Text");

  assert.deepEqual(errors, [], `no page errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
