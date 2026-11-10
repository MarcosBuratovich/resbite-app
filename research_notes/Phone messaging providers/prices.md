# Phone messaging provider prices (UK first, Argentina second)

Researched 2026-11-03 for the Resbite phone-verification plan. Read-only web research; nothing was run against Supabase or any provider.

## How to read this

- Access date for every source: **2026-11-03**. Numbers are copied from the pages listed under Sources; none are from memory.
- Currencies are the provider's own: USD ($), EUR, GBP, ARS. I do not convert between them, except where one provider publishes both.
- Units differ and matter: "per segment" (Twilio, Sinch, Bird, Telnyx "message part"), "per SMS" (Plivo, AWS, Prelude), "per successful verification" (Twilio Verify, Vonage Verify, Prelude, AWS OTP), "per message" (WhatsApp). A code under 160 GSM characters is one segment.
- A verification costs the fee for the verification (if the provider sells one) plus every SMS attempt. If you send codes through Supabase's Send SMS hook with a plain SMS API, you pay only the SMS price.
- "Starts at" means the provider shows a floor, not the price you will pay on every network (see Plivo).
- **Inference** marks my reading, not a statement on a page.
- Unreadable items are in "What I could not read". An empty cell there means unreadable, not free.

## Table 1: SMS one-time codes (SMS API only, no verification fee)

| Provider | UK | Argentina | Unit | Extras (sender ID, number rental, fees) | Source |
|---|---|---|---|---|---|
| Sinch (SMS "Cloud" list) | GBP 0.035 (USD 0.04415, EUR 0.0405); a few networks USD 0.044 | GBP 0.0715 (USD 0.0906, EUR 0.0831); Nextel network USD 0.018 | per outbound message, "carrier fees apply" | Carrier fee amounts, sender ID and UK number prices not on the page | [6] |
| AWS End User Messaging SMS | USD 0.05 | USD 0.09449 | per message part, all networks | UK long code USD 2/month, USD 0 setup, about 1 week to provision. Argentina number: AWS Support case, price on request. UK sender ID price not on the page | [7][8] |
| Plivo | USD 0.0486 (EE) to 0.0563; O2 0.0513, Vodafone 0.0509, Three 0.0556, other networks 0.0521. "Starts at 0.0372" is the landline rate | from USD 0.0795; network rates up to 0.1400 | per SMS (page does not say how multi-segment is billed) | UK numbers USD 0.85/month local, 0.90/month mobile. Sender ID fee not listed. No separate carrier fee listed | [4][5] |
| Twilio Programmable Messaging | USD 0.056 (mobile number or alphanumeric); short code 0.0524 | USD 0.1034 | per segment | UK alphanumeric sender ID: free, one-way only. UK numbers per month: local 1.15, mobile 2.50. "Additional carrier fees may apply" (amounts not readable). Failed message USD 0.001. No minimum; committed-use discounts via sales | [1][2] |
| Prelude (all-in, see Table 2) | EUR 0.025 SMS rate, passed through "at cost" | not readable | per SMS | UK alphanumeric sender ID available, "free registration needed" | [10][9] |
| Vonage SMS API | not readable (page blocks scripts and non-browser fetches) | not readable | | | [26] |
| Bird (MessageBird) | not readable | not readable | per segment (US page) | Plans: pay as you go no deposit; Startup 15, Growth 500 per month (US page) | [14] |
| Telnyx | not readable (country pages show US rates) | not readable | per message part | UK/AR number prices not shown | [13] |
| Infobip | quote-only or ambiguous (see below) | same | | | [12] |
| Textlocal | page unreachable | | | | none |

**Inference** (Infobip): the page's table is labelled "Per message", precision 5, default USD, and lists GB 4.4 and AR 9.7. Sinch's own USD figures are GB 4.415 and AR 9.06 hundredths of a dollar, so the Infobip values are probably US cents (GB about USD 0.044, AR about USD 0.097). The page does not say so; do not quote it as a price.

## Table 2: Verification products (fee on top of the SMS)

| Provider | UK | Argentina | Unit | Extras | Source |
|---|---|---|---|---|---|
| Twilio Verify | USD 0.05 + SMS 0.056 = USD 0.106 | USD 0.05 + SMS 0.1034 = USD 0.1534 | verification fee per successful verification; SMS billed on every attempt | Page also lists an SMS channel fee of USD 0.0083 "U.S. rates" (**Inference**: may or may not apply to UK; not confirmed). Failed or unfinished verifications pay no 0.05 fee but the SMS is still billed. Volume discounts only via sales (100,000+ a month). Free trial, no allowance stated | [3][1][2] |
| Vonage Verify | EUR 0.052 / USD 0.06084 + messaging rate (not readable) | same fee + messaging rate (not readable) | per successful verification; no charge for unsuccessful attempts | "Additional messaging and voice rates apply for attempted and successful verifications" | [11] |
| Prelude Verify | EUR 0.032 + SMS EUR 0.025 = EUR 0.057 | not readable | per verification, SMS passed through at cost | Pay as you go, no setup, no minimum on prepaid. Startup plan EUR 360/month. WhatsApp EUR 0.0182, Telegram EUR 0.012, Viber 0.007, RCS 0.0153 per message for UK (page of UK rates). Free tier not stated | [9][10] |
| AWS OTP (End User Messaging) | USD 0.045 + SMS 0.05 = USD 0.095 | USD 0.045 + 0.09449 = USD 0.13949 | per successful verification, plus standard SMS | Phone number validate USD 0.006 per request | [7][8] |

## Table 3: SMS invitations to phone numbers (marketing/transactional text, not codes)

Invitations use the same per-segment rates as Table 1, but with differences that matter:

| Topic | What the pages say | Source |
|---|---|---|
| Price | Same SMS price per segment as codes. A link plus event text often runs to 2 segments (**Inference**: 160 GSM characters per single segment; longer or non-GSM text splits). | [1][4][6] |
| UK sender ID | Twilio: alphanumeric free, but one-way (no replies). Prelude: UK alphanumeric available, free registration. Plivo, Sinch, AWS: sender ID price not on the pages I read | [1][10] |
| UK number | Twilio mobile number USD 2.50/month, Plivo USD 0.90/month, AWS USD 2/month | [1][4][7] |
| Argentina | Only the per-segment rates above; sender ID rules not on the pages | [2][5][8] |
| Marketing opt-in | **Inference**: unsolicited invitations to non-users need a legal basis (UK PECR and consent). Not checked on provider pages; get advice before launch. | none |

## Table 4: WhatsApp Business Platform (Meta list rates)

Rates are Meta's own rate card, linked from [15] (USD, GBP and ARS list sheets, market rows "United Kingdom" and "Argentina") [16]. Per-message pricing replaced conversation pricing on **1 July 2025** [15].

| Category | UK (USD) | UK (GBP) | Argentina (USD) | Argentina (ARS) | Unit |
|---|---|---|---|---|---|
| Marketing | 0.0635 | 0.0458 | 0.0618 | 89.562 | per delivered template message |
| Utility | 0.022 | 0.0159 | 0.026 | 37.6798 | per delivered template message |
| Authentication | 0.022 | 0.0159 | 0.026 | 37.6798 | per delivered template message |
| Authentication-international | n/a | n/a | n/a | n/a | not applicable |
| Service column | 0.022 | 0.0159 | 0.026 | 37.6798 | shown in the card; see rules below |

Rules as the page states them today [15][17]:

- Template messages (marketing, utility, authentication) can be sent any time to opted-in users. Non-template messages (service, Meta Business Agent) only inside an open customer service window.
- The 24-hour customer service window opens when the user messages or calls you; each new user message or call resets it to 24 hours.
- Free entry point: if a user messages from a Click to WhatsApp ad and you reply within the window, the message is free and opens a free-entry-point window of up to 7 days. Meta Business Agent messages are still charged.
- Authentication-international: applies only in listed markets (Indonesia, India, Egypt, Malaysia, Nigeria, Pakistan, Saudi Arabia, South Africa, UAE; nine more from 1 Oct 2026) and only for businesses sending over 750K template messages in 30 days. **The UK and Argentina are not on either list** [17]; the rate card shows "n/a" for both.
- Recent changes: UK marketing rate rose on 1 July 2026; Argentina utility and authentication rates fell on 1 Oct 2025 [15].
- **Inference**: I could not tell from the card alone whether the "Service" column is billed inside the 24-hour window. Twilio's page says utility messages inside the window are free [18]. Check before budgeting service messages.

What a Business Solution Provider adds:

| Route | Added cost | Source |
|---|---|---|
| Meta Cloud API direct | Meta rate only; no markup because there is no BSP (**Inference**: stated by structure, not by a pricing line) | [15] |
| Twilio WhatsApp | USD 0.005 per message, inbound or outbound, on top of Meta's rate; failed message USD 0.001. So UK authentication = 0.022 + 0.005 = USD 0.027 | [18] |
| 360dialog | Monthly fee per number: Regular EUR 49, Premium EUR 99, Scale EUR 500; page says "no markup on Meta fees". Marketplace EUR 99 per number | [19] |
| Twilio Verify via WhatsApp | USD 0.05 verification fee + channel fee. The page shows USD 0.0034 in the table and 0.0147 in the FAQ, which conflict | [3] |

## Table 5: Telegram Gateway

| Provider | UK | Argentina | Unit | Extras | Source |
|---|---|---|---|---|---|
| Telegram Gateway | USD 0.01 | USD 0.01 | per delivered verification code; undelivered codes refunded | Prepaid credits, not transferable or withdrawable. Own-number messages free. Free "checkSendAbility" if user cannot receive. Free testing environment. Recipient must have a Telegram account and have shared the number with you voluntarily. Country-specific prices and check/request prices are in the API docs, which I did not fetch | [20] |

## Supabase facts

- Built-in phone providers: **MessageBird (now Bird), Twilio, Vonage, TextLocal (community-supported)**. WhatsApp OTP is only available with the **Twilio and Twilio Verify** providers [21].
- Send SMS hook: replaces Supabase's sending. It receives JSON with `user` (id, phone) and `sms.otp`; a 200 with an empty body means success; works with any provider, including regional ones, other channels, fallback to a second provider, or a custom message body. Offered as an HTTP hook (Deno example with Twilio, signature checked with Standard Webhooks) or a Postgres hook (queue plus pg_cron). The page does not state a timeout [22].
- Rate limits: default **30 SMS per hour** per project (configurable) and a **60-second** gap between OTP requests for the same user (configurable); OTPs expire after 1 hour. Docs advise adjusting rate limits and configuring CAPTCHA to control SMS spend [21][23].
- Cost: no per-SMS charge from Supabase appears on any page I read. Auth is billed by monthly active users (Free 50,000; Pro and Team 100,000 included, then USD 0.00325 each) [24][25]. Only "Advanced MFA (Phone)" is a paid add-on (USD 75/month first project, not on Free) and it is not what phone sign-in uses [25]. **Inference**: SMS cost is the provider's alone; the pricing page does not explicitly say phone sign-in is allowed on Free, but lists Auth Hooks that send SMS on Free [25].

## Illustrative monthly cost: 1,000 and 10,000 UK verifications

Assumptions: one SMS per verification (no retries or resends), sent via the Send SMS hook with the provider's plain SMS API, 1 segment, UK mobile numbers, no sender ID or number rental counted, list prices without volume discount. Retries multiply the SMS cost.

Three cheapest credible SMS options (cheapest by published UK per-SMS price among the providers whose UK price I could read):

| Option | Unit price | 1,000 / month | 10,000 / month |
|---|---|---|---|
| Sinch (USD list) | USD 0.04415 | 1,000 x 0.04415 = **USD 44.15** (GBP list: 1,000 x 0.035 = GBP 35.00) | 10,000 x 0.04415 = **USD 441.50** (GBP 350.00) |
| AWS End User Messaging SMS | USD 0.05 | 1,000 x 0.05 = **USD 50.00** | 10,000 x 0.05 = **USD 500.00** |
| Plivo (O2 rate as typical; range EE 0.0486 to Three 0.0556) | USD 0.0513 | 1,000 x 0.0513 = **USD 51.30** (48.60 to 55.60) | 10,000 x 0.0513 = **USD 513.00** (486.00 to 556.00) |

Reference points (not in the three):

| Option | 1,000 / month | 10,000 / month |
|---|---|---|
| Twilio SMS only (0.056) | 1,000 x 0.056 = USD 56.00 | USD 560.00 |
| Twilio Verify (0.05 + 0.056) | 1,000 x 0.106 = USD 106.00 (plus any channel fee, USD 0.0083 each = 8.30) | USD 1,060.00 (plus 83.00) |
| Prelude (0.032 + 0.025 EUR) | 1,000 x 0.057 = EUR 57.00 | EUR 570.00 |
| AWS OTP (0.045 + 0.05) | 1,000 x 0.095 = USD 95.00 | USD 950.00 |
| WhatsApp authentication via Meta direct (0.022) | 1,000 x 0.022 = USD 22.00 | USD 220.00 |
| WhatsApp authentication via Twilio (0.022 + 0.005) | 1,000 x 0.027 = USD 27.00 | USD 270.00 |
| Telegram Gateway (0.01) | 1,000 x 0.01 = USD 10.00 | USD 100.00 |

Notes: WhatsApp and Telegram only work for users who have those apps; the SMS fallback cost still applies for the rest (**Inference**). 360dialog adds EUR 49 a month per number on top. Carrier fees on Twilio and Sinch could not be read and may raise their totals. Sinch and Plivo may require account approval or minimums not shown on the pages I read.

## What I could not read

- **Vonage SMS API** UK and Argentina prices: the pricing page is static US-only content and the country table needs a browser; the site blocks WebFetch (HTTP 403) and headless Chrome (Cloudflare challenge). Only Vonage Verify's fee was readable [11].
- **Bird**: the pricing page shows US rates only; UK and Argentina "Contact Sales". Carrier-fee page is US 10DLC. Number rental amount not stated [14].
- **Telnyx**: UK and Argentina country pages return the same US rate cards; the machine-readable endpoint returns 404 [13].
- **Infobip**: country rates sit in a script table with an ambiguous unit; treated as quote-only [12].
- **Textlocal**: textlocal.com and textlocal.co.uk did not resolve (DNS failure) from this machine, so no price.
- **Prelude Argentina**: country page for AR returns the generic home page, no AR rate.
- **Twilio** carrier fees: referred to but amounts not shown; the Twilio Verify SMS channel fee for the UK is unclear.
- **UK alphanumeric sender ID cost** for Sinch, Plivo, AWS, Vonage, Bird, Telnyx: not on the pages read (only Twilio free, Prelude free registration).
- **Telegram Gateway** per-country price list and API pricing section: not fetched, only the headline USD 0.01.
- **WhatsApp rate card**: the sheets are signed Meta file links; the rate card date is not stated on the sheet, and the card's "Service" column billing meaning is unconfirmed.
- **Supabase**: whether phone sign-in is permitted on every plan is not stated on the pricing page; no per-SMS Supabase charge was found.
- Some summaries for Twilio, Plivo, AWS, Prelude, Telegram and Supabase came through a page summariser rather than raw text; the Sinch, AWS (CSV), Plivo (network table), Prelude UK, Meta rate card and Vonage Verify numbers were read from raw page data.

## Sources (all accessed 2026-11-03)

1. Twilio SMS pricing, United Kingdom: https://www.twilio.com/en-us/sms/pricing/gb
2. Twilio SMS pricing, Argentina: https://www.twilio.com/en-us/sms/pricing/ar
3. Twilio Verify pricing: https://www.twilio.com/en-us/verify/pricing
4. Plivo SMS pricing, United Kingdom: https://www.plivo.com/sms/pricing/gb/
5. Plivo SMS pricing, Argentina: https://www.plivo.com/sms/pricing/ar/
6. Sinch SMS pricing (embedded pricing data, Cloud list, dated 2026-11-03): https://sinch.com/pricing/sms/
7. AWS End User Messaging pricing: https://aws.amazon.com/end-user-messaging/pricing/
8. AWS SMS price list CSV linked from [7]: https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/business-applications/approved/documents/End-User-Messaging-SMS-Prices.ebc340b4d416d90832dd59629c4792b0deb6f8bc.csv
9. Prelude pricing: https://www.prelude.so/pricing
10. Prelude UK rates: https://www.prelude.so/countries/gb
11. Vonage Verify pricing: https://www.vonage.com/communications-apis/verify/pricing/
12. Infobip SMS pricing: https://www.infobip.com/sms/pricing
13. Telnyx messaging pricing: https://telnyx.com/pricing/messaging
14. Bird SMS pricing: https://bird.com/en-us/pricing/sms
15. WhatsApp Business Platform pricing (Meta): https://developers.facebook.com/docs/whatsapp/pricing
16. Meta rate card sheets (USD, GBP, ARS list rates), linked from [15] under "Rates" (signed fbcdn links, not stable); interactive version: https://business.whatsapp.com/products/platform-pricing#rates
17. Meta authentication-international rates: https://developers.facebook.com/docs/whatsapp/pricing/authentication-international-rates
18. Twilio WhatsApp pricing: https://www.twilio.com/en-us/whatsapp/pricing
19. 360dialog pricing: https://360dialog.com/pricing
20. Telegram Gateway: https://core.telegram.org/gateway
21. Supabase phone login: https://supabase.com/docs/guides/auth/phone-login
22. Supabase Send SMS hook: https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
23. Supabase Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
24. Supabase MAU billing: https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users
25. Supabase pricing: https://supabase.com/pricing
26. Vonage SMS pricing (US content only readable): https://www.vonage.com/communications-apis/sms/pricing/

## Follow-up checks (same day, main session)

- **Textlocal is gone.** Its successor page says "Textlocal Messenger closed on 31 July 2026", "All Textlocal services, messaging, APIs and Proxy stopped", and "Textlocal is now Webex Interact" [27]. Supabase's built-in Textlocal provider therefore points at a closed service; of the built-in four, Twilio, Vonage and Bird remain.
- **Twilio UK carrier fees.** The UK pricing page carries only the generic sentence "Prices may change from time to time without notice and additional carrier fees may apply" and links to a US carrier-fee section; it shows no UK per-carrier fee table [1]. **Inference**: no UK pass-through fee is published; budget the USD 0.056 list price and confirm on the first invoice.
- **Vonage SMS** still answers HTTP 403 to non-browser fetches [26]; its UK and Argentina SMS prices remain unread.
- **Telegram Gateway API** [28]: it delivers "automated messages, such as verification codes, to users who registered their phone number on Telegram". A fee is charged only on successful delivery ("If a message is not delivered within the specified ttl, the request fee will be refunded automatically"); `checkSendAbility` is free unless it confirms the number can be reached, and sending with its `request_id` is then free; sending to your own number is free. `sendVerificationMessage` takes `phone_number` (E.164), optional `request_id`, `sender_username` (a verified channel you own), your own 4 to 8 digit `code` or a `code_length`, a `callback_url` for delivery reports and a `ttl` of 30 to 3600 seconds. The page states no price per country; the headline USD 0.01 is from [20].

27. Webex Interact, Textlocal closure notice: http://webexinteract.com/textlocal/ (accessed 2026-11-03)
28. Telegram Gateway API reference: https://core.telegram.org/gateway/api (accessed 2026-11-03)
