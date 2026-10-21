import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  buildEventLink,
  buildInvitationLink,
  invitationOrigin,
  isLinkCode,
  isPendingInvite,
  parseEventLink,
  parseInvitationLink,
  pendingInviteParams,
  routeSystemLink,
} from "./appLinks";
import { createPendingInviteStore } from "../services/pendingInviteStore";
const token = "a".repeat(64),
  second = "b".repeat(64),
  origin = "https://links.example.org";
const code = "Ab3_-xYz0123456789abcd",
  otherCode = "ZZZZZZZZZZZZZZZZZZZZZZ";

test("scheme stays the default; owned HTTPS uses a private fragment and round trips", () => {
  assert.equal(buildInvitationLink(token), `resbite://invite?token=${token}`);
  assert.equal(
    buildInvitationLink(token, origin),
    `${origin}/invite#token=${token}`,
  );
  for (const url of [
    `resbite://invite?token=${token}`,
    `resbite:///invite?token=${token}`,
    buildInvitationLink(token, origin),
  ]) {
    assert.equal(parseInvitationLink(url, origin), token);
    assert.equal(routeSystemLink(url, origin), `/invite?token=${token}`);
  }
  assert.equal(parseInvitationLink(buildInvitationLink(token, origin)), null);
});

test("origin configuration fails closed for credentials, ports, paths and local hosts", () => {
  assert.equal(invitationOrigin(origin + "/"), origin);
  for (const bad of [
    "http://example.org",
    "https://localhost",
    "https://127.0.0.1",
    "https://example.local",
    "https://a@links.example.org",
    origin + ":443",
    origin + "/invite",
    origin + "?a=b",
    "https://bad_.org",
    " https://example.org",
  ]) {
    assert.throws(() => buildInvitationLink(token, bad));
    assert.equal(
      parseInvitationLink(`resbite://invite?token=${token}`, bad),
      null,
    );
  }
  assert.throws(() => buildInvitationLink("no secret in errors"));
});

test("malformed or foreign links cannot supply a token", () => {
  for (const bad of [
    `https://evil.example/invite#token=${token}`,
    `${origin}.evil.example/invite#token=${token}`,
    `${origin}/invite?token=${token}`,
    `${origin}/invite#token=${token}&token=${second}`,
    `${origin}/invite?tracking=1#token=${token}`,
    `${origin}/other#token=${token}`,
    `${origin}/other/../invite#token=${token}`,
    `${origin}:443/invite#token=${token}`,
    `resbite://invite?token=${token}&token=${second}`,
    `resbite://invite?token=${token}&next=https://evil.example`,
    `resbite://invite?token=${token}#other`,
    `resbite://invite/?token=${token}`,
    `resbite://evil/invite?token=${token}`,
    `resbite://invite?token=${token.toUpperCase()}`,
    `resbite://invite?token=${token.slice(1)}`,
    `resbite://invite?token=${token}a`,
    `resbite://invite?token=%61${token.slice(1)}`,
    `resbite://invite?token=${token}\n`,
    `resbite://user@invite?token=${token}`,
    `resbite://invite:123?token=${token}`,
    `resbite://invite?token=${token.repeat(10)}`,
    `resbite://invite\\?token=${token}`,
    "nonsense",
    `/invite/?token=${token}`,
    `/%69nvite?token=${token}`,
  ]) {
    assert.equal(parseInvitationLink(bad, origin), null);
    assert.equal(routeSystemLink(bad, origin), "/invite");
  }
});

test("auth callback and root paths still route without allowing foreign callback origins", () => {
  for (const callback of [
    "resbite://auth/callback?code=fixture",
    "resbite:///auth/callback?recovery=1&code=fixture",
    "/auth/callback?code=fixture",
  ])
    assert.equal(routeSystemLink(callback), callback);
  assert.equal(
    routeSystemLink("https://evil.example/auth/callback?code=fixture"),
    "/invite",
  );
  assert.equal(
    routeSystemLink("resbite://user@auth/callback?code=fixture"),
    "/invite",
  );
  assert.equal(routeSystemLink("resbite://"), "/");
  assert.equal(routeSystemLink("/"), "/");
});

test("cold-start link survives storage restore and newer warm link survives older claim", async () => {
  const data = new Map<string, string>();
  const disk = {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: async (key: string) => {
      data.delete(key);
    },
  };
  let current: string | null = null;
  const first = createPendingInviteStore(disk, (value) => {
    current = value;
  });
  const route = routeSystemLink(buildInvitationLink(token, origin), origin);
  await first.remember(new URL(route, origin).searchParams.get("token"));
  const restarted = createPendingInviteStore(disk, (value) => {
    current = value;
  });
  await restarted.restore();
  assert.equal(current, token);
  await restarted.remember(parseInvitationLink(buildInvitationLink(second))!);
  await restarted.remember(null, token);
  assert.equal(current, second);
  assert.equal(
    parseInvitationLink(`https://evil.example/invite#token=${token}`, origin),
    null,
  );
  assert.equal(current, second);
});

test("fallback removes secrets from history, never fetches and only exposes a deliberate app link", () => {
  const script = readFileSync(
    new URL("../../../links/assets/invite.js", import.meta.url),
    "utf8",
  );
  for (const valid of [true, false]) {
    const elements: Record<
      string,
      { textContent?: string; href?: string; hidden?: boolean }
    > = { open: { hidden: true }, status: {} };
    let replacement: unknown;
    runInNewContext(script, {
      location: { hash: `#token=${token}`, search: valid ? "" : "?token=bad" },
      history: {
        replaceState: (...args: unknown[]) => {
          replacement = args[2];
        },
      },
      document: { getElementById: (id: string) => elements[id] },
    });
    assert.equal(replacement, "/invite");
    assert.equal(elements.open.hidden, !valid);
    assert.equal(
      elements.open.href,
      valid ? `resbite://invite?token=${token}` : undefined,
    );
  }
});

test("GI1 event links: owned HTTPS and the app scheme round trip to the invite screen", () => {
  assert.equal(isLinkCode(code), true);
  assert.equal(buildEventLink(code), `resbite://r/${code}`);
  assert.equal(buildEventLink(code, origin), `${origin}/r/${code}`);
  assert.equal(buildEventLink(code, origin + "/"), `${origin}/r/${code}`);
  for (const url of [
    `resbite://r/${code}`,
    `resbite:///r/${code}`,
    `${origin}/r/${code}`,
  ]) {
    assert.equal(parseEventLink(url, origin), code);
    assert.equal(routeSystemLink(url, origin), `/invite?code=${code}`);
  }
  // The native path the router hands over for either form.
  assert.equal(routeSystemLink(`/r/${code}`, origin), `/invite?code=${code}`);
  assert.equal(routeSystemLink(`/r/${code}`), `/invite?code=${code}`);
  // Without a configured origin, only the scheme is trusted.
  assert.equal(parseEventLink(`${origin}/r/${code}`), null);
  assert.equal(routeSystemLink(`${origin}/r/${code}`), "/invite");
  assert.throws(() => buildEventLink("short"), /incomplete/);
  assert.throws(() => buildEventLink(code, "http://example.org"));
  // A token link is not an event link, and an event link is not a token link.
  assert.equal(parseEventLink(`resbite://invite?token=${token}`, origin), null);
  assert.equal(parseInvitationLink(`resbite://r/${code}`, origin), null);
});

test("GI1 event links reject everything but the exact canonical forms", () => {
  for (const bad of [
    `${origin}/r/${code.slice(1)}`,
    `${origin}/r/${code}a`,
    `${origin}/r/${code}/`,
    `${origin}/r/${code}/image`,
    `${origin}/r/x/${code}`,
    `${origin}/x/r/${code}`,
    `${origin}/r/${code}?utm=1`,
    `${origin}/r/${code}#top`,
    `${origin}/r/?code=${code}`,
    `https://LINKS.example.org/r/${code}`,
    `https://links.EXAMPLE.org/r/${code}`,
    `http://links.example.org/r/${code}`,
    `${origin}:443/r/${code}`,
    `https://evil.example/r/${code}`,
    `${origin}.evil.example/r/${code}`,
    `https://a@links.example.org/r/${code}`,
    `resbite://r/${code}?x=1`,
    `resbite://r/${code}#x`,
    `resbite://r/${code}/`,
    `resbite://R/${code}`,
    `resbite://evil/r/${code}`,
    `resbite://user@r/${code}`,
    `resbite://r:12/${code}`,
    `resbite://r/${code.slice(0, 21)}!`,
    `resbite://r/${code.slice(0, 21)}=`,
    `resbite://r/%41${code.slice(1)}`,
    `resbite://r/${code}\n`,
    `RESBITE://r/${code}`,
    `/r/${code}?x=1`,
    `/r/${code}/`,
    `/r/${code.slice(1)}`,
    "/r/",
    "/r",
  ]) {
    assert.equal(parseEventLink(bad, origin), null, bad);
    assert.equal(routeSystemLink(bad, origin), "/invite", bad);
  }
  // Ordinary internal paths and the auth callback are left alone.
  assert.equal(routeSystemLink("/event?plan=x", origin), "/event?plan=x");
  assert.equal(routeSystemLink("/rsvp", origin), "/rsvp");
});

test("the kept invitation is a token or a code, and routes to the invite screen by its shape", () => {
  assert.equal(isPendingInvite(token), true);
  assert.equal(isPendingInvite(code), true);
  for (const bad of [null, "", "bad", code + "a", token.slice(1), token.toUpperCase()])
    assert.equal(isPendingInvite(bad), false);
  assert.deepEqual(pendingInviteParams(token), { token });
  assert.deepEqual(pendingInviteParams(code), { code });
  assert.equal(pendingInviteParams(null), null);
  assert.equal(pendingInviteParams("nonsense"), null);
});

test("a kept event link code survives a restart, replaces a token, and a stale claim cannot clear it", async () => {
  const data = new Map<string, string>();
  const disk = {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: async (key: string) => {
      data.delete(key);
    },
  };
  let current: string | null = null;
  const store = createPendingInviteStore(disk, (value) => {
    current = value;
  });
  await store.remember(token);
  const route = routeSystemLink(buildEventLink(code, origin), origin);
  await store.remember(new URL(route, origin).searchParams.get("code"));
  assert.equal(current, code);
  assert.equal(data.size, 1);
  const restarted = createPendingInviteStore(disk, (value) => {
    current = value;
  });
  current = null;
  await restarted.restore();
  assert.equal(current, code);
  // A claim of the older token does not clear the newer code; the code's own claim does.
  await restarted.remember(null, token);
  assert.equal(current, code);
  await restarted.remember(otherCode);
  await restarted.remember(null, code);
  assert.equal(current, otherCode);
  await restarted.remember(null, otherCode);
  assert.equal(current, null);
  assert.equal(data.size, 0);
  await assert.rejects(restarted.remember(code + "a"));
  await assert.rejects(restarted.remember("short"));
  // A malformed stored value is ignored on restore.
  data.set("resbite.pending-invite", "not a code");
  current = "x";
  await restarted.restore();
  assert.equal(current, null);
});
