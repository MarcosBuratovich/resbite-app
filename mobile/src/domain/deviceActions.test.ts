import test from "node:test";
import assert from "node:assert/strict";
import { createDeviceActions } from "./deviceActions.ts";

// The event page's device actions (calendar, reminders, turning notifications on): one at a time.

function harness() {
  const log: string[] = [];
  const actions = createDeviceActions({
    busy: (on) => log.push(on ? "busy" : "idle"),
    error: (message) => log.push(`error:${message}`),
    settled: () => log.push("read"),
  });
  return { log, actions };
}
/** An action that finishes (or fails) when told to. */
function gate(name: string, log: string[]) {
  let finish!: (ok: boolean) => void;
  const done = new Promise<boolean>((resolve) => (finish = resolve));
  return {
    work: async () => {
      log.push(`start:${name}`);
      if (!(await done)) throw Error(`${name} failed`);
      log.push(`end:${name}`);
    },
    finish,
  };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("an action shows busy, clears the last error, and the chips read the phone again after it", async () => {
  const { log, actions } = harness();
  await actions.run(async () => void log.push("work"), "Calendar failed");
  assert.deepEqual(log, ["busy", "error:null", "work", "idle", "read"]);
});

test("a failed action reports its own failure", async () => {
  const { log, actions } = harness();
  await actions.run(async () => {
    throw Error("no");
  }, "Calendar failed");
  assert.deepEqual(log, ["busy", "error:null", "error:Calendar failed", "idle", "read"]);
});

test("a second tap while an action runs is dropped", async () => {
  const { log, actions } = harness();
  const first = gate("calendar", log);
  const running = actions.run(first.work, "Calendar failed");
  await actions.run(async () => void log.push("second"), "Reminders failed");
  first.finish(true);
  await running;
  await flush();
  assert.equal(log.includes("second"), false);
});

test("a queued action (Turn on notifications) runs once the current one finishes, never dropped", async () => {
  const { log, actions } = harness();
  const first = gate("calendar", log);
  const running = actions.run(first.work, "Calendar failed");
  void actions.run(async () => void log.push("turn-on"), "Turn on failed", { queue: true });
  assert.equal(log.includes("turn-on"), false, "it waits for the current action");
  first.finish(true);
  await running;
  await flush();
  assert.deepEqual(log, [
    "busy",
    "error:null",
    "start:calendar",
    "end:calendar",
    "idle",
    "read",
    "busy",
    "turn-on",
    "idle",
    "read",
  ]);
});

test("a queued action runs after a failed one, and keeps that failure on screen unless it fails too", async () => {
  {
    const { log, actions } = harness();
    const first = gate("calendar", log);
    const running = actions.run(first.work, "Calendar failed");
    void actions.run(async () => void log.push("turn-on"), "Turn on failed", { queue: true });
    first.finish(false);
    await running;
    await flush();
    assert.deepEqual(log.slice(-5), ["read", "busy", "turn-on", "idle", "read"]);
    assert.equal(log.filter((x) => x === "error:null").length, 1, "the calendar failure stays");
  }
  {
    const { log, actions } = harness();
    const first = gate("calendar", log);
    const running = actions.run(first.work, "Calendar failed");
    void actions.run(async () => {
      throw Error("no");
    }, "Turn on failed", { queue: true });
    first.finish(true);
    await running;
    await flush();
    assert.equal(log.at(-3), "error:Turn on failed");
  }
});

test("queued actions run in order, one at a time", async () => {
  const { log, actions } = harness();
  const first = gate("calendar", log);
  const second = gate("turn-on", log);
  const running = actions.run(first.work, "Calendar failed");
  void actions.run(second.work, "Turn on failed", { queue: true });
  void actions.run(async () => void log.push("third"), "Reminders failed", { queue: true });
  first.finish(true);
  await flush();
  assert.ok(log.includes("start:turn-on"));
  assert.equal(log.includes("third"), false, "the third waits for the second");
  second.finish(true);
  // The first tap's run settles once everything queued behind it has.
  await running;
  const order = log.filter((x) => x.startsWith("start:") || x.startsWith("end:") || x === "third");
  assert.deepEqual(order, ["start:calendar", "end:calendar", "start:turn-on", "end:turn-on", "third"]);
});
