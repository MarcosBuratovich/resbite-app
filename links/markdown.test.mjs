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
