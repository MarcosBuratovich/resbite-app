// The legal pages and the contact form in headless Chrome (plan 5, Task 8). Builds a final site from finished copies of
// docs/legal/, serves it on a tiny local server (the pages as built, /api/contact through the generated function with a
// stub sender that records messages, /i/ and /r/ through the generated functions with readers that answer "inactive"),
// then drives the pages at 390 and 320 px. No request leaves this machine and nothing is really sent.
// Run from mobile/: node --import tsx ../links/verify-legal.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generate } from "./generate.mjs";
import { buildLegalPages, LEGAL_PAGES } from "./legal/pages.mjs";
import { checkSite } from "./check-live.mjs";

const require = createRequire(new URL("../mobile/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");

const PORT = Number(process.env.RESBITE_LEGAL_PORT || 5181);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const here = fileURLToPath(new URL(".", import.meta.url));

// Finished copies of the documents (the same two replacements as legal.test.mjs): placeholders filled, draft status gone.
const SOURCES = ["privacy-notice.md", "terms-of-use.md", "support.md", "delete-account.md", "invitee-notice-short.md", "community-rules-short.md"];
const finish = (md) => md.replace(/\[\[OWNER:[^\]]*\]\]/g, "Example").replace(" — draft for solicitor review, not yet published", "");

Object.assign(process.env, {
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  LINK_ORIGIN: ORIGIN,
  APP_STORE_URL: "https://testflight.apple.com/join/fixture",
  TERMS_VERSION: "2026-10",
});

const dir = await mkdtemp(join(tmpdir(), "resbite-legal-"));
const legalDir = join(dir, "legal");
await (await import("node:fs/promises")).mkdir(legalDir);
for (const name of SOURCES) await writeFile(join(legalDir, name), finish(await readFile(join(here, "../docs/legal", name), "utf8")));
const out = await generate("https://link.resbite.com", "ABCDE12345", "com.resbite.app", join(dir, "out"), { legal: "final", legalDir });
const built = new Map((await buildLegalPages({ legalDir, mode: "final" })).map((p) => [p.route, p]));
const { default: contact } = await import(pathToFileURL(join(out, "api", "contact.mjs")).href);
const { default: personal } = await import(pathToFileURL(join(out, "api", "personal.mjs")).href);
const { default: eventPage } = await import(pathToFileURL(join(out, "api", "page.mjs")).href);
const { renderContactSent, contactHeaders } = await import(pathToFileURL(join(out, "lib", "contact.mjs")).href);
const { PAGE_CSP } = await import(pathToFileURL(join(out, "lib", "render.mjs")).href);
const { createRateLimiter } = await import(pathToFileURL(join(out, "lib", "rate-limit.mjs")).href);

const sentMessages = [];
const deps = {
  send: async (message) => void sentMessages.push(message),
  perAddress: createRateLimiter({ limit: 100, windowMs: 3_600_000 }),
  overall: createRateLimiter({ limit: 100, windowMs: 3_600_000 }),
};
const inactive = async () => ({ state: "inactive" });
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".html": "text/html; charset=utf-8" };
const vercelRes = (res) => ({
  setHeader: (k, v) => res.setHeader(k, v),
  status: (code) => ({ send: (body) => ((res.statusCode = code), res.end(body)) }),
});
const readBody = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s)); });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, ORIGIN);
    const path = url.pathname;
    const legal = built.get(path);
    if (legal && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": legal.csp, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
      return res.end(legal.html);
    }
    if (path === "/support/sent") {
      res.writeHead(200, { ...contactHeaders(), "Content-Security-Policy": PAGE_CSP });
      return res.end(renderContactSent());
    }
    if (path === "/api/contact") {
      const body = req.method === "POST" ? await readBody(req) : undefined;
      return await contact({ method: req.method, headers: req.headers, body }, vercelRes(res), deps);
    }
    const personalMatch = path.match(/^\/([ir])\/([^/]*)$/);
    if (personalMatch) {
      const handler = personalMatch[1] === "i" ? personal : eventPage;
      const dep = personalMatch[1] === "i" ? { readPersonalInvitation: inactive } : { readInvitationPage: inactive };
      return await handler({ query: { code: decodeURIComponent(personalMatch[2]) } }, vercelRes(res), dep);
    }
    if (path === "/invite") {
      const file = (await readFile(join(out, "invite.html"), "utf8"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" });
      return res.end(file);
    }
    const file = resolve(out, `.${decodeURIComponent(path)}`);
    const isAasa = path === "/.well-known/apple-app-site-association";
    if (!file.startsWith(out + sep) || !(TYPES[extname(file)] || isAasa)) throw Error("not found");
    const bytes = await readFile(file);
    res.writeHead(200, { "Content-Type": isAasa ? "application/json" : TYPES[extname(file)], "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
    res.end(bytes);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});
await new Promise((ok, fail) => server.once("error", fail).listen(PORT, "127.0.0.1", ok));

let browser = null;
/** A page with its console and page errors collected. The meta CSP can't carry frame-ancestors; the header does. */
async function open(width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, locale: "en-GB", reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && m.text() !== "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.") errors.push(m.text());
  });
  const foreign = [];
  page.on("request", (r) => { if (new URL(r.url()).origin !== ORIGIN) foreign.push(r.url()); });
  return { page, errors, foreign, done: () => context.close() };
}
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

try {
  browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome", headless: true });

  // 1. Every legal page, at 390 and 320 px: no console error (a CSP violation is one), no sideways scroll.
  for (const width of [390, 320]) {
    const f = await open(width);
    for (const p of LEGAL_PAGES) {
      await f.page.goto(`${ORIGIN}${p.route}`);
      await expect(f.page.getByRole("heading", { level: 1 })).toHaveCount(1);
      assert.ok(await noSideways(f.page), `${p.route} scrolls sideways at ${width}`);
    }
    await f.page.goto(`${ORIGIN}/terms#community-rules`);
    await expect
      .poll(() => f.page.evaluate(() => {
        const r = document.getElementById("community-rules").getBoundingClientRect();
        return r.top >= -2 && r.top < window.innerHeight;
      }), { message: `#community-rules is in view at ${width}` })
      .toBe(true);
    assert.deepEqual(f.errors, [], `console errors at ${width}`);
    assert.deepEqual(f.foreign, [], `requests beyond the page's origin at ${width}`);
    await f.done();
  }

  // 2. The form: Tab order never reaches the trap field; a filled form lands on /support/sent and is "sent" to privacy@.
  {
    const f = await open(390),
      { page } = f;
    await page.goto(`${ORIGIN}/support`);
    await page.locator("#contact-name").focus();
    const order = ["contact-name"];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent.trim()));
    }
    assert.deepEqual(order, ["contact-name", "contact-email", "contact-topic", "contact-details", "Send message"]);
    assert.ok(!order.includes("contact-website"));
    await page.locator("#contact-name").fill("Sam Example");
    await page.locator("#contact-email").fill("sam@example.com");
    await page.locator("#contact-topic").selectOption({ label: "Delete my web-only or banned account" });
    await page.locator("#contact-details").fill("Please delete my account. <b>Thanks</b>");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.waitForURL(`${ORIGIN}/support/sent`);
    await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible();
    assert.equal(sentMessages.length, 1, "one message was handed to the sender");
    assert.equal(sentMessages[0].to, "privacy@resbite.com");
    assert.equal(sentMessages[0].replyTo, "sam@example.com");
    assert.deepEqual(f.errors, [], "console errors on the form path");
    await f.done();
  }

  // 3. A bad address reaches the server (browser validation off): the error summary, aria-invalid, the typed name kept.
  {
    const f = await open(320),
      { page } = f;
    await page.goto(`${ORIGIN}/support`);
    await page.evaluate(() => (document.getElementById("contact-form").noValidate = true));
    await page.locator("#contact-name").fill("Sam Example");
    await page.locator("#contact-email").fill("nope");
    await page.locator("#contact-topic").selectOption({ label: "Help with the app" });
    await page.locator("#contact-details").fill("It does nothing.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".error-summary")).toBeVisible();
    await expect(page.locator("#contact-email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#contact-name")).toHaveValue("Sam Example");
    assert.ok(await noSideways(page), "the error page does not scroll sideways at 320");
    assert.equal(sentMessages.length, 1, "nothing more was sent");
    await f.done();
  }

  // 4. checkSite against this server returns no failure at all.
  assert.deepEqual(await checkSite(ORIGIN), [], "checkSite failures");

  console.log(
    `PASS: the four legal pages in headless Chrome at 390 and 320px (one h1, no console or CSP error, no sideways scroll, no request beyond the origin), /terms#community-rules in view; the form (Tab order name, email, topic, details, Send and never the trap field; a filled form lands on /support/sent and hands one message to privacy@resbite.com with the typed reply-to; with validation off a bad address shows the error summary, aria-invalid and keeps the typed name); checkSite on the local site returns [].`,
  );
} finally {
  await browser?.close();
  await new Promise((ok) => server.close(ok));
  await rm(dir, { recursive: true, force: true });
}
