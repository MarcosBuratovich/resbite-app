// Builds the Licences screen's data from the npm dependency tree (App Store readiness, A25).
// Pure: callers inject the file reader, so this module has no `fs`.

export type LockEntry = { version?: string; license?: string; dev?: boolean; devOptional?: boolean; optional?: boolean };
export type LockFile = { packages: Record<string, LockEntry> };
/** Paths are relative to `mobile/`. `list` gives the file names in a directory, not subdirectories. */
export type LicenceReader = { read(path: string): string | null; list(dir: string): string[] | null };
export type FontNotice = { name: string; licence: string; text: string };
export type NativeNotice = { name: string; version: string; licence: string };
export type PackageNotice = { name: string; version: string; licence: string; texts: number[] };
export type Licences = { fonts: FontNotice[]; packages: PackageNotice[]; native: NativeNotice[]; texts: string[] };

const PREFIX = "node_modules/";
const PODSPECS = "node_modules/react-native/third-party-podspecs";

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function licenceOf(manifest: any, entry: LockEntry): string {
  if (typeof manifest?.license === "string" && manifest.license) return manifest.license;
  if (typeof manifest?.license?.type === "string" && manifest.license.type) return manifest.license.type;
  if (Array.isArray(manifest?.licenses)) {
    const types = manifest.licenses.map((l: any) => (typeof l === "string" ? l : l?.type)).filter((t: unknown) => typeof t === "string" && t);
    if (types.length) return types.join(" OR ");
  }
  return entry.license || "Unknown";
}

function parseJson(text: string | null): any {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function fontNotice(reader: LicenceReader, name: string): FontNotice {
  const path = `assets/fonts/${name}-OFL.txt`;
  const text = reader.read(path);
  if (text === null) throw new Error(`Missing font licence ${path}`);
  return { name, licence: "OFL-1.1", text: text.replace(/\r\n/g, "\n").trim() };
}

function nativeNotices(reader: LicenceReader): NativeNotice[] {
  const notices: NativeNotice[] = [];
  for (const file of reader.list(PODSPECS) ?? []) {
    if (!file.endsWith(".podspec") || file === "ReactNativeDependencies.podspec") continue;
    const text = reader.read(`${PODSPECS}/${file}`);
    if (text === null) continue;
    const name = /spec\.name\s*=\s*['"]([^'"]+)['"]/.exec(text)?.[1];
    if (!name) continue;
    notices.push({
      name,
      version: /spec\.version\s*=\s*['"]([^'"]+)['"]/.exec(text)?.[1] ?? "bundled",
      licence: /spec\.license\s*=\s*\{\s*:type\s*=>\s*['"]([^'"]+)['"]/.exec(text)?.[1] ?? "Unknown",
    });
  }
  return notices.sort((a, b) => byText(a.name, b.name));
}

export function buildLicences(lock: LockFile, reader: LicenceReader): Licences {
  const texts: string[] = [];
  const seen = new Set<string>();
  const packages: PackageNotice[] = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key.startsWith(PREFIX) || entry.dev || entry.devOptional || entry.optional) continue;
    const name = key.slice(key.lastIndexOf(PREFIX) + PREFIX.length);
    const version = entry.version ?? "";
    if (seen.has(`${name}@${version}`)) continue;
    seen.add(`${name}@${version}`);
    const manifest = parseJson(reader.read(`${key}/package.json`));
    const files = (reader.list(key) ?? [])
      .filter((file) => /^(licen|copying|notice)/.test(file.toLowerCase()))
      .sort((a, b) => byText(a.toLowerCase(), b.toLowerCase()));
    const indices: number[] = [];
    for (const file of files) {
      const text = (reader.read(`${key}/${file}`) ?? "").replace(/\r\n/g, "\n").trim();
      if (!text) continue;
      let index = texts.indexOf(text);
      if (index < 0) index = texts.push(text) - 1;
      if (!indices.includes(index)) indices.push(index);
    }
    packages.push({ name, version, licence: licenceOf(manifest, entry), texts: indices });
  }
  packages.sort((a, b) => byText(a.name, b.name) || byText(a.version, b.version));
  return {
    fonts: [fontNotice(reader, "Montserrat"), fontNotice(reader, "Quicksand")],
    packages,
    native: nativeNotices(reader),
    texts,
  };
}
