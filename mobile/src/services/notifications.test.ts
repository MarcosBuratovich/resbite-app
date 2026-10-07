import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createNotificationService,
  type NotificationAdapter,
} from "./notifications";
import { notificationDelivery, permissionCopy } from "../domain/notifications";
function fixture(platform = "ios") {
  let reads = 0,
    opens = 0;
  const adapter: NotificationAdapter = {
    platform,
    getPermission: async () => {
      reads++;
      return { status: "undetermined" };
    },
    openSettings: async () => {
      opens++;
    },
  };
  return {
    adapter,
    counts: () => ({ reads, opens }),
    service: createNotificationService(adapter),
  };
}
test("preview and unsupported platforms never inspect permission or open settings", async () => {
  for (const [platform, preview, expected] of [
    ["ios", true, "preview"],
    ["web", false, "unsupported"],
  ] as const) {
    const f = fixture(platform);
    assert.equal(await f.service.readPermission(preview), expected);
    await assert.rejects(f.service.openSettings(preview));
    assert.deepEqual(f.counts(), { reads: 0, opens: 0 });
  }
});
test("iOS richer permission distinguishes quiet and temporary access", async () => {
  const f = fixture();
  for (const [status, expected] of [
    [0, "undetermined"],
    [1, "denied"],
    [2, "granted"],
    [3, "provisional"],
    [4, "ephemeral"],
    [99, "unknown"],
  ] as const) {
    f.adapter.getPermission = async () => ({
      status: "denied",
      ios: { status },
    });
    assert.equal(await f.service.readPermission(false), expected);
    assert.ok(permissionCopy[expected].detail);
  }
});
test("Android permission is read afresh and failures stay failures", async () => {
  const f = fixture("android");
  for (const status of ["undetermined", "granted", "denied"] as const) {
    f.adapter.getPermission = async () => ({ status });
    assert.equal(await f.service.readPermission(false), status);
  }
  f.adapter.getPermission = async () => {
    throw Error("unavailable");
  };
  await assert.rejects(f.service.readPermission(false), /unavailable/);
});
test("settings opening is explicit and preserves platform errors", async () => {
  const f = fixture();
  await f.service.readPermission(false);
  assert.deepEqual(f.counts(), { reads: 1, opens: 0 });
  await f.service.openSettings(false);
  assert.deepEqual(f.counts(), { reads: 1, opens: 1 });
  f.adapter.openSettings = async () => {
    throw Error("unavailable");
  };
  await assert.rejects(f.service.openSettings(false), /unavailable/);
  assert.equal(notificationDelivery.enabled, false);
});
