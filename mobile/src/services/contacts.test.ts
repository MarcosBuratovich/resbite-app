import test from "node:test";
import assert from "node:assert/strict";
import { createContactService, type ContactAdapter } from "./contacts";

function fixture(overrides: Partial<ContactAdapter> = {}) {
  const calls: string[] = [];
  const adapter: ContactAdapter = {
    platform: "ios",
    getPermission: async () => {
      calls.push("check");
      return { granted: true, accessPrivileges: "all" };
    },
    requestPermission: async () => {
      calls.push("request");
      return { granted: true, accessPrivileges: "all" };
    },
    read: async (offset, limit) => {
      calls.push(`read:${offset}:${limit}`);
      return [];
    },
    expand: async () => {
      calls.push("expand");
    },
    ...overrides,
  };
  return { service: createContactService(adapter), calls };
}

test("contact reads request permission only for an explicit action and never enumerate after denial", async () => {
  const { service, calls } = fixture();
  await service.readContactPage(0, true);
  await service.readContactPage(50);
  assert.deepEqual(calls, [
    "request",
    "read:0:50",
    "check",
    "check",
    "read:50:50",
    "check",
  ]);
  const denied = fixture({
    requestPermission: async () => ({
      granted: false,
      accessPrivileges: "none",
    }),
  });
  await assert.rejects(
    denied.service.readContactPage(0, true),
    /Contacts access is off/,
  );
  assert.deepEqual(denied.calls, []);
  const web = fixture({ platform: "web" });
  await assert.rejects(web.service.readContactPage(0, true), /iPhone app/);
  assert.equal(await web.service.hasContactAccess(), false);
  assert.deepEqual(web.calls, []);
});

test("limited pages retain separate details, deduplicate normalized addresses and count unusable contacts", async () => {
  const { service } = fixture({
    getPermission: async () => ({ granted: true, accessPrivileges: "limited" }),
    read: async () => [
      {
        fullName: " Alex ",
        emails: [{ address: " A@EXAMPLE.COM " }, { address: "a@example.com" }],
        phones: [{ number: "+44 (7700) 900-123" }],
      },
      { fullName: null, phones: [{ number: "07700900123" }] },
      {
        fullName: "No detail",
        emails: [{ address: "invalid" }],
        phones: [{ number: "123" }],
      },
      { fullName: "Empty" },
    ],
  });
  const page = await service.readContactPage(50);
  assert.equal(page.limited, true);
  assert.equal(page.nextOffset, 54);
  assert.equal(page.more, false);
  assert.equal(page.missing, 2);
  assert.deepEqual(
    page.people.map((p) => p.key),
    ["email:a@example.com", "phone:+447700900123", "phone:07700900123"],
  );
  assert.equal(page.people[2].name, "Unnamed contact");
});

test("pagination advances by raw records even when every record lacks usable details", async () => {
  const { service } = fixture({
    read: async () => Array.from({ length: 50 }, () => ({})),
  });
  const page = await service.readContactPage(50);
  assert.equal(page.nextOffset, 100);
  assert.equal(page.more, true);
  assert.equal(page.missing, 50);
  assert.deepEqual(page.people, []);
  await assert.rejects(service.readContactPage(-1), /contacts page/);
});

test("a page is discarded if permission is revoked or narrowed while it loads", async () => {
  for (const accessPrivileges of ["none", "limited"] as const) {
    let checks = 0;
    const { service } = fixture({
      getPermission: async () =>
        ++checks === 1
          ? { granted: true, accessPrivileges: "all" }
          : { granted: accessPrivileges !== "none", accessPrivileges },
      read: async () => [
        {
          fullName: "Private",
          emails: [{ address: "private@example.invalid" }],
        },
      ],
    });
    await assert.rejects(service.readContactPage(), /Contacts access/);
  }
});

test("expanding access invokes only the iOS limited-access picker and does not request broader permission", async () => {
  const limited = fixture({
    getPermission: async () => ({ granted: true, accessPrivileges: "limited" }),
  });
  await limited.service.expandContactAccess();
  assert.deepEqual(limited.calls, ["expand"]);
  const full = fixture();
  await full.service.expandContactAccess();
  assert.deepEqual(full.calls, ["check"]);
  const revoked = fixture({
    getPermission: async () => ({ granted: false, accessPrivileges: "none" }),
  });
  await assert.rejects(
    revoked.service.expandContactAccess(),
    /Contacts access is off/,
  );
  assert.deepEqual(revoked.calls, []);
});
