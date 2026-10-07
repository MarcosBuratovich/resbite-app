import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as people from "../domain/people";

// Exercise the public native boundary, not only injected adapters. React Native
// exposes lazy enumerable getters; an unrelated legacy module may be absent.
function loadService(file: string, namespaceImport = false) {
  const native = {
    Platform: { OS: "ios" },
    Linking: { openSettings: async () => {} },
    get PushNotificationIOS(): never {
      throw Error("new NativeEventEmitter() requires a non-null argument");
    },
  };
  let source = readFileSync(new URL(file, import.meta.url), "utf8");
  if (namespaceImport)
    source = source.replace(
      /require\("react-native"\) as typeof import\("react-native"\)/g,
      'await import("react-native")',
    );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const exports: Record<string, (...args: any[]) => Promise<any>> = {};
  runInNewContext(compiled, {
    exports,
    // Metro importAll copies enumerable values, unlike TypeScript's getter-
    // preserving CommonJS helper. Match the device bundler's behavior here.
    __importStar: (value: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      for (const key in value) result[key] = value[key];
      result.default = value;
      return result;
    },
    require: (name: string) => {
      if (name === "react-native") return native;
      if (name === "../domain/people") return people;
      if (name === "expo-contacts")
        return {
          getPermissionsAsync: async () => ({ granted: true }),
          requestPermissionsAsync: async () => ({ granted: true }),
          Contact: {
            getAllDetails: async (
              _fields: unknown,
              options: { offset: number; limit: number; sortOrder?: string },
            ) => {
              const swift = readFileSync(
                new URL(
                  "../../node_modules/expo-contacts/ios/Next/records/ContactQueryOptions.swift",
                  import.meta.url,
                ),
                "utf8",
              );
              const allowed = Array.from(
                swift.matchAll(/case \w+ = "([^"]+)"/g),
                (match) => match[1],
              );
              assert.ok(
                options.sortOrder === undefined ||
                  allowed.includes(options.sortOrder),
                "Contact query options must match the installed iOS enum",
              );
              assert.equal(options.offset, 0);
              assert.equal(options.limit, 50);
              return [];
            },
            presentAccessPicker: async () => {},
          },
          ContactField: {},
          ContactsSortOrder: { UserDefault: "userDefault" },
        };
      if (name === "expo-notifications")
        return {
          getPermissionsAsync: async () => ({
            status: "granted",
            ios: { status: 2 },
          }),
        };
      throw Error(`Unexpected import: ${name}`);
    },
  });
  return exports;
}
test("contact native boundary avoids unrelated React Native lazy getters", async () => {
  const service = loadService("./contacts.ts");
  assert.equal((await service.readContactPage()).people.length, 0);
  assert.equal(await service.hasContactAccess(), true);
  // Confirm the fixture reproduces the original import failure.
  await assert.rejects(
    loadService("./contacts.ts", true).readContactPage(),
    /NativeEventEmitter/,
  );
});
test("notification permission/settings boundary avoids unrelated legacy modules", async () => {
  const service = loadService("./notifications.ts");
  assert.equal(await service.readNotificationPermission(false), "granted");
  await service.openNotificationSettings(false);
});
