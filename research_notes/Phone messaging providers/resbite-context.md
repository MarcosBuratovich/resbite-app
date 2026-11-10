# Resbite context for the messaging-provider research (3 November 2026)

What Resbite does today with phone numbers, from the repo (specs under `docs/superpowers/specs/`, runbooks under `qa/`). This is the baseline the prices and the rules are measured against.

## Where phone numbers are used

- **Phone accounts.** Sign-up, sign-in and "Add your number" run on Supabase Auth phone sign-in with a six-digit code (`mobile/src/services/phoneCode.ts`). The same code step guards the two web pages on link.resbite.com: `/i/<code>` (a personal invitation, answered by the number it was sent to) and `/r/<code>` (the open link, where a stranger asks to join). Spec: `2026-10-27-contact-invitations-design.md`; the phone key (`2026-10-29-phone-key-design.md`) matches a typed number to the host's contact entry whatever the format.
- **Invitations.** By design (CI-P1) **the host sends each personal invitation from their own phone**: the app opens WhatsApp (`wa.me` link with the number and the text) or the native Messages composer with the recipient and the personal link filled in (`mobile/src/services/inviteSend.ts`, `mobile/src/domain/contactInvites.ts`). Resbite never sends texts itself. The app records "Sent on WhatsApp" / "Sent on Messages" when the composer was opened, not that the message arrived. Contacts already on Resbite get an in-app invitation and a push notification instead.
- **Contact lookup.** Only the numbers the host picks are sent, hashed by the phone key, to find who is already on Resbite; contact names never leave the phone.

## How codes are sent today: test mode

- Supabase's **Send SMS hook** is a Postgres function, `public.send_sms_hook(event jsonb)` (`supabase/migrations/20261027120000_phone_accounts.sql`). Auth calls it with the number and the one-time code. While `private.phone_mode.test_mode` is true it **stores the code** and the app swaps the fixed code `000000` for it (`public.exchange_test_code`). With test mode off and no sender, the hook answers 503 "Text messages aren't set up yet."
- Owner decisions: **CI-D10 no paid SMS service yet**; **CI-D13 test mode for any number** until a provider is connected. Turning test mode off is a one-row update once a real sender replaces the hook body (`qa/phone-accounts-2026-10-27/README.md`, step 7).
- Still pending in the Auth dashboard (owner): phone provider on, the hook selected, SMS OTP length 6, expiry 600 s, phone confirmations on.

## What connecting a provider means for this design

- Two routes, both configuration rather than redesign (CI-P2): Supabase's **built-in providers** (set in the Auth dashboard; the hook then goes unused) or the **hook calling the provider** (the Postgres function would call the provider's HTTP API through `pg_net` with the key in Vault, or the hook is switched to an HTTP hook served by an Edge Function). The second keeps test mode's switch and log; the first loses them. **Inference** from the hook's shape; the research note on prices says which providers are built in.
- The spec already expects **abuse limits per invitation and per number** before paid SMS goes live, because paid codes attract SMS-pumping (`Constraints`, contact-invitations spec).
- Volumes are small for now: a private beta with testers in Argentina, UK market first. Costs are worth reading per 1,000 and 10,000 verifications a month, not per message.

## Open items the spec already lists that this research touches

- CI-D10 / CI-P2: which provider, and when.
- The Auth dashboard steps above.
- Web-only accounts (strangers declined on the open link) and their removal, parked until real strangers exist.
