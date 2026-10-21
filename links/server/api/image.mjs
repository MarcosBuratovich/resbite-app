// GET /r/<code>/image (rewritten to /api/image?code=<code>): the event's picture for the page and the preview.
// A stable address per link; the signed cover URL behind it rotates. Anything other than an open event's
// cover or illustration gets the Resbite mark.
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isLinkCode } from "../lib/render.mjs";
import { readInvitationPage, signCoverUrl } from "../lib/supabase.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const send = (res, bytes, type) => {
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "private, max-age=60");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(200).send(bytes);
};
const mark = async (res) => send(res, await readFile(resolve(root, "resbite-mark.png")), "image/png");

export default async function handler(req, res) {
  const code = typeof req.query?.code === "string" ? req.query.code : "";
  let data = { state: "inactive" };
  if (isLinkCode(code)) {
    try {
      data = await readInvitationPage(code);
    } catch {
      data = { state: "inactive" };
    }
  }
  if (data.state !== "open" || !data.image) return mark(res);
  if (data.image.kind === "activity" && /^[a-z0-9-]{1,80}$/.test(data.image.ref)) {
    try {
      return send(res, await readFile(resolve(root, "activities", `${data.image.ref}.png`)), "image/png");
    } catch {
      return mark(res);
    }
  }
  if (data.image.kind === "cover") {
    const signed = await signCoverUrl(data.image.ref);
    if (signed) {
      const upstream = await fetch(signed);
      if (upstream.ok)
        return send(res, Buffer.from(await upstream.arrayBuffer()), upstream.headers.get("content-type") || "image/jpeg");
    }
  }
  return mark(res);
}
