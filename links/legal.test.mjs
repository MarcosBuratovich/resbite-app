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

// ---- Task 4: the legal pages from docs/legal/
import { mkdtemp, readFile as readFileFs, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DRAFT_BANNER, buildLegalPages, publicPart } from "./legal/pages.mjs";

const LEGAL_SOURCES = ["privacy-notice.md", "terms-of-use.md", "support.md", "delete-account.md"];
const finish = (md) => md.replace(/\[\[OWNER:[^\]]*\]\]/g, "Example").replace(" — draft for solicitor review, not yet published", "");
async function legalCopy(edit) {
  const dir = await mkdtemp(join(tmpdir(), "legal-"));
  for (const name of LEGAL_SOURCES) {
    const text = await readFileFs(new URL(`../docs/legal/${name}`, import.meta.url), "utf8");
    await writeFile(join(dir, name), edit(name, text));
  }
  return dir;
}

test("the notes are never published", () => {
  const md = "# T\n\n**Version 1.0**\n\n> **Placeholders to fill** (delete this box before publishing)\n>\n> 1. [[OWNER: x]]\n\nKept.\n\n> ### Your right to object\n>\n> Kept too.\n\n---\n\n## Placeholders to fill\n\n| a |\n\n---\n\n## Notes for the reviewer (delete before publishing)\n\nGone.\n\n## Drafting notes for the reviewer (remove before publishing)\n\nGone too.\n";
  const out = publicPart(md);
  assert.ok(out.includes("Kept.") && out.includes("> ### Your right to object"));
  for (const gone of ["Placeholders to fill", "[[OWNER", "Gone", "before publishing"]) assert.ok(!out.includes(gone), gone);
  assert.ok(!/---\s*$/.test(out) && !/---\s*\n\s*---/.test(out));
});

test("a final build refuses unfinished documents, naming each file", async () => {
  const dir = await legalCopy((name, text) => (name === "terms-of-use.md" ? finish(text) : text));
  await assert.rejects(buildLegalPages({ legalDir: dir, mode: "final" }), (e) =>
    /^The legal documents are not ready to publish:/.test(e.message) && /privacy-notice\.md: an \[\[OWNER: …\]\] placeholder/.test(e.message)
    && /support\.md: the draft status/.test(e.message) && !e.message.includes("terms-of-use.md"));
});

test("the real documents build as drafts: four pages, their anchors, the form in place, no notes", async () => {
  const pages = await buildLegalPages({ legalDir: fileURLToPath(new URL("../docs/legal/", import.meta.url)), mode: "draft" });
  assert.deepEqual(pages.map((p) => p.route), ["/privacy", "/terms", "/support", "/delete-account"]);
  for (const page of pages) {
    assert.equal((page.html.match(/<h1/g) || []).length, 1, page.route);
    assert.ok(page.html.includes(DRAFT_BANNER) && page.robots === false, page.route);
    for (const raw of ["**", "](", "|---", "before publishing", "Notes for the", "<script"]) assert.ok(!page.html.includes(raw), `${page.route}: ${raw}`);
    assert.ok(!/(src|href)="http:/.test(page.html), page.route);
  }
  const support = pages.find((p) => p.route === "/support").html;
  assert.ok(support.indexOf('id="by-the-contact-form"') < support.indexOf('<form id="contact-form"') && support.indexOf('<form id="contact-form"') < support.indexOf('id="by-post"'));
  assert.ok(support.includes(`content="${FORM_CSP}"`) && pages.find((p) => p.route === "/terms").html.includes('id="community-rules"'));
  assert.ok(pages.find((p) => p.route === "/privacy").html.includes("<title>Privacy Policy – Resbite</title>"));
});

test("finished documents build for production: no banner, no mark, indexable", async () => {
  const pages = await buildLegalPages({ legalDir: await legalCopy((_, t) => finish(t)), mode: "final" });
  for (const page of pages) assert.ok(page.robots && !page.html.includes("draft-banner") && !page.html.includes("<mark"), page.route);
});

test("a page missing a required anchor is refused", async () => {
  const dir = await legalCopy((name, t) => finish(name === "privacy-notice.md" ? t.replace("## 10. If someone invited you by your number", "## 10. Invited by number") : t));
  await assert.rejects(buildLegalPages({ legalDir: dir, mode: "final" }), /privacy-notice\.md has no "#if-someone-invited-you-by-your-number"/);
});

// ---- Task 8: the read-only live check
import { checkSite } from "./check-live.mjs";

test("checkSite reports every failing path", async () => {
  const failures = await checkSite("https://link.example", async () => new Response("nope", { status: 404 }));
  for (const path of ["/privacy", "/terms", "/support", "/delete-account", "/support/sent", "/api/contact", "/invite"])
    assert.ok(failures.some((f) => f.startsWith(`${path}: `)), path);
});
