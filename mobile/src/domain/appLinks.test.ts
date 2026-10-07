import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  buildInvitationLink,
  invitationOrigin,
  parseInvitationLink,
  routeSystemLink,
} from "./appLinks";
import { createPendingInviteStore } from "../services/pendingInviteStore";
const token = "a".repeat(64),
  second = "b".repeat(64),
  origin = "https://links.example.org";

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
