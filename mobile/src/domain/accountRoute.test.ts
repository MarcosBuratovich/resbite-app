import assert from "node:assert/strict";
import { accountGate } from "./accountRoute";

const base = { status: "approved", phoneVerified: true, name: null as string | null, profileReady: false };

assert.equal(accountGate({ ...base, phoneVerified: false }), "add-phone");
assert.equal(accountGate({ ...base, status: "access_pending", phoneVerified: false }), "add-phone");
assert.equal(accountGate(base), "about-you");
assert.equal(accountGate({ ...base, profileReady: true }), null);
assert.equal(accountGate({ ...base, status: "access_pending", name: "Sam" }), null);
assert.equal(accountGate({ ...base, status: "unconfirmed", phoneVerified: false }), null);
assert.equal(accountGate({ ...base, status: "checking", phoneVerified: false }), null);
assert.equal(accountGate({ ...base, status: "error", phoneVerified: false }), null);
console.log("accountRoute tests passed");
