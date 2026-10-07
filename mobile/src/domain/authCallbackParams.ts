type Param = string | string[] | undefined;

/** Repeated parameters are ambiguous and must never be exchanged. */
export function parseAuthCallbackParams(code: Param, recovery: Param) {
  if (
    typeof code !== "string" ||
    !/^[A-Za-z0-9_-]{1,2048}$/.test(code) ||
    (recovery !== undefined && recovery !== "1")
  )
    return null;
  return { code, recovery: recovery === "1" };
}
