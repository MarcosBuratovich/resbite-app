// Browser QA for CE2 cover photos. Every Supabase request is intercepted; nothing is uploaded.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const baseURL = process.env.RESBITE_QA_URL || "http://localhost:8081";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [];
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  created_at: "2026-01-01T00:00:00Z",
};
const expiry = Math.floor(Date.now() / 1000) + 3600;
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" })).toString("base64url"),
  "local-fixture-only",
].join(".");
const session = {
  access_token: token,
  refresh_token: "local-fixture",
  token_type: "bearer",
  expires_at: expiry,
  expires_in: 3600,
  user,
};
async function syntheticPng(page, width, height) {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#e07a5f";
      ctx.fillRect(0, 0, w, h);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [width, height],
  );
  return Buffer.from(base64, "base64");
}
// Clean JPEG: no APPn/COM metadata, longest side <= 1600, at most 2 MB.
function assertCleanJpeg(bytes) {
  assert.ok(bytes.length <= 2097152);
  assert.equal(bytes[0], 255);
  assert.equal(bytes[1], 216);
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i++] !== 255) continue;
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === 0 || (marker >= 208 && marker <= 215)) continue;
    if (marker === 217) break;
    assert.ok(!(marker >= 224 && marker <= 239) && marker !== 254, "No metadata segments uploaded");
    const length = bytes.readUInt16BE(i);
    if ([192, 193, 194].includes(marker)) {
      assert.ok(bytes.readUInt16BE(i + 3) <= 1600, "Cover height within 1600 px");
      assert.ok(bytes.readUInt16BE(i + 5) <= 1600, "Cover width within 1600 px");
    }
    i += length;
  }
}
try {
  // 1. Preview: a chosen cover stays in memory and shows on the plan card.
  const preview = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  preview.on("pageerror", (e) => errors.push(e.message));
  await preview.route("**/*.supabase.co/**", (route) => route.abort());
  await preview.goto(baseURL);
  await preview.getByText("Preview the design", { exact: true }).click();
  await preview.getByRole("tab", { name: "My resbites", exact: true }).click();
  await preview.getByRole("button", { name: "New resbite", exact: true }).click();
  await preview.getByLabel("Name", { exact: true }).fill("Cover picnic");
  await preview.getByRole("checkbox", { name: "Natural", exact: true }).click();
  await preview.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
  const previewChooser = preview.waitForEvent("filechooser");
  await preview.getByRole("button", { name: "Add cover photo", exact: true }).click();
  await (await previewChooser).setFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: await syntheticPng(preview, 3000, 1000),
  });
  await expect(preview.getByText("Preview cover stays in memory. Nothing is uploaded.", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Save preview plan", exact: true }).click();
  await expect(preview.getByText("Cover picnic", { exact: true })).toBeVisible();
  await expect(preview.locator('img[src^="data:image/jpeg"]').first()).toBeAttached();
  await preview.context().close();
  console.log("PASS: preview cover stays in memory and shows on the plan card.");

  // 2. Signed in: the plan saves first, the cover uploads after it, a failed attach
  // leaves a journal that Edit retries with the same path; then replace and remove.
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem("covers-seeded")) {
      sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(s));
      sessionStorage.setItem("covers-seeded", "1");
    }
  }, session);
  const plans = new Map();
  const uploads = [];
  let failNextLink = true;
  let coverBytes = Buffer.alloc(0);
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles")
      return reply({ id: user.id, display_name: "Fixture", avatar_path: null, avatar_revision: 0 });
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/attendees") return reply([]);
    if (path === "/rest/v1/plans") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const rows = [...plans.values()].filter((p) => !id || p.id === id);
      return reply(req.headers().accept?.includes("object") ? (rows[0] ?? null) : rows);
    }
    if (path === "/rest/v1/rpc/create_plan_v2") {
      const b = req.postDataJSON();
      plans.set(b.p_id, {
        id: b.p_id,
        owner_id: user.id,
        activity_id: b.p_activity,
        title: b.p_title.trim(),
        description: b.p_description,
        categories: b.p_categories,
        starts_at: b.p_start,
        time_zone: b.p_zone,
        place_label: b.p_place,
        note: b.p_note,
        status: "active",
        version: 1,
        cover_path: null,
        cover_revision: 0,
      });
      return reply(b.p_id);
    }
    if (path.startsWith("/storage/v1/object/sign/plan-covers/") && req.method() === "POST")
      return reply({ signedURL: "/object/sign/plan-covers/fixture.jpg?token=fixture" });
    if (path === "/storage/v1/object/sign/plan-covers/fixture.jpg")
      return route.fulfill({ contentType: "image/jpeg", body: coverBytes });
    if (path.startsWith("/storage/v1/object/plan-covers/")) {
      const objectPath = decodeURIComponent(path.slice("/storage/v1/object/plan-covers/".length));
      const bytes = req.postDataBuffer();
      assertCleanJpeg(bytes);
      coverBytes = bytes;
      uploads.push(objectPath);
      return reply({ Key: `plan-covers/${objectPath}`, Id: "fixture" });
    }
    if (path === "/rest/v1/rpc/set_plan_cover_if_current") {
      assert.equal(req.headers().authorization, `Bearer ${token}`);
      const { p_plan, p_path, p_expected_path, p_expected_revision } = req.postDataJSON();
      const plan = plans.get(p_plan);
      if (failNextLink) {
        failNextLink = false;
        return reply({ message: "Temporary failure" }, 503);
      }
      if (plan.cover_path !== p_expected_path || plan.cover_revision !== p_expected_revision) {
        if (plan.cover_path === p_path && plan.cover_revision === p_expected_revision + 1)
          return reply({ cover_path: plan.cover_path, cover_revision: plan.cover_revision });
        return reply({ code: "40001", message: "The cover changed elsewhere" }, 409);
      }
      if (plan.cover_path !== p_path) {
        plan.cover_path = p_path;
        plan.cover_revision++;
      }
      return reply({ cover_path: plan.cover_path, cover_revision: plan.cover_revision });
    }
    return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
  });
  await page.goto(`${baseURL}/plans`);
  await page.getByRole("button", { name: "New resbite", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Garden picnic");
  await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
  await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add cover photo", exact: true }).click();
  await (await chooser).setFiles({ name: "wide.png", mimeType: "image/png", buffer: await syntheticPng(page, 4000, 1200) });
  await expect(page.getByText("Your cover uploads after the resbite is saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(
    page.getByText("Your resbite is saved, but its cover photo hasn’t uploaded yet. Open Edit plan to retry.", { exact: true }),
  ).toBeVisible();
  assert.equal(plans.size, 1);
  const [plan] = plans.values();
  assert.equal(uploads.length, 1);
  assert.match(uploads[0], new RegExp(`^${user.id}/${plan.id}/[0-9a-f-]+\\.jpg$`));
  assert.equal(plan.cover_path, null);
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByRole("button", { name: "Retry cover", exact: true }).click();
  await expect(page.getByText("Cover photo saved.", { exact: true })).toBeVisible();
  assert.equal(plan.cover_path, uploads[0]);
  assert.equal(plan.cover_revision, 1);
  assert.equal(uploads.at(-1), uploads[0], "Retry uploads to the same path");
  await page.getByRole("button", { name: "Remove cover photo", exact: true }).click();
  await expect(
    page.getByText("Cover photo removed. The previous file stays in private storage until cleanup is available.", { exact: true }),
  ).toBeVisible();
  assert.equal(plan.cover_path, null);
  assert.equal(plan.cover_revision, 2);
  const again = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add cover photo", exact: true }).click();
  await (await again).setFiles({ name: "tall.png", mimeType: "image/png", buffer: await syntheticPng(page, 900, 3000) });
  await expect(page.getByText("Cover photo saved.", { exact: true })).toBeVisible();
  assert.equal(plan.cover_revision, 3);
  await page.getByRole("button", { name: "My resbites", exact: true }).click();
  await expect(page.locator('img[src*="/object/sign/plan-covers/fixture.jpg"]').first()).toBeAttached();
  await page.context().close();
  console.log("PASS: signed-in cover uploads after save, retries from Edit, removes and re-adds.");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
