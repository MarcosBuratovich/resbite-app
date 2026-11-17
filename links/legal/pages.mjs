// The four legal pages, rendered at build time from docs/legal/*.md. The only text left out is what the documents
// mark for deletion before publishing. A final build refuses anything unfinished.
import { readFile } from "node:fs/promises";
import { markdownToHtml } from "./markdown.mjs";
import { FORM_CSP, LEGAL_LINKS, sitePage } from "../server/lib/site.mjs";
import { PAGE_CSP } from "../server/lib/render.mjs";
import { contactFormHtml } from "../server/lib/contact.mjs";

export const DRAFT_BANNER = '<p class="draft-banner" role="note">Draft for review: these words are not in force.</p>';

const SOURCES = {
  "/privacy": { file: "privacy.html", source: "privacy-notice.md", anchors: ["if-someone-invited-you-by-your-number", "your-right-to-object"] },
  "/terms": { file: "terms.html", source: "terms-of-use.md", anchors: ["community-rules"] },
  "/support": { file: "support.html", source: "support.md", anchors: ["by-the-contact-form", "how-quickly-we-respond", "an-intimate-image-of-you"], form: true },
  "/delete-account": { file: "delete-account.html", source: "delete-account.md", anchors: ["ask-us-to-delete-your-account-by-email"] },
};

export const LEGAL_PAGES = LEGAL_LINKS.map((link) => {
  const s = SOURCES[link.href];
  return {
    route: link.href,
    file: s.file,
    source: s.source,
    title: link.label,
    csp: s.form ? FORM_CSP : PAGE_CSP,
    anchors: s.anchors,
    form: !!s.form,
  };
});

const RULE = /^-{3,}\s*$/;
const H2 = /^##\s+(.*?)\s*#*\s*$/;
const NOTE_HEADING = /\((?:delete|remove) before publishing\)|^Placeholders to fill$/i;
const NOTE_BOX = /(?:delete|remove) this box/i;

export function publicPart(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const kept = [];
  let skipping = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h2 = line.match(H2);
    if (h2) skipping = NOTE_HEADING.test(h2[1]);
    if (skipping) {
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const block = [];
      while (i < lines.length && lines[i].startsWith(">")) block.push(lines[i++]);
      if (!NOTE_BOX.test(block[0])) kept.push(...block);
      continue;
    }
    kept.push(line);
    i++;
  }
  const out = [];
  let lastKeptWasRule = false;
  for (const line of kept) {
    if (RULE.test(line)) {
      if (lastKeptWasRule) continue;
      lastKeptWasRule = true;
    } else if (line.trim() !== "") {
      lastKeptWasRule = false;
    }
    out.push(line);
  }
  while (out.length && (out[out.length - 1].trim() === "" || RULE.test(out[out.length - 1]))) out.pop();
  return `${out.join("\n")}\n`;
}

export function publishProblems(markdown) {
  const text = publicPart(markdown);
  const problems = [];
  if (/\[\[OWNER:/.test(text)) problems.push("an [[OWNER: …]] placeholder");
  if (/draft for solicitor review|not yet published/i.test(text)) problems.push("the draft status");
  if (/before publishing/i.test(text)) problems.push("a note marked for deletion before publishing");
  return problems;
}

export async function buildLegalPages({ legalDir, mode }) {
  const dir = legalDir.endsWith("/") ? legalDir : `${legalDir}/`;
  const texts = await Promise.all(LEGAL_PAGES.map((page) => readFile(`${dir}${page.source}`, "utf8")));
  if (mode === "final") {
    const lines = [];
    LEGAL_PAGES.forEach((page, n) => {
      for (const problem of publishProblems(texts[n])) lines.push(`${page.source}: ${problem}`);
    });
    if (lines.length) throw new Error(`The legal documents are not ready to publish:\n${lines.join("\n")}`);
  }
  const draft = mode === "draft";
  return LEGAL_PAGES.map((page, n) => {
    const insertAfter = page.form ? { "by-the-contact-form": contactFormHtml() } : {};
    const body = markdownToHtml(publicPart(texts[n]), { draft, insertAfter });
    for (const anchor of page.anchors) {
      if (!body.includes(`id="${anchor}"`)) throw new Error(`${page.source} has no "#${anchor}"`);
    }
    const robots = !draft;
    return {
      route: page.route,
      file: page.file,
      csp: page.csp,
      robots,
      html: sitePage({ title: page.title, body, csp: page.csp, robots, banner: draft ? DRAFT_BANNER : "" }),
    };
  });
}
