import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as calendarDomain from "../domain/calendarEvent.ts";
import * as mirrorModule from "./deviceMirror.ts";
import { CALENDAR_ADDED_NOTE, CALENDAR_UPDATED_NOTE, type CalendarEventDetails } from "../domain/calendarEvent.ts";
import type { DeviceMirror } from "./deviceMirror.ts";
import { createCalendarRecordStore } from "./calendarRecordStore.ts";
import {
  createCalendarService,
  createFakeCalendarAdapter,
  type CalendarAdapter,
  type CalendarResult,
} from "./calendar.ts";

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
  };
}
const plan = {
  id: "plan-1",
  title: "Picnic in the park",
  starts_at: "2099-01-01T10:00:00Z",
  ends_at: null,
  place_label: " Riverside park ",
  note: "Door code 4521",
};

function harness(result: CalendarResult) {
  const shown: CalendarEventDetails[] = [];
  const adapter: CalendarAdapter = {
    add: async (details) => {
      shown.push(details);
      return result;
    },
  };
  const records = createCalendarRecordStore(memory());
  return { shown, records, calendar: createCalendarService(adapter, records) };
}

test("a saved entry is remembered with the start, end and place it was added with", async () => {
  for (const result of ["saved", "done"] as const) {
    const h = harness(result);
    assert.equal(await h.calendar.add("owner", plan, false), true);
    assert.deepEqual(await h.records.get("owner", "plan-1"), {
      starts_at: plan.starts_at,
      ends_at: null,
      place_label: "Riverside park",
    });
    // The form gets the name, times and place; never the Meeting details, and no alert.
    assert.deepEqual(h.shown, [
      {
        title: "Picnic in the park",
        startDate: new Date("2099-01-01T10:00:00Z"),
        endDate: new Date("2099-01-01T11:00:00Z"),
        location: "Riverside park",
        notes: CALENDAR_ADDED_NOTE,
        alarms: [],
      },
    ]);
  }
});

test("a form that can't open (iOS 16, or one already open) rejects for the page to explain, and remembers nothing", async () => {
  // Controller ruling P10: the page shows CALENDAR_OPEN_FAILED; Resbite never asks for calendar access.
  const records = createCalendarRecordStore(memory());
  const failing: CalendarAdapter = {
    add: async () => {
      throw Error("Calendar permissions not granted");
    },
  };
  await assert.rejects(createCalendarService(failing, records).add("owner", plan, false), /permissions not granted/);
  assert.equal(await records.get("owner", "plan-1"), null);
});

test("a cancelled form remembers nothing; Update calendar fills in the updated note", async () => {
  for (const result of ["canceled", "deleted"] as const) {
    const h = harness(result);
    assert.equal(await h.calendar.add("owner", plan, true), false);
    assert.equal(await h.records.get("owner", "plan-1"), null);
    assert.equal(h.shown[0].notes, CALENDAR_UPDATED_NOTE);
  }
});

test("the entry counts as added even when this phone can't remember it", async () => {
  const records = { remember: async () => Promise.reject(Error("locked")) };
  const calendar = createCalendarService({ add: async () => "saved" }, records);
  assert.equal(await calendar.add("owner", plan, false), true);
  const changed = createCalendarService({ add: async () => "saved" }, createCalendarRecordStore(memory()));
  assert.equal(
    await changed.add("owner", plan, false, () => {
      throw Error("Session changed. Please try again.");
    }),
    true,
  );
});

test("the web and preview fake saves, and shows the entry to browser QA in development only", async () => {
  const device: DeviceMirror = { reminders: [], calendar: [], permission: "undetermined" };
  assert.equal(await createFakeCalendarAdapter(device).add(sample()), "saved");
  assert.equal(device.calendar.length, 1);
  assert.equal(device.calendar[0].title, "Picnic in the park");
  // Without a mirror (a release build), nothing is recorded anywhere.
  assert.equal(await createFakeCalendarAdapter(null).add(sample()), "saved");
  assert.equal(globalThis.__resbiteDevice, undefined);
});

function sample(): CalendarEventDetails {
  return {
    title: "Picnic in the park",
    startDate: new Date("2099-01-01T10:00:00Z"),
    endDate: new Date("2099-01-01T11:00:00Z"),
    location: "Riverside park",
    notes: CALENDAR_ADDED_NOTE,
    alarms: [],
  };
}

// The real phone's boundary, run against a stand-in for expo-calendar's legacy API (as nativeImports.test.ts).
test("the phone opens iPhone's own form with the details, and only saved or done counts as added", async () => {
  const opened: unknown[] = [];
  let action = "saved";
  const source = readFileSync(new URL("./calendar.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === "../domain/calendarEvent") return calendarDomain;
      if (name === "./deviceMirror") return mirrorModule;
      if (name === "expo-calendar/legacy")
        return {
          createEventInCalendarAsync: async (details: unknown, options?: unknown) => {
            opened.push([details, options]);
            return { action, id: null };
          },
        };
      throw Error(`Unexpected import: ${name}`);
    },
  });
  const adapter: CalendarAdapter = exports.nativeCalendarAdapter();
  assert.equal(await adapter.add(sample()), "saved");
  assert.deepEqual(opened, [[sample(), undefined]]);
  for (const [reported, expected] of [
    ["done", "done"],
    ["canceled", "canceled"],
    ["deleted", "deleted"],
    ["responded", "canceled"],
  ]) {
    action = reported;
    assert.equal(await adapter.add(sample()), expected);
  }
});
