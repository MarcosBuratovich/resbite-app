import test, { after } from "node:test";
import assert from "node:assert/strict";
import { formatWhen, previewDescription, renderClosedPage, pageHeaders, isLinkCode, PAGE_CSP } from "./server/lib/render.mjs";
import { readInvitationPage, signCoverUrl } from "./server/lib/supabase.mjs";
import { renderOpenLinkPage, personalCsp } from "./server/lib/personal.mjs";
import { pageOptions } from "./server/lib/options.mjs";
import page from "./server/api/page.mjs";
import image from "./server/api/image.mjs";
import { mkdtemp, mkdir, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const code = "k7Qx9AbCdEfGhIjKlMnOpQ";
const options = { origin: "https://link.resbite.com", code, appStoreUrl: "https://testflight.apple.com/join/abc", appStoreId: "6823164725" };
const open = {
  state: "open", host: "Stephen", title: "Film night: Paddington 2", starts_at: "2099-10-23T18:30:00+00:00", ends_at: "2099-10-23T21:00:00+00:00",
  time_zone: "Europe/London", area: "Near Old Street, London", going: 6, image: { kind: "cover", ref: "covers/x/1.jpg" },
};

test("times read as the app shows them, in the event's zone", () => {
  assert.equal(formatWhen(open.starts_at, open.ends_at, "Europe/London"), "Fri 23 Oct, 19:30 – 22:00");
  assert.equal(formatWhen(open.starts_at, null, "Europe/London"), "Fri 23 Oct, 19:30");
  assert.equal(formatWhen(open.starts_at, "2099-10-23T18:00:00+00:00", "Europe/London"), "Fri 23 Oct, 19:30");
  assert.equal(formatWhen(open.starts_at, null, "Not/AZone"), "Fri 23 Oct, 18:30");
  assert.equal(formatWhen("nope", null, "UTC"), "");
  assert.equal(previewDescription(open), "Fri 23 Oct, 19:30 · Invited by Stephen");
});

test("an end on another local day names its day", () => {
  assert.equal(formatWhen("2099-10-23T21:00:00+00:00", "2099-10-24T01:00:00+00:00", "Europe/London"), "Fri 23 Oct, 22:00 – Sat 24 02:00");
});

// The open link's page (plan 3): the personal page's steps in open mode, so anyone can answer and wait for the host.
const linkOptions = {
  ...options,
  supabaseUrl: "https://ewcsgvhuojxdpaspwsrx.supabase.co",
  publishableKey: "sb_publishable_KEY123",
  termsVersion: "2026-10",
  termsUrl: "https://www.resbite.com/terms",
  privacyUrl: "https://www.resbite.com/privacy",
};

test("the open page is the personal page's first step in open mode: the basics and Answer, no number note", () => {
  const html = renderOpenLinkPage(open, linkOptions);
  for (const text of ["Stephen invited you", "Film night: Paddington 2", "Fri 23 Oct, 19:30 – 22:00", "Near Old Street, London", "6 going", ">Answer</button>"])
    assert.ok(html.includes(text), text);
  for (const gone of ["number ending", "Not your number", "RSVP", "Join Resbite to reply", 'href="#join"', "/page.js", "Exact address after you reply"])
    assert.ok(!html.includes(gone), gone);
  // GI1's way into the app stays for people who already have Resbite.
  assert.ok(html.includes(`<a class="button secondary" id="open-app" href="resbite://r/${code}">I have Resbite: open the app</a>`));
  assert.ok(html.includes(`<img class="hero" src="https://link.resbite.com/r/${code}/image" alt="" />`));
  for (const step of ["confirm", "code", "answer", "app"]) assert.ok(html.includes(`<section id="step-${step}" aria-live="polite" hidden></section>`), step);
  assert.match(html, /<script type="module" src="\/personal\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\/page\.css" \/>\s*<link rel="stylesheet" href="\/personal\.css" \/>/);
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.ok(html.includes('<html lang="en">') && html.includes('<main id="main" ') && !html.includes("user-scalable=no"));
  assert.ok(html.includes(`<meta name="apple-itunes-app" content="app-id=6823164725, app-argument=https://link.resbite.com/r/${code}" />`));
  assert.ok(!renderOpenLinkPage(open, { ...linkOptions, appStoreId: "" }).includes("apple-itunes-app"));
  assert.ok(!/https?:\/\/(?!link\.resbite\.com|testflight\.apple\.com|ewcsgvhuojxdpaspwsrx\.supabase\.co|www\.resbite\.com)/.test(html), "no third-party resources");
  assert.ok(!html.includes("000000"));
});

test("the open page carries the personal page's data attributes, with mode open, country 44 and no ending", () => {
  // invitation_page has no ending or country; were they there, the open page would still not match a number.
  const html = renderOpenLinkPage({ ...open, ending: "34", country: "1" }, linkOptions);
  const main = html.match(/<main [^>]*>/)[0];
  for (const [name, value] of [["supabase-url", linkOptions.supabaseUrl], ["publishable-key", linkOptions.publishableKey], ["code", code],
    ["mode", "open"], ["country", "44"], ["host", "Stephen"], ["terms-version", "2026-10"], ["terms-url", linkOptions.termsUrl],
    ["privacy-url", linkOptions.privacyUrl], ["app-store-url", linkOptions.appStoreUrl], ["starts-at", open.starts_at]])
    assert.ok(main.includes(`data-${name}="${value}"`), name);
  assert.ok(!html.includes("data-ending") && !html.includes("••34"), "no number to match");
  assert.equal(html.split(linkOptions.publishableKey).length, 2, "the key appears once");
  assert.ok(html.indexOf(linkOptions.publishableKey) > html.indexOf("<main"));
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${personalCsp(linkOptions.supabaseUrl)}" />`));
});

test("the preview carries the title, date, host and the stable image; never the area, the place or the key", () => {
  const html = renderOpenLinkPage(open, linkOptions);
  assert.ok(html.includes('<meta property="og:title" content="Film night: Paddington 2" />'));
  assert.ok(html.includes('<meta property="og:description" content="Fri 23 Oct, 19:30 · Invited by Stephen" />'));
  assert.ok(html.includes(`<meta property="og:image" content="https://link.resbite.com/r/${code}/image" />`));
  const head = html.slice(0, html.indexOf("<body>"));
  for (const secret of ["Old Street", "covers/x", linkOptions.publishableKey]) assert.ok(!head.includes(secret), secret);
});

test("extra keys never reach the page, and text is escaped", () => {
  const leaky = { ...open, title: "<b>Film</b> & \"night\"", host: "<i>Mo</i>", place_label: "Cinema room, 12 Secret Street", note: "Gate 4512", guests: ["Ana"], description: "Secret description" };
  const html = renderOpenLinkPage(leaky, linkOptions);
  assert.ok(!html.includes("Secret") && !html.includes("4512") && !html.includes("Ana"));
  assert.ok(html.includes("&lt;b&gt;Film&lt;/b&gt; &amp; &quot;night&quot;") && !html.includes("<b>Film"));
  assert.ok(html.includes('data-host="&lt;i&gt;Mo&lt;/i&gt;"') && !html.includes("<i>Mo"));
});

test("zero going reads as an invitation, and no area shows no area line", () => {
  const html = renderOpenLinkPage({ ...open, going: 0, area: "" }, linkOptions);
  assert.ok(html.includes("Be one of the first") && !html.includes("0 going"));
  assert.ok(!html.includes("Old Street"));
});

test("cancelled, happened and inactive pages say so, with no RSVP and the generic preview", () => {
  const cancelled = renderClosedPage({ state: "cancelled", host: "Stephen", title: "Film night" }, options);
  assert.ok(cancelled.includes("Stephen cancelled this resbite.") && !cancelled.includes("RSVP") && !cancelled.includes("Film night"));
  const happened = renderClosedPage({ state: "happened", host: "Stephen", title: "Film night" }, options);
  assert.ok(happened.includes("This resbite has already happened.") && happened.includes("Plan your own with Resbite."));
  assert.ok(happened.includes('<a href="https://testflight.apple.com/join/abc">Plan your own with Resbite.</a>'));
  const inactive = renderClosedPage({ state: "inactive" }, { ...options, code: "" });
  assert.ok(inactive.includes("This invitation is no longer active.") && !inactive.includes("#join"));
  assert.ok(!inactive.includes("apple-itunes-app"), "no banner without a code");
  for (const html of [cancelled, happened, inactive]) {
    assert.ok(html.includes('<meta property="og:title" content="You’re invited to a resbite" />'));
    assert.ok(html.includes('<meta property="og:image" content="https://link.resbite.com/resbite-mark.png" />'));
  }
  // As GI1 drew them: the strict CSP, the page's own script, no step and no key.
  for (const html of [cancelled, happened, inactive]) {
    assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}" />`));
    assert.ok(html.includes('<script src="/page.js"></script>') && !html.includes("personal.js") && !html.includes("data-"));
  }
});

test("headers and the code shape", () => {
  const headers = pageHeaders();
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["Content-Security-Policy"], PAGE_CSP);
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow");
  assert.ok(isLinkCode(code) && !isLinkCode("short") && !isLinkCode(code + "x") && !isLinkCode("k7Qx9AbCdEfGhIjKlMnOp/") && !isLinkCode(42));
});

test("the database calls: malformed codes never reach the database; replies are checked; cover paths are checked", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/rpc/invitation_page")) return { ok: true, json: async () => ({ state: "open", host: "S" }) };
    if (url.includes("/object/sign/")) return { ok: true, json: async () => ({ signedURL: "/object/sign/plan-covers/covers/x/1.jpg?token=t" }) };
    return { ok: false, status: 500 };
  };
  assert.deepEqual(await readInvitationPage("short", fetchImpl), { state: "inactive" });
  assert.equal(calls.length, 0);
  assert.deepEqual(await readInvitationPage(code, fetchImpl), { state: "open", host: "S" });
  assert.equal(calls[0].init.headers.apikey, "sb_publishable_test");
  assert.equal(JSON.parse(calls[0].init.body).p_code, code);
  assert.equal(await signCoverUrl("covers/x/1.jpg", 300, fetchImpl), "https://example.supabase.co/storage/v1/object/sign/plan-covers/covers/x/1.jpg?token=t");
  assert.equal(calls[1].init.headers.apikey, "sb_secret_test");
  assert.equal(await signCoverUrl("../etc/passwd", 300, fetchImpl), null);
  assert.equal(await readInvitationPage(code, async () => ({ ok: true, json: async () => "junk" })).then((d) => d.state), "inactive");
});

test("the page function answers an unknown or malformed code with the inactive page and the headers", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  const headers = {};
  let status = 0, body = "";
  const res = { setHeader: (k, v) => (headers[k] = v), status: (s) => ({ send: (b) => ((status = s), (body = b)) }) };
  await page({ query: { code: "not-a-code" } }, res);
  assert.equal(status, 200);
  assert.ok(body.includes("This invitation is no longer active."));
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow");
  assert.equal(headers["Content-Security-Policy"], PAGE_CSP);
});

test("the page options come from the environment, with one set of defaults for /r/ and /i/", () => {
  assert.deepEqual(pageOptions("not-a-code", {}), {
    origin: "https://link.resbite.com",
    code: "",
    appStoreUrl: "https://apps.apple.com/",
    appStoreId: "",
    supabaseUrl: "",
    publishableKey: "",
    termsVersion: "2026-10",
    termsUrl: "",
    privacyUrl: "",
  });
  const env = {
    LINK_ORIGIN: "https://link.example", APP_STORE_URL: "https://testflight.apple.com/join/abc", APP_STORE_ID: "6823164725",
    SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_SECRET_KEY: "sb_secret_never",
    TERMS_VERSION: "2027-01", TERMS_URL: "https://www.resbite.com/terms", PRIVACY_URL: "https://www.resbite.com/privacy",
  };
  const options = pageOptions(code, env);
  assert.deepEqual(options, {
    origin: "https://link.example",
    code,
    appStoreUrl: "https://testflight.apple.com/join/abc",
    appStoreId: "6823164725",
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    termsVersion: "2027-01",
    termsUrl: "https://www.resbite.com/terms",
    privacyUrl: "https://www.resbite.com/privacy",
  });
  assert.ok(!JSON.stringify(options).includes("sb_secret"), "never the secret key");
});

test("the page function renders an open link in open mode with the /i/ CSP; closed states keep the strict CSP", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  const run = async (read, query = { code }) => {
    const res = { headers: {}, statusCode: 0, body: "" };
    res.setHeader = (k, v) => (res.headers[k] = v);
    res.status = (s) => ({ send: (b) => ((res.statusCode = s), (res.body = b)) });
    await page({ query }, res, { readInvitationPage: read });
    return res;
  };
  const opened = await run(async (c) => (assert.equal(c, code), open));
  assert.equal(opened.statusCode, 200);
  assert.equal(opened.headers["Content-Security-Policy"], personalCsp("https://example.supabase.co"));
  assert.equal(opened.headers["Cache-Control"], "no-store");
  assert.equal(opened.headers["Referrer-Policy"], "no-referrer");
  assert.equal(opened.headers["X-Robots-Tag"], "noindex, nofollow");
  for (const attr of ['data-mode="open"', 'data-country="44"', 'data-publishable-key="sb_publishable_test"', 'data-supabase-url="https://example.supabase.co"', 'data-terms-version="2026-10"'])
    assert.ok(opened.body.includes(attr), attr);
  const closed = [
    [async () => ({ state: "cancelled", host: "Stephen" }), "Stephen cancelled this resbite."],
    [async () => ({ state: "happened", host: "Stephen" }), "This resbite has already happened."],
    [async () => ({ state: "inactive" }), "This invitation is no longer active."],
    [async () => { throw Error("boom"); }, "This invitation is no longer active."],
  ];
  for (const [read, sentence] of closed) {
    const res = await run(read);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes(sentence), sentence);
    assert.equal(res.headers["Content-Security-Policy"], PAGE_CSP, sentence);
    assert.ok(!res.body.includes("sb_publishable_test") && !res.body.includes("personal.js"), sentence);
  }
  const malformed = await run(async () => { throw Error("must not be called"); }, { code: "nope" });
  assert.equal(malformed.headers["Content-Security-Policy"], PAGE_CSP);
});

// ---- The image route (api/image.mjs), driven by injected fakes and a fixture folder of bundled files.

const here = dirname(fileURLToPath(import.meta.url));
const mobileAssets = join(here, "..", "mobile", "assets");
const markFile = () => readFile(join(mobileAssets, "brand", "resbite-mark.png"));
const illustrationFile = () => readFile(join(mobileAssets, "activities", "coffee-together.png"));

let fixtures;
async function bundled() {
  if (!fixtures) {
    const full = await mkdtemp(join(tmpdir(), "gi1-image-"));
    await copyFile(join(mobileAssets, "brand", "resbite-mark.png"), join(full, "resbite-mark.png"));
    await mkdir(join(full, "activities"));
    await copyFile(join(mobileAssets, "activities", "coffee-together.png"), join(full, "activities", "coffee-together.png"));
    fixtures = { full, empty: await mkdtemp(join(tmpdir(), "gi1-image-empty-")) };
  }
  return fixtures;
}
after(async () => {
  if (fixtures) for (const dir of Object.values(fixtures)) await rm(dir, { recursive: true, force: true });
});

function fakeRes() {
  const res = { statusCode: 0, body: undefined, headers: {} };
  res.setHeader = (name, value) => {
    res.headers[name] = value;
  };
  res.status = (status) => {
    res.statusCode = status;
    return {
      send: (body) => {
        res.body = body;
        return res;
      },
    };
  };
  return res;
}
const imageHeaders = (res) => {
  assert.equal(res.headers["Content-Security-Policy"], "default-src 'none'");
  assert.equal(res.headers["X-Robots-Tag"], "noindex, nofollow");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
};
const openWith = (picture) => ({ state: "open", host: "Stephen", title: "Film night", image: picture });
async function picture(deps, link = code) {
  const { full } = await bundled();
  const res = fakeRes();
  await image(
    { query: { code: link } },
    res,
    {
      root: full,
      readInvitationPage: async () => openWith({ kind: "cover", ref: "covers/x/1.jpg" }),
      signCoverUrl: async () => null,
      fetch: async () => {
        throw Error("fetch not expected");
      },
      ...deps,
    },
  );
  return res;
}

test("the image route: an unknown or malformed link gets the Resbite mark", async () => {
  const unknown = await picture({ readInvitationPage: async () => ({ state: "inactive" }) });
  assert.equal(unknown.statusCode, 200);
  assert.equal(unknown.headers["Content-Type"], "image/png");
  assert.ok(Buffer.from(unknown.body).equals(await markFile()));
  imageHeaders(unknown);
  const malformed = await picture({ readInvitationPage: async () => { throw Error("must not be called"); } }, "not-a-code");
  assert.ok(Buffer.from(malformed.body).equals(await markFile()));
});

test("the image route: an open event's illustration is served from the bundled files", async () => {
  const res = await picture({ readInvitationPage: async () => openWith({ kind: "activity", ref: "coffee-together" }) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "image/png");
  assert.ok(Buffer.from(res.body).equals(await illustrationFile()));
  imageHeaders(res);
});

test("a bad illustration name gets the mark, never a file outside the folder", async () => {
  const res = await picture({ readInvitationPage: async () => openWith({ kind: "activity", ref: "../x" }) });
  assert.equal(res.headers["Content-Type"], "image/png");
  assert.ok(Buffer.from(res.body).equals(await markFile()));
});

test("a cover is streamed from its signed URL when the upstream type is an image", async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
  const seen = {};
  const res = await picture({
    signCoverUrl: async (path) => {
      seen.path = path;
      return "https://example.supabase.co/storage/v1/object/sign/plan-covers/covers/x/1.jpg?token=t";
    },
    fetch: async (url) => {
      seen.url = url;
      return {
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    },
  });
  assert.equal(seen.path, "covers/x/1.jpg");
  assert.equal(seen.url, "https://example.supabase.co/storage/v1/object/sign/plan-covers/covers/x/1.jpg?token=t");
  assert.equal(res.headers["Content-Type"], "image/jpeg");
  assert.ok(Buffer.from(res.body).equals(bytes));
  imageHeaders(res);
});

test("a cover that cannot be signed, fetched or read falls back to the mark", async () => {
  const failures = [
    { signCoverUrl: async () => { throw Error("SUPABASE_SECRET_KEY is not set"); } },
    { signCoverUrl: async () => null },
    { signCoverUrl: async () => "https://example.supabase.co/x", fetch: async () => { throw Error("network"); } },
    { signCoverUrl: async () => "https://example.supabase.co/x", fetch: async () => ({ ok: false, status: 404, headers: new Headers() }) },
  ];
  for (const deps of failures) {
    const res = await picture(deps);
    assert.equal(res.statusCode, 200);
    assert.ok(Buffer.from(res.body).equals(await markFile()));
    imageHeaders(res);
  }
});

test("a cover whose upstream type is not an image gets the mark, never the upstream bytes", async () => {
  const res = await picture({
    signCoverUrl: async () => "https://example.supabase.co/x",
    fetch: async () => ({
      ok: true,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      arrayBuffer: async () => new TextEncoder().encode("<script>x</script>").buffer,
    }),
  });
  assert.equal(res.headers["Content-Type"], "image/png");
  assert.ok(Buffer.from(res.body).equals(await markFile()));
});

test("with no bundled mark the last resort is an empty 204, still with the headers", async () => {
  const { empty } = await bundled();
  const res = await picture({ root: empty, readInvitationPage: async () => ({ state: "inactive" }) });
  assert.equal(res.statusCode, 204);
  assert.equal(res.body, "");
  imageHeaders(res);
});
