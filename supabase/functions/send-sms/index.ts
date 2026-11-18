import {
  handleSendSms,
  hookSecrets,
  smsRouter,
  twilioSender,
  type LogEntry,
  type TwilioConfig,
} from "../_shared/sms-hook.ts";
import { handleSweep, twilioRecords } from "../_shared/sms-records.ts";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
// Unset secrets are empty strings: Twilio then refuses the call and the hook answers 500, never a text.
const config: TwilioConfig = {
  accountSid: Deno.env.get("TWILIO_ACCOUNT_SID") ?? "",
  apiKeySid: Deno.env.get("TWILIO_API_KEY_SID") ?? "",
  apiKeySecret: Deno.env.get("TWILIO_API_KEY_SECRET") ?? "",
  messagingServiceSid: Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ?? "",
};
const log = (entry: LogEntry) => console.log(JSON.stringify({ fn: "send-sms", ...entry }));
Deno.serve(
  smsRouter({
    hook: (r) =>
      handleSendSms(r, {
        secrets: hookSecrets(Deno.env.get("SEND_SMS_HOOK_SECRETS")),
        nowSeconds: () => Math.floor(Date.now() / 1000),
        send: twilioSender(config),
        log,
      }),
    sweep: (r) =>
      handleSweep(r, {
        secret: Deno.env.get("SMS_SWEEP_SECRET"),
        nowMs: Date.now,
        ...twilioRecords(config),
        log,
      }),
  }),
);
