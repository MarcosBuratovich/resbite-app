import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createScreenTurn } from "./screenTurn";

test("work started on a screen still counts while the screen shows the same account and resbite (C25)", () => {
  const screen = createScreenTurn();
  screen.show("pedro:plan-1");
  screen.mount();
  const here = screen.begin();
  assert.equal(here(), true);
  // A render that shows the same thing changes nothing.
  screen.show("pedro:plan-1");
  assert.equal(here(), true);
});

test("work started on a screen stops counting once it shows another account or resbite, even if it comes back", () => {
  const screen = createScreenTurn();
  screen.show("pedro:plan-1");
  screen.mount();
  const here = screen.begin();
  screen.show("pedro:plan-2");
  assert.equal(here(), false, "another resbite");
  screen.show("pedro:plan-1");
  assert.equal(here(), false, "back again: still a later turn");
  assert.equal(screen.begin()(), true, "work started now counts");
  const later = screen.begin();
  screen.show("sol:plan-1");
  assert.equal(later(), false, "another account");
});

test("work started on a screen stops counting once it closes; StrictMode's remount keeps it", () => {
  const screen = createScreenTurn();
  screen.show("pedro:plan-1");
  const unmount = screen.mount();
  const here = screen.begin();
  // StrictMode runs the effect, its cleanup, then the effect again, on the same screen.
  unmount();
  const again = screen.mount();
  assert.equal(here(), true);
  again();
  assert.equal(here(), false, "closed");
});

test("nothing counts before the screen is mounted", () => {
  const screen = createScreenTurn();
  screen.show("pedro:plan-1");
  assert.equal(screen.begin()(), false);
});

test("Invite people's sendLink and the refusal reload check the screen is still current before setting state (C25)", () => {
  const screen = readFileSync(new URL("../../app/invitations.tsx", import.meta.url), "utf8");
  assert.match(screen, /const beginTurn = useScreenTurn\(identity\);/);
  const send = screen.slice(screen.indexOf("async function sendLink("), screen.indexOf("const progress ="));
  // The turn is taken before anything is awaited.
  assert.ok(send.indexOf("const here = beginTurn();") >= 0 && send.indexOf("const here = beginTurn();") < send.indexOf("await"), "turn first");
  // After the names are read: nothing is set and nothing is sent once the screen moved on.
  const names = send.indexOf("await nameOf(plan.owner_id)");
  const check = send.indexOf("if (!here()) return;");
  assert.ok(names >= 0 && check > names, "checked after the name reads");
  assert.ok(check < send.indexOf("setOwn(ownName)") && check < send.indexOf("contacts.send("), "checked before setting state or sending");
  // After the send: the line is set only while the screen is current.
  assert.match(send, /const line = await contacts\.send\(item, via, words\);\s*if \(here\(\)\) contacts\.setError\(line\);/);
  assert.doesNotMatch(send, /contacts\.setError\(await/);
  const reload = screen.slice(screen.indexOf("// Bring mode reads the allowance again"), screen.indexOf("async function sendLink("));
  assert.match(reload, /const here = beginTurn\(\);/);
  assert.match(reload, /if \(here\(\) && shownPlan\.current === id\) takeAllowance\(ticket, next, true\);/);
});
