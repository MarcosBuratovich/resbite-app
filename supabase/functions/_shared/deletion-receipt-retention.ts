export function createReceiptPurgeHandler(
  purge: () => Promise<number>,
  enabled: boolean,
  secret: string,
) {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST")
      return reply(405, { error: "Method not allowed" });
    if (!enabled || secret.length < 32)
      return reply(503, { error: "Receipt purge disabled" });
    if (request.headers.get("Authorization") !== `Bearer ${secret}`)
      return reply(401, { error: "Unauthorized" });
    // Caller cannot choose accounts, receipt IDs, age thresholds or batch size.
    try {
      const removed = await purge();
      if (!Number.isInteger(removed) || removed < 0 || removed > 100)
        throw Error("Invalid purge result");
      return reply(200, { receiptsPurged: removed });
    } catch {
      return reply(503, { error: "Receipt purge unavailable" });
    }
  };
}
