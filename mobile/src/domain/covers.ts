// Event cover photos (CE2): a private bucket with one folder per owner and plan.
export const COVER_BUCKET = "plan-covers";
export const COVER_MAX_DIMENSION = 1600;
const id = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const scopePattern = new RegExp(`^${id}/${id}$`, "i");

/** Journal scope and storage folder for one plan's cover: `<owner id>/<plan id>`. */
export function coverScope(ownerId: string, planId: string): string {
  const scope = `${ownerId}/${planId}`;
  if (!scopePattern.test(scope)) throw Error("Invalid cover owner.");
  return scope;
}

export function coverTarget(scope: string, fileId: string): string {
  return `${scope}/${fileId}.jpg`;
}

export const coverPhotoLayout = {
  validScope: (scope: string) => scopePattern.test(scope),
  key: (scope: string) => `resbite.cover.v1.${scope.replace("/", ".")}`,
  prefix: (scope: string) => `${scope}/`,
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
