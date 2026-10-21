// Renders the event page for one link (GI1, spec section 2). Pure: data in, HTML out. It uses only the keys
// invitation_page returns, so nothing else about an event can reach the page or its preview.
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

/** "Fri 23 Oct, 19:30 – 22:00" in the event's own time zone, as the app shows it; "Fri 23 Oct, 19:30" without an end. */
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
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone });
  const clock = (date) => time.format(date).replace(/^24:/, "00:");
  const end = endsAt ? new Date(endsAt) : null;
  const range = end && !Number.isNaN(end.getTime()) && end > start ? `${clock(start)} – ${clock(end)}` : clock(start);
  return `${day.format(start)}, ${range}`;
}

/** "Fri 23 Oct, 19:30 · Invited by Stephen" for the chat preview. Never the area or the place. */
export function previewDescription(data) {
  return `${formatWhen(data.starts_at, null, data.time_zone)} · Invited by ${data.host}`;
}

const goingLine = (going) => (going > 0 ? `${going} going` : "Be one of the first");

const preview = (title, description, image) =>
  `<meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:site_name" content="Resbite" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${escape(image)}" />
    <meta property="og:image:alt" content="${escape(title)}" />
    <meta name="twitter:card" content="summary" />`;

/**
 * The whole document. `options`: origin (https://link.resbite.com), code, appStoreUrl, appStoreId (for the smart
 * app banner; empty while the app is only on TestFlight).
 */
export function renderPage(data, options) {
  const { origin, code, appStoreUrl, appStoreId } = options;
  const self = `${origin}/r/${code}`;
  const state = data?.state;
  const open = state === "open";
  const title = open ? data.title : "You’re invited to a resbite";
  const image = open ? `${self}/image` : `${origin}/resbite-mark.png`;
  const description = open ? previewDescription(data) : "Open the link on your phone to see the resbite.";
  const banner = appStoreId ? `<meta name="apple-itunes-app" content="app-id=${escape(appStoreId)}, app-argument=${escape(self)}" />` : "";
  const body = open ? openBody(data, { image, code, appStoreUrl }) : closedBody(state, data);
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

function openBody(data, { image, code, appStoreUrl }) {
  const when = formatWhen(data.starts_at, data.ends_at, data.time_zone);
  const area = data.area ? `<p class="detail">${escape(data.area)}</p>` : "";
  return `      <p class="invited"><span class="dot" aria-hidden="true"></span>${escape(data.host)} invited you</p>
      <img class="hero" src="${escape(image)}" alt="" />
      <h1>${escape(data.title)}</h1>
      <p class="detail">${escape(when)}</p>
      ${area}
      <p class="muted">Exact address after you reply</p>
      <p class="detail">${escape(goingLine(data.going))}</p>
      <section class="why" aria-labelledby="why">
        <h2 id="why">With a free Resbite account you can</h2>
        <ul>
          <li>See who’s going</li>
          <li>Add it to your calendar</li>
          <li>Get reminders before it starts</li>
        </ul>
        <p class="muted">Free. No ads. No public profile.</p>
      </section>
      <p class="footer"><a class="button" href="#join">RSVP</a></p>
      <div id="join" class="sheet" role="dialog" aria-labelledby="join-title">
        <a class="scrim" href="#main" aria-label="Close"></a>
        <div class="panel">
          <h2 id="join-title">Join Resbite to reply</h2>
          <p>${escape(data.host)} will see your answer.</p>
          <p class="summary"><img src="${escape(image)}" alt="" /><span><strong>${escape(data.title)}</strong><br />${escape(when)}</span></p>
          <p class="muted">Free. No ads. No public profile.</p>
          <a class="button" href="${escape(appStoreUrl)}">Get the app</a>
          <a class="button secondary" id="open-app" href="resbite://r/${escape(code)}">I have Resbite: open the app</a>
          <p class="muted hint" id="open-hint" hidden>If Resbite doesn’t open, install it first.</p>
        </div>
      </div>`;
}

function closedBody(state, data) {
  const host = escape(data?.host || "The host");
  if (state === "cancelled") return `      <h1>${host} cancelled this resbite.</h1>`;
  if (state === "happened")
    return `      <h1>This resbite has already happened.</h1>
      <p class="muted">Plan your own with Resbite.</p>`;
  return `      <h1>This invitation is no longer active.</h1>
      <p class="muted">Ask whoever sent it for a new link.</p>`;
}
