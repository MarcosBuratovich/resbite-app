// Renders the event page for one link (GI1, spec section 2). Pure: data in, HTML out. It uses only the keys
// invitation_page returns, so nothing else about an event can reach the page or its preview. Since open-link approval
// (plan 3) an open link's page is the personal page's steps in open mode (personal.mjs renderOpenLinkPage); this file
// draws the closed links' pages, which keep GI1's words and the strict CSP.
export const PAGE_CSP =
  "default-src 'none'; img-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'";

/** The headers every rendered page carries. */
export function pageHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": PAGE_CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

export const CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const isLinkCode = (value) => typeof value === "string" && CODE_PATTERN.test(value);

const escape = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * "Fri 23 Oct, 19:30 – 22:00" in the event's own time zone, as the app shows it; "Fri 23 Oct, 19:30" without an end.
 * An end on another local day reads "Fri 23 Oct, 22:00 – Sat 24 02:00": the end gets its weekday and day number.
 */
export function formatWhen(startsAt, endsAt, timeZone) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "";
  let zone = timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: zone });
  const endDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: zone });
  const dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zone });
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone });
  const clock = (date) => time.format(date).replace(/^24:/, "00:");
  const end = endsAt ? new Date(endsAt) : null;
  let range = clock(start);
  if (end && !Number.isNaN(end.getTime()) && end > start) {
    range = dayKey.format(end) === dayKey.format(start)
      ? `${clock(start)} – ${clock(end)}`
      : `${clock(start)} – ${endDay.format(end)} ${clock(end)}`;
  }
  return `${day.format(start)}, ${range}`;
}

/** "Fri 23 Oct, 19:30 · Invited by Stephen" for the chat preview. Never the area or the place. */
export function previewDescription(data) {
  return `${formatWhen(data.starts_at, null, data.time_zone)} · Invited by ${data.host}`;
}

const preview = (title, description, image) =>
  `<meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:site_name" content="Resbite" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${escape(image)}" />
    <meta property="og:image:alt" content="${escape(title)}" />
    <meta name="twitter:card" content="summary" />`;

/**
 * Safari's smart app banner, which opens the app on this link. None without a code: the inactive page for a malformed
 * link has none to hand the app, and none without an App Store id (while the app is only on TestFlight).
 */
export function smartBanner({ origin, code, appStoreId }) {
  return appStoreId && code ? `<meta name="apple-itunes-app" content="app-id=${escape(appStoreId)}, app-argument=${escape(`${origin}/r/${code}`)}" />` : "";
}

/**
 * A closed link's whole document: cancelled, happened, or inactive (unknown, turned off, malformed; any other state
 * reads as inactive). `options`: origin (https://link.resbite.com), code, appStoreUrl, appStoreId.
 */
export function renderClosedPage(data, options) {
  const { origin, appStoreUrl } = options;
  const title = "You’re invited to a resbite";
  const image = `${origin}/resbite-mark.png`;
  const description = "Open the link on your phone to see the resbite.";
  const banner = smartBanner(options);
  const body = closedBody(data?.state, data, appStoreUrl);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <meta name="robots" content="noindex, nofollow" />
    <meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}" />
    <title>${escape(title)}</title>
    ${preview(title, description, image)}
    ${banner}
    <link rel="icon" href="/resbite-mark.png" />
    <link rel="stylesheet" href="/page.css" />
  </head>
  <body>
    <main id="main">
${body}
    </main>
    <script src="/page.js"></script>
  </body>
</html>
`;
}

function closedBody(state, data, appStoreUrl) {
  const host = escape(data?.host || "The host");
  if (state === "cancelled") return `      <h1>${host} cancelled this resbite.</h1>`;
  if (state === "happened")
    return `      <h1>This resbite has already happened.</h1>
      <p class="muted"><a href="${escape(appStoreUrl)}">Plan your own with Resbite.</a></p>`;
  return `      <h1>This invitation is no longer active.</h1>
      <p class="muted">Ask whoever sent it for a new link.</p>`;
}
