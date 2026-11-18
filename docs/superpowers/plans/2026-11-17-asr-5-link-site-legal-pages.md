# Link Site Legal Pages Implementation Plan (App Store readiness, plan 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `link.resbite.com` publishes the Privacy Policy, Terms of Use, Support (with a contact form) and Delete your account pages straight from `docs/legal/`, shows the company's particulars on every page, shows the invitee notice and the right to object beside the number field on `/r/` and `/i/`, runs its functions in London, and drops the "private testing" wording from `/invite`. Every Vercel and Resend step is the owner's.

**Architecture:** `links/generate.mjs` renders the four pages at build time from `docs/legal/*.md` with a small Markdown converter of our own (`links/legal/`), leaving out only the notes the documents mark for deletion, and writes them as static HTML with no script and the strict CSP (`form-action 'self'` only where the form is). A build mode decides what ships: `final` refuses placeholders and draft status, `draft` adds a banner and `noindex` for a protected preview, and `off` builds the site as it is today for any deploy made before the documents are final. The form is a plain HTML POST to `/api/contact`, which checks the input, limits each address, sends through Resend to the support or the privacy inbox by topic, and redirects to `/support/sent`. One footer function serves the static and the rendered pages; `personal.js` draws the notice from words tested against `docs/legal/invitee-notice-short.md`.

**Tech Stack:** Node 22 ES modules (`.mjs`), `node:test`, Vercel Node functions (`req.body`, `res.setHeader`, `res.status().send()`), the Resend REST API (`POST https://api.resend.com/emails`, body keys `from`, `to`, `reply_to`, `subject`, `text`; 200 on success, 429 when limited), Playwright from `mobile/node_modules` for the headless checks. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`: section 2, rows DOC-3, DOC-7, WEB-1 to WEB-7 and OPS-5, workstream D (D1 to D5, D7, D9), F1, decisions D-5 and D-10, section 6 phase 4. With `knowledge-base/08-decisions.md`, section "App Store readiness (AS), 17 November 2026": AS-D1 (the company), AS-D3 (the two inboxes), AS-D7 (solicitor first), AS-D8 (legal pages on link.resbite.com), AS-R5 ("Privacy Policy"), AS-R7 (legal requests to privacy@). They override the spec where they differ. The pages publish `docs/legal/privacy-notice.md`, `terms-of-use.md`, `support.md` and `delete-account.md`; the notice is `docs/legal/invitee-notice-short.md`.

**Branch:** `asr-5-link-site-legal`, cut from `app-store-readiness` and merged back into it in the roadmap's order (`docs/superpowers/plans/2026-11-17-asr-0-roadmap.md`); or `app-store-readiness` itself when nothing else is being built. Tasks 1 to 4 and 8's `check-live.mjs` can start once the documents are committed; Tasks 5 to 7 start after plan 1's Task 4 and plan 4's Tasks 5 and 6 have merged (both change `personal.js`, `personal-flow.mjs`, `options.mjs` and the verify scripts first).

**Shared with the other readiness plans.**
- **Owns the site's structure:** `pageOptions(code, env, mode)`, `TERMS_VERSION_FALLBACK`, `generate.mjs`'s build modes, routes, headers and copy list, the page shells (`site.mjs`), `linkedParts` and the notice. Plan 1's CAPTCHA Tasks 7 and 8 (blocked on AS-D5) build on these after this plan merges; its `/captcha` route ships in every mode.
- **Consumes plan 4's words** (L9, the `TERMS_VERSION` fallback's value, `nameNotAllowed`) and **plan 1's Task 4** (no `000000` swap in `personal.js`).
- **Deploys.** Plan 1's sitting-1 deploy is built from plan 1's own commit, before any of this plan's files (or with `--legal=off`). Plan 4's site changes go live only with this plan's R5. R2 is the one place the Vercel `TERMS_VERSION` is set.
- **Depends on, before R5:** plan 1's sitting 1 (real codes), plan 6's sitting (the 30-day number purge and the do-not-invite list the notice promises), the solicitor's review and the inboxes (R0). Plan 6's Auth email footer (its R9) and plan 4's Terms publication (its step 7) wait for R6.

**Before Task 1.** The documents work is applying AS-R5 to `docs/legal/` and `docs/compliance/` in the working tree as this plan is written. Start only when `git status --short docs/legal docs/compliance` prints nothing and `grep -l "Privacy Notice" docs/legal/*.md` prints nothing. Otherwise stop and ask the controller. Lines cited in `docs/` files are found by the quoted text, not by number.

**Tasks:** 9, then "Rollout (owner-run)".

## Global Constraints

- **Owner-run steps.** Every Vercel step (variables, preview and production deploys, firewall rules, the region and plan record) and every Resend step (the API key) needs the owner's explicit approval at the time. They live only in "Rollout (owner-run)". This plan has no Supabase, EAS, TestFlight or App Store Connect step, no migration and no database function.
- **Secrets by name only.** `RESEND_API_KEY` exists only in Vercel's environment. It never appears in the repo, a test, a fixture, a log or the `qa/` record, which says "set" or "unset". Delete the `.env.local` that `vercel link` writes. Never create `mobile/.env.local`. No secret or service-role key reaches browser code.
- **No real people's data.** Fixtures use `example.com` addresses (`sam@example.com`) and the 07700 900xxx fiction range, as the existing link tests do. The only real addresses are the role inboxes `support@resbite.com` and `privacy@resbite.com` (AS-D3).
- **The company, exactly (AS-D1):** Resbite Ltd, a private limited company registered in England and Wales, company number 12450334, registered office 86-90 Paul Street, London EC2A 4NE, United Kingdom.
- **The published page never differs from the file** (`docs/legal/README.md`, rule 2). Pages are rendered from `docs/legal/` at build time. The only text left out is what the documents mark for deletion: an H2 section whose heading says "(delete before publishing)" or "(remove before publishing)" or is "Placeholders to fill", and a quote whose first line says "delete this box" or "remove this box". The notice's words are tested against `invitee-notice-short.md`.
- **Drafts never reach production.** A `final` build refuses any `[[OWNER:` placeholder, the draft status ("draft for solicitor review", "not yet published") and any "before publishing" note left in the public part. Production deploys use `final`. `draft` goes only to Vercel's protected previews.
- **CSP.** No third-party script, style, font or image on any page. The legal pages carry no script at all and use `PAGE_CSP` (`links/server/lib/render.mjs:5-6`). `/support`, `/api/contact`'s pages use `FORM_CSP`, which is `PAGE_CSP` with `form-action 'self'`. The meta CSP and the header CSP of each page are the same string, since both are enforced. The `/r/` and `/i/` CSPs do not change.
- **Copy.** Plain British English, short sentences, the typographic apostrophe the site already uses (’). The four documents are called "Privacy Policy", "Terms of Use", "Support" and "Delete your account" in every link and title.
- **Nothing logs** a contact message, an email address or an IP address.
- **Tests.** `cd mobile && npm test` runs the link tests too; each new test file joins its chain in `mobile/package.json:68`, right after `node --import tsx ../links/personal-flow.test.mjs`. `cd mobile && npm run typecheck` (which runs `tsc --noEmit`) still passes (no TypeScript changes). The headless checks run with `cd mobile && node --import tsx ../links/verify-<name>.mjs` (Playwright, channel `chrome`; `/usr/bin/google-chrome` exists on the Linux box).
- **Git.** Commit after each task and push to the plan's branch (Branch, above); merging to `main` is the owner's choice. Commit messages end with the session's attribution line.

## Decisions this plan makes

- **L1. A converter of our own.** The documents use a small subset of Markdown (headings, paragraphs, bold, links, bare addresses, code spans, lists, tables, quotes, rules). A ~200-line converter covers it with every piece of text escaped and only `https:`, `mailto:`, `/` and `#` links allowed. No Markdown package joins the build.
- **L2. Build modes.** `--legal=final` (the default), `draft` or `off`. `off` leaves out the pages, the sent page, the contact function, the footer and the notices, so the SMS sitting's deploy (D6, phase 3), which comes before the documents are final, publishes nothing that depends on them. The mode reaches the functions through a module generate writes, `lib/legal-mode.mjs`.
- **L3. Topics decide the inbox.** Data protection, legal requests and deletion go to `privacy@resbite.com`; everything else to `support@resbite.com`. This is the routing in `support.md`'s build notes, and AS-R7 keeps legal requests where only the owner reads them. Task 3 corrects `support.md`'s "goes straight to our support inbox" to match.
- **L4. Resend sends the form.** It already sends the Auth emails from `noreply@resbite.com` (`qa/auth-readiness.md`, "Hosted setup update — 18 September 2026"). A new sending-only key, `RESEND_API_KEY`, on Vercel. From `Resbite contact form <noreply@resbite.com>`, reply-to the person. Task 3 adds the use to the Privacy Policy and the vendor register.
- **L5. Limits.** In the function: 5 sent messages an hour per address and 50 an hour per instance, counted only for messages that would be sent. The real limit is the Vercel firewall rule on `/api/contact` (Rollout R8).
- **L6. After sending,** a 303 to `/support/sent`, a static page with `noindex`, so a reload never sends twice.
- **L7. Page options.** `TERMS_URL` and `PRIVACY_URL` default to the site's own `/terms` and `/privacy` unless the mode is `off`. `TERMS_VERSION` must be `YYYY-MM` (the only form the database accepts) or the fallback applies. The fallback becomes an exported constant, `TERMS_VERSION_FALLBACK`, keeping the literal `options.mjs` has when Task 5 starts (`"2026-12"` once plan 4's Task 5 has set it, else `"2026-10"`); plan 4 owns its value (its open point "`TERMS_VERSION` value").
- **L8. Who gave the number.** The `/i/` notice names the inviter (the person who brought you, or the host), as the page's own "Type the number … invited" does. The `/r/` notice names the host, who decides the request.
- **L9. The tick's words are the app's.** `personal-flow.test.mjs:161-162` keeps `PAGE_COPY.tick` and `.terms` equal to the app's `GUEST_COPY`. Plan 4 (`docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md`, Task 5) owns these words: it sets `GUEST_COPY.tick` to "I’m 18 or over and I accept the Terms of Use." and `.terms` to "Read the Terms of Use. Our Privacy Policy explains how we use your data.", and the web's `PAGE_COPY.tick` and `.terms` and the verify scripts' `COPY.tick` to the same, in one commit. This plan doesn't set them; Task 7 only links the phrases. The tick's label stays plain text, as the app's `TickRow` label is; the line under it links "Terms of Use" (or "Terms") and "Privacy Policy" as whole phrases.
- **L10. Region.** `"regions": ["lhr1"]` in the generated `vercel.json`, for every function. Every Vercel plan allows one region.
- **L11. `/invite`.** The sentence "Resbite is in private testing." goes; the rest of the note stays.

## Review Focus

1. **A draft or a reviewer's note reaching production.** A `final` build must refuse an unfilled placeholder or the draft status, and the notes must be gone even from a draft. Task 4 ("the notes are never published", "a final build refuses unfinished documents, naming each file") and Task 6 ("a final build refuses … before writing anything").
2. **Hostile or odd form input.** HTML in a field shown back on the error page, CR/LF or a list of addresses in the email field, a field sent twice (an array), 6,000 characters of details, a POST from another site. Each is escaped or refused, and nothing is sent. Task 3.
3. **A link that lands nowhere.** The notice's `#if-someone-invited-you-by-your-number`, the chat rules' `#community-rules` and the form's section must exist. If a heading is renamed, the build refuses. Task 4 ("a page missing a required anchor is refused") and Task 7 (the notice's anchor is one of the page's required anchors).
4. **A deploy before the documents are final.** The default refuses, and `--legal=off` ships no page, footer, notice or form. Task 6 ("off leaves out everything that depends on the documents").
5. **A phone 320 px wide.** Wide tables and long addresses must not make a page scroll sideways, and the notice stays between the number and Send code. Task 8 (`verify-legal.mjs`) and Task 7 (`verify-personal.mjs`).

## File Structure

| File | Responsibility |
|---|---|
| `links/legal/markdown.mjs` (new) | Markdown subset to escaped HTML; heading ids; an insertion point after a named section |
| `links/legal/pages.mjs` (new) | The four pages: their sources, titles and required anchors; strips the notes; refuses an unfinished `final` build |
| `links/server/lib/site.mjs` (new) | The company, the legal links, `FORM_CSP`, the footer and the page shell, shared by the build and the functions |
| `links/server/lib/contact.mjs` (new) | Topics, words, reading and checking the form, the message, the form HTML and the form's pages |
| `links/server/lib/mailer.mjs` (new) | One Resend call |
| `links/server/lib/rate-limit.mjs` (new) | An in-memory limit per key and window |
| `links/server/lib/legal-mode.mjs` (new) | `LEGAL_MODE`, `"final"` in the source; generate writes the build's own |
| `links/server/api/contact.mjs` (new) | `POST /api/contact` |
| `links/assets/site.css`, `links/assets/legal.css` (new) | The footer on every page; the legal pages and the form |
| `links/check-live.mjs` (new) | Read-only checks of a deployed site; the owner runs it after a deploy |
| `links/verify-legal.mjs` (new) | The legal pages and the form in headless Chrome, plus `checkSite` against a local server |
| `links/generate.mjs` | Modes, the pages, routes, headers, region, `/invite`'s footer, the hosting notes, the CLI flag |
| `links/server/lib/options.mjs`, `render.mjs`, `personal.mjs` | The `legal` option, URL defaults, version check, footer and `data-notice` |
| `links/assets/personal-flow.mjs`, `personal.js`, `personal.css`, `invite.html` | The notice and its words; linked phrases; `/invite`'s wording and footer |
| `links/*.test.mjs`, `links/verify-personal.mjs`, `links/verify-open-link.mjs`, `mobile/package.json` | Tests |
| `docs/legal/support.md`, `docs/legal/privacy-notice.md`, `docs/legal/README.md`, `docs/compliance/vendors.md` | What the form does, said where the documents say it |
| `qa/link-site-legal-2026-11-17/README.md` (new), `qa/app-store-release/README.md` | The rollout record; a pointer from release step 16 |

---

### Task 1: Markdown to HTML

**Files:**
- Create: `links/legal/markdown.mjs`
- Test: `links/markdown.test.mjs` (new)
- Modify: `mobile/package.json:68` (add ` && node --test ../links/markdown.test.mjs` after `node --import tsx ../links/personal-flow.test.mjs`)

**Interfaces:**
- Produces: `markdownToHtml(markdown: string, options?: { draft?: boolean; insertAfter?: Record<string, string> }): string` and `slugify(heading: string): string`.

The subset, one line each:
- `#` to `####` headings, each with an `id` from `slugify`; a repeated id gets `-2`, `-3` (one count across the whole document, quotes included).
- A paragraph is consecutive text lines, joined with `<br />\n`.
- `- ` items make `<ul>`; `N. ` items make `<ol>`, with `start="N"` when N is not 1.
- `|` rows: a header row, a `|---|` row, body rows, inside `<div class="table"><table>`. A header row whose cells are all empty gives no `<thead>`. Header cells are `<th scope="col">`.
- `---` alone is `<hr />`.
- Consecutive `>` lines are a `<blockquote>` whose inside is converted the same way.
- Escaping: `&`, `<`, `>` and `"` in every piece of text and every attribute (attributes are double-quoted; `'` stays as written).
- Inline: `` `code` `` is literal; `**bold**`; `[text](href)` only for `https:`, `mailto:`, `/…` and `#…`, else the text alone; bare `https://…` and `name@domain.tld` become links without trailing `.,;:!?)`; `[[OWNER: …]]` becomes `<mark class="placeholder">…</mark>` only when `draft`.

- [ ] **Step 1: Write the failing tests** in `links/markdown.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml as md, slugify } from "./legal/markdown.mjs";

test("headings get ids without their section numbers; a repeat gets -2", () => {
  const html = md("## 10. If someone invited you by your number\n\n### In the app\n\n### In the app");
  assert.ok(html.includes('<h2 id="if-someone-invited-you-by-your-number">10. If someone invited you by your number</h2>'));
  assert.ok(html.includes('<h3 id="in-the-app">In the app</h3>') && html.includes('<h3 id="in-the-app-2">In the app</h3>'));
  assert.equal(slugify("9. Community rules"), "community-rules");
  assert.equal(slugify("3.1 Your account and signing in"), "your-account-and-signing-in");
  assert.equal(slugify("Things you can’t report directly in the app"), "things-you-cant-report-directly-in-the-app");
});

test("paragraphs keep their line breaks, and every piece of text is escaped", () => {
  assert.equal(md("**Version 1.0**\n**Operator:** Resbite Ltd"), "<p><strong>Version 1.0</strong><br />\n<strong>Operator:</strong> Resbite Ltd</p>");
  assert.equal(md('a <script>alert(1)</script> & "b"'), "<p>a &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;b&quot;</p>");
});

test("links: https, mailto, site paths and anchors only", () => {
  assert.equal(md("[ico.org.uk](https://ico.org.uk)"), '<p><a href="https://ico.org.uk">ico.org.uk</a></p>');
  assert.equal(md("[x](javascript:alert(1))"), "<p>x</p>");
  assert.equal(md("[rules](#community-rules) [help](/support)"), '<p><a href="#community-rules">rules</a> <a href="/support">help</a></p>');
});

test("bare addresses and emails become links, without trailing punctuation, and never twice", () => {
  assert.equal(md("At https://link.resbite.com/support."), '<p>At <a href="https://link.resbite.com/support">https://link.resbite.com/support</a>.</p>');
  assert.equal(md("Email **privacy@resbite.com**."), '<p>Email <strong><a href="mailto:privacy@resbite.com">privacy@resbite.com</a></strong>.</p>');
  assert.equal((md("[https://ico.org.uk](https://ico.org.uk)").match(/<a /g) || []).length, 1);
});

test("lists, tables and rules", () => {
  assert.equal(md("- a\n- **b**"), "<ul>\n<li>a</li>\n<li><strong>b</strong></li>\n</ul>");
  assert.ok(md("3. c\n4. d").startsWith('<ol start="3">'));
  const table = md("| Address | Use |\n|---|---|\n| **support@resbite.com** | Help |");
  assert.ok(table.startsWith('<div class="table"><table>') && table.includes('<th scope="col">Address</th>'));
  assert.ok(table.includes('<td><strong><a href="mailto:support@resbite.com">support@resbite.com</a></strong></td>'));
  assert.ok(!md("| | |\n|---|---|\n| a | b |").includes("<thead>"));
  assert.equal(md("---"), "<hr />");
});

test("a quote is converted inside, sharing the heading ids", () => {
  const box = "> ### Your right to object\n>\n> **You can object.**";
  const html = md(`${box}\n\n${box}`);
  assert.ok(html.includes('<blockquote>\n<h3 id="your-right-to-object">Your right to object</h3>\n<p><strong>You can object.</strong></p>\n</blockquote>'));
  assert.ok(html.includes('id="your-right-to-object-2"'));
});

test("code spans are literal; placeholders are marked only in a draft", () => {
  assert.equal(md("`**/r/**`"), "<p><code>**/r/**</code></p>");
  assert.equal(md("VAT [[OWNER: VAT number]]", { draft: true }), '<p>VAT <mark class="placeholder">[[OWNER: VAT number]]</mark></p>');
  assert.equal(md("VAT [[OWNER: VAT number]]"), "<p>VAT [[OWNER: VAT number]]</p>");
});

test("insertAfter puts HTML at the end of the named section, and a missing heading is an error", () => {
  const html = md("### By the contact form\n\ntext\n\n### By post", { insertAfter: { "by-the-contact-form": "<form></form>" } });
  assert.ok(html.indexOf("text") < html.indexOf("<form></form>") && html.indexOf("<form></form>") < html.indexOf('id="by-post"'));
  assert.throws(() => md("### A", { insertAfter: { missing: "<form></form>" } }), /no heading "missing"/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd mobile && node --test ../links/markdown.test.mjs`
Expected: FAIL, "Cannot find module … links/legal/markdown.mjs".

- [ ] **Step 3: Implement `markdownToHtml` and `slugify` in `links/legal/markdown.mjs`**

A line-by-line block parser with one `seen` slug map passed into quotes. Inline text is split on code spans first; each other piece is escaped once, then placeholders (draft), `[text](href)`, `**bold**`, then bare addresses and emails only outside the anchors already made. `slugify`: drop a leading `\d+(\.\d+)*\.?\s+`, lower-case, drop `’` and `'`, runs of anything but `[a-z0-9]` become `-`, trim `-`. `insertAfter` emits its HTML before the next heading of the same or a higher level, or at the end; an id never met throws `Error('no heading "<id>"')`. No export beyond the two functions.

- [ ] **Step 4: Run them to see them pass**

Run: `cd mobile && node --test ../links/markdown.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add links/legal/markdown.mjs links/markdown.test.mjs mobile/package.json
git commit -m "Link site: Markdown to HTML for the legal pages"
```

---

### Task 2: The footer and the page shell

**Files:**
- Create: `links/server/lib/site.mjs`, `links/assets/site.css`, `links/assets/legal.css`
- Test: `links/legal.test.mjs` (new)
- Modify: `mobile/package.json:68` (add ` && node --test ../links/legal.test.mjs` after the markdown test)

**Interfaces:**
- Consumes: nothing. `site.mjs` imports no other module: `render.mjs` imports it in Task 5, and a cycle would leave `PAGE_CSP` uninitialised. `FORM_CSP` is its own literal; the test pins it to `PAGE_CSP` (`links/server/lib/render.mjs:5-6`).
- Produces, from `links/server/lib/site.mjs`:
  - `COMPANY = { name: "Resbite Ltd", number: "12450334", registeredIn: "England and Wales", office: "86-90 Paul Street, London EC2A 4NE, United Kingdom", support: "support@resbite.com", privacy: "privacy@resbite.com" }`
  - `LEGAL_LINKS: Array<{ href: string; label: string }>`: `/privacy` Privacy Policy, `/terms` Terms of Use, `/support` Support, `/delete-account` Delete your account, in that order.
  - `FORM_CSP: string`, `escapeHtml(text: unknown): string` (`&`, `<`, `>`, `"`; `null` and `undefined` give `""`), `siteFooter(): string`
  - `sitePage({ title, body, csp, robots = true, banner = "" }): string`: a whole document. Head: charset, viewport, `referrer no-referrer`, robots `noindex, nofollow` only when `robots` is false, the meta CSP, `<title>{title} – Resbite</title>`, the icon `/resbite-mark.png`, `/site.css` then `/legal.css`. Body: `<header class="site-header">` with the mark (`alt=""`, 32×32) and "Resbite", then `banner`, then `<main id="main" class="legal">{body}</main>`, then `siteFooter()`. No script.

- [ ] **Step 1: Write the failing tests** in `links/legal.test.mjs`:

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd mobile && node --test ../links/legal.test.mjs`
Expected: FAIL, "Cannot find module … site.mjs".

- [ ] **Step 3: Implement `links/server/lib/site.mjs`, and write the two stylesheets**

The footer is the nav (the four `LEGAL_LINKS`), then `<p>` with the particulars sentence from the test, then `<p>Email <a href="mailto:support@resbite.com">support@resbite.com</a> for help, or <a href="mailto:privacy@resbite.com">privacy@resbite.com</a> about your data.</p>`. `site.css`: `.site-footer` centred, `max-width: 390px` (720px on the legal pages, from `legal.css`), 14px muted text, links at least 44px tall, the nav wrapping. `legal.css`: the colour tokens of `personal.css:3-16`, a 720px column, `.table { overflow-x: auto }`, cells top-aligned with `overflow-wrap: anywhere`, `blockquote` as a bordered box, `mark.placeholder`, `.draft-banner`, the form (Task 3: `.field`, `.hint`, `.error`, `.error-summary`, `.button`, and `.trap` off-screen). Both stylesheets start `:root { color-scheme: light; }` like the other pages.

- [ ] **Step 4: Run them to see them pass**

Run: `cd mobile && node --test ../links/legal.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add links/server/lib/site.mjs links/assets/site.css links/assets/legal.css links/legal.test.mjs mobile/package.json
git commit -m "Link site: the footer with the company's particulars, and the page shell"
```

---

### Task 3: The contact form and `/api/contact`

**Files:**
- Create: `links/server/lib/contact.mjs`, `links/server/lib/mailer.mjs`, `links/server/lib/rate-limit.mjs`, `links/server/api/contact.mjs`
- Test: `links/contact.test.mjs` (new)
- Modify: `mobile/package.json:68` (add ` && node --test ../links/contact.test.mjs` after the legal test)
- Modify (words, found by text): `docs/legal/support.md` ("### By the contact form", first sentence), `docs/legal/privacy-notice.md` (the Resend row in 5.2 and "Sign-in emails at Resend" in 7), `docs/legal/README.md` (change log), `docs/compliance/vendors.md` (the Resend row in the summary table and the Resend "Used for" row)

**Interfaces:**
- Consumes: `FORM_CSP`, `PAGE_CSP`, `sitePage`, `escapeHtml` (Task 2).
- Produces, from `links/server/lib/contact.mjs`:
  - `INBOXES = { support: "support@resbite.com", privacy: "privacy@resbite.com" }`
  - `CONTACT_TOPICS: Array<{ value: string; label: string; inbox: "support" | "privacy" }>`, in this order: `help` Help with the app; `report` Report content or a person; `intimate-image` An intimate image of me; `child-safety` Child safety; `complaint` Complaint; `appeal` Appeal; `data-protection` Data protection request or complaint (privacy); `legal-complaint` Legal complaint (defamation, copyright or privacy); `legal-request` Legal request from a court, the police or a regulator (privacy); `delete-account` Delete my web-only or banned account (privacy); `other` Something else.
  - `CONTACT_WORDS` (below), `readForm(body: unknown): { name, email, topic, details, website }` (strings; anything not a string is `""`; a raw string or Buffer body is read with `URLSearchParams`), `validateContact(values): Partial<Record<"name" | "email" | "topic" | "details", string>>` (`{}` when valid), `contactMessage(values): { to, replyTo, subject, text }`, `contactFormHtml({ values = {}, errors = {} } = {}): string`, `renderContactPage({ values, errors, problem = "" }): string`, `renderStatusPage(heading: string, body: string, csp: string): string`, `renderContactSent(): string`, `contactHeaders(): Record<string, string>`.
- From `links/server/lib/mailer.mjs`: `CONTACT_FROM = "Resbite contact form <noreply@resbite.com>"`, `sendContactEmail(message, { fetch = globalThis.fetch, apiKey = process.env.RESEND_API_KEY } = {}): Promise<void>` (throws on a missing key, a network failure, an 8-second timeout or a non-2xx reply).
- From `links/server/lib/rate-limit.mjs`: `createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }): { take(key: string): boolean }`. A full map drops expired keys first; if still full, a new key is refused.
- From `links/server/api/contact.mjs`: `export default async function handler(req, res, deps = {})`, deps `{ send = sendContactEmail, perAddress = PER_ADDRESS, overall = OVERALL }`, with module-level `PER_ADDRESS = createRateLimiter({ limit: 5, windowMs: 3_600_000 })` and `OVERALL = createRateLimiter({ limit: 50, windowMs: 3_600_000 })`.

`CONTACT_WORDS`, exactly: `formLabel` "Contact form"; `name` "Your name"; `email` "Your email address"; `emailHint` "We reply to this address."; `topic` "What is it about?"; `topicPrompt` "Choose a topic"; `details` "Details"; `detailsHint` "Say what happened and where: the resbite’s title and date, the name the person uses, or the link you were sent. Please don’t send images."; `send` "Send message"; `errors`: `name` "Enter your name.", `nameLong` "Use a name of up to 100 characters.", `email` "Enter an email address we can reply to, like name@example.com.", `topic` "Choose what your message is about.", `details` "Tell us the details.", `detailsLong` "Keep the details under 5,000 characters."; `summary` "There is a problem"; `pageTitle` "Contact us"; `sendFailed(address)` "We couldn’t send your message. Try again, or email {address}."; `tooManyHeading` "Too many messages"; `tooManyBody` "You’ve sent several messages in a short time. Try again in an hour, or email support@resbite.com."; `refusedHeading` "Message not sent"; `refusedBody` "Send your message from our Support page."; `sentHeading` "Message sent"; `sentBody` "Thanks. Your message is with our team. We reply by email."; `sentTimes` "How quickly we respond"; `back` "Back to Support".

The rules: name trimmed, 1 to 100 characters; email trimmed, at most 254 characters, matching `^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[^\s@<>(),;:"\[\]]+$`; topic one of the values; details trimmed, 1 to 5,000 characters. `website` is the trap field. The subject is `Contact form: {label}`. The text is `Topic: {label}\nName: {name}\nEmail: {email}\n\n{details}\n\nSent with the contact form on link.resbite.com/support.\n`.

The handler, in order: not POST → 405 with `Allow: POST` and the "Message not sent" status page; an `Origin` header whose host is not `req.headers.host` (or that does not parse) → 403 with the same page; `readForm(req.body)`; trap filled → 303 to `/support/sent`, nothing sent; errors → 400 with the form, the person's words and the errors; `perAddress.take(address)` then `overall.take("all")` false → 429 with `Retry-After: 3600`; `send(contactMessage(values))` throws → 502 with the form, the words and `sendFailed(<the topic's inbox>)`; else 303 to `/support/sent`. The address is `x-real-ip`, else the first of `x-forwarded-for`, else `"unknown"`. Every response carries `contactHeaders()`: `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: FORM_CSP`, `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex, nofollow`. Nothing logs.

- [ ] **Step 1: Write the failing tests** in `links/contact.test.mjs`. Helpers: `respond()` (records `statusCode`, `headers`, `body`, as `personal.test.mjs` does), `post(body, headers)` building `{ method: "POST", headers: { host: "link.resbite.com", origin: "https://link.resbite.com", "x-real-ip": "198.51.100.7", ...headers }, body }`, and `valid = { name: "Sam", email: "sam@example.com", topic: "help", details: "The Answer button does nothing.", website: "" }`.

```js
test("the topics are the Support page's, and three go to the privacy inbox", async () => {
  const labels = CONTACT_TOPICS.map((t) => t.label);
  assert.equal(labels.length, 11);
  assert.deepEqual(CONTACT_TOPICS.filter((t) => t.inbox === "privacy").map((t) => t.value), ["data-protection", "legal-request", "delete-account"]);
  const docs = (await doc("support.md")) + (await doc("delete-account.md"));
  for (const quoted of ["An intimate image of me", "Data protection request or complaint", "Complaint", "Appeal", "Legal complaint", "Delete my web-only or banned account"]) {
    assert.ok(docs.includes(`"${quoted}"`), `the documents quote ${quoted}`);
    assert.ok(labels.some((l) => l === quoted || l.startsWith(`${quoted} (`)), `the form offers ${quoted}`);
  }
});

test("readForm keeps strings only, from a parsed or a raw body", () => {
  assert.deepEqual(readForm({ name: ["a", "b"], email: 5, topic: "help" }), { name: "", email: "", topic: "help", details: "", website: "" });
  assert.equal(readForm("name=Sam&email=sam%40example.com").email, "sam@example.com");
  assert.equal(readForm(Buffer.from("details=Hi")).details, "Hi");
});

test("validateContact: each field required and bounded; a comma list or a line break is not an address", () => {
  assert.deepEqual(validateContact(valid), {});
  assert.deepEqual(validateContact({ ...valid, name: " ", topic: "nope", details: "" }), { name: "Enter your name.", topic: "Choose what your message is about.", details: "Tell us the details." });
  assert.equal(validateContact({ ...valid, name: "x".repeat(101) }).name, "Use a name of up to 100 characters.");
  assert.equal(validateContact({ ...valid, details: "x".repeat(5001) }).details, "Keep the details under 5,000 characters.");
  for (const email of ["nope", "a@b.example,c@d.example", "sam@example.com\r\nBcc: x@example.com", "<sam@example.com>"])
    assert.equal(validateContact({ ...valid, email }).email, "Enter an email address we can reply to, like name@example.com.", email);
});

test("contactMessage: the topic's inbox, a fixed subject, the person's address as reply-to", () => {
  assert.deepEqual(contactMessage({ ...valid, topic: "delete-account" }), {
    to: "privacy@resbite.com", replyTo: "sam@example.com", subject: "Contact form: Delete my web-only or banned account",
    text: "Topic: Delete my web-only or banned account\nName: Sam\nEmail: sam@example.com\n\nThe Answer button does nothing.\n\nSent with the contact form on link.resbite.com/support.\n",
  });
  assert.equal(contactMessage(valid).to, "support@resbite.com");
});

test("sendContactEmail posts to Resend with the key and reply_to; a refusal or a missing key throws", async () => {
  const calls = [];
  const fetch = async (url, init) => (calls.push([url, init]), { ok: true, status: 200 });
  await sendContactEmail(contactMessage(valid), { fetch, apiKey: "re_fixture_only" });
  const [url, init] = calls[0];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.headers.Authorization, "Bearer re_fixture_only");
  assert.deepEqual(JSON.parse(init.body), { from: CONTACT_FROM, to: ["support@resbite.com"], reply_to: "sam@example.com", subject: "Contact form: Help with the app", text: contactMessage(valid).text });
  await assert.rejects(sendContactEmail(contactMessage(valid), { fetch: async () => ({ ok: false, status: 422 }), apiKey: "re_fixture_only" }), /422/);
  await assert.rejects(sendContactEmail(contactMessage(valid), { fetch, apiKey: "" }), /RESEND_API_KEY/);
  assert.equal(calls.length, 1);
});

test("createRateLimiter: a limit per key per window; a full map refuses new keys", () => {
  let t = 0;
  const limit = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 2, now: () => t });
  assert.deepEqual([limit.take("a"), limit.take("a"), limit.take("a"), limit.take("b"), limit.take("c")], [true, true, false, true, false]);
  t = 1000;
  assert.deepEqual([limit.take("a"), limit.take("c")], [true, true]);
});

test("the form posts to /api/contact, with labelled fields, the topics and a trap field no one reaches", () => {
  const html = contactFormHtml();
  assert.ok(html.includes('<form id="contact-form" class="contact" method="post" action="/api/contact" aria-label="Contact form">'));
  for (const id of ["contact-name", "contact-email", "contact-topic", "contact-details"]) assert.ok(html.includes(`<label for="${id}">`), id);
  assert.ok(html.includes('<option value="intimate-image">An intimate image of me</option>') && html.includes('autocomplete="email"') && html.includes('maxlength="5000"'));
  assert.match(html, /<div class="trap" aria-hidden="true">[\s\S]*<input id="contact-website" name="website" tabindex="-1" autocomplete="off"/);
  const again = contactFormHtml({ values: { ...valid, topic: "appeal" }, errors: { email: "Enter an email address we can reply to, like name@example.com." } });
  assert.ok(again.includes('<option value="appeal" selected>Appeal</option>'));
  assert.match(again, /id="contact-email"[^>]*aria-invalid="true"[^>]*aria-describedby="contact-email-hint contact-email-error"/);
});

test("a valid message goes to its inbox, then the person goes to /support/sent", async () => {
  const sent = [], res = respond();
  await handler(post({ ...valid, topic: "legal-request" }), res, { send: async (m) => sent.push(m), ...fresh() });
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "/support/sent");
  assert.equal(sent[0].to, "privacy@resbite.com");
  assert.equal(res.headers["Content-Security-Policy"], FORM_CSP);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("a message with errors comes back with them and the person's words, escaped, and nothing is sent", async () => {
  const sent = [], res = respond();
  await handler(post({ ...valid, name: "<script>x</script>", email: "nope" }), res, { send: async (m) => sent.push(m), ...fresh() });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('value="&lt;script&gt;x&lt;/script&gt;"') && !res.body.includes("<script>x"));
  assert.ok(res.body.includes('<div class="error-summary" role="alert">') && res.body.includes('<a href="#contact-email">'));
  assert.ok(res.body.includes(`<meta http-equiv="Content-Security-Policy" content="${FORM_CSP}" />`));
  assert.equal(sent.length, 0);
});

test("GET is refused, a post from another site is refused, and the trap pretends to send", async () => {
  const sent = [], send = async (m) => sent.push(m);
  const get = respond(); await handler({ method: "GET", headers: {} }, get, { send, ...fresh() });
  assert.equal(get.statusCode, 405); assert.equal(get.headers.Allow, "POST");
  const away = respond(); await handler(post(valid, { origin: "https://elsewhere.example" }), away, { send, ...fresh() });
  assert.equal(away.statusCode, 403);
  const trap = respond(); await handler(post({ ...valid, website: "https://spam.example" }), trap, { send, ...fresh() });
  assert.equal(trap.statusCode, 303);
  assert.equal(sent.length, 0);
});

test("the sixth message in an hour from one address is refused; another address still gets through", async () => {
  const sent = [], send = async (m) => sent.push(m), limits = fresh(), codes = [];
  for (let i = 0; i < 6; i++) { const res = respond(); await handler(post(valid), res, { send, ...limits }); codes.push(res.statusCode); }
  assert.deepEqual(codes, [303, 303, 303, 303, 303, 429]);
  const other = respond(); await handler(post(valid, { "x-real-ip": "198.51.100.8" }), other, { send, ...limits });
  assert.equal(other.statusCode, 303);
  assert.equal(sent.length, 6);
});

test("a failed send keeps the person's words and names the topic's inbox; nothing is logged", async () => {
  const logged = [], keep = { ...console };
  for (const k of ["log", "info", "warn", "error"]) console[k] = (...a) => logged.push(a);
  try {
    const res = respond();
    await handler(post({ ...valid, topic: "data-protection" }), res, { send: async () => { throw Error("boom"); }, ...fresh() });
    assert.equal(res.statusCode, 502);
    assert.ok(res.body.includes("We couldn’t send your message. Try again, or email privacy@resbite.com.") && res.body.includes("The Answer button does nothing."));
  } finally { Object.assign(console, keep); }
  assert.deepEqual(logged, []);
});

test("the sent page: no form, noindex, and the way back", () => {
  const html = renderContactSent();
  assert.ok(html.includes("<h1>Message sent</h1>") && html.includes('<a href="/support#how-quickly-we-respond">How quickly we respond</a>'));
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow" />') && !html.includes("<form"));
});
```

`fresh()` returns `{ perAddress: createRateLimiter({ limit: 5, windowMs: 3_600_000 }), overall: createRateLimiter({ limit: 50, windowMs: 3_600_000 }) }`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd mobile && node --test ../links/contact.test.mjs`
Expected: FAIL, "Cannot find module … contact.mjs".

- [ ] **Step 3: Implement the four modules** with the interfaces and rules above

The form: a `.field` per input with its label, the hint `<p class="hint" id="contact-email-hint">` (and `contact-details-hint`), an error `<p class="error" id="contact-<field>-error">` only when there is one, `required` and `maxlength` (100, 254, 5000) on each, the `<select>` starting with `<option value="">Choose a topic</option>`, the trap `<div class="trap" aria-hidden="true">` with a label "Leave this empty", then `<button type="submit" class="button">Send message</button>`. Values go through `escapeHtml`. `renderContactPage` is `sitePage` with `FORM_CSP`, `robots: false`, title "Contact us", body `<h1>Contact us</h1>`, the error summary (`<h2>There is a problem</h2>` and a list of links to each field) or `problem` as a paragraph, then the form. `renderStatusPage` is `sitePage` with the given `csp` and `robots: false`. Every page the handler sends uses `FORM_CSP`, the same as its header; `renderContactSent` is a status page with `PAGE_CSP` (its Vercel header, Task 6) and the three lines from the test.

- [ ] **Step 4: Run them to see them pass**

Run: `cd mobile && node --test ../links/contact.test.mjs`
Expected: PASS, 13 tests.

- [ ] **Step 5: Say in the documents what the form does** (found by their text; a change of substance for the solicitor, per `docs/legal/README.md` rule 3)

- `docs/legal/support.md`, under "### By the contact form": replace "The form on this page goes straight to our support inbox." with "The form on this page goes straight to our team. Messages about your personal data, legal requests and requests to delete an account go to our privacy inbox. Everything else goes to our support inbox."
- `docs/legal/privacy-notice.md`, section 5.2: the Resend row becomes `| Resend | Sends sign-in emails (confirmation, codes and password reset), and delivers what you send with our contact form to our inboxes | Your email address and the link or code; what you send in the contact form | United States |`. Section 7: "Sign-in emails at Resend" becomes "Sign-in emails and contact form messages at Resend" (period unchanged).
- `docs/legal/README.md`, change log: add `| 17 November 2026 | Privacy Policy; Support and contact | 1.0 (draft) | The contact form sends through Resend; data protection, legal requests and deletion go to the privacy inbox | Not published |`.
- `docs/compliance/vendors.md`: in the summary table's Resend row, "Email addresses and Auth emails" becomes "Email addresses, Auth emails and contact form messages"; in the Resend section's "Used for", replace "If D1's contact form sends through Resend, add that use here" with "The link site's contact form (`links/server/api/contact.mjs`, D1), from `noreply@resbite.com` to the support and privacy inboxes, with its own sending-only key, `RESEND_API_KEY` on Vercel".

Run: `grep -c "contact form" docs/legal/privacy-notice.md docs/compliance/vendors.md && cd mobile && node --test ../links/contact.test.mjs ../links/legal.test.mjs`
Expected: both counts above 0; PASS.

- [ ] **Step 6: Commit**

```bash
git add links/server/lib/contact.mjs links/server/lib/mailer.mjs links/server/lib/rate-limit.mjs links/server/api/contact.mjs links/contact.test.mjs mobile/package.json docs/legal/support.md docs/legal/privacy-notice.md docs/legal/README.md docs/compliance/vendors.md
git commit -m "Link site: the contact form, /api/contact through Resend, and the documents that describe it"
```

---

### Task 4: The legal pages from `docs/legal/`

**Files:**
- Create: `links/legal/pages.mjs`
- Test: `links/legal.test.mjs` (add)

**Interfaces:**
- Consumes: `markdownToHtml` (Task 1), `sitePage`, `LEGAL_LINKS`, `FORM_CSP` (Task 2), `contactFormHtml` (Task 3), `PAGE_CSP`.
- Produces, from `links/legal/pages.mjs`:
  - `LEGAL_PAGES: Array<{ route, file, source, title, csp, anchors: string[], form: boolean }>`, built from `LEGAL_LINKS`:
    - `/privacy`, `privacy.html`, `privacy-notice.md`, anchors `if-someone-invited-you-by-your-number`, `your-right-to-object`;
    - `/terms`, `terms.html`, `terms-of-use.md`, anchor `community-rules`;
    - `/support`, `support.html`, `support.md`, `FORM_CSP`, `form: true`, anchors `by-the-contact-form`, `how-quickly-we-respond`, `an-intimate-image-of-you`;
    - `/delete-account`, `delete-account.html`, `delete-account.md`, anchor `ask-us-to-delete-your-account-by-email`.
  - `DRAFT_BANNER = '<p class="draft-banner" role="note">Draft for review: these words are not in force.</p>'`
  - `publicPart(markdown: string): string`: the document without its marked notes (Global Constraints), with runs of `---` (blank lines between) collapsed to one and no `---` at the end.
  - `publishProblems(markdown: string): string[]`: of the public part, any of `"an [[OWNER: …]] placeholder"`, `"the draft status"` (`/draft for solicitor review|not yet published/i`), `"a note marked for deletion before publishing"` (`/before publishing/i`).
  - `buildLegalPages({ legalDir: string, mode: "final" | "draft" }): Promise<Array<{ route, file, csp, robots: boolean, html }>>`. In `final`, every file's problems are gathered and thrown in one `Error` whose message starts "The legal documents are not ready to publish:" and lists `<source>: <problem>` lines. A required anchor missing from a page throws `<source> has no "#<anchor>"`. `/support` gets `contactFormHtml()` after "by-the-contact-form". Draft pages carry `DRAFT_BANNER` and `robots: false`.

- [ ] **Step 1: Write the failing tests** (add to `links/legal.test.mjs`). Helpers: `finish = (md) => md.replace(/\[\[OWNER:[^\]]*\]\]/g, "Example").replace(" — draft for solicitor review, not yet published", "")`, and `legalCopy(edit)` copying the four real sources into a fresh `mkdtemp` folder through `edit(name, text)`.

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd mobile && node --test ../links/legal.test.mjs`
Expected: FAIL on the new tests, "Cannot find module … legal/pages.mjs".

- [ ] **Step 3: Implement `links/legal/pages.mjs`** with the interfaces above. `publicPart` works on lines: an H2 that matches starts a skip that ends at the next H2; a quote block that matches is skipped whole.

- [ ] **Step 4: Run them to see them pass**

Run: `cd mobile && node --test ../links/legal.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add links/legal/pages.mjs links/legal.test.mjs
git commit -m "Link site: the Privacy Policy, Terms of Use, Support and Delete your account pages from docs/legal"
```

---

### Task 5: The footer on the invitation pages, and the page options

**Files:**
- Create: `links/server/lib/legal-mode.mjs` (`/** Written by generate.mjs for each build: "final", "draft" or "off". This copy is the tests'. */ export const LEGAL_MODE = "final";`)
- Modify: `links/server/lib/options.mjs:4-19`, `links/server/lib/render.mjs:116-123` (renderClosedPage's stylesheet and body end), `links/server/lib/personal.mjs:124-130` (documentHtml's head and body end) and `:148-161` (stepsBody's `attrs`)
- Test: `links/page.test.mjs:166-196` (update), `links/personal.test.mjs` (add)

**Interfaces:**
- Consumes: `siteFooter` (Task 2).
- Produces: `TERMS_VERSION_FALLBACK` (L7) and `pageOptions(code, env = process.env, mode = LEGAL_MODE)`, which returns today's keys plus `legal: boolean` (`mode !== "off"`); `termsUrl` is `env.TERMS_URL`, else `${origin}/terms` when `legal`, else `""` (same for `privacyUrl` and `/privacy`); `termsVersion` is `env.TERMS_VERSION` only when it matches `^\d{4}-(0[1-9]|1[0-2])$`, else `TERMS_VERSION_FALLBACK`. The three renderers add `<link rel="stylesheet" href="/site.css" />` after their last stylesheet and, when `options.legal`, `siteFooter()` right after `</main>` (before any script). `stepsBody` adds `notice: "on"` to its data attributes when `options.legal`.

- [ ] **Step 1: Write the failing tests**

In `links/page.test.mjs`, the defaults test (`:166-196`) expects `legal: true`, `termsUrl: "https://link.resbite.com/terms"`, `privacyUrl: "https://link.resbite.com/privacy"` and `termsVersion: TERMS_VERSION_FALLBACK` (imported, in place of the literal) for `pageOptions("not-a-code", {})`, and `legal: true` in the env case. Add:

```js
test("off mode: no legal links by default; a malformed Terms version falls back", () => {
  const off = pageOptions(code, {}, "off");
  assert.deepEqual([off.legal, off.termsUrl, off.privacyUrl], [false, "", ""]);
  assert.match(TERMS_VERSION_FALLBACK, /^\d{4}-(0[1-9]|1[0-2])$/);
  for (const bad of ["1.0", "2026-13", "2026-1", " 2027-01"]) assert.equal(pageOptions(code, { TERMS_VERSION: bad }).termsVersion, TERMS_VERSION_FALLBACK, bad);
  assert.equal(pageOptions(code, { TERMS_VERSION: "2027-01" }).termsVersion, "2027-01");
});

test("closed pages carry the footer after main when the legal pages are live, and none otherwise", () => {
  const html = renderClosedPage({ state: "inactive" }, { ...options, legal: true });
  assert.ok(html.indexOf("</main>") < html.indexOf('<footer class="site-footer">') && html.indexOf('<footer class="site-footer">') < html.indexOf('<script src="/page.js">'));
  assert.ok(html.includes('<link rel="stylesheet" href="/site.css" />') && html.includes(`content="${PAGE_CSP}"`) && !html.includes("data-"));
  assert.ok(!renderClosedPage({ state: "inactive" }, options).includes("site-footer"));
});
```

In `links/personal.test.mjs`, add:

```js
test("the personal and open pages carry the footer and data-notice when the legal pages are live", () => {
  for (const html of [renderPersonalPage(open, { ...options, legal: true }), renderOpenLinkPage(open, { ...options, legal: true, appStoreId: "" })]) {
    assert.ok(html.match(/<main [^>]*>/)[0].includes('data-notice="on"'));
    assert.ok(html.indexOf("</main>") < html.indexOf('<footer class="site-footer">') && html.indexOf("<footer") < html.indexOf('src="/personal.js"'));
  }
  const closed = renderPersonalPage({ state: "inactive" }, { ...options, legal: true });
  assert.ok(closed.includes('<footer class="site-footer">') && !closed.includes("data-notice"));
  assert.ok(!renderPersonalPage(open, options).includes("data-notice") && !renderPersonalPage(open, options).includes("site-footer"));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd mobile && node --test ../links/page.test.mjs ../links/personal.test.mjs`
Expected: FAIL on the options test (no `legal`) and the three new tests.

- [ ] **Step 3: Implement** the `legal-mode.mjs` module, the options and the renderer changes above.

- [ ] **Step 4: Run them to see them pass**

Run: `cd mobile && node --test ../links/page.test.mjs ../links/personal.test.mjs`
Expected: PASS, every test in both files.

- [ ] **Step 5: Commit**

```bash
git add links/server/lib/legal-mode.mjs links/server/lib/options.mjs links/server/lib/render.mjs links/server/lib/personal.mjs links/page.test.mjs links/personal.test.mjs
git commit -m "Link site: the footer on /r/ and /i/, legal links by default, a checked Terms version"
```

---

### Task 6: The build: modes, routes, headers, region and `/invite`

**Files:**
- Modify: `links/generate.mjs:18-31` (signature, checks), `:55-57` (`/invite`), `:61-64` (copies), `:72-103` (`vercel.json`), `:104-107` (hosting notes), `:115-121` (CLI)
- Modify: `links/assets/invite.html:19` (add `/site.css`), `:28-31` (the note), `:33` (`{{FOOTER}}` after `</main>`)
- Modify: `links/verify-personal.mjs:102`, `links/verify-open-link.mjs:96` (pass `{ legal: "draft" }`)
- Test: `links/generate.test.mjs:10-14` (`site()`), `:57-73`, `:80-107`, and new tests

**Interfaces:**
- Consumes: `buildLegalPages`, `LEGAL_PAGES` (Task 4), `renderContactSent` (Task 3), `siteFooter`, `FORM_CSP` (Task 2), `LEGAL_MODE` module (Task 5).
- Produces: `generate(originValue, teamId, bundleId, output, { legal = "final", legalDir = resolve(source, "../docs/legal") } = {}): Promise<string>`; the CLI takes `--legal=final|draft|off` anywhere after the script name. An unknown mode is the Usage error.

What the build does, by mode:

| | `final` | `draft` | `off` |
|---|---|---|---|
| `buildLegalPages` | run first, before anything is written; its error is rethrown with "Build with --legal=draft for a preview, or --legal=off to leave the legal pages out." appended | run first | not run |
| `privacy.html`, `terms.html`, `support.html`, `delete-account.html`, `support-sent.html`, `legal.css` | written | written | not written |
| `api/contact.mjs` | copied | copied | not copied |
| `lib/legal-mode.mjs` | written: `export const LEGAL_MODE = "<mode>";\n` (the lib copy loop skips the source copy) | same | same |
| `site.css` | written | written | written |
| `/invite` | `{{FOOTER}}` is `siteFooter()` | same | `""` |
| `regions` | `["lhr1"]` | same | same |

The routes and headers (final and draft) are added after today's:
- rewrites `{ source: route, destination: "/" + file }` for the four pages, then `{ source: "/support/sent", destination: "/support-sent.html" }`;
- headers for each route and its `.html` path: `Content-Security-Policy` (the page's `csp`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=300`, and `X-Robots-Tag: noindex, nofollow` when `robots` is false (all draft pages, and `/support/sent` and `/support-sent.html` always, with `PAGE_CSP`).

`/invite`'s note becomes: "If you don’t have Resbite yet, ask the person who invited you. This page doesn’t claim your invitation, so keep the original message private." In the hosting notes, "TERMS_VERSION (default …)" takes its value from `TERMS_VERSION_FALLBACK` (Task 5) instead of a literal, so plan 4's value (its Task 5 edits that literal today) appears in one place only. The hosting notes add, one line each: "Legal pages: <mode>.", "Functions run in London (lhr1).", "The contact form (/api/contact) needs RESEND_API_KEY, a sending-only Resend key; without it the form tells people to email us.", "Add per-address rate limits in the Vercel firewall for /r/*, /i/* and POST /api/contact.", and, in draft, "DRAFT BUILD: deploy to a protected preview only, never to production."

- [ ] **Step 1: Write the failing tests** in `links/generate.test.mjs`. `site(options = { legal: "draft" })` passes its options to `generate`. The rewrites `deepEqual` (`:88-94`) gains the five new rewrites. The no-key list (`:102`) adds `api/contact.mjs`, `lib/contact.mjs`, `lib/mailer.mjs`, `lib/rate-limit.mjs`, `lib/site.mjs`, and each file is also checked against `/re_[A-Za-z0-9]{8,}/`. New tests:

```js
test("a final build refuses unfinished documents before writing anything, and says how to build anyway", async () => {
  const dir = await mkdtemp(join(tmpdir(), "resbite-links-"));
  try {
    await assert.rejects(generate("https://link.resbite.com", "ABCDE12345", "com.resbite.app", join(dir, "out")), (e) =>
      /not ready to publish/.test(e.message) && e.message.includes("--legal=draft") && e.message.includes("--legal=off"));
    await assert.rejects(readdir(join(dir, "out")), /ENOENT/);
    await assert.rejects(generate("https://link.resbite.com", "ABCDE12345", "com.resbite.app", join(dir, "x"), { legal: "maybe" }), /Usage/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the draft build has the four pages, the sent page, their routes and headers, in London", async () => {
  const { out, cleanup } = await site();
  try {
    const vercel = JSON.parse(await readFile(join(out, "vercel.json"), "utf8"));
    const headers = (source) => Object.fromEntries(vercel.headers.find((h) => h.source === source).headers.map((h) => [h.key, h.value]));
    assert.deepEqual(vercel.regions, ["lhr1"]);
    for (const [route, file] of [["/privacy", "privacy.html"], ["/terms", "terms.html"], ["/support", "support.html"], ["/delete-account", "delete-account.html"]]) {
      assert.ok(vercel.rewrites.some((r) => r.source === route && r.destination === `/${file}`), route);
      for (const source of [route, `/${file}`]) {
        assert.equal(headers(source)["Content-Security-Policy"], route === "/support" ? FORM_CSP : PAGE_CSP, source);
        assert.equal(headers(source)["X-Robots-Tag"], "noindex, nofollow", source);
        assert.equal(headers(source)["Referrer-Policy"], "no-referrer", source);
      }
      assert.ok((await readFile(join(out, file), "utf8")).includes("draft-banner"), file);
    }
    assert.equal(headers("/support/sent")["X-Robots-Tag"], "noindex, nofollow");
    assert.equal(await readFile(join(out, "lib/legal-mode.mjs"), "utf8"), 'export const LEGAL_MODE = "draft";\n');
    for (const name of ["api/contact.mjs", "support-sent.html", "site.css", "legal.css"]) assert.ok((await readFile(join(out, name))).length > 0, name);
    assert.match(await readFile(join(out, "hosting-requirements.txt"), "utf8"), /RESEND_API_KEY[\s\S]*lhr1|lhr1[\s\S]*RESEND_API_KEY/);
  } finally { await cleanup(); }
});

test("off leaves out everything that depends on the documents", async () => {
  const { out, cleanup } = await site({ legal: "off" });
  try {
    for (const name of ["privacy.html", "support-sent.html", "api/contact.mjs", "legal.css"]) await assert.rejects(readFile(join(out, name)), /ENOENT/, name);
    const vercel = JSON.parse(await readFile(join(out, "vercel.json"), "utf8"));
    assert.ok(!vercel.rewrites.some((r) => r.source === "/privacy") && vercel.regions[0] === "lhr1");
    assert.ok(!(await readFile(join(out, "invite.html"), "utf8")).includes("site-footer"));
    const personal = (await import(pathToFileURL(join(out, "api", "personal.mjs")).href)).default;
    const res = respond();
    await personal({ query: { code: "nope" } }, res, {});
    assert.ok(res.body.includes("This invitation is no longer active.") && !res.body.includes("Resbite Ltd"));
  } finally { await cleanup(); }
});

test("/invite: neutral words, the shared styles, and the footer", async () => {
  const { out, cleanup } = await site();
  try {
    const page = await readFile(join(out, "invite.html"), "utf8");
    assert.ok(!/private testing|beta|tester/i.test(page) && !page.includes("{{"));
    assert.ok(page.includes("If you don’t have Resbite yet, ask the person who invited you."));
    assert.ok(page.includes('<link rel="stylesheet" href="/site.css" />') && page.indexOf("</main>") < page.indexOf('<footer class="site-footer">'));
  } finally { await cleanup(); }
});
```

`respond()` is the same small recorder as `personal.test.mjs`'s; import `PAGE_CSP` from `./server/lib/render.mjs`, `FORM_CSP` from `./server/lib/site.mjs`, `readdir` and `pathToFileURL`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd mobile && node --import tsx ../links/generate.test.mjs`
Expected: FAIL: the new tests, and today's tests once `site()` passes an option `generate` does not read yet (no legal pages in the rewrites).

- [ ] **Step 3: Implement the build** as the table and lists above say, and the two `invite.html` edits. The CLI reads the flag from `process.argv`, passes the rest as today's four positional values, and prints, after a draft build, "Draft build: deploy it to a protected preview only."

- [ ] **Step 4: Run the link tests**

Run: `cd mobile && node --import tsx ../links/generate.test.mjs && node --test ../links/page.test.mjs ../links/personal.test.mjs ../links/legal.test.mjs ../links/contact.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run the two headless checks** (they now build drafts)

Run: `cd mobile && node --import tsx ../links/verify-personal.mjs && node --import tsx ../links/verify-open-link.mjs`
Expected: each prints its `PASS:` line.

- [ ] **Step 6: Commit**

```bash
git add links/generate.mjs links/assets/invite.html links/generate.test.mjs links/verify-personal.mjs links/verify-open-link.mjs
git commit -m "Link site: build modes, the legal routes and headers, functions in London, neutral /invite"
```

---

### Task 7: The notice beside the number field

**Before this task:** plan 4's Task 5 has merged: it changed the app's tick and, in the same commit, the web's `PAGE_COPY.tick` and `.terms` and the verify scripts' `COPY.tick` (`grep -c "I accept the Terms of Use" mobile/src/domain/guestAccount.ts links/assets/personal-flow.mjs` prints 1 for each). If not, stop and ask the controller: the parity test at `links/personal-flow.test.mjs:161-162` ties the two.

**Files:**
- Modify: `links/assets/personal-flow.mjs` (`PAGE_COPY.tick` and `.terms` stay as plan 4 set them; four entries added at the end of `PAGE_COPY`, and `INVITEE_ANCHOR`, `linkedParts`, `numberNotice` after it)
- Modify: `links/assets/personal.js:10-38` (imports), `:106-110` (the terms line through `linkedParts`), `:142-153` (the notice in the confirm form)
- Modify: `links/assets/personal.css` (append after `:102`)
- Test: `links/personal-flow.test.mjs` (imports `:7-44`, new tests)
- Modify: `links/verify-personal.mjs` (`COPY.tick` `:43`, env `:92-100`, the Terms link `:344`, after the tick step, the PASS line `:689`), `links/verify-open-link.mjs` (`COPY.tick` `:39`, env `:85-94`, after the tick near `:411`, the PASS line `:763`)

**Interfaces:**
- Consumes: `data-notice="on"` on `<main>` (Task 5); `LEGAL_PAGES` anchors (Task 4).
- Produces, from `links/assets/personal-flow.mjs`:
  - consumed, not changed: `PAGE_COPY.tick` "I’m 18 or over and I accept the Terms of Use." and `PAGE_COPY.terms` "Read the Terms of Use. Our Privacy Policy explains how we use your data." (set by plan 4's Task 5, L9)
  - `PAGE_COPY.personalNotice(who)`: "{who} gave Resbite Ltd this number to invite you. We use it to text you a code. Confirming it creates a Resbite account with your number, name and answer; other guests never see your number. Unanswered, the number is deleted within 30 days after the resbite ends. Privacy Policy"
  - `PAGE_COPY.openNotice(host)`: "Resbite Ltd uses your number to text you a code and send your request to {host}. Confirming it creates a Resbite account with your number, name and answer; other guests never see your number. It stays until you ask us to delete it at privacy@resbite.com. Privacy Policy"
  - `PAGE_COPY.objectionLabel`: "Right to object:"; `PAGE_COPY.objection`: "tell us at any time to stop using your number. Email privacy@resbite.com and we’ll delete it and stop anyone inviting you by number."
  - `INVITEE_ANCHOR = "if-someone-invited-you-by-your-number"`
  - `linkedParts(text: string, links: Record<string, string>): Array<{ text: string; href: string }>`: the text split on the phrases, longest first, `href` `""` for plain text and for a phrase whose link is `""`; never an empty part.
  - `numberNotice({ open: boolean, who: string, privacyUrl: string }): { notice: Part[]; objection: Part[] | null }`, `Part = { text, href, strong? }`, where `strong: true` appears only on the objection's label. The notice links "Privacy Policy" to `privacyUrl` (plus `#` + `INVITEE_ANCHOR` when not open) and "privacy@resbite.com" to `mailto:privacy@resbite.com`. The objection is `null` when open, else `{ text: "Right to object:", href: "", strong: true }`, `{ text: " ", href: "" }` and the parts of `objection`.

`personal.js`: when `data.notice === "on"`, the confirm form gets, after `confirmError` and before `sendButton`, `<div class="number-notice">` holding `<p id="number-notice" class="privacy-note">` (the notice) and, on `/i/`, `<p class="privacy-note objection">` (the objection, the label in `<strong>`). `who` is `inviter` on `/i/` and `host` on `/r/` (L8); `privacyUrl` is the `httpsUrl`-checked one at `:85`. `#number`'s `aria-describedby` becomes `confirm-error number-notice` when the notice is there. An `https:` part is a link with `target="_blank" rel="noopener noreferrer"`, a `mailto:` part a plain link. The tick's `<label>` stays `C.tick` as plain text (L9). `#terms-line` is drawn from `linkedParts(C.terms, { "Terms of Use": termsUrl, Terms: termsUrl, "Privacy Policy": privacyUrl })`, replacing the split at `:107-110`. `personal.css`: `.number-notice` a column with 10px gaps; `.privacy-note` 15px, muted, `margin: 0`, `overflow-wrap: anywhere`; `.objection` with `padding-top: 10px` and a 1px `var(--line)` top border; links in `var(--aqua-dark)`.

- [ ] **Step 1: Write the failing tests** in `links/personal-flow.test.mjs`:

```js
const noticeDoc = readFileSync(new URL("../docs/legal/invitee-notice-short.md", import.meta.url), "utf8");
/** The quoted line after `label` in the section headed `heading`. */
const quotedAfter = (heading, label) => {
  const section = noticeDoc.slice(noticeDoc.indexOf(heading));
  return section.slice(section.indexOf(label)).match(/^> (.+)$/m)[1];
};
const plain = (md) => md.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").replace(/'/g, "’");
const linkOf = (md) => md.match(/\]\(([^)]+)\)/)[1];
const words = (parts) => parts.map((p) => p.text).join("");

test("the notice and the right to object are the published words, exactly", () => {
  const personal = quotedAfter("## Personal invitation page", "**Notice**");
  const object = quotedAfter("## Personal invitation page", "**Right to object**");
  const event = quotedAfter("## Event link page", "**Notice**");
  assert.equal(PAGE_COPY.personalNotice("Marcos"), plain(personal).replace("{host}", "Marcos"));
  assert.equal(`${PAGE_COPY.objectionLabel} ${PAGE_COPY.objection}`, plain(object));
  assert.equal(PAGE_COPY.openNotice("Marcos"), plain(event).replace("{host}", "Marcos"));
  const mine = numberNotice({ open: false, who: "Marcos", privacyUrl: "https://link.resbite.com/privacy" });
  assert.equal(mine.notice.at(-1).href, linkOf(personal));
  assert.equal(numberNotice({ open: true, who: "Marcos", privacyUrl: "https://link.resbite.com/privacy" }).notice.at(-1).href, linkOf(event));
});

test("numberNotice: the open link has no objection; the objection's label is strong; mail links; no URL, no link", () => {
  const personal = numberNotice({ open: false, who: "Pedro", privacyUrl: "https://link.resbite.com/privacy" });
  assert.equal(words(personal.notice), PAGE_COPY.personalNotice("Pedro"));
  assert.deepEqual(personal.objection[0], { text: "Right to object:", href: "", strong: true });
  assert.ok(personal.objection.some((p) => p.href === "mailto:privacy@resbite.com"));
  const open = numberNotice({ open: true, who: "Marcos", privacyUrl: "" });
  assert.equal(open.objection, null);
  assert.ok(open.notice.some((p) => p.text === "privacy@resbite.com" && p.href === "mailto:privacy@resbite.com"));
  assert.deepEqual(open.notice.at(-1), { text: "Privacy Policy", href: "" });
});

test("linkedParts links whole phrases, longest first", () => {
  const links = { "Terms of Use": "https://t", Terms: "https://t", "Privacy Policy": "https://p" };
  assert.deepEqual(linkedParts("I agree to the Terms and Privacy Policy.", links), [
    { text: "I agree to the ", href: "" }, { text: "Terms", href: "https://t" }, { text: " and ", href: "" },
    { text: "Privacy Policy", href: "https://p" }, { text: ".", href: "" }]);
  assert.deepEqual(linkedParts("I’m 18 or over and I accept the Terms of Use.", links)[1], { text: "Terms of Use", href: "https://t" });
  assert.deepEqual(linkedParts("I’m 18 or over", links), [{ text: "I’m 18 or over", href: "" }]);
});

test("the notice's anchor is one the Privacy Policy page must have", () => {
  assert.ok(LEGAL_PAGES.find((p) => p.route === "/privacy").anchors.includes(INVITEE_ANCHOR));
});
```

Import `readFileSync` from `node:fs`, `LEGAL_PAGES` from `./legal/pages.mjs`, and the three new exports.

- [ ] **Step 2: Run them to see them fail**

Run: `cd mobile && node --import tsx ../links/personal-flow.test.mjs`
Expected: FAIL, `numberNotice` / `linkedParts` / `INVITEE_ANCHOR` not exported.

- [ ] **Step 3: Implement** the copy, the three exports, the `personal.js` drawing and the styles above.

- [ ] **Step 4: Run them to see them pass**

Run: `cd mobile && node --import tsx ../links/personal-flow.test.mjs`
Expected: PASS, every test in the file, the parity test at `:161-162` unchanged and passing with the new words.

- [ ] **Step 5: Extend the headless checks**

Both scripts take `COPY.tick` from `PAGE_COPY.tick` (replacing the literal plan 4 wrote with the import, the same sentence), and set `PRIVACY_URL: "https://link.resbite.com/privacy"` (the local origin is `http:`, which `personal.js` never links). `verify-personal.mjs:344` looks for the link named "Terms of Use". After the tick is checked:
- `verify-personal.mjs`: `#number-notice` has the text of `numberNotice({ open: false, who: "Marcos", privacyUrl })`; its "Privacy Policy" link's `href` is `https://link.resbite.com/privacy#if-someone-invited-you-by-your-number`; `.objection` is a separate visible paragraph whose `strong` reads "Right to object:"; the notice's top is below `#number`'s bottom and its bottom above the Send code button's top; at 390 and 320 px `document.documentElement.scrollWidth <= innerWidth`; the "Legal" navigation has the four links. On the guest's link (`GUEST_LINK`) the notice names Pedro.
- `verify-open-link.mjs`: `#number-notice` has the open text naming Marcos; its link is `https://link.resbite.com/privacy`; `page.getByText("Right to object:")` has count 0; the footer's navigation is there.
- Each PASS line gains "; the invitee notice beside the number (and, on /i/, the right to object on its own line); the footer".

Run: `cd mobile && node --import tsx ../links/verify-personal.mjs && node --import tsx ../links/verify-open-link.mjs`
Expected: both PASS lines.

- [ ] **Step 6: Commit**

```bash
git add links/assets/personal-flow.mjs links/assets/personal.js links/assets/personal.css links/personal-flow.test.mjs links/verify-personal.mjs links/verify-open-link.mjs
git commit -m "Link site: the invitee notice and the right to object beside the number field"
```

---

### Task 8: The legal pages in a browser, and the live check

**Files:**
- Create: `links/check-live.mjs`, `links/verify-legal.mjs`
- Test: `links/legal.test.mjs` (add one test)

**Interfaces:**
- Consumes: `LEGAL_PAGES` (Task 4), `COMPANY`, `FORM_CSP` (Task 2), `PAGE_CSP`, `generate` (Task 6), the generated `api/contact.mjs`, `api/personal.mjs`, `api/page.mjs`.
- Produces: `checkSite(origin: string, fetchImpl = fetch): Promise<string[]>` from `links/check-live.mjs`, each failure as `"<path>: <what>"`, `[]` when all pass. Run as `node links/check-live.mjs https://link.resbite.com`, it prints `PASS: …` and the `x-vercel-id` of the `/i/` reply (for the region record), or the failures and exits 1.

`checkSite` asks, with GET only and no redirects followed:
- each `LEGAL_PAGES` route: 200, `text/html`, the CSP header equal to the page's `csp`, `nosniff`, the footer's particulars sentence, each required anchor's `id="…"`, and none of `[[OWNER:`, `draft for solicitor review`, `before publishing`, `<script`; `/support` has `action="/api/contact"`;
- `/support/sent`: 200 with `X-Robots-Tag` containing `noindex`; `/api/contact`: 405;
- `/invite`: 200, the footer, not "private testing";
- `/i/AAAAAAAAAAAAAAAAAAAAAA` and `/r/AAAAAAAAAAAAAAAAAAAAAA`: 200, "This invitation is no longer active.", the footer, a CSP with `default-src 'none'` and `script-src 'self'`;
- `/.well-known/apple-app-site-association`: `application/json`, paths `["/invite", "/r/*"]`.

`verify-legal.mjs` (style of `verify-personal.mjs:1-20`): build a `final` site from finished copies of `docs/legal/` (its own copy of Task 4's two `finish` replacements, written to a `mkdtemp` folder and passed as `legalDir`), serve it on `RESBITE_LEGAL_PORT` (default 5181) with the generated `vercel.json`'s rewrites and headers, `/api/contact` with a stub `send` that records messages, and `/i/` and `/r/` through the generated functions with readers that answer `{ state: "inactive" }`. Then, in headless Chrome at 390 and 320 px:
1. each legal page loads with no console error (a CSP violation is one) and `scrollWidth <= innerWidth`; `/terms#community-rules` puts that heading in view;
2. the form: Tab from the name field reaches email, topic, details and Send, never `#contact-website`; a filled form with "Delete my web-only or banned account" lands on `/support/sent` with "Message sent", and the stub holds one message to `privacy@resbite.com` with the typed reply-to;
3. with `form.noValidate = true` and the email "nope", the reply shows the error summary, `#contact-email` has `aria-invalid="true"` and the name typed is still in its field;
4. `checkSite` against the local origin returns `[]`.
It prints one `PASS:` line naming these checks.

- [ ] **Step 1: Write the failing test** (add to `links/legal.test.mjs`)

```js
test("checkSite reports every failing path", async () => {
  const failures = await checkSite("https://link.example", async () => new Response("nope", { status: 404 }));
  for (const path of ["/privacy", "/terms", "/support", "/delete-account", "/support/sent", "/api/contact", "/invite"])
    assert.ok(failures.some((f) => f.startsWith(`${path}: `)), path);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd mobile && node --test ../links/legal.test.mjs`
Expected: FAIL, "Cannot find module … check-live.mjs".

- [ ] **Step 3: Implement `links/check-live.mjs` and `links/verify-legal.mjs`** as above.

- [ ] **Step 4: Run the test and the browser check**

Run: `cd mobile && node --test ../links/legal.test.mjs && node --import tsx ../links/verify-legal.mjs`
Expected: PASS (9 tests), then the `PASS:` line.

- [ ] **Step 5: Commit**

```bash
git add links/check-live.mjs links/verify-legal.mjs links/legal.test.mjs
git commit -m "Link site: a browser check of the legal pages and the form, and a read-only live check"
```

---

### Task 9: The rollout record, and the whole suite

**Files:**
- Create: `qa/link-site-legal-2026-11-17/README.md`
- Modify (found by text): `docs/legal/README.md` (rule 2), `qa/app-store-release/README.md` (under "### Step 16. Legal pages, footer and notices")

- [ ] **Step 1: Write the record.** `qa/link-site-legal-2026-11-17/README.md` holds: the branch and the commit of Task 8; what ships (D1, D2, D3, D7, D9, the form); the build modes and the rule that only `final` goes to production; the Rollout steps R0 to R10 below as unticked checkboxes, each marked **[approval: Vercel]** or **[approval: Resend]** where it is; the variables by name with "set / unset" columns (`RESEND_API_KEY`, `TERMS_URL`, `PRIVACY_URL`, `TERMS_VERSION`, and `APP_STORE_URL`'s current value, which D4 asks to record); the rollback; and an empty "Applied" section. No secret, no real number, no account id beyond those the earlier `qa/` records already name.

- [ ] **Step 2: Point the documents and the release runbook at it.** `docs/legal/README.md`, rule 2: replace "Then change the link site's page so it carries exactly the same text and version, in the same commit where you can." with "The link site renders its pages from these files when it is built (`links/generate.mjs`), so the next approved deploy publishes the change. A build for production refuses a file that still has a placeholder or its draft status." `qa/app-store-release/README.md`, step 16: add a first item "Runbook: `qa/link-site-legal-2026-11-17/README.md`."

- [ ] **Step 3: Run everything**

Run: `cd mobile && npm test && npm run typecheck && node --import tsx ../links/verify-personal.mjs && node --import tsx ../links/verify-open-link.mjs && node --import tsx ../links/verify-legal.mjs`
Expected: every test passes (the known Linux-only failure in `src/services/nativeImports.test.ts`, if it is still there, is not this plan's), no type errors, three `PASS:` lines.

- [ ] **Step 4: Commit and push**

```bash
git add qa/link-site-legal-2026-11-17/README.md docs/legal/README.md qa/app-store-release/README.md
git commit -m "Link site legal pages: the rollout record"
git push -u origin HEAD   # the plan's branch, or app-store-readiness
```

---

## Rollout (owner-run)

Spec phase 4, step 16. Each step marked **[approval]** needs the owner's explicit yes at the time; record each in `qa/link-site-legal-2026-11-17/README.md`. The commands are the ones the earlier link-site runbooks used (`qa/circles-of-trust-2026-11-10/README.md`, step 5).

**Until this rollout, any other deploy of the link site uses `--legal=off`** (the SMS sitting's D6 deploy in phase 3 among them). Without the flag, generate refuses.

- **R0. Ready to publish (no approval: repository work, after the owner's answers).**
  - The solicitor has reviewed the four documents and the notice (AS-D7), and the owner has filled every placeholder in `docs/legal/`: effective date, VAT line, vendors, Vercel region and plan. Commit them.
  - The inboxes exist and are read every working day (F1), so the footer never names an address nobody reads.
  - What the notice promises is live: invitees' numbers deleted 30 days after the resbite ends and the do-not-invite list (C3, D-23), and real text-message codes (C1, D6). Otherwise the deploy waits.
  - The Terms version is final in the repository: the owner's value (`docs/legal/README.md`, placeholder 2) is in the app's `TERMS_VERSION` and in `TERMS_VERSION_FALLBACK` (`links/server/lib/options.mjs`), as plan 4's open point "`TERMS_VERSION` value" sets it, in one commit.
  - Optional, before the review ends: a draft build on a protected preview for the solicitor, `--legal=draft` in R3 and R4 only. Never `--prod` with a draft.
- **R1. [approval: Resend]** Create a sending-only API key named `resbite-link-contact`, limited to the `resbite.com` domain. It goes straight into R2; it is never written down.
- **R2. [approval: Vercel]** On the `resbite-link` project (scope `creamos`), set: `RESEND_API_KEY` (Sensitive; Production and Preview), `TERMS_URL=https://link.resbite.com/terms`, `PRIVACY_URL=https://link.resbite.com/privacy`, `TERMS_VERSION=<the R0 value>` (the app's build must send the same value, `docs/legal/README.md` "Extra steps for the Terms of Use"). Record each name as set, and `APP_STORE_URL`'s current value (D4). `APP_STORE_URL` and `APP_STORE_ID` change only after the Manual release (spec step 27).
- **R3. Build** from the repository root, at the pushed head:
  `node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs https://link.resbite.com QY833VTUWL com.resbite.app /tmp/resbite-link --legal=final`
  It must print the success line; a refusal names the files still unfinished (back to R0).
- **R4. [approval: Vercel] Preview.** From `/tmp/resbite-link`: `npx vercel link --yes --project resbite-link --scope creamos`, delete the `.env.local` it writes, note the newest Production row of `npx vercel ls --scope creamos` (the rollback target), then `npx vercel deploy --yes --scope creamos`. Previews sit behind deployment protection, so check with `npx vercel curl /privacy --deployment <preview> -- -sI` (200, `text/html`, the CSP), and the same for `/support`, `/personal.js` and `/site.css`.
- **R5. [approval: Vercel] Production.** `npx vercel deploy --prod --yes --scope creamos`.
- **R6. Live check.** `node links/check-live.mjs https://link.resbite.com` prints `PASS`. Record the `x-vercel-id` it prints: the function region in it should be `lhr1`.
- **R7. The form, live.** Send one message with "Help with the app" and one with "Data protection request or complaint", each from an address the owner reads. The first arrives at support@, the second at privacy@, and Reply goes to the sender. Delete both after.
- **R8. [approval: Vercel] Firewall.** A rate limit on `/i/*` with the same values as the existing `/r/*` rule (D5; skip if the SMS sitting added it), and one on POST `/api/contact` (proposed: 10 requests per 10 minutes per IP, then deny). Record the values.
- **R9. Region and plan (D7).** In the deployment summary, confirm the functions run in London (`lhr1`). Record the Vercel plan and its log period, for the placeholders in `docs/legal/privacy-notice.md` and `docs/compliance/vendors.md`.
- **R10. Records.** In `docs/legal/README.md`'s change log, the published commit for each document. Tick step 16 in `qa/app-store-release/README.md`. Fill "Applied" in the `qa/` record.

**After R6,** `/terms` carries Terms of Use 1.0, which plan 4's rollout step 7 (publishing the Terms version) waits for. The literal it publishes equals R2's `TERMS_VERSION`.

**Rollback.** `npx vercel rollback <the R4 deployment id> --scope creamos`. The variables can stay: the earlier build ignores `RESEND_API_KEY`, and the earlier pages read `TERMS_URL`, `PRIVACY_URL` and `TERMS_VERSION` as before.

## Self-review (17 November 2026)

- **Spec coverage.** D1 (pages, form, anchors): Tasks 1, 3, 4, 6. D2 (footer on `/r/`, `/i/`, `/invite`, the legal pages): Tasks 2, 5, 6. D3 (notice, the separate right to object on `/i/`, the tick still pointing at the current Terms): Tasks 5, 7, L9. D4: R2 and L7. D5: R8. D7: Task 6 and R9. D9: Task 6. DOC-3's second means of contact: the form (Task 3). WEB-5 (deletion route for web-only accounts): the "Delete my web-only or banned account" topic and `/delete-account`. DOC-7 (emails) is not this plan's (C13, F1). D6, D8 (later work), D10 (CAPTCHA) are other plans'.
- **Names.** `LEGAL_LINKS`, `LEGAL_PAGES`, `FORM_CSP`, `siteFooter`, `sitePage`, `contactFormHtml`, `renderContactSent`, `buildLegalPages`, `LEGAL_MODE`, `numberNotice`, `linkedParts`, `INVITEE_ANCHOR` and `checkSite` are each defined once and used as defined.
- **Review Focus.** Each of the five has its test in the task named beside it.
