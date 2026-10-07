import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
};
const expiry = Math.floor(Date.now() / 1000) + 3600;
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(
    JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" }),
  ).toString("base64url"),
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
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  const errors = [],
    writes = [],
    uploads = [],
    deletes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let profile = { display_name: "Saved name", avatar_path: null, avatar_revision: 0 };
  let failName = true,
    losePhotoReply = true,
    loseUploadReply = false,
    competingPhoto = false;
  await page.addInitScript((session) => {
    if (!sessionStorage.getItem("fixture-seeded")) {
      sessionStorage.setItem(
        "sb-ewcsgvhuojxdpaspwsrx-auth-token",
        JSON.stringify(session),
      );
      sessionStorage.setItem("fixture-seeded", "1");
    }
  }, session);
  let imageData;
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles") return reply(profile);
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/rpc/save_profile") {
      writes.push(req.postDataJSON());
      if (failName) {
        failName = false;
        return reply({ message: "Offline fixture" }, 503);
      }
      profile.display_name = req.postDataJSON().p_name;
      return reply(user.id);
    }
    if (path.startsWith("/storage/v1/object/sign/") && req.method() === "POST")
      return reply({
        signedURL: `/object/sign/profile-photos/fixture.jpg?token=fixture`,
      });
    if (path === "/storage/v1/object/sign/profile-photos/fixture.jpg")
      return route.fulfill({ contentType: "image/jpeg", body: imageData });
    if (
      path === "/storage/v1/object/profile-photos" &&
      req.method() === "DELETE"
    ) {
      deletes.push(req.postDataJSON());
      return reply({ message: "Client must never delete photo bytes without a retirement fence" }, 400);
    }
    if (path.startsWith("/storage/v1/object/profile-photos/")) {
      const bytes = req.postDataBuffer();
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
        assert.ok(
          !(marker >= 224 && marker <= 239) && marker !== 254,
          "No metadata segments uploaded",
        );
        const length = bytes.readUInt16BE(i);
        if ([192, 193, 194].includes(marker)) {
          assert.ok(bytes.readUInt16BE(i + 3) <= 1024);
          assert.ok(bytes.readUInt16BE(i + 5) <= 1024);
        }
        i += length;
      }
      imageData = bytes;
      uploads.push(path);
      if (loseUploadReply) {
        loseUploadReply = false;
        return reply({ message: "Lost upload reply" }, 503);
      }
      return reply({ Key: path, Id: "fixture" });
    }
    if (path === "/rest/v1/rpc/set_avatar_if_current") {
      const { p_path, p_expected_path, p_expected_revision } = req.postDataJSON();
      assert.equal(req.headers().authorization, `Bearer ${token}`);
      if (competingPhoto) {
        competingPhoto = false;
        profile.avatar_path = `${user.id}/other-device.jpg`;
        profile.avatar_revision++;
      }
      if (profile.avatar_path !== p_expected_path || profile.avatar_revision !== p_expected_revision) {
        if (profile.avatar_path === p_path && profile.avatar_revision === p_expected_revision + 1)
          return reply({ avatar_path: profile.avatar_path, avatar_revision: profile.avatar_revision });
        return reply({ message: "Photo changed elsewhere", code: "40001" }, 409);
      }
      if (profile.avatar_path !== p_path) profile.avatar_revision++;
      profile.avatar_path = p_path;
      if (losePhotoReply) {
        losePhotoReply = false;
        return reply({ message: "Lost reply" }, 503);
      }
      return reply({ avatar_path: profile.avatar_path, avatar_revision: profile.avatar_revision });
    }
    return reply({ message: `Unexpected ${path}` }, 400);
  });
  await page.goto(`${base}/profile`);
  const name = page.getByRole("textbox", {
    name: "What should we call you?",
    exact: true,
  });
  await expect(name).toHaveValue("Saved name");
  await name.fill("My changed name");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Could not save your name. Your changes are kept.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(name).toHaveValue("My changed name");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Your profile is saved.", { exact: true }),
  ).toBeVisible();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#23aa99";
    ctx.fillRect(0, 0, 1600, 1200);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Add optional photo", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByText("Your private photo is saved.", { exact: true }),
  ).toBeVisible();
  assert.equal(uploads.length, 1);
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(
    page.getByText(
      "Your profile photo is removed. The previous file remains in private storage until cleanup is enabled.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.equal(profile.avatar_path, null);
  assert.equal(profile.avatar_revision, 2);
  await expect(page.getByRole("button", { name: "Retry photo change", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Add optional photo", exact: true })).toBeVisible();
  assert.equal(deletes.length, 0);

  // Unknown upload result remains account-scoped and resumes after restart with
  // exactly the same path/bytes/revision, then clears its confirmed journal.
  loseUploadReply = true;
  const retryChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add optional photo", exact: true }).click();
  await (await retryChooser).setFiles({ name: "retry.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.getByRole("button", { name: "Retry photo change", exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Retry photo change", exact: true })
    .click();
  await expect(
    page.getByText("Your private photo is saved.", { exact: true }),
  ).toBeVisible();
  assert.equal(uploads.length, 3);
  assert.equal(uploads[1], uploads[2]);
  assert.equal(profile.avatar_revision, 3);
  assert.equal(deletes.length, 0);

  // Concurrent removal cannot clear a new photo saved by another device.
  competingPhoto = true;
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByText("Your photo changed elsewhere. Choose Keep saved photo before making another change.", { exact: true })).toBeVisible();
  assert.equal(profile.avatar_path, `${user.id}/other-device.jpg`);
  await page.getByRole("button", { name: "Keep saved photo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change photo", exact: true })).toBeVisible();

  // Legacy pending changes have no safe baseline revision: explain discard and
  // never adopt the newly read server revision as if it were the original one.
  await page.evaluate(({ id, previous }) => {
    sessionStorage.setItem(`resbite.photo.v1.${id}`, JSON.stringify({ previous, target: `${id}/legacy.jpg` }));
  }, { id: user.id, previous: profile.avatar_path });
  await page.reload();
  await expect(page.getByText("This photo change was prepared by an older app. Keep the saved photo, then choose again.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry photo change", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Keep saved photo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change photo", exact: true })).toBeVisible();
  assert.equal(uploads.length, 3);
  assert.equal(deletes.length, 0);
  assert.deepEqual(errors, []);
  const preview = await browser.newPage({
    viewport: { width: 320, height: 740 },
  });
  let previewRequests = 0;
  preview.on("pageerror", (e) => errors.push(e.message));
  await preview.route("**/*.supabase.co/**", (route) => {
    previewRequests++;
    return route.abort();
  });
  await preview.goto(base);
  await preview.getByText("Preview the design", { exact: true }).click();
  await preview.getByRole("tab", { name: "Profile", exact: true }).click();
  const previewChooser = preview.waitForEvent("filechooser");
  await preview
    .getByRole("button", { name: "Add optional photo", exact: true })
    .click();
  await (
    await previewChooser
  ).setFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    preview.getByText("Preview photo stays in memory. Nothing was uploaded.", {
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(previewRequests, 0);
  assert.deepEqual(errors, []);
  console.log(
    "Profile fixtures passed: name retention, normalized upload, lost-link reconciliation, upload restart, concurrent removal, legacy recovery and zero client file deletions.",
  );
} finally {
  await browser.close();
}
