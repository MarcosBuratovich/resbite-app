// An in-memory limit per key and window. One serverless instance has its own map, so this is a brake, not the limit:
// the real limit is the Vercel firewall rule on /api/contact. Nothing is logged and nothing leaves the process.
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }) {
  const hits = new Map();
  return {
    /** Counts one use of `key`; false when the key has used up its window, or when the map is full and the key is new. */
    take(key) {
      const t = now();
      const entry = hits.get(key);
      if (entry && t < entry.resetAt) {
        if (entry.count >= limit) return false;
        entry.count += 1;
        return true;
      }
      if (!entry && hits.size >= maxKeys) {
        for (const [k, v] of hits) if (t >= v.resetAt) hits.delete(k);
        if (hits.size >= maxKeys) return false;
      }
      hits.set(key, { count: 1, resetAt: t + windowMs });
      return true;
    },
  };
}
