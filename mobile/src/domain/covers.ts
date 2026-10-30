// Event cover photos (CE2): a private bucket with one folder per owner and plan. The folder is always the plan
// owner's, whoever uploads (an admin too: the policies and set_plan_cover_if_current want it there); this device's
// journal of an unconfirmed change is kept under the person making it.
export const COVER_BUCKET = "plan-covers";
export const COVER_MAX_DIMENSION = 1600;
/** UX2: a cover photo description is at most 200 characters (the database checks the same). */
export const COVER_DESCRIPTION_MAX = 200;
export const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const id = UUID_PATTERN;
const scopePattern = new RegExp(`^${id}/${id}$`, "i");

/** This device's journal scope for one plan's cover: `<id of the person changing it>/<plan id>`. */
export function coverScope(personId: string, planId: string): string {
  const scope = `${personId}/${planId}`;
  if (!scopePattern.test(scope)) throw Error("Invalid cover owner.");
  return scope;
}

/** The storage folder of one plan's covers: `<plan owner's id>/<plan id>`, whoever uploads. */
export function coverFolder(ownerId: string, planId: string): string {
  return coverScope(ownerId, planId);
}

/** A new cover file in a plan's folder (`coverFolder`). */
export function coverTarget(folder: string, fileId: string): string {
  return `${folder}/${fileId}.jpg`;
}

export const coverPhotoLayout = {
  validScope: (scope: string) => scopePattern.test(scope),
  key: (scope: string) => `resbite.cover.v1.${scope.replace("/", ".")}`,
  /** A cover journaled under `<person>/<plan>` lives in that plan's folder, whoever owns it: `<any id>/<plan>/…`. */
  within: (scope: string, path: string) => {
    if (!scopePattern.test(scope)) return null;
    const folder = new RegExp(`^${id}/${scope.split("/")[1]}/`, "i").exec(path);
    return folder ? path.slice(folder[0].length) : null;
  },
  copy: {
    unretryable:
      "This saved cover change cannot be safely retried. Choose Keep saved cover, then choose the cover again.",
    missing: "This resbite is no longer available to your account.",
    unverified:
      "The saved cover could not be verified. Reopen the plan before trying again.",
    changedElsewhere:
      "The cover changed elsewhere. Choose Keep saved cover before making another change.",
    unconfirmed: "Cover update is unconfirmed. Retry to check the saved cover.",
  },
};
