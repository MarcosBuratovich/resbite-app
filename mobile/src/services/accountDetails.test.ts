import test from "node:test";
import assert from "node:assert/strict";
import type { User } from "@supabase/supabase-js";
import {
  saveAccountDetails,
  accountDetailsAdapter,
  type DetailsAdapter,
} from "./accountDetails";
import {
  detailsFromMetadata,
  emptyRegistration,
  optionalMetadata,
  hasReviewedDetails,
} from "../domain/registration";
const user = (
  details: unknown = {
    birth_date: "1990-01-01",
    phone: "+447700900123",
    city: "London",
    interests: ["Outdoors"],
  },
): User =>
  ({
    id: "owner",
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-09-23T00:00:00Z",
    user_metadata: { provider_name: "Kept", registration_details: details },
  }) as User;
const run = (
  baseline: User,
  adapter: DetailsAdapter,
  assertCurrent = () => {},
) =>
  saveAccountDetails({
    accountId: "owner",
    baseline,
    value: { ...emptyRegistration },
    assertCurrent,
    adapter,
  });
test("explicit removal preserves unrelated metadata and verifies saved values", async () => {
  let state = user(),
    writes = 0;
  const result = await run(state, {
    read: async () => state,
    update: async (data) => {
      writes++;
      state = { ...state, user_metadata: { ...state.user_metadata, ...data } };
      return state;
    },
  });
  assert.equal(writes, 1);
  assert.equal(result.user_metadata.provider_name, "Kept");
  assert.deepEqual(result.user_metadata.registration_details, {
    birth_date: null,
    phone: null,
    city: null,
    interests: [],
  });
});
test("lost reply is reconciled without repeating mutation", async () => {
  let state = user(),
    writes = 0;
  const baseline = state;
  const adapter: DetailsAdapter = {
    read: async () => state,
    update: async (data) => {
      writes++;
      state = { ...state, user_metadata: { ...state.user_metadata, ...data } };
      throw Error("reply lost");
    },
  };
  await run(baseline, adapter);
  await run(baseline, adapter);
  assert.equal(writes, 1);
});
test("newly observed remote changes are not overwritten", async () => {
  let writes = 0;
  const baseline = user(),
    other = user({
      ...baseline.user_metadata.registration_details,
      city: "Paris",
    });
  await assert.rejects(
    run(baseline, {
      read: async () => other,
      update: async () => {
        writes++;
        return other;
      },
    }),
    /another device/,
  );
  assert.equal(writes, 0);
});
test("wrong user and changed session stop writes", async () => {
  let writes = 0,
    active = true;
  const baseline = user(),
    update = async () => {
      writes++;
      return baseline;
    };
  await assert.rejects(
    run(baseline, { read: async () => ({ ...baseline, id: "other" }), update }),
    /Account changed/,
  );
  await assert.rejects(
    run(
      baseline,
      {
        read: async () => {
          active = false;
          return baseline;
        },
        update,
      },
      () => {
        if (!active) throw Error("stale session");
      },
    ),
    /stale session/,
  );
  assert.equal(writes, 0);
});
test("failed save keeps an uncertain outcome; cannot report success from old values", async () => {
  const baseline = user();
  await assert.rejects(
    run(baseline, {
      read: async () => baseline,
      update: async () => {
        throw Error("offline");
      },
    }),
    /could not be confirmed/,
  );
});
test("Google metadata is optional until explicitly reviewed; malformed values are ignored", () => {
  assert.equal(hasReviewedDetails({ full_name: "Google Name" }), false);
  assert.equal(
    detailsFromMetadata({ full_name: "Google Name" }).name,
    "Google Name",
  );
  assert.equal(hasReviewedDetails({ registration_details_version: 1 }), true);
  assert.deepEqual(
    optionalMetadata(
      detailsFromMetadata({
        registration_details: {
          city: 5,
          interests: ["Outdoors", "bad", "Outdoors"],
        },
      }),
    ),
    { birth_date: null, phone: null, city: null, interests: ["Outdoors"] },
  );
});
test("adapter sends captured bearer token and raw baseline to atomic RPC", async () => {
  const original = globalThis.fetch;
  let writes = 0;
  const baseline = user();
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer captured-token",
      );
      if (String(url).endsWith("/auth/v1/user"))
        return new Response(JSON.stringify(baseline));
      assert.equal(
        String(url).endsWith("/rpc/save_registration_details"),
        true,
      );
      const body = JSON.parse(init!.body as string);
      assert.deepEqual(
        body.p_expected,
        baseline.user_metadata.registration_details,
      );
      assert.deepEqual(body.p_details, {
        birth_date: null,
        phone: null,
        city: null,
        interests: [],
      });
      writes++;
      return new Response(
        JSON.stringify({
          account_id: "owner",
          registration_details: body.p_details,
        }),
      );
    };
    await run(baseline, accountDetailsAdapter("captured-token"));
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = original;
  }
});
