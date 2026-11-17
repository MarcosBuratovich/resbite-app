// One Resend call for the contact form. RESEND_API_KEY exists only in Vercel's environment; it is read here and never logged.
export const CONTACT_FROM = "Resbite contact form <noreply@resbite.com>";

/** Sends `{ to, replyTo, subject, text }` through Resend. Throws on a missing key, a network failure, a timeout (8 s) or a non-2xx reply. */
export async function sendContactEmail(message, { fetch = globalThis.fetch, apiKey = process.env.RESEND_API_KEY } = {}) {
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const reply = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: CONTACT_FROM, to: [message.to], reply_to: message.replyTo, subject: message.subject, text: message.text }),
    signal: AbortSignal.timeout(8000),
  });
  if (!reply.ok) throw new Error(`Resend answered ${reply.status}`);
}
