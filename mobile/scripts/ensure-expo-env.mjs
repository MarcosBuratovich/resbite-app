import { existsSync, writeFileSync } from "node:fs";

const target = new URL("../expo-env.d.ts", import.meta.url);
if (!existsSync(target)) {
  writeFileSync(
    target,
    '/// <reference types="expo/types" />\n\n// NOTE: This file should not be edited and should be in your git ignore\n',
  );
}
