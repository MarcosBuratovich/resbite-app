# App Store review notes: Resbite 1.0, first submission

- **Owner:** the owner.
- **Version:** 1.0 (draft).
- **Date:** 17 November 2026.
- **Next review:** on the day of the 1.0 submission (phase 6, step 24 of the [release runbook](README.md)), against the submission build; then rewritten for each later version.
- **Purpose:** the text for App Store Connect's Notes for App Review on Resbite's first submission (gap analysis A7 and E6).
- **Review:** a draft for the owner. It is not a public document, but it must say nothing the published Privacy Notice (A1), Terms of Use (A3) and deletion page (A6) contradict. Those go to a UK solicitor before publishing (decision D-12). Check the notes against the final texts.

This replaces, for the first submission, the chat-only draft in [`qa/chat-release/app-store-review-notes.md`](../chat-release/app-store-review-notes.md). That draft opened "Resbite is an invitation-only app" and "This version adds a chat", which are wrong for a first version since the open beta. It said nothing on sign-in, deletion, stored numbers or services (gap analysis ASC-8, CON-4). Its Report and Block section is kept, updated for the 1.0 report reasons.

## Placeholders to fill

Fill each one **in App Store Connect only**. Sign-in details never go into this file or the repo.

| # | Placeholder | Filled from |
|---|---|---|
| 1 | [[OWNER: title of the weekly group — proposed: "Thursday board games"]] | The pack, section 12.3 |
| 2 | [[OWNER: title of the one-off — proposed: "Picnic in the park"]] | The pack, section 12.3 |
| 3 | [[OWNER: deletion-test account email and password — proposed: account R2 of the pack's section 12, typed only into the Notes in App Store Connect, never into the repo]] | The pack, section 12.2 (R2). Apple asks for additional accounts' details in the Notes. |
| 4 | [[OWNER: devices and iOS versions tested — proposed: each iPhone model and iOS version from the runbook's device checks, and the iPad used in iPhone compatibility mode]] | The runbook's device checks: each iPhone model and iOS version, and the iPad used in iPhone compatibility mode |
| 5 | [[OWNER: SMS provider — proposed: Twilio]] | Decision D-3 |
| 6 | [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]] | Decision D-3 |

## How to use it

1. On the submission day, open the submission build with the review account and walk every path the text names. If a label or a path differs, change the text to match the build.
2. Copy the text block below into App Store Connect → the 1.0 version → App Review Information → Notes.
3. Fill the six placeholders there.
4. **Size.** The Notes field holds up to 4,000 bytes. The block below is 3,954 bytes with its placeholders unfilled, and 3,358 bytes with them taken out (recounted in the cross-check of 17 November 2026, after the placeholders were given one standard wording). Apart from the placeholders, it is plain ASCII, so one character is one byte; it uses straight quotes on purpose. Filled with titles of about 20 characters, an email and password of about 60 and a devices line of about 120, it comes to about 3,600 bytes. App Store Connect refuses text over the limit, so a refusal there is the final check. To count the block in this file, from the repository root: `awk '/^```text$/{f=1;next} /^```$/{f=0} f' qa/app-store-release/app-store-review-notes.md | wc -c`.
5. The review account's own sign-in goes in Sign-In Information, not in the Notes.

## Where each claim comes from

The notes promise only what 1.0 will have. A claim marked with a build item is true only once that item is built and live. The runbook checks each one before submission.

| Claim in the notes | Source | Needs |
|---|---|---|
| What the app does; groups repeat weekly with an open chat | `mobile/src/domain/planCopy.ts`; chat groups, live on hosted (`qa/chat-release/README.md`, "Applied") | C4 (the roll job) |
| For adults (18+) | The 18+ tick (`mobile/src/domain/guestAccount.ts:13-15`), on every account | B2, C8 |
| No purchases, subscriptions, ads or tracking | `mobile/package.json` (no purchase, ad or analytics SDK); PRV-14 | — |
| Run by Resbite Ltd, England and Wales | Owner facts, 17 November 2026 | — |
| Sign-in path: "I have an account", then "Use email and password"; no code | `mobile/app/index.tsx`; `mobile/app/auth/phone.tsx` (`PHONE_COPY.useEmail`); `mobile/src/domain/accountRoute.ts:10-13` | The review accounts (pack, section 12) |
| Every account needs a number verified by text, because invitations are matched to it (SI-5, guideline 5.1.1(v)) | `mobile/src/domain/accountRoute.ts:11`; `mobile/src/domain/phoneCopy.ts` ("Your friends find and invite you by your number."); decision CI-D2 | C1 (real SMS), B12 |
| The weekly group's chat is always open; Group chat on its page | `mobile/src/domain/eventPage.ts` ("Group chat"); `supabase/migrations/20261111150000_chat_groups.sql:215` | C4; seeded content |
| The chat rules at the first Send, and their wording | `mobile/src/domain/safetyCopy.ts` (`rules`) | R1 has not agreed (pack, 12.2) |
| An unanswered invitation's card shows the announcement; a connection request | Chat runbook step 6a; `mobile/src/domain/connectionsCopy.ts` | Seeded content |
| Contacts access optional; type a number | `mobile/src/state/useContactInvites.ts` (PERM-5) | — |
| Only picked numbers checked and stored, for that invitation only, deleted when answered or revoked or 30 days after the resbite ends; no contact database (PRV-20, guideline 5.1.1(viii)) | `mobile/src/state/useContactInvites.ts:268-286`; retention defaults (gap analysis section 5); D-23 suppression list | C3 |
| Invitations sent from your own messaging app | `mobile/src/services/inviteSend.ts` (PERM-4) | — |
| The blocked-terms filter checks messages, announcements, titles, descriptions, notes and names | `supabase/migrations/20261111160000_chat_safety.sql:999,1057` for messages and announcements | C7 for the rest |
| Report and Block, in each place listed | Chat runbook's notes and step 7 ("Chat safety (plan 3)"); `mobile/src/domain/safetyCopy.ts` | Device check on the build |
| Reasons include Illegal or dangerous, Child safety and Intimate image shared without consent | — | B7, C7 |
| A block hides messages at once and ends any connection; they aren't told; Blocked people | `mobile/src/domain/safetyCopy.ts` (`blockQuestion`); `mobile/app/blocked-people.tsx` | — |
| Each report notifies the moderators | The moderator push, live (`qa/chat-release/README.md:869`) | — |
| Daily read, a named backup, removal and suspension within 24 hours | `qa/chat-release/README.md`, "The reports queue"; the moderation standard (A15) | C5, F2, A24 (backup); C6 (removing photos, titles and covers) |
| Delete account for every kind of account; password confirmation | `mobile/app/data-privacy.tsx` (the row) | B3, C2 |
| Access closes at once; within 30 days, usually minutes; the screen confirms it; "What happens" says what is kept and that a host's future resbites are cancelled and guests told | `mobile/app/delete-account.tsx` ("Deletion immediately closes access."); D-4, D-20 | B3, C2 |
| About and legal: Privacy Notice, Terms of Use, Support, Licences; links on the first and sign-in screens | — | B1, A25 |
| The four URLs | — | D1 |
| support@resbite.com in Data & privacy > Contact and after every report | `mobile/app/data-privacy.tsx:28,138-147`; `mobile/src/design/ReportSheet.tsx:69` | F1, and `EXPO_PUBLIC_SUPPORT_ADDRESS` set before the build |
| Services: Supabase in London, Expo and Apple push, Apple and Google sign-in, Resend | `docs/implementation-status.md:30`; data inventory §14 | C11 (Apple provider on) |
| The SMS provider; the CAPTCHA vendor | — | C1; B16, D10 |
| link.resbite.com on Vercel | `links/` | D1 |
| UK storefront only | Decision D-2 | — |
| Nothing hidden or switched off | Deletion and push on in the build, test mode off (CON-3, guideline 2.5.19) | B3, B4, C1, C2; the EAS variables |

## The notes (paste into App Store Connect)

```text
Resbite is an iPhone app for planning small get-togethers, called resbites. A host picks a time and place and invites friends by phone number; guests answer Going, Maybe or Can't go, and everyone on a resbite can chat. A resbite that repeats weekly is a group, whose chat stays open. For adults (18+). No purchases, subscriptions, ads or tracking. Run by Resbite Ltd, England and Wales.

SIGN IN
Use the account in Sign-In Information: on the first screen tap "I have an account", then "Use email and password". No code is asked. Please don't use "Get started": every account needs a mobile number verified by text, because friends invite each other by number and invitations are matched to it. Both review accounts already have one.

WHAT TO OPEN
On My resbites, open [[OWNER: title of the weekly group — proposed: "Thursday board games"]]. Its chat is always open: on its page tap Group chat to see the host's messages and announcement. The chat rules appear at the review account's first Send.
The account is also invited, not yet answered, to [[OWNER: title of the one-off — proposed: "Picnic in the park"]]; its card shows the host's announcement. Profile > Connections holds a request from the host.
You can create a resbite from Create. Contacts access is optional; you can type a number. Only the numbers you pick are checked and stored, for that invitation only, and deleted once answered or revoked, or 30 days after the resbite ends. We build no contact database. Invitations are sent from your own messaging app.

SAFETY
Chat rules: "Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account." A blocked-terms filter checks messages, announcements, titles, descriptions, notes and names.
Report and Block:
- In a chat: long-press a message for Report message; tap a name above a message, or ... menu > Report or block, for that person.
- On a chat's people list, for each person.
- On an unanswered invitation: long-press its card, or Report or block on its page.
- Profile > Connections: a request's ... menu.
Reasons include Illegal or dangerous, Child safety and Intimate image shared without consent. A block hides the person's messages at once and ends any connection; they aren't told. Undo it in Profile > Data & privacy > Blocked people.
Each report notifies our moderators. We read the queue daily, with a named backup when the owner is away, and remove content and suspend accounts within 24 hours.

DELETE ACCOUNT
Profile > Data & privacy > Delete account, for every kind of account. To try it, sign out and sign in with the second account: [[OWNER: deletion-test account email and password — proposed: account R2 of the pack's section 12, typed only into the Notes in App Store Connect, never into the repo]]. Confirm with its password. Access closes at once; deletion completes within 30 days, usually minutes, and the screen confirms it. "What happens" says what is kept, and that a host's future resbites are cancelled and guests told.

PRIVACY, TERMS, SUPPORT
Profile > Data & privacy > About and legal links the Privacy Notice, Terms of Use, Support and Licences; so do the first and sign-in screens. https://link.resbite.com/privacy, /terms, /support, /delete-account. Contact: support@resbite.com, also in Data & privacy > Contact and after every report.

TESTED ON
[[OWNER: devices and iOS versions tested — proposed: each iPhone model and iOS version from the runbook's device checks, and the iPad used in iPhone compatibility mode]]

SERVICES
Supabase (data, sign-in, storage; London), Expo and Apple push, Sign in with Apple, Google sign-in, Resend (sign-in email), [[OWNER: SMS provider — proposed: Twilio]] (codes), [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]], link.resbite.com on Vercel (web invitations, legal pages).

REGIONS
UK storefront only. Nothing is hidden or switched off for review.
```

## Open points

1. **The password proof (B3).** "Confirm with its password" holds only if B3 offers a password proof to an email account that also has a verified phone. Today the screen asks for an email code first, with "Use my password instead". A reviewer can receive neither an email code nor an SMS. If B3 keeps that order, add "(tap Use my password instead)" to the notes.
2. **The About and legal path (B1).** B1 may put the group on Data & privacy or on Profile. Change the path in the notes to match the build.
3. **The 24-hour promise** stays in the notes only once the backup moderator is named and on the moderators list (C5). Until then the release waits (chat runbook R-Q4; gap analysis UGC-5).
4. **The 30-day promise and the confirmation** must match what C2 delivers and what A6 says.
5. **The contact-number retention line** depends on C3's purge job being live and on the periods the owner adopts (D-8). If the periods change, change the line.
6. **The chat rules quote** is the live wording (`mobile/src/domain/safetyCopy.ts`). `docs/legal/community-rules-short.md` recommends a longer text that adds illegal content, private details and intimate images. If the owner adopts it, it ships in the build and in a new rules version (C7), and the quote here must change to match. The longer text adds 98 bytes (with a straight apostrophe), which still fits: about 3,700 bytes filled.
