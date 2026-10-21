/** Link secrets are never included in error messages or logs. */
export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** GI1 event link code: 16 random bytes as 22 base64url characters, made by the database. */
export function isLinkCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22}$/.test(value);
}

/** A pending invitation kept on the device: a per-person token (before GI1) or an event link code. */
export function isPendingInvite(value: unknown): value is string {
  return isInviteToken(value) || isLinkCode(value);
}

/** The invite screen's parameters for a kept invitation, by its shape. */
export function pendingInviteParams(
  value: string | null,
): { token: string } | { code: string } | null {
  if (isInviteToken(value)) return { token: value };
  if (isLinkCode(value)) return { code: value };
  return null;
}

/** Explicit build-time trust root; never infer it from an incoming link. */
export function invitationOrigin(value?: string): string | null {
  if (!value) return null;
  if (!/^https:\/\/[a-z0-9.-]+\/?$/.test(value))
    throw Error("Invitation origin must be an HTTPS domain without a path.");
  const url = new URL(value);
  const labels = url.hostname.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    ) ||
    !/^[a-z]{2,63}$/.test(labels.at(-1)!) ||
    ["localhost", "local", "internal"].includes(labels.at(-1)!)
  )
    throw Error("Invitation origin must be a public HTTPS domain.");
  return url.origin;
}

export function buildInvitationLink(token: string, origin?: string): string {
  if (!isInviteToken(token)) throw Error("This invitation link is incomplete.");
  const owned = invitationOrigin(origin);
  // Fragments are not sent to the fallback web server or in HTTP referrers.
  return owned
    ? `${owned}/invite#token=${token}`
    : `resbite://invite?token=${token}`;
}

export function parseInvitationLink(
  value: unknown,
  origin?: string,
): string | null {
  if (typeof value !== "string" || value.length > 512 || /[\s\\%]/.test(value))
    return null;
  try {
    const owned = invitationOrigin(origin);
    const url = new URL(value);
    if (url.username || url.password || url.port) return null;
    const scheme =
      url.protocol === "resbite:" &&
      ((url.hostname === "invite" && url.pathname === "") ||
        (url.hostname === "" && url.pathname === "/invite"));
    const https =
      owned !== null &&
      url.protocol === "https:" &&
      url.origin === owned &&
      url.pathname === "/invite";
    if (!scheme && !https) return null;
    // The exact shape rejects duplicate, unknown, encoded, and mixed parameters.
    const parameters = scheme ? url.search : url.hash;
    if ((scheme && url.hash) || (https && url.search)) return null;
    if (!/^[?#]token=[a-f0-9]{64}$/.test(parameters)) return null;
    const token = parameters.slice(7);
    const canonical = scheme
      ? [`resbite://invite?token=${token}`, `resbite:///invite?token=${token}`]
      : [`${owned}/invite#token=${token}`];
    return canonical.includes(value) ? token : null;
  } catch {
    return null;
  }
}

/** GI1: the event's one link. The owned origin's page when configured, else the app's own scheme. */
export function buildEventLink(code: string, origin?: string): string {
  if (!isLinkCode(code)) throw Error("This invitation link is incomplete.");
  const owned = invitationOrigin(origin);
  return owned ? `${owned}/r/${code}` : `resbite://r/${code}`;
}

/** The code from an event link, or null. Only the exact canonical forms pass: no query, hash or extra path. */
export function parseEventLink(value: unknown, origin?: string): string | null {
  if (typeof value !== "string" || value.length > 512 || /[\s\\%]/.test(value))
    return null;
  try {
    const owned = invitationOrigin(origin);
    const code = value.slice(value.lastIndexOf("/") + 1);
    if (!isLinkCode(code)) return null;
    const canonical = [`resbite://r/${code}`, `resbite:///r/${code}`];
    if (owned) canonical.push(`${owned}/r/${code}`);
    return canonical.includes(value) ? code : null;
  } catch {
    return null;
  }
}

/** Cold-start and already-open native delivery share the same validation. */
export function routeSystemLink(path: string, origin?: string): string {
  // GI1 event links, as a full link or as the native path the router hands over.
  const code = parseEventLink(path.startsWith("/r/") ? `resbite://${path}` : path, origin);
  if (code) return `/invite?code=${code}`;
  if (path.startsWith("/r/") || path === "/r") return "/invite";
  const candidate = path.startsWith("/invite?") ? `resbite://${path}` : path;
  const token = parseInvitationLink(candidate, origin);
  if (token) return `/invite?token=${token}`;
  if (path.length > 8192 || /[\s\\]/.test(path)) return "/invite";
  try {
    const url = new URL(path, "resbite:///");
    if (url.protocol !== "resbite:" || url.username || url.password || url.port)
      return "/invite";
    // Auth uses PKCE query parameters (and recovery=1); leave those intact.
    if (
      (url.hostname === "auth" && url.pathname === "/callback") ||
      (!url.hostname && url.pathname === "/auth/callback")
    )
      return path;
    // Internal paths are Router-owned, but an invitation token always passes above.
    if (
      path.startsWith("/") &&
      !path.startsWith("//") &&
      decodeURIComponent(url.pathname).replace(/\/+$/, "") !== "/invite"
    )
      return path;
    if (path === "resbite://" || path === "resbite:///" || path === "")
      return "/";
    return "/invite";
  } catch {
    return "/invite";
  }
}
