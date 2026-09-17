export type KeyStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};
// Keep every Keychain/Keystore value under conservative native size limits.
// A new generation is complete before its manifest replaces the previous one.
export function chunkedStorage(
  store: KeyStore,
  randomId: () => string,
): KeyStore {
  async function manifest(key: string) {
    const raw = await store.getItem(key + ".manifest");
    if (!raw) return null;
    const m = JSON.parse(raw) as { generation: string; count: number };
    if (
      !/^[a-zA-Z0-9-]+$/.test(m.generation) ||
      !Number.isInteger(m.count) ||
      m.count < 1 ||
      m.count > 1000
    )
      throw new Error("Invalid secure session manifest");
    return m;
  }
  async function cleanup(
    key: string,
    m: { generation: string; count: number } | null,
  ) {
    if (m)
      await Promise.all(
        Array.from({ length: m.count }, (_, i) =>
          store.removeItem(`${key}.${m.generation}.${i}`),
        ),
      );
  }
  return {
    async getItem(key) {
      const m = await manifest(key);
      if (!m) return store.getItem(key);
      const chunks = await Promise.all(
        Array.from({ length: m.count }, (_, i) =>
          store.getItem(`${key}.${m.generation}.${i}`),
        ),
      );
      return chunks.some((x) => x === null) ? null : chunks.join("");
    },
    async setItem(key, value) {
      const previous = await manifest(key),
        generation = randomId(),
        points = Array.from(value),
        chunks = Array.from(
          { length: Math.max(1, Math.ceil(points.length / 400)) },
          (_, i) => points.slice(i * 400, (i + 1) * 400).join(""),
        );
      const next = { generation, count: chunks.length };
      try {
        for (let i = 0; i < chunks.length; i++)
          await store.setItem(`${key}.${generation}.${i}`, chunks[i]);
        await store.setItem(key + ".manifest", JSON.stringify(next));
      } catch (e) {
        await cleanup(key, next);
        throw e;
      }
      await cleanup(key, previous);
      await store.removeItem(key);
    },
    async removeItem(key) {
      const m = await manifest(key);
      await store.removeItem(key + ".manifest");
      await cleanup(key, m);
      await store.removeItem(key);
    },
  };
}
