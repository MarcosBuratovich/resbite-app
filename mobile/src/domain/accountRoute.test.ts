import assert from "node:assert/strict";
import { accountGate, gateHref } from "./accountRoute";

const base = { status: "approved", phoneVerified: true, termsNeeded: false, name: null as string | null, profileReady: false };

assert.equal(accountGate({ ...base, phoneVerified: false }), "add-phone");
assert.equal(accountGate({ ...base, status: "access_pending", phoneVerified: false }), "add-phone");
assert.equal(accountGate(base), "about-you");
assert.equal(accountGate({ ...base, profileReady: true }), null);
assert.equal(accountGate({ ...base, status: "access_pending", name: "Sam" }), null);
assert.equal(accountGate({ ...base, status: "unconfirmed", phoneVerified: false }), null);
assert.equal(accountGate({ ...base, status: "checking", phoneVerified: false }), null);
assert.equal(accountGate({ ...base, status: "error", phoneVerified: false }), null);
assert.equal(accountGate({ ...base, status: "access_pending" }), "about-you");
assert.equal(accountGate({ ...base, name: "Sam" }), null);
assert.equal(accountGate({ ...base, termsNeeded: true }), "accept-terms");
assert.equal(accountGate({ ...base, termsNeeded: true, profileReady: true, name: "Sam" }), "accept-terms");
assert.equal(accountGate({ ...base, termsNeeded: true, phoneVerified: false }), "add-phone");
assert.equal(accountGate({ ...base, termsNeeded: true, status: "access_pending", name: "Sam" }), null);
assert.equal(accountGate({ ...base, termsNeeded: true, status: "access_pending" }), "about-you");
assert.deepEqual(gateHref, { "add-phone": "/add-phone", "accept-terms": "/accept-terms", "about-you": "/about-you" });
console.log("accountRoute tests passed");
