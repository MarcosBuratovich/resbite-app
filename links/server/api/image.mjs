// GET /r/<code>/image (rewritten to /api/image?code=<code>), and /i/<code>/image (kind=personal): the event's picture for the page and the preview.
// A stable address per link; the signed cover URL behind it rotates. Anything other than an open event's
// cover or illustration gets the Resbite mark. Nothing here logs; a failure falls back to the mark, or to an empty 204.
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isLinkCode } from "../lib/render.mjs";
import { readInvitationPage, readPersonalInvitation, signCoverUrl } from "../lib/supabase.mjs";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];

const setCommon = (res) => {
  res.setHeader("Cache-Control", "private, max-age=60");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
};
const send = (res, bytes, type) => {
  setCommon(res);
  res.setHeader("Content-Type", type);
  res.status(200).send(bytes);
};

/** Handler for GET /api/image. `deps` lets tests inject the database, signing, fetch and the bundled files' root. */
export default async function handler(req, res, deps = {}) {
  const d = { readInvitationPage, readPersonalInvitation, signCoverUrl, fetch: globalThis.fetch, root: defaultRoot, ...deps };
  // The Resbite mark; a last resort with no bundled file is an empty 204, never a 500.
  const mark = async () => {
    try {
      return send(res, await readFile(resolve(d.root, "resbite-mark.png")), "image/png");
    } catch {
      setCommon(res);
      res.status(204).send("");
    }
  };

  const code = typeof req.query?.code === "string" ? req.query.code : "";
  let data = { state: "inactive" };
  if (isLinkCode(code)) {
    try {
      data = req.query?.kind === "personal" ? await d.readPersonalInvitation(code) : await d.readInvitationPage(code);
    } catch {
      data = { state: "inactive" };
    }
  }
  if (data.state !== "open" || !data.image) return mark();
  if (data.image.kind === "activity" && /^[a-z0-9-]{1,80}$/.test(data.image.ref)) {
    try {
      return send(res, await readFile(resolve(d.root, "activities", `${data.image.ref}.png`)), "image/png");
    } catch {
      return mark();
    }
  }
  if (data.image.kind === "cover") {
    try {
      const signed = await d.signCoverUrl(data.image.ref);
      if (signed) {
        const upstream = await d.fetch(signed);
        if (upstream.ok) {
          const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
          if (COVER_TYPES.includes(type)) return send(res, Buffer.from(await upstream.arrayBuffer()), type);
        }
      }
    } catch {
      // Missing secret, network failure or a bad body: the mark, as for any other closed or unknown picture.
    }
  }
  return mark();
}
