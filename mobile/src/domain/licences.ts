import { LEGAL_COPY } from "./legal";
import data from "./licences.json";
import type { Licences, PackageNotice } from "./licenceNotices";

export const LICENCES: Licences = data;

/** A package's licence texts, one after another, or a plain line when it ships none. */
export function packageText(p: PackageNotice, texts: readonly string[]): string {
  if (!p.texts.length) return LEGAL_COPY.noLicenceText(p.licence);
  return p.texts.map((i) => texts[i]).join("\n\n");
}
