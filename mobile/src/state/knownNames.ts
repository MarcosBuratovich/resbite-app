/**
 * Display names this app has already read, by signed-in account and person, so the next screen can use one without
 * reading it again: the resbite page reads the organizer's name, and bring mode's message uses it (C23). Held in
 * memory only, and keyed by the account, so another account signed in later never sees them.
 */
const names = new Map<string, string>();
const key = (scope: string, userId: string) => `${scope}:${userId}`;

/** Keeps a name read for `userId` while `scope` is signed in; a missing or blank name changes nothing. */
export function rememberName(scope: string | undefined, userId: string | undefined, name: string | null | undefined) {
  const clean = name?.trim();
  if (scope && userId && clean) names.set(key(scope, userId), clean);
}

/** The name this account last read for `userId`, or null. */
export function knownName(scope: string | undefined, userId: string | undefined): string | null {
  return scope && userId ? (names.get(key(scope, userId)) ?? null) : null;
}
