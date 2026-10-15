import test from "node:test";
import assert from "node:assert/strict";
import { defaultEnd, shiftedEnd, spokenRange, timeRange, validateEnd } from "./eventTime.ts";

// Local times, built in the test machine's zone like the app's editor values.
const at = (text: string) => new Date(text.replace(" ", "T")).toISOString();

test("time range: start only, same day, next day, and nonsense ends ignored", () => {
  assert.equal(timeRange(at("2099-10-16 10:00")), "10:00");
  assert.equal(timeRange(at("2099-10-16 10:00"), null), "10:00");
  assert.equal(timeRange(at("2099-10-16 10:00"), at("2099-10-16 12:00")), "10:00 – 12:00");
  assert.equal(timeRange(at("2099-10-16 22:00"), at("2099-10-17 02:00")), "22:00 – Sat 17 02:00");
  assert.equal(timeRange(at("2099-10-16 10:00"), at("2099-10-16 09:00")), "10:00");
  assert.equal(timeRange(at("2099-10-16 10:00"), "garbage"), "10:00");
  assert.equal(timeRange(null, at("2099-10-16 12:00")), "");
});

test("spoken range for VoiceOver", () => {
  const now = new Date(2099, 9, 1);
  assert.equal(spokenRange(at("2099-10-16 10:00"), at("2099-10-16 12:00"), now), "from 10:00 to 12:00");
  assert.equal(spokenRange(at("2099-10-16 22:00"), at("2099-10-17 02:00"), now), "from 22:00 to 02:00 on Saturday 17 October");
  assert.equal(spokenRange(at("2099-10-16 10:00"), null, now), "");
});

test("end validation: optional, valid, after the start", () => {
  assert.equal(validateEnd("2099-10-16 10:00", ""), null);
  assert.equal(validateEnd("2099-10-16 10:00", "2099-10-16 12:00"), null);
  assert.equal(validateEnd("2099-10-16 22:00", "2099-10-17 02:00"), null);
  assert.equal(validateEnd("2099-10-16 10:00", "2099-10-16 10:00"), "The end must be after the start.");
  assert.equal(validateEnd("2099-10-16 10:00", "2099-10-16 09:59"), "The end must be after the start.");
  assert.equal(validateEnd("2099-10-16 10:00", "2099-02-30 12:00"), "Choose a valid end time.");
});

test("the end picker starts an hour after the start, and a moved start keeps the length", () => {
  assert.equal(defaultEnd("2099-10-16 10:00"), "2099-10-16 11:00");
  assert.equal(defaultEnd("2099-10-16 23:30"), "2099-10-17 00:30");
  assert.equal(defaultEnd(""), "");
  assert.equal(shiftedEnd("2099-10-16 10:00", "2099-10-18 09:00", "2099-10-16 12:30"), "2099-10-18 11:30");
  assert.equal(shiftedEnd("2099-10-16 10:00", "2099-10-18 09:00", ""), "");
  // An end that wasn't after the old start isn't a length to keep.
  assert.equal(shiftedEnd("2099-10-16 10:00", "2099-10-18 09:00", "2099-10-16 09:00"), "2099-10-16 09:00");
});
