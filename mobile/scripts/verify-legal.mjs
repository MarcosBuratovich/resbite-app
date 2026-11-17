import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// Browser checks for App Store readiness plan 3's screens. Section (l*) per task; Task 1 is l1 to l3, Task 4 is l4, Task 6 is l6, Task 7 is l7.
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
  // The list recycles rows while it scrolls, so a row found mid-scroll can detach or leave the window before the click: scroll back and look again.
  const tapRow = async (target, name) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const row = await scrollTo(target, name);
      try {
        await row.click({ timeout: 4000 });
        return;
      } catch {
        await target.mouse.wheel(0, -1400);
        await target.waitForTimeout(500);
      }
    }
    throw new Error(`Licences row "${name}" could not be tapped`);
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
  await tapRow(page, "react-native 0.86.3, MIT");
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

  // (l5) About and legal: four links, Licences, the company details, Larger Text at 320 px.
  await page.goto(`${base}/about-legal`);
  await expect(page.getByRole("heading", { name: "About and legal", exact: true })).toBeVisible();
  await page.evaluate(() => (window.__opened = []));
  const TERMS_BASE = TERMS.split("#")[0];
  for (const name of ["Privacy Policy", "Terms of Use", "Community rules", "Support"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  assert.deepEqual(await opened(), [PRIVACY, TERMS, TERMS_BASE + "#community-rules", SUPPORT]);
  await page.getByRole("button", { name: "Licences", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Licences", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "About and legal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "About and legal", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Company details", exact: true })).toBeVisible();
  const first = page.getByText("Resbite is provided by Resbite Ltd, a private limited company registered in England and Wales.");
  await expect(first).toBeVisible();
  await expect(page.getByText("Company number: 12450334")).toBeVisible();
  await expect(page.getByText("Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom")).toBeVisible();
  await expect(page.getByText("Data protection: privacy@resbite.com")).toBeVisible();
  assert.equal(await first.evaluate((el) => getComputedStyle(el).userSelect), "text");
  if (process.env.EXPECT_SUPPORT) {
    await expect(page.getByText(`Help and reports: ${process.env.EXPECT_SUPPORT}`)).toBeVisible();
  } else {
    await expect(page.getByText("Help and reports:", { exact: false })).toHaveCount(0);
  }
  {
    const large = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    large.on("pageerror", (e) => errors.push(e.message));
    await large.route("**/*.supabase.co/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await large.goto(`${base}/about-legal?largeText=1`);
    await large.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await expect(large.getByRole("heading", { name: "About and legal", exact: true })).toBeVisible();
    await expect(large.getByText("Data protection: privacy@resbite.com")).toBeAttached();
    assert.ok(await large.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "About and legal fits at 320 px under Larger Text");
    const clipped = await large.evaluate(() =>
      [...document.querySelectorAll("[role=button],[role=link],[role=heading],h1,h2,h3")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.left < -1 || b.right > window.innerWidth + 1;
        })
        .map((el) => el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40)),
    );
    assert.deepEqual(clipped, [], "nothing is clipped on About and legal at 320 px under Larger Text");
    await large.close();
  }
  console.log("PASS (l5) About and legal opens the four pages, Licences and shows the company details");

  // (l6) Data & privacy, by preview: Preview the design, the Profile tab, Data & privacy.
  const TOPICS = [
    "Your account",
    "Contacts and invitations",
    "Resbites and chat",
    "Connections",
    "Notifications",
    "On this device",
    "Who we work with",
    "How long we keep it",
  ];
  const ABOUT =
    "This page sums up how Resbite uses your data. Our Privacy Policy has the full details, and you can open it below.";
  await page.goto(base);
  await page.getByRole("button", { name: "Preview the design", exact: true }).click();
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Data & privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();
  {
    const tops = await Promise.all(
      TOPICS.map(async (name) => {
        const el = page.getByRole("button", { name, exact: true });
        await expect(el).toBeVisible();
        return (await el.boundingBox()).y;
      }),
    );
    assert.deepEqual(tops, [...tops].sort((a, b) => a - b), "the topics come in the agreed order");
    await expect(page.getByRole("button", { name: "Preview & samples", exact: true })).toHaveCount(0);
    await expect(page.getByText(/beta/i)).toHaveCount(0);
    await page.getByRole("button", { name: "About this page", exact: true }).click();
    await expect(page.getByText(ABOUT, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close sheet", exact: true }).click();
    await expect(page.getByRole("button", { name: "Close sheet", exact: true })).toHaveCount(0);
    await page.evaluate(() => (window.__opened = []));
    await page.getByRole("button", { name: "Privacy Policy", exact: true }).click();
    assert.deepEqual(await opened(), [PRIVACY]);
    await page.evaluate(() => (window.__opened = []));
    await page.getByRole("button", { name: "Request a copy of my data", exact: true }).click();
    assert.deepEqual(await opened(), [
      "mailto:privacy@resbite.com?subject=Request%20a%20copy%20of%20my%20data&body=Please%20send%20me%20a%20copy%20of%20the%20personal%20data%20Resbite%20holds%20about%20me.",
    ]);
    await page.getByRole("button", { name: "About and legal", exact: true }).click();
    await expect(page.getByRole("heading", { name: "About and legal", exact: true })).toBeVisible();
  }
  {
    const large = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    large.on("pageerror", (e) => errors.push(e.message));
    await large.route("**/*.supabase.co/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await large.goto(base);
    await large.getByRole("button", { name: "Preview the design", exact: true }).click();
    await large.getByRole("tab", { name: "Profile", exact: true }).click();
    await large.getByRole("button", { name: "Data & privacy", exact: true }).click();
    await large.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    await expect(large.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();
    assert.ok(await large.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Data & privacy fits at 320 px under Larger Text");
    const clipped = await large.evaluate(() =>
      [...document.querySelectorAll("[role=button],[role=link],[role=heading],h1,h2,h3")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.left < -1 || b.right > window.innerWidth + 1;
        })
        .map((el) => el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40)),
    );
    assert.deepEqual(clipped, [], "nothing is clipped on Data & privacy at 320 px under Larger Text");
    await large.close();
  }
  console.log("PASS (l6) Data & privacy lists the eight topics, opens the Privacy Policy and the data request, and fits at 320 px under Larger Text");

  // (l7) No Wellness tab, and About access says nothing about a private test.
  {
    const preview = await browser.newPage({ viewport: { width: 390, height: 844 } });
    preview.on("pageerror", (e) => errors.push(e.message));
    await preview.route("**/*.supabase.co/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await preview.goto(base);
    await preview.getByRole("button", { name: "Preview the design", exact: true }).click();
    await expect(preview.getByRole("tab", { name: "Profile", exact: true })).toBeVisible();
    const tabs = await preview.getByRole("tab").allInnerTexts();
    assert.deepEqual(tabs.map((t) => t.trim()), ["Create", "My resbites", "Profile"], "the tab bar is Create, My resbites and Profile");
    await preview.goto(`${base}/wellness`);
    await expect(preview.getByRole("heading", { name: "Wellness", exact: true })).toHaveCount(0);
    await preview.close();
    const auth = await browser.newPage({ viewport: { width: 390, height: 844 } });
    auth.on("pageerror", (e) => errors.push(e.message));
    await auth.route("**/*.supabase.co/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await auth.goto(`${base}/auth?mode=login`);
    await auth.getByRole("button", { name: "About access", exact: true }).click();
    const line = "Resbite is for people aged 18 and over. Every account needs a mobile number, confirmed with a code we text you.";
    await expect(auth.getByText(line, { exact: true })).toBeVisible();
    const sheet = auth.getByRole("dialog");
    if (await sheet.count()) assert.ok(!/private|test/i.test(await sheet.innerText()), "no private or test wording in the sheet");
    await auth.close();
  }
  console.log("PASS (l7) the tab bar is Create, My resbites and Profile, /wellness shows nothing, and About access has the new line");

  assert.deepEqual(errors, [], `no page errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
