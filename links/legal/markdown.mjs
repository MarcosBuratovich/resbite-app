// A small Markdown converter for the legal documents in docs/legal/.
// It covers only the subset those documents use. Every piece of text is
// escaped, and only https:, mailto:, site paths and anchors become links.

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function slugify(heading) {
  return heading
    .replace(/^\d+(\.\d+)*\.?\s+/, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeHref(href) {
  if (/^(https:|mailto:)/i.test(href)) return true;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  return href.startsWith("#");
}

const BARE = /https:\/\/[^\s<>"]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

function autolink(text) {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(BARE)) {
    let found = match[0];
    let tail = "";
    const trailing = found.match(/[.,;:!?)]+$/);
    if (trailing) {
      tail = trailing[0];
      found = found.slice(0, -tail.length);
    }
    out += escapeHtml(text.slice(last, match.index));
    const href = found.startsWith("https://") ? found : `mailto:${found}`;
    out += `<a href="${escapeHtml(href)}">${escapeHtml(found)}</a>`;
    last = match.index + match[0].length - tail.length;
  }
  return out + escapeHtml(text.slice(last));
}

const SPAN = /\[\[OWNER:[^\]]*\]\]|\[([^[\]]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)|\*\*(.+?)\*\*/g;

function inlineNoCode(text, { auto, draft }) {
  let out = "";
  let last = 0;
  const plain = (piece) => (auto ? autolink(piece) : escapeHtml(piece));
  for (const match of text.matchAll(SPAN)) {
    out += plain(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[0].startsWith("[[OWNER:")) {
      out += draft ? `<mark class="placeholder">${escapeHtml(match[0])}</mark>` : escapeHtml(match[0]);
    } else if (match[3] !== undefined) {
      out += `<strong>${inlineNoCode(match[3], { auto, draft })}</strong>`;
    } else {
      const inner = inlineNoCode(match[1], { auto: false, draft });
      out += safeHref(match[2]) ? `<a href="${escapeHtml(match[2])}">${inner}</a>` : inner;
    }
  }
  return out + plain(text.slice(last));
}

function inline(text, options) {
  const parts = text.split(/(`[^`]+`)/);
  return parts
    .map((part) =>
      /^`[^`]+`$/.test(part)
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : inlineNoCode(part, { auto: true, draft: !!options.draft }),
    )
    .join("");
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

const HEADING = /^(#{1,4})\s+(.*?)\s*#*\s*$/;
const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^(\d+)\.\s+(.*)$/;
const RULE = /^-{3,}\s*$/;

function startsBlock(line) {
  return (
    line.trim() === "" ||
    HEADING.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    RULE.test(line) ||
    line.startsWith(">") ||
    line.startsWith("|")
  );
}

function parseBlocks(markdown, options, seen) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ html: "<hr />" });
      i++;
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      const base = slugify(heading[2]) || "section";
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      const id = count === 1 ? base : `${base}-${count}`;
      blocks.push({
        html: `<h${level} id="${id}">${inline(heading[2], options)}</h${level}>`,
        level,
        id: base,
      });
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const inner = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        inner.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const html = parseBlocks(inner.join("\n"), options, seen).map((b) => b.html).join("\n");
      blocks.push({ html: `<blockquote>\n${html}\n</blockquote>` });
      continue;
    }
    if (BULLET.test(line)) {
      const items = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(lines[i].match(BULLET)[1]);
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !BULLET.test(lines[i].trim())) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        }
      }
      blocks.push({
        html: `<ul>\n${items.map((item) => `<li>${inline(item, options)}</li>`).join("\n")}\n</ul>`,
      });
      continue;
    }
    if (ORDERED.test(line)) {
      const start = Number(line.match(ORDERED)[1]);
      const items = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        items.push(lines[i].match(ORDERED)[2]);
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !ORDERED.test(lines[i].trim())) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        }
      }
      const open = start === 1 ? "<ol>" : `<ol start="${start}">`;
      blocks.push({
        html: `${open}\n${items.map((item) => `<li>${inline(item, options)}</li>`).join("\n")}\n</ol>`,
      });
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i]);
        i++;
      }
      const isSeparator = (row) => /^\|?[\s:|-]+\|?$/.test(row) && row.includes("-");
      const head = splitRow(rows[0]);
      const bodyRows = rows.slice(isSeparator(rows[1] || "") ? 2 : 1).map(splitRow);
      const cells = (row, tag) =>
        `<tr>${row
          .map((cell) => (tag === "th" ? `<th scope="col">${inline(cell, options)}</th>` : `<td>${inline(cell, options)}</td>`))
          .join("")}</tr>`;
      const thead = head.every((cell) => cell === "") ? "" : `<thead>\n${cells(head, "th")}\n</thead>\n`;
      const tbody = `<tbody>\n${bodyRows.map((row) => cells(row, "td")).join("\n")}\n</tbody>`;
      blocks.push({ html: `<div class="table"><table>\n${thead}${tbody}\n</table></div>` });
      continue;
    }
    const paragraph = [];
    while (i < lines.length && (paragraph.length === 0 || !startsBlock(lines[i]))) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push({ html: `<p>${paragraph.map((p) => inline(p, options)).join("<br />\n")}</p>` });
  }
  return blocks;
}

export function markdownToHtml(markdown, options = {}) {
  const blocks = parseBlocks(markdown, options, new Map());
  const insertAfter = options.insertAfter || {};
  for (const id of Object.keys(insertAfter)) {
    if (!blocks.some((block) => block.id === id)) throw new Error(`no heading "${id}"`);
  }
  const out = [];
  let open = [];
  for (const block of blocks) {
    if (block.level !== undefined) {
      const closing = open.filter((entry) => block.level <= entry.level);
      for (const entry of closing) out.push(insertAfter[entry.id]);
      open = open.filter((entry) => block.level > entry.level);
      if (insertAfter[block.id] !== undefined) open.push({ id: block.id, level: block.level });
    }
    out.push(block.html);
  }
  for (const entry of open) out.push(insertAfter[entry.id]);
  return out.join("\n");
}
