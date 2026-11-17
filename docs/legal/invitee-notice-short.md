# Invitation page privacy notice (short)

**Version 1.0 — draft for solicitor review, not yet published**
**Effective date:** [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]]
**Operator:** Resbite Ltd

> **Placeholders to fill** (delete this box, and the notes for the build, before publishing)
>
> 1. Effective date (header): [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]]
> 2. CAPTCHA vendor, in the optional bot-check line: [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]]

This is the short privacy notice shown beside the mobile number field on our invitation pages. It summarises section 10 of the Privacy Notice, "If someone invited you by your number".

`{host}` stands for the host's name, as the page already shows it. "Privacy Notice" is a link.

---

## Personal invitation page (`link.resbite.com/i/<code>`)

**Notice** (49 words, counting `{host}` and the link label):

> {host} gave Resbite Ltd this number to invite you. We use it to text you a code. Confirming it creates a Resbite account with your number, name and answer; other guests never see your number. Unanswered, the number is deleted within 30 days after the resbite ends. [Privacy Notice](https://link.resbite.com/privacy#if-someone-invited-you-by-your-number)

**Right to object** (26 words). Shown at the same time as the notice, in its own clearly separate block:

> **Right to object:** tell us at any time to stop using your number. Email privacy@resbite.com and we'll delete it and stop anyone inviting you by number.

Together: 75 words.

---

## Event link page (`link.resbite.com/r/<code>`)

**Notice** (47 words):

> Resbite Ltd uses your number to text you a code and send your request to {host}. Confirming it creates a Resbite account with your number, name and answer; other guests never see your number. It stays until you ask us to delete it at privacy@resbite.com. [Privacy Notice](https://link.resbite.com/privacy)

There is no right-to-object line on this page. Here the visitor types their own number to ask to join, so we collect it from them (UK GDPR Article 13) to do what they asked, not on the basis of legitimate interests. The Privacy Notice's own right-to-object box (section 11) covers the rest.

---

## Optional bot-check line (both pages, once the bot check is live)

> We use [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]] to check you're not a bot.

8 or 9 words once the vendor is named ("We use hCaptcha to check you're not a bot."). With it, the personal page reaches about 84 words in all, so it should sit beside the **Send code** button rather than in the notice block. The Privacy Notice (sections 3.11 and 9) already describes the check, so the line is optional.

---

## Notes for the build (delete before publishing)

- **Depends on.** The notice is true only once these are built: the short notice placed on `/r/` and `/i/` (D3); the `/privacy` page and its anchor for section 10 (D1); real text-message codes (C1, B12, D6); invitees' numbers deleted 30 days after the resbite ends (C3); the do-not-invite list that the right to object promises (C3, D-23); the privacy inbox watched (F1); the current Terms version on the tick (D4); and, for the optional line, the bot check (B16, D10, C11).
- **Where.** Directly beside or under the mobile number field, above **Send code**, visible before the visitor types. Not behind a link, a tap or a fold.
- **The right to object stands apart.** Its own paragraph, with "Right to object:" in bold, not merged into the notice text or the 18+ tick, and in the same type size as the notice. UK GDPR Article 21(4) asks for it to be presented "clearly and separately from any other information".
- **The link** on the personal page goes to section 10 of the Privacy Notice. Confirm the anchor once the page is built (D1).
- **The tick stays.** The "I'm 18 or over" tick and the Terms line keep pointing at the current Terms version (D4).
- **No other change** to the page's strict content security policy, except what D10 adds for the bot check.

## What each sentence covers (for the reviewer; delete before publishing)

| Sentence | Personal page | Event page | Requirement |
|---|---|---|---|
| "{host} gave Resbite Ltd this number…" / "Resbite Ltd uses your number…" | Who we are; the source of the number | Who we are | Art 13(1)(a), 14(1)(a), 14(2)(f) |
| "…to invite you. We use it to text you a code." / "…to text you a code and send your request…" | Why | Why | Art 13(1)(c), 14(1)(c) |
| "Confirming it creates a Resbite account with your number, name and answer" | What we hold if they go on | Same | Art 13(1)(c), 14(1)(d) |
| "other guests never see your number" | Who sees it | Same | Art 13(1)(e), 14(1)(e) |
| "Unanswered, the number is deleted within 30 days after the resbite ends." / "It stays until you ask us to delete it" | How long | How long | Art 13(2)(a), 14(2)(a) |
| "Right to object…" | The right to object, and how deletion is asked for | — | Art 14(2)(c), 21(4) |
| "Privacy Notice" link | Everything else: lawful basis, recipients, transfers, all rights, complaints | Same | Art 13, 14 in full, layered |
