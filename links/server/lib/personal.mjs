// Renders the personal invitation page /i/<code> (contact invitations, Task 10; mockup invitee-web-journey screen 1).
// Pure: data in, HTML out. It uses only the keys personal_invitation_page returns, which never include the place
// or the full number. The steps after the first (confirm, code, answer, get the app) are filled by /personal.js.
import { PAGE_CSP, formatWhen, pageHeaders, previewDescription } from "./render.mjs";

/** The /r/ CSP with the one Supabase host the page may call. Without a usable URL the page cannot connect at all. */
export function personalCsp(supabaseUrl) {
  let host = "";
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol === "https:") host = url.host;
  } catch {
    // Unset or malformed: no connection allowed.
  }
  return host ? PAGE_CSP.replace("connect-src 'none'", `connect-src https://${host}`) : PAGE_CSP;
}

/** The /r/ headers with the /i/ CSP. */
export function personalHeaders(supabaseUrl) {
  return { ...pageHeaders(), "Content-Security-Policy": personalCsp(supabaseUrl) };
}

/** The page's own words, in one place. Task 11's script carries its step strings in personal-flow.mjs. */
export const PERSONAL_WORDS = {
  invited: (host) => `${host} invited you`,
  forNumber: (ending) => `This invitation is for the number ending ••${ending}.`,
  answer: "Answer",
  notYours: (host) => `Not your number? Ask ${host} to check it.`,
  going: (n) => (n > 0 ? `${n} going` : "Be one of the first"),
  genericTitle: "You’re invited to a resbite",
  genericPreview: "Open the link on your phone to see the resbite.",
  cancelled: (host) => `${host} cancelled this resbite.`,
  happened: "This resbite has already happened.",
  inactive: "This invitation is no longer active.",
  inactiveHint: "Ask whoever sent it for a new link.",
  plan: "Plan your own with Resbite.",
};

const escape = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * The whole document. `options`: origin, code, appStoreUrl, supabaseUrl, publishableKey, termsVersion, termsUrl,
 * privacyUrl. The publishable key appears once, in a data- attribute on <main>, and only on an open invitation.
 */
export function renderPersonalPage(data, options) {
  const { origin, code, supabaseUrl } = options;
  const state = data?.state;
  const open = state === "open";
  const image = open ? `${origin}/i/${code}/image` : `${origin}/resbite-mark.png`;
  const title = open ? data.title : PERSONAL_WORDS.genericTitle;
  const description = open ? previewDescription(data) : PERSONAL_WORDS.genericPreview;
  const csp = personalCsp(supabaseUrl);
  const body = open ? openBody(data, image, options) : closedBody(state, data, options.appStoreUrl);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <meta name="robots" content="noindex, nofollow" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>${escape(title)}</title>
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:site_name" content="Resbite" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${escape(image)}" />
    <meta property="og:image:alt" content="${escape(title)}" />
    <meta name="twitter:card" content="summary" />
    <link rel="icon" href="/resbite-mark.png" />
    <link rel="stylesheet" href="/page.css" />
    <link rel="stylesheet" href="/personal.css" />
  </head>
  <body>
${body}
${open ? '    <script type="module" src="/personal.js"></script>\n' : ""}  </body>
</html>
`;
}

function openBody(data, image, options) {
  const w = PERSONAL_WORDS;
  const when = formatWhen(data.starts_at, data.ends_at, data.time_zone);
  const area = data.area ? `\n        <p class="detail">${escape(data.area)}</p>` : "";
  const attrs = {
    "supabase-url": options.supabaseUrl,
    "publishable-key": options.publishableKey,
    code: options.code,
    country: data.country,
    ending: data.ending,
    host: data.host,
    "terms-version": options.termsVersion,
    "terms-url": options.termsUrl,
    "privacy-url": options.privacyUrl,
    "app-store-url": options.appStoreUrl,
    // The script drops the session it keeps for this invitation once the event has started.
    "starts-at": data.starts_at,
  };
  const dataAttrs = Object.entries(attrs)
    .map(([name, value]) => `data-${name}="${escape(value)}"`)
    .join(" ");
  return `    <main id="main" ${dataAttrs}>
      <section id="step-invitation">
        <p class="invited"><span class="dot" aria-hidden="true"></span>${escape(w.invited(data.host))}</p>
        <img class="hero" src="${escape(image)}" alt="" />
        <h1>${escape(data.title)}</h1>
        <p class="detail">${escape(when)}</p>${area}
        <p class="detail">${escape(w.going(data.going))}</p>
        <p class="note">${escape(w.forNumber(data.ending))}</p>
        <p><button type="button" class="button" id="answer">${w.answer}</button></p>
        <p class="muted">${escape(w.notYours(data.host))}</p>
      </section>
      <section id="step-confirm" aria-live="polite" hidden></section>
      <section id="step-code" aria-live="polite" hidden></section>
      <section id="step-answer" aria-live="polite" hidden></section>
      <section id="step-app" aria-live="polite" hidden></section>
      <noscript><p class="muted">Answering needs JavaScript. Ask ${escape(data.host)} for help if it is off.</p></noscript>
    </main>`;
}

function closedBody(state, data, appStoreUrl) {
  const w = PERSONAL_WORDS;
  const host = escape(data?.host || "The host");
  let inner;
  if (state === "cancelled") inner = `      <h1>${escape(w.cancelled(data?.host || "The host"))}</h1>`;
  else if (state === "happened")
    inner = `      <h1>${w.happened}</h1>\n      <p class="muted"><a href="${escape(appStoreUrl)}">${w.plan}</a></p>`;
  else inner = `      <h1>${w.inactive}</h1>\n      <p class="muted">${w.inactiveHint}</p>`;
  return `    <main id="main">\n${inner}\n    </main>`;
}
