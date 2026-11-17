import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { COMPANY, FORM_CSP, LEGAL_LINKS, siteFooter, sitePage } from "./server/lib/site.mjs";
import { PAGE_CSP } from "./server/lib/render.mjs";

const doc = (name) => readFile(new URL(`../docs/legal/${name}`, import.meta.url), "utf8");

test("the footer names the company, its number and office, both inboxes, and links the four documents", () => {
  const html = siteFooter();
  assert.match(html, /^\s*<footer class="site-footer">/);
  assert.ok(html.includes('<nav aria-label="Legal">'));
  assert.deepEqual([...html.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]), [
    ["/privacy", "Privacy Policy"], ["/terms", "Terms of Use"], ["/support", "Support"], ["/delete-account", "Delete your account"],
    ["mailto:support@resbite.com", "support@resbite.com"], ["mailto:privacy@resbite.com", "privacy@resbite.com"],
  ]);
  assert.ok(html.includes("Resbite Ltd is a private limited company registered in England and Wales, company number 12450334. Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom."));
  assert.deepEqual(LEGAL_LINKS.map((l) => l.label), ["Privacy Policy", "Terms of Use", "Support", "Delete your account"]);
});

test("the footer's particulars are the Support page's", async () => {
  const support = await doc("support.md");
  for (const row of [`| Company name | ${COMPANY.name} |`, `| Company number | ${COMPANY.number} |`, `| Registered office | ${COMPANY.office} |`])
    assert.ok(support.includes(row), row);
});

test("a site page: its CSP in the head, the shared styles, no script, the footer after main", () => {
  const html = sitePage({ title: "Terms of Use", body: "<h1>Resbite Terms of Use</h1>", csp: PAGE_CSP });
  assert.ok(html.startsWith('<!doctype html>\n<html lang="en">'));
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}" />`));
  assert.ok(html.includes("<title>Terms of Use – Resbite</title>"));
  assert.match(html, /<link rel="stylesheet" href="\/site\.css" \/>\s*<link rel="stylesheet" href="\/legal\.css" \/>/);
  assert.ok(!html.includes("<script") && !html.includes('name="robots"'));
  assert.ok(html.indexOf('<main id="main" class="legal"><h1>') < html.indexOf("</main>"));
  assert.ok(html.indexOf("</main>") < html.indexOf('<footer class="site-footer">'));
  assert.ok(sitePage({ title: "x", body: "", csp: PAGE_CSP, robots: false }).includes('<meta name="robots" content="noindex, nofollow" />'));
  assert.ok(sitePage({ title: "<b>", body: "", csp: PAGE_CSP }).includes("<title>&lt;b&gt; – Resbite</title>"));
  assert.equal(FORM_CSP, PAGE_CSP.replace("form-action 'none'", "form-action 'self'"));
});
