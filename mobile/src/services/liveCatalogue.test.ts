import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readPublishedCatalogue, type CatalogueAdapter } from "./liveCatalogue";
import { decodePublishedActivities } from "../domain/catalogue";
import { filterActivities } from "../domain/rules";

test("three owner-approved additions decode with reviewed content and intersect search with approved categories", async () => {
  const additions = JSON.parse(
    await readFile(
      new URL("../../content/activity-additions.json", import.meta.url),
      "utf8",
    ),
  );
  const overlay = JSON.parse(
    await readFile(new URL("../../content/activity-categories.json", import.meta.url), "utf8"),
  );
  const rows = additions.map(
    (item: {
      id: string;
      title: string;
      description: string;
      tips: string[];
      sourceIds: string[];
    }) => ({
      id: item.id,
      title: item.title,
      categories: overlay.activities.find((entry: { id: string }) => entry.id === item.id).categories,
      description: item.description,
      artwork_key: item.id,
      source_ids: item.sourceIds,
      tips: item.tips,
      duration_minutes: null,
      published: true,
    }),
  );
  const decoded = decodePublishedActivities(rows);
  assert.deepEqual(
    decoded.map((item) => item.id),
    ["picnic-in-the-park", "walk-and-talk", "board-game-night"],
  );
  for (const [index, item] of decoded.entries()) {
    assert.equal(item.description, additions[index].description);
    assert.deepEqual(item.tips, additions[index].tips);
    assert.deepEqual(item.sourceIds, [`R20260924-${item.id}`]);
    assert.equal(item.artwork, `${item.id}.png`);
    assert.equal(item.durationMinutes, null);
  }
  assert.deepEqual(
    filterActivities(decoded, " PICNIC ", "natural").map((item) => item.id),
    ["picnic-in-the-park"],
  );
  assert.deepEqual(filterActivities(decoded, "picnic", "physical"), []);
  assert.deepEqual(
    filterActivities(decoded, "", "community").map((item) => item.id),
    ["picnic-in-the-park", "walk-and-talk", "board-game-night"],
  );
});

const published = {
  id: "coffee-together",
  title: "Reviewed title",
  description: "Only server copy",
  categories: ["community", "uplifting"],
  artwork_key: "coffee-together",
  source_ids: ["review"],
  published: true,
  duration_minutes: 45,
  tips: ["Server suggestion"],
};
function setup(rows: unknown = [published]) {
  let accountId = "owner";
  const controller = new AbortController();
  const options = {
    accountId: "owner",
    assertCurrent() {
      assert.equal(accountId, "owner", "Account changed");
    },
    signal: controller.signal,
  };
  const adapter: CatalogueAdapter = {
    async sessionAccountId() {
      return accountId;
    },
    async read() {
      return rows;
    },
  };
  return {
    options,
    adapter,
    controller,
    switchAccount() {
      accountId = "another";
    },
  };
}

test("published catalogue uses complete server copy; empty response stays empty", async () => {
  const live = setup();
  const items = await readPublishedCatalogue(live.options, live.adapter);
  assert.deepEqual(items, [
    {
      id: published.id,
      title: "Reviewed title",
      description: "Only server copy",
      categories: published.categories,
      artwork: "coffee-together.png",
      sourceIds: ["review"],
      durationMinutes: 45,
      tips: ["Server suggestion"],
    },
  ]);
  const empty = setup([]);
  assert.deepEqual(
    await readPublishedCatalogue(empty.options, empty.adapter),
    [],
  );
});

test("unpublished, malformed and unsupported activity details never receive draft fallback", () => {
  for (const row of [
    { ...published, published: false },
    { ...published, title: "" },
    { ...published, tips: null },
    { ...published, tips: [null] },
    { ...published, artwork_key: "unknown" },
    { ...published, duration_minutes: undefined },
    { ...published, duration_minutes: 0 },
    { ...published, duration_minutes: 2.5 },
  ])
    assert.throws(() => decodePublishedActivities([row]));
  assert.throws(() => decodePublishedActivities([published, published]));
  assert.equal(
    decodePublishedActivities([
      { ...published, tips: [], duration_minutes: null },
    ])[0].durationMinutes,
    null,
  );
});

test("read errors stay errors and a later retry can succeed", async () => {
  const live = setup();
  live.adapter.read = async () => {
    throw Error("offline");
  };
  await assert.rejects(
    readPublishedCatalogue(live.options, live.adapter),
    /offline/,
  );
  live.adapter.read = async () => [published];
  assert.equal(
    (await readPublishedCatalogue(live.options, live.adapter))[0].title,
    "Reviewed title",
  );
});

test("activity detail rejects a result for another deep-link id", async () => {
  const live = setup();
  await assert.rejects(
    readPublishedCatalogue(
      { ...live.options, activityId: "painting" },
      live.adapter,
    ),
    /unavailable/,
  );
});

test("account change before or during a read cannot return catalogue rows", async () => {
  const before = setup();
  let reads = 0;
  before.adapter.read = async () => {
    reads++;
    return [published];
  };
  before.switchAccount();
  await assert.rejects(
    readPublishedCatalogue(before.options, before.adapter),
    /Account changed/,
  );
  assert.equal(reads, 0);
  const during = setup();
  during.adapter.read = async () => {
    during.switchAccount();
    return [published];
  };
  await assert.rejects(
    readPublishedCatalogue(during.options, during.adapter),
    /Account changed/,
  );
  const sharedSession = setup();
  sharedSession.adapter.sessionAccountId = async () => "different";
  await assert.rejects(
    readPublishedCatalogue(sharedSession.options, sharedSession.adapter),
    /Account changed/,
  );
});

test("leaving focus aborts a late reply even when its adapter ignores cancellation", async () => {
  const live = setup();
  let release!: (value: unknown) => void;
  live.adapter.read = async () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const request = readPublishedCatalogue(live.options, live.adapter);
  await new Promise((resolve) => setImmediate(resolve));
  live.controller.abort();
  await assert.rejects(request, /interrupted/);
  release([published]);
});

test("a hung account/catalogue read has a finite retryable deadline", async () => {
  const live = setup();
  live.adapter.sessionAccountId = async () => new Promise(() => {});
  await assert.rejects(
    readPublishedCatalogue({ ...live.options, timeoutMs: 5 }, live.adapter),
    /interrupted/,
  );
});

test("a server without approved categories is reported, not shown with guessed labels", () => {
  const legacy: Record<string, unknown> = { ...published, category: "Meals & Drinks" };
  delete legacy.categories;
  assert.throws(() => decodePublishedActivities([legacy]), /could not be read/);
  assert.throws(
    () => decodePublishedActivities([{ ...published, categories: ["community", "community"] }]),
    /could not be read/,
  );
  assert.deepEqual(decodePublishedActivities([published])[0].categories, ["community", "uplifting"]);
});
