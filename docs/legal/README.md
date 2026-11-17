# Public legal documents: index and change rules

**Owner:** the owner (for Resbite Ltd)

**Version:** 1.0

**Date:** 17 November 2026

**Next review:** at every change to a public document, and at least by 17 November 2027

**Purpose:** list Resbite's public documents, where each is published and which version is current, and set the rules for changing them.

> **Placeholders to fill**
>
> 1. The effective date of each document (one shared date is proposed): [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]]
> 2. The `TERMS_VERSION` value for Terms of Use 1.0: [[OWNER: the Terms version string for Terms of Use 1.0 — proposed: the year and month the Terms take effect, in the "YYYY-MM" form the database accepts, for example "2026-12"; it must differ from today's "2026-10"]]

This folder holds the source text of the documents published on the link site, `link.resbite.com`. None is published yet. Every version 1.0 is a draft for a UK solicitor's review (decision D-12 in `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`).

## The documents

| Document | Source file | Published at | Version | Status | Effective date | Gap-analysis deliverable |
|---|---|---|---|---|---|---|
| Privacy Notice | `privacy-notice.md` | https://link.resbite.com/privacy | 1.0 | Draft for solicitor review, not yet published | [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]] | A1, with A2 and A20 as sections |
| Terms of Use | `terms-of-use.md` | https://link.resbite.com/terms | 1.0 (`TERMS_VERSION` [[OWNER: the Terms version string for Terms of Use 1.0 — proposed: the year and month the Terms take effect, in the "YYYY-MM" form the database accepts, for example "2026-12"; it must differ from today's "2026-10"]]) | Draft for solicitor review, not yet published | As above | A3 |
| Support and contact, with Complaints and appeals | `support.md` | https://link.resbite.com/support | 1.0 | Draft for solicitor review, not yet published | As above | A4, with A5 as a section |
| Delete your account | `delete-account.md` | https://link.resbite.com/delete-account | 1.0 | Draft for solicitor review, not yet published | As above | A6 |
| Invitation page notice (short) | `invitee-notice-short.md` | Beside the number field on `/r/` and `/i/`, with the right-to-object line on `/i/` | 1.0 | Draft for solicitor review, not yet published | As above | A2 (built by D3) |
| Community rules: short version and sign-up wording | `community-rules-short.md` | In the app: the chat rules sheet, the 18+ and Terms tick, the acceptance screen; on `/r/` and `/i/`: the tick | 1.0 | Draft for solicitor review, not yet published | As above | A3 (built by B1, B2, C7, D3) |

The open-source licence notices (A25) live in the app, not here.

**One name for each document.** The public documents and the app call A1 the "Privacy Notice" and A3 the "Terms of Use". Apple's own field in App Store Connect is still called "Privacy Policy URL"; it points at `/privacy`. The regulator is named the same way everywhere: "the Information Commission (ICO)", which took over from the Information Commissioner's Office on 30 September 2026 and still uses the name ICO (ico.org.uk).

## Where each URL is used

Each URL is fixed in places that are slow to change. A wrong or missing URL means a new app build.

| URL | App Store Connect | In the app | Link site | Auth emails |
|---|---|---|---|---|
| `/privacy` | Privacy Policy URL | Data & privacy and About and legal; the welcome and sign-in screens; the 18+ and Terms tick (`EXPO_PUBLIC_PRIVACY_URL`) | Footer on every page; the tick line and the notice beside the number field (`PRIVACY_URL`) | Footer |
| `/terms` | Linked in the description | The same places as `/privacy` (`EXPO_PUBLIC_TERMS_URL`) | Footer; the tick line (`TERMS_URL`) | Footer |
| `/support` | Support URL | About and legal. The Contact topic and the report thanks show the support address (`EXPO_PUBLIC_SUPPORT_ADDRESS`) | Footer | The support address in the footer |
| `/delete-account` | Privacy Choices URL | Not linked: the app has its own Delete account screen | Footer; linked from `/support` | — |

## Rules for changing a public document

1. **Every change bumps the version.** Even a typo fix.
   - Change the second number (1.0 → 1.1) for wording that doesn't change what we do or what people can do.
   - Change the first number (1.1 → 2.0) for a change of substance: new data, a new purpose or vendor, new rights or duties, new times or periods.
   - Update the effective date and record the change in the change log below.
2. **Change the file here first.** Then change the link site's page so it carries exactly the same text and version, in the same commit where you can. The published page must never differ from the file.
3. **Changes of substance go to the solicitor before they are published** (D-12), and so does every first version.
4. **Keep the documents consistent with each other and with the app.** The retention periods, the deletion steps, the report reasons and the contact details appear in several documents and in the app's own text (Data & privacy, Delete account, the report sheet). Change them together.
5. **Keep the App Privacy answers in step.** When the Privacy Notice changes, check the App Store Connect App Privacy answers against it before the next submission.
6. **Keep every published version.** Record the commit of each published version in the change log, so that anyone can see the exact text a person agreed to.

### Extra steps for the Terms of Use

A change to the Terms, of any size, also needs a new `TERMS_VERSION`, so that people accept the version they are shown:

1. Set the new `TERMS_VERSION` in the app: `mobile/src/domain/guestAccount.ts`, the constant `TERMS_VERSION` (today `"2026-10"`, line 4).
2. Set the same value on the link site: the Vercel variable `TERMS_VERSION`, and the fallback in `links/server/lib/options.mjs` (today `"2026-10"`, line 16), so a deploy without the variable still sends the right version.
3. Set it wherever the server keeps the current version, once the versioned acceptance (C8) adds one.
4. Use the form `YYYY-MM`. The database refuses any other form (`supabase/migrations/20261022120000_gi2_guest_accounts.sql`, line 27), so there can be only one Terms version a month, unless C8 changes the form.
5. Release the new app build and the link-site change together. The app's value is fixed when the build is made. Until the new build is in people's hands, the old build keeps recording the old version. The EAS build and the Vercel change each need the owner's approval at the time.
6. Accounts without the new version are asked to accept it once, on the acceptance screen (B2, C8).

## Change log

| Date | Document | Version | Change | Published commit |
|---|---|---|---|---|
| 17 November 2026 | Privacy Notice | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Terms of Use | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Support and contact | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Delete your account | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Invitation page notice (short) | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Community rules: short version and sign-up wording | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | This index | 1.0 | First version | — |
| 17 November 2026 | All of the above | 1.0 (draft) | Cross-check before solicitor review: one name for the Privacy Notice and the regulator; one effective-date placeholder; what deletion does to a host's resbites, the guest list, suspension records, legal-request address and the ban for child sexual abuse made the same everywhere | Not published |
