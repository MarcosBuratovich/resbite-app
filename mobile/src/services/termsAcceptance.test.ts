import test from "node:test";
import assert from "node:assert/strict";
import { TERMS_COPY } from "../domain/termsCopy";
import { acceptTerms, termsErrorMessage } from "./termsAcceptance";

test("accept sends the version; a stale version reads as changed, anything else as failed", async () => {
  const sent: string[] = [];
  await acceptTerms("2026-12", { acceptTerms: async (v) => void sent.push(v) });
  assert.deepEqual(sent, ["2026-12"]);
  assert.deepEqual(termsErrorMessage(Error("Terms changed")), { message: TERMS_COPY.changed, changed: true });
  assert.deepEqual(termsErrorMessage(Error("Failed to fetch")), { message: TERMS_COPY.failed, changed: false });
  assert.deepEqual(termsErrorMessage(null), { message: TERMS_COPY.failed, changed: false });
});

test("a refused or failed call rejects with the server's words, for termsErrorMessage to read", async () => {
  await assert.rejects(
    acceptTerms("2026-11", {
      acceptTerms: async () => {
        throw Error("Terms changed");
      },
    }),
    (e: unknown) => termsErrorMessage(e).changed === true,
  );
  await assert.rejects(
    acceptTerms("2026-12", {
      acceptTerms: async () => {
        throw Error("Sign-in required");
      },
    }),
    (e: unknown) => termsErrorMessage(e).message === TERMS_COPY.failed,
  );
  // Only the server's exact refusal counts as changed: a thrown string or other words don't.
  assert.equal(termsErrorMessage("Terms changed").changed, false);
  assert.equal(termsErrorMessage(Error("Terms changed later")).changed, false);
});
