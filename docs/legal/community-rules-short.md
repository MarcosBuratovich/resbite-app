# Resbite community rules: the short version, and the sign-up wording

**Version 1.0 — draft for solicitor review, not yet published**
**Effective date:** [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]]
**Operator:** Resbite Ltd

> **About this file (delete this box before publishing).** This file holds words people see in the app and on the link site: the chat rules sheet, the 18+ and Terms tick, and the screen that asks for a new Terms version. It also holds notes for the owner and the builder. **Only the text in quoted blocks (lines that start with ">") is public.** It is not published as a page: the app and the link site show it. Everything else, including the file paths and build item ids, is a note and is never shown to anyone outside the team. The full community rules are section 9 of the Terms of Use (`docs/legal/terms-of-use.md`). Like the Terms, this is a draft for the solicitor's review (decision D-12), written for Resbite at version 1.0.

## Placeholders to fill

| # | Placeholder | Where it appears |
|---|---|---|
| 1 | [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]] | The header |

---

## 1. The chat rules sheet

### Where it appears

Before someone sends their first message or announcement, the app shows the chat rules sheet, and they tap **I agree**. The server records which version of the rules they accepted. Until they agree, their message waits.

- Words: `mobile/src/domain/safetyCopy.ts:51-55`
- Sheet: `mobile/app/chat.tsx:1088-1090` (messages) and `:1579` (announcements)
- Server: `private.chat_rules_version()` returns `2026-11` (`supabase/migrations/20261111160000_chat_safety.sql:836-838`); acceptances are stored per version (`:811-818`, `:847-850`).

### The current text (live)

> **Chat rules**
>
> Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account.
>
> [I agree]

### Is it good?

**Mostly, yes.**
- It is short and plain, and it sounds kind.
- It names the harms people meet most often in a chat.
- It says honestly what happens: messages are removed, and accounts can be lost.
- The Terms quote it as the short version (Terms section 9.2).

**What it leaves out.**
- Anything illegal.
- Intimate images shared without consent. Apple's October 2026 update names nonconsensual intimate imagery as content apps must "proactively prevent and remove", and the UK's 48-hour takedown standard applies (gap analysis UGC-10, D-21).
- Other people's private details, such as a home address.
- A way to read the full rules.

### Recommended text

> **Chat rules**
>
> Be kind. No harassment, hate, threats, spam or anything illegal. Don't share someone's private details or intimate images without their consent. Messages that break these rules are removed, and people who break them can lose their account.
>
> Read the full community rules
>
> [I agree]

- "Read the full community rules" is a link to `https://link.resbite.com/terms#community-rules`.
- The text is about 230 characters, so the sheet stays short.

### If the owner adopts the new text, these change with it

1. `SAFETY_COPY.rules` in `mobile/src/domain/safetyCopy.ts:53-54`, plus a new string for the link.
2. **The rules version on the server.** A migration changes `private.chat_rules_version()` from `2026-11` to a new value, for example `2026-12`. Without that, people who agreed to the old words never see the new ones. With it, each person sees the sheet once more before their next message. The sheet already holds unsent messages while it waits (`rulesHeldMessage`, `safetyCopy.ts:58`). The safety extension migration (C7) is the natural place for this change.
3. The quote in the Terms, section 9.2.
4. A canonical URL for the full rules in the app (B1), and the `#community-rules` anchor on the published `/terms` page (D1).

### If the owner keeps the current text

That is acceptable. Everyone will accept the Terms, which carry the full rules, on the acceptance screen (B2). In that case, add only the "Read the full community rules" link. Adding a link doesn't change the rules, so the server version can stay at `2026-11`.

**Recommendation:** adopt the new text, with the version change in C7, so it ships in the same sitting as the other safety changes.

---

## 2. The 18+ and Terms tick at sign-up

### Where it appears

- **App:** phone sign-up (`mobile/app/auth/phone.tsx:101-109`), joining from an invitation link (`mobile/app/invite.tsx:242-254`), and the new acceptance screen for every other account (B2; section 3 below).
- **Link site:** the answer pages `/r/` and `/i/` (`links/assets/personal-flow.mjs:24-26`).

### The current text

| Part | Text |
|---|---|
| Tick | I'm 18 or over |
| Line under the tick | I agree to the Terms and Privacy Policy. |
| Helper, while not ticked | Resbite is for people aged 18 and over. |

### Recommended text: one tick, one line

| Part | Text |
|---|---|
| Tick | **I'm 18 or over and I accept the Terms of Use.** |
| Line under the tick (not part of what is ticked) | Our Privacy Notice explains how we use your data. |
| Helper, while not ticked (unchanged) | Resbite is for people aged 18 and over. |
| VoiceOver hint on the tick | Confirms you're 18 or over and accept the Terms of Use. |

"Terms of Use" and "Privacy Notice" are always links, to `https://link.resbite.com/terms` and `https://link.resbite.com/privacy`.

**Why this wording.**
- **One tick, both facts.** One action records both the age confirmation and the Terms version. Section 2.4 of the Terms describes exactly this.
- **"Terms of Use"** names the document as it is published. "Terms" alone could mean anything.
- **The Privacy Notice is information, not an agreement.** Resbite doesn't rely on consent for the account, the chat or moderation. Asking people to "agree to" the Privacy Notice can suggest that it does, and muddles what withdrawing consent would mean. So the Privacy Notice gets its own line, outside the tick.
- **"Accept"** matches the Terms (section 2.4) and the acceptance screen below.

### If the acceptance screen uses two ticks instead

| Part | Text |
|---|---|
| First tick | I'm 18 or over |
| Second tick | I accept the Terms of Use |
| Line under the ticks | Our Privacy Notice explains how we use your data. |
| Helper, while either is not ticked | Resbite is for people aged 18 and over, and you need to accept the Terms of Use to use it. |

Continue stays off until both are ticked. Use the same form in the app and on the link site.

### Build notes

- **`TermsLine` will mis-link the new wording.** It splits its text on the literal words "Terms" and "Privacy Policy" (`mobile/src/design/TickRow.tsx:60-108`). With the new tick it would link "Terms" and leave "of Use" as plain text, and it would look for "Privacy Policy" inside the tick line. B1 and B2 must change it to link the whole phrases "Terms of Use" and "Privacy Notice", each in its own line.
- **The link site has its own copy** of the tick and the line (`links/assets/personal-flow.mjs:24-26`). Change it in the same way (D3), so the app and the web say the same thing.
- **The recorded version.** `TERMS_VERSION` is `2026-10` in the app (`mobile/src/domain/guestAccount.ts:4`) and on the link site (`links/server/lib/options.mjs:16`), and names no document. Set both to one new value for version 1.0 of the Terms, in the `YYYY-MM` form the database accepts (`supabase/migrations/20261022120000_gi2_guest_accounts.sql:27`); the value is a placeholder in `docs/legal/README.md` (B2, C8, D4).

---

## 3. The screen that asks for the Terms

This screen comes after Add your number and before About you. It appears for any account that hasn't accepted the current Terms version: accounts made with Apple, Google or email, and every older account once version 1.0 is published (decision D-11).

### Suggested text for version 1.0

> **Please accept our Terms**
>
> To use Resbite, confirm that you're 18 or over and accept our Terms of Use. They include our community rules.
>
> This is the first full version of our Terms. It sets out our community rules, how we keep Resbite safe, how to complain or appeal, and what happens when you delete your account.
>
> [ ] I'm 18 or over and I accept the Terms of Use.
> Our Privacy Notice explains how we use your data.
>
> [Continue]
>
> Delete my account · Sign out

- **Continue** stays off until the box is ticked.
- **Delete my account** opens the normal Delete account screen. Section 16.2 of the Terms says people who don't accept a new version can delete their account instead, so the way out must be on this screen.
- The second paragraph is written fresh for each new version: one or two sentences on what changed and why. For a new account that has never accepted any version, the app can leave it out.

### Suggested text for later versions

> **We've updated our Terms**
>
> [One or two sentences: what changed, and why.]
>
> To keep using Resbite, please accept the new version.
>
> [ ] I'm 18 or over and I accept the Terms of Use.
> Our Privacy Notice explains how we use your data.
>
> [Continue]
>
> Delete my account · Sign out

---

## 4. One more place for the rules

In **About and legal** (B1), add a row **Community rules** that opens `https://link.resbite.com/terms#community-rules`. People can then find the full rules without reading the whole of the Terms.

---

## 5. What must be built for these words to be true (delete before publishing)

| Words | Depends on |
|---|---|
| The tick on every account and the acceptance screen, recorded by version | B2, C8, D3, D4 (decision D-11) |
| "Delete my account" and "Sign out" on the acceptance screen | B2, with deletion live (B3, C2) |
| The links to `/terms` and `/privacy`, and the `#community-rules` anchor | B1, D1 |
| The recommended chat rules text and its new rules version | B1, and the C7 migration that bumps `private.chat_rules_version()` from `2026-11` |
| "Terms of Use" and "Privacy Notice" linked as whole phrases | B1, B2, D3 (`TermsLine` and `links/assets/personal-flow.mjs`) |
| A **Community rules** row in About and legal | B1 |
