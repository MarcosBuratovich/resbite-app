/** Short-lived signed links, reused until shortly before they expire. Failures are never cached. */
export function createSignedUrlCache(
  sign: (path: string) => Promise<string>,
  options: { ttlMs?: number; now?: () => number } = {},
) {
  const ttl = options.ttlMs ?? 240_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { url: string; expires: number }>();
  const inflight = new Map<string, Promise<string>>();
  return {
    get(path: string): Promise<string> {
      const hit = entries.get(path);
      if (hit && hit.expires > now()) return Promise.resolve(hit.url);
      const running = inflight.get(path);
      if (running) return running;
      const request = sign(path)
        .then((url) => {
          entries.set(path, { url, expires: now() + ttl });
          return url;
        })
        .finally(() => inflight.delete(path));
      inflight.set(path, request);
      return request;
    },
    peek(path: string): string | null {
      const hit = entries.get(path);
      return hit && hit.expires > now() ? hit.url : null;
    },
    clear() {
      entries.clear();
    },
  };
}
