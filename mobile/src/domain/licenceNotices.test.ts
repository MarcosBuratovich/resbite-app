import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildLicences, type LicenceReader, type LockFile } from "./licenceNotices.ts";
import { packageText } from "./licences.ts";

// Run from mobile/, as every test in this repo is. Paths are relative to mobile/.
const fsReader: LicenceReader = {
  read(path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  list(dir) {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch {
      return null;
    }
  },
};
const memory = (files: Record<string, string>): LicenceReader => ({
  read: (path) => (path in files ? files[path] : null),
  list: (dir) => {
    const names = Object.keys(files)
      .filter((path) => path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes("/"))
      .map((path) => path.slice(dir.length + 1));
    return names.length ? names : null;
  },
});
const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as LockFile;
const stored = JSON.parse(readFileSync("src/domain/licences.json", "utf8"));

test("the committed licences match the dependency tree", () => {
  assert.deepEqual(buildLicences(lock, fsReader), stored, "run node --import tsx scripts/generate-licences.mjs");
});

test("coverage: every production package is listed, and no dev, optional or removed one", () => {
  const expected = new Set<string>();
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key.startsWith("node_modules/") || entry.dev || entry.devOptional || entry.optional) continue;
    expected.add(`${key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length)}@${entry.version}`);
  }
  const listed = new Set<string>(stored.packages.map((p: { name: string; version: string }) => `${p.name}@${p.version}`));
  assert.deepEqual([...listed].sort(), [...expected].sort());
  const names = new Set<string>(stored.packages.map((p: { name: string }) => p.name));
  for (const dev of ["typescript", "tsx", "@playwright/test"]) {
    if (lock.packages[`node_modules/${dev}`]?.dev) assert.ok(!names.has(dev), `${dev} is dev-only`);
  }
  assert.ok(!names.has("expo-location"));
  assert.ok(!names.has("@react-native-async-storage/async-storage"));
});

test("fonts carry the Open Font Licence", () => {
  assert.deepEqual(stored.fonts.map((f: { name: string }) => f.name), ["Montserrat", "Quicksand"]);
  for (const font of stored.fonts) {
    assert.equal(font.licence, "OFL-1.1");
    assert.ok(font.text.includes("SIL Open Font License, Version 1.1"), font.name);
  }
  assert.ok(stored.fonts[0].text.startsWith("Copyright 2011 The Montserrat Project Authors"));
});

test("spot checks: react-native and the native libraries", () => {
  const rn = stored.packages.find((p: { name: string }) => p.name === "react-native");
  assert.equal(rn.licence, "MIT");
  assert.ok(rn.texts.some((i: number) => stored.texts[i].includes("Meta Platforms")));
  const boost = stored.native.find((n: { name: string }) => n.name === "boost");
  assert.equal(boost.licence, "Boost Software License");
  assert.equal(boost.version, "1.84.0");
  const names = stored.native.map((n: { name: string }) => n.name);
  assert.ok(names.includes("glog"));
  assert.ok(!names.includes("ReactNativeDependencies"));
});

const fonts = {
  "assets/fonts/Montserrat-OFL.txt": "  Montserrat text\n",
  "assets/fonts/Quicksand-OFL.txt": "Quicksand text",
};

test("a package lists its LICENSE and NOTICE in that order, and identical texts are stored once", () => {
  const result = buildLicences(
    {
      packages: {
        "": { version: "1.0.0" },
        "node_modules/a": { version: "1.0.0" },
        "node_modules/b": { version: "2.0.0" },
        "node_modules/c": { version: "3.0.0" },
      },
    },
    memory({
      ...fonts,
      "node_modules/a/package.json": JSON.stringify({ license: "MIT" }),
      "node_modules/a/NOTICE": "notice a\r\n",
      "node_modules/a/LICENSE": "same\r\ntext\n",
      "node_modules/a/README.md": "not a licence",
      "node_modules/b/package.json": JSON.stringify({ license: "MIT" }),
      "node_modules/b/license.md": "same\ntext",
      "node_modules/c/package.json": JSON.stringify({ license: "MIT" }),
    }),
  );
  assert.deepEqual(result.texts, ["same\ntext", "notice a"]);
  assert.deepEqual(result.packages.map((p) => [p.name, p.texts]), [
    ["a", [0, 1]],
    ["b", [0]],
    ["c", []],
  ]);
  assert.equal(packageText(result.packages[2], result.texts), "This package doesn’t include a licence file. Its licence is MIT.");
  assert.equal(packageText(result.packages[0], result.texts), "same\ntext\n\nnotice a");
});

test("licence resolution, nested names, optional entries and sorting", () => {
  const result = buildLicences(
    {
      packages: {
        "node_modules/z": { version: "1.0.0" },
        "node_modules/a/node_modules/@s/n": { version: "1.0.0", license: "ISC" },
        "node_modules/m": { version: "1.0.0" },
        "node_modules/o": { version: "1.0.0" },
        "node_modules/p": { version: "1.0.0", optional: true },
        "node_modules/d": { version: "1.0.0", dev: true },
        "node_modules/q": { version: "1.0.0", license: "BSD-3-Clause" },
        "node_modules/t": { version: "1.0.0" },
      },
    },
    memory({
      ...fonts,
      "node_modules/z/package.json": JSON.stringify({ license: { type: "Apache-2.0" } }),
      "node_modules/m/package.json": JSON.stringify({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] }),
      "node_modules/o/package.json": JSON.stringify({}),
      "node_modules/q/package.json": JSON.stringify({}),
    }),
  );
  assert.deepEqual(result.packages.map((p) => [p.name, p.licence]), [
    ["@s/n", "ISC"],
    ["m", "MIT OR Apache-2.0"],
    ["o", "Unknown"],
    ["q", "BSD-3-Clause"],
    ["t", "Unknown"],
    ["z", "Apache-2.0"],
  ]);
});

test("a missing font file stops the build", () => {
  assert.throws(() => buildLicences({ packages: {} }, memory({ "assets/fonts/Montserrat-OFL.txt": "x" })));
});
