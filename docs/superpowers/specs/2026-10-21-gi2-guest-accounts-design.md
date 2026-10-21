# GI2: the guest's account from the link, and the link granting access

**Date:** 21 October 2026. **Status:** drafted from the GI1 spec and the Figma boards at the owner's request ("just start from the spec and the Figma boards"); the calls marked *my call* are the controller's, not the owner's, and are listed again at the end for review.
**Source:** Figma "GI · Guest invitation flow V1.1" (473:3213; screens 03–07, the Paths strip, the Deferred deep link and Not-in-this-version panels), "FU · Dev brief V0.4" (332:7288; sign-in options, the 18+ tick, the name rule) and FU screen 09 (475:5431), the pattern map (473:2553) and the UK refer-a-friend note (473:2549). Decisions GI-D1 to GI-D7 in `2026-10-21-gi1-event-links-design.md`. **Builds on:** GI1 (migration live and page deployed 21 October 2026; the build goes to TestFlight on 22 October).

## Intent

A friend of the host taps the link in WhatsApp, has no Resbite, gets the app, and the app opens on the invitation. They tick "I'm 18 or over", continue with Apple, Google or their email, and are on the event, answering, inside a minute. No tester roster stands in their way: the link is their invitation to the beta (GI-D1). Stephen's reason, from the boards: "Being invited is the best moment to turn a guest into a user, so registering is part of replying."

Success: Stephen shares his film-night link; a friend without the app installs it, taps the link again, creates an account with Apple, sees who's going, taps Going and sees the exact address, and Stephen gets "<name> is going." A friend who already has Resbite lands straight on the invitation. Nobody is asked for a password, a date of birth, a phone number or interests.

## Scope

**In GI2:**
- the link grants beta access: a new access record created when a guest joins through a live link, honoured everywhere the roster is honoured today (reading, notifications, deletion);
- the guest's account screen in the app ("Create your account to reply") with the 18+ tick, Continue with Apple, Continue with Google, Continue with email (a six-digit code, no password) and "I already have an account";
- Sign in with Apple, native, also offered on the existing sign-in screen (Apple guideline 4.8, since Google is offered);
- the name rule: taken from Apple or Google when given, else asked once; guests skip "About you";
- the join itself, then the existing event page for the reply (Going / Maybe / Can't go) and the exact address after it;
- the 18+ and terms attestation, stored with its time and terms version;
- account deletion for link-made accounts (the roster is no longer required; Apple accounts re-authenticate with Apple);
- a count of link opens in the app, with no personal data, so the drop-off from page to account to reply can be read from the database;
- copy updates where the app still says "tester account" or "approved testers";
- SQL tests, rollback, rehearsal; app unit and browser tests; captures.

**Not in GI2:**
- deferred deep links through a service (Branch and the like): "tap the link again" is the fallback, as GI1 decided; the count of opens shows how often it is needed;
- capacity, "spaces left", the full state, host approval (GI3);
- the group chat, replying on a computer, change notifications (B1), the notifications ask card and "Open the group chat" from screen 07;
- stronger age checks (the tick is self-declaration, as the FU brief says; "for later");
- "Plan your own?" after replying; the first-use flow for new planners (FU) beyond what GI2 reuses;
- Apple token revocation on deletion (see Deletion; recorded as a follow-up).

## Decisions

| # | Decision | Whose |
|---|---|---|
| GI2-D1 | **One access source next to the roster.** `private.beta_access` holds link-made grants; `eligible()` accepts a roster row or a live grant. Nothing else in the app's reading, notification or deletion rules changes shape. | my call (GI-D1 names the outcome, not the mechanism) |
| GI2-D2 | **The guest's account is created by Supabase Auth, then one database call joins them**: `join_by_link(code, name, terms_version)` records the attestation, grants access, creates the profile and the attendance, and notifies the host, in one transaction. No grant without a successful join through a live link. | my call |
| GI2-D3 | **The tick comes first, and the buttons stay disabled until it is ticked**, exactly as Stephen requested on 19 October ("I'm 18 or over" / "I agree to the Terms and Privacy Policy."). The tick is sent with the join call, so an account that exists without an attestation (the app closed in between) is asked again next time and gets nothing until then. | agreed (Stephen) + my call on storage |
| GI2-D4 | **Email means a six-digit code, no password**, as the FU brief says, for guests. Existing password accounts keep signing in on the sign-in screen. A code sent to an address that already has an account signs into that account (one identity per person). | FU brief, agreed 12 Oct; my call to apply it to guests now |
| GI2-D5 | **Google stays on the guest screen** because the browser flow already exists; Apple is the new native path. Both appear on the guest screen and the sign-in screen. | my call |
| GI2-D6 | **The reply keeps Maybe.** The boards draw Going and Can't go only; the app shipped Maybe in UX2 and the owner has not retired it. Screen 06 is the existing event page. | my call, flagged |
| GI2-D7 | **Screen 07 is the existing event page after a reply**: the exact address, Add to calendar and reminders (UX3). The notifications ask card and the chat link wait for B1 and the chat. | my call |
| GI2-D8 | **Guests skip "About you"** and the interest questions; the name is the only thing asked, and only when Apple or Google do not supply one. | agreed (Stephen) |
| GI2-D9 | **Link opens are counted, nothing more.** A row per open with the link id and a timestamp, written by an anonymous call; no device id, no address. The privacy sheet says so. Page views come from Vercel's logs. | my call, flagged ("Measure each step… Analytics only with consent" on the boards) |
| GI2-D10 | **Deletion works for link-made accounts and is on in this build**; Apple accounts prove it is them by signing in with Apple again rather than by an emailed code (Apple's relay address may not deliver it). The raw deletion RPC is retired in the same migration. | my call on mechanism; **the owner decides whether deletion is switched on** |

## Approach

- **One hosted-compatible migration**, built in reviewed slices with SQL tests in full and hosted-baseline modes, a rehearsal and a rollback, as GI1 was. It redefines the roster-joined functions (`eligible`, `notification_recipient_eligible`, the two deletion functions) to accept a grant, and adds the join, the attestation, the grant and the counter.
- **Native Apple sign-in** with `expo-apple-authentication` and Supabase's `signInWithIdToken`, nonce from `expo-crypto`. No Apple secret key to rotate on the native path. The Apple provider is enabled in the Supabase dashboard with the bundle id as the client id (owner).
- **The app keeps its kit, wording and accessibility rules** (UX1/UX4): one short heading, chips and buttons from the kit, explanations behind ⓘ, 44 pt targets, Larger Text, VoiceOver, Reduce Motion, no Reanimated layout animations, curly apostrophes.
- **Old paths keep working.** Roster testers, password sign-in, the per-person `/invite#token=` links and `claim_plan_link` stay. Build 9 (GI1) keeps working against the GI2 database: it never calls the new functions, and the redefined ones keep their signatures.
- **Release coupling.** Sign in with Apple is a native capability, so GI2 ships as a new TestFlight build (10) with the migration. The migration can go first: without the build nothing calls the new functions.

## Design

### 1. Data and rules (the migration)

**`private.beta_access`:** `user_id uuid primary key references auth.users on delete cascade`, `source text not null check (source in ('link'))`, `plan_link_id uuid references private.plan_links on delete set null`, `granted_at timestamptz not null default now()`, `revoked_at timestamptz`. RLS on, no client grants. A revoked grant counts as absent for `eligible()`, and `join_by_link` refuses a user whose grant is revoked (`42501` "Invitation unavailable"): revoking is the owner's ban for abuse, done by SQL, and no link lifts it. Turning a link off and `remove_guest` do not touch grants (a removed guest is a user, not banned; GI1). Deleting the account removes the row with the user.

**`private.age_attestations`:** `user_id uuid primary key references auth.users on delete cascade`, `confirmed_at timestamptz not null default now()`, `terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}$')`, `method text not null default 'tick' check (method in ('tick'))`. Written once; a later tick never overwrites the first. RLS on, no client grants.

The app sends `TERMS_VERSION = "2026-10"` (a constant in `src/domain/guestAccount.ts`, bumped when the Terms change; the stored version says which text the person agreed to).

**`private.link_opens`:** `id bigint generated always as identity primary key`, `plan_link_id uuid not null references private.plan_links on delete cascade`, `opened_at timestamptz not null default now()`. Nothing else: no user, device or address.

**`private.eligible()`** becomes: a signed-in, non-anonymous, confirmed, not-banned user who is not deleting (as today) **and** (an enabled roster row for their email **or** a `beta_access` row with `revoked_at is null`). `require_tester()` is unchanged in shape. Every function that joined `tester_roster` directly (`notification_recipient_eligible`, `request_account_deletion`, `prepare_deletion_intent`, and the deletion cleanup that deletes the roster row) is redefined to use the same rule: "roster or live grant". The cleanup keeps deleting the roster row; the grant goes with the auth user, so a deleted-then-recreated account must join through a link again.

**`private.join_by_link(p_code text, p_name text, p_terms_version text) returns uuid`** (definer, `set search_path=''`; public invoker wrapper; `authenticated` only):
1. `auth.uid()` must be a non-anonymous user with `email_confirmed_at` set (Apple and Google users are confirmed; the email-code user is confirmed by the code), not banned, not deleting; else `42501` "Sign-in required".
2. Advisory lock on the user (as `require_tester` does).
3. If `eligible()` already: return `private.claim_plan_link(p_code)` (keeps GI1's rules: the organizer and existing attendees get the plan back from any link; others need a live link and an open event). `p_name` and `p_terms_version` are ignored.
4. Otherwise the link must be live and the event open: code well-formed, `revoked_at is null`, plan `active`, `starts_at > now()`; else `42501` "Invitation unavailable". A dead link grants nothing.
5. The name: `btrim(p_name)` 1–80 characters unless a profile already exists; else `22023` "Name required".
6. The attestation: if none exists, `p_terms_version` must match the pattern, and a row is inserted; else `22023` "Age confirmation required". An existing row is kept as is.
7. Insert the grant (`source 'link'`, the link id); upsert the profile (`display_name` only when the row is new); insert the attendee as `pending` if absent; queue the `invitation` outbox notice to the host with the GI1 dedupe key.
8. Return the plan id.

**`public.note_link_open(p_code text) returns void`** (definer, callable by `anon` and `authenticated`): a well-formed code with a live link inserts one `link_opens` row; anything else does nothing and returns normally (no information leaks). Inside the database it throttles itself: when the link already has 60 or more opens in the last minute, the call does nothing. Supabase's gateway cannot limit one RPC path, so this is the only limit; `join_by_link` is `authenticated`-only and serialised per user by its lock, which is enough for the beta (my call).

**`public.account_access_status()`** gains nothing: `approved` already follows `eligible()`. The app learns it is approved by re-reading the status after the join.

**Retiring the raw deletion RPC.** The service-role grant on the legacy `request_account_deletion` wrapper goes; `supabase/tests/security-review.sql` asserts the new state. The gateway Edge Function keeps its ledger path.

**Rollback** restores every redefined function to its GI1 body verbatim, drops the three tables and the two new functions, and leaves the auth users and profiles in place; link-made accounts lose access until re-applied (the roster is unchanged).

### 2. Sign in with Apple

- `expo-apple-authentication ~57.0.2`; `app.json` → `ios.usesAppleSignIn: true` and the plugin entry; the `ios/` folder's entitlements updated in the same commit (the folder is committed).
- `signInWithApple()` in `useAuthFlow`: raw nonce from `expo-crypto` `randomUUID()`, hashed with SHA-256 for the Apple request (`AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce: hashed })`), then `supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce: raw })`. A missing identity token is an error with the kit's connection copy. A cancelled sheet is not an error: back to the screen, nothing stored.
- Apple sends the name only on the first authorisation. When `credential.fullName` has a given or family name, the app joins with it (joined by a space, "stored exactly as typed", FU brief) and also saves it to user metadata `display_name`. When no name arrives and no profile exists, the Name step appears (section 4).
- Apple's private relay email is an ordinary confirmed email to Supabase; nothing in the app shows or depends on it except deletion (section 6).
- The sign-in screen (`app/auth/index.tsx`) gets "Continue with Apple" above "Continue with Google" on iOS, using the same function; the account lands at `/account` as Google does.
- Owner-side: Supabase dashboard → Authentication → Providers → Apple: enabled, Client IDs `com.resbite.app` (native only; no Services ID or secret key needed for the native flow). The App ID capability "Sign in with Apple" is added by EAS at build time from `usesAppleSignIn`.

### 3. Email by code

- "Continue with email" → the Email step (FU 07): heading "What's your email?", one field "Email", a primary "Send code". Calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`. The Code step (FU 08): heading "Check your email", "We sent a 6-digit code to <email>.", six digit boxes that check themselves on the sixth digit (no Continue button; one text field with six visible cells, so VoiceOver and paste work), the line "Didn't get it? Send a new code in 0:30" counting down and becoming the link "Send a new code", and the link "Open email app". `verifyOtp({ email, token, type: "email" })` signs in with a confirmed email. Codes last 10 minutes (the OTP expiry is 600 s on the hosted project; owner-side); a wrong code shows "That code doesn't match. Try again." and clears the boxes; an expired code shows "That code has expired. Send a new one." (my wording; the boards draw none).
- Two hosted email templates must carry the code. A new or unconfirmed address gets the **Confirm sign up** template from `signInWithOtp`, an existing confirmed one the **Magic Link** template. So `supabase/templates/confirmation.html` gains the six-digit `{{ .Token }}` next to its link (password sign-ups then see a code too, harmlessly), and `email-code.html` stays the Magic Link template (`qa/auth-readiness.md` item 5). The owner pastes both into the dashboard at rollout.
- The hosted SMTP minimum interval between emails to one address is 60 s, so the resend line counts down from 1:00, not 0:30, unless the owner lowers that setting (my call: 1:00).
- An email that already has a password account receives the code and signs into that account; the app then follows the signed-in path (section 4, step C).

### 4. The app flow

**A. Opening a link, signed out.** `/invite?code=` already receives every `/r/<code>` link. Signed out, the screen is screen 05:
- The context card from `invitation_page(code)`, called with the publishable key and no session (the function is anon-callable): "<Host> invited you", the title, the start ("Fri 23 Oct, 7.30pm" in the event's zone). While loading, the card shows the kit's placeholder. The app also calls `note_link_open(code)` once per screen visit.
- If the page says `cancelled`, `happened` or `inactive`, the screen shows that state's sentence from GI1 ("<Host> cancelled this resbite.", "This resbite has already happened.", "This invitation is no longer active.") with "Go to Resbite" (the normal start) and no account creation.
- Otherwise: heading "Create your account to reply"; body "Just your name for now. You can set up the rest later."; the tick row "I'm 18 or over" with the sub-label "I agree to the Terms and Privacy Policy." where Terms and Privacy Policy open the URLs in `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` (plain words when unset); below the tick, a helper "Resbite is for people aged 18 and over." (FU 09); then "Continue with Apple" (primary, iOS only), "Continue with Google", "Continue with email", and the text link "I already have an account". The three buttons are disabled until the tick is on (VoiceOver reads "dimmed"; the helper line explains).
- The code is kept on the device as GI1 does (`pendingInviteStore`), together with the tick (`agreedTerms: version`) so the join after sign-in carries it.
- "I already have an account" opens the sign-in screen; after signing in, the kept code brings the person back here (step C).

**B. After the provider.** The screen stays on `/invite`. With a session but not approved:
- If a name is known (Apple's `fullName`, or metadata `display_name` / `full_name` / `name`), the app calls `join_by_link(code, name, TERMS_VERSION)` straight away, with a spinner "Joining…".
- Otherwise the Name step: heading "What's your name?", field "Your name" with helper "This is how the people you invite will see you." (FU 09), "Continue" → the join.
- On `22023` "Age confirmation required" (the kept tick was lost): the tick row shows again with the buttons replaced by one "Continue". On `42501` "Invitation unavailable": the inactive state, the kept code cleared, as GI1 does. On a connection error: "Check your connection" with Retry, the code kept.
- After the join the app refreshes the account status (now `approved`), marks the setup as reviewed for this account so "About you" is skipped (`registration_details_version` is written as 1 with empty details by the existing `save_registration_details` call), and replaces the route with `/event?plan=<id>`: the existing event page as a pending guest (area, "Exact address after you reply", names after the reply as UX2/UX3 define).

**C. Already approved, or a roster tester.** Unchanged from GI1: a session that is approved claims through `join_by_link` (which delegates to `claim_plan_link`) and lands on the event. The `/account` screen's "not yet approved" state is no longer reachable for a person holding a live code: `/account` sends a signed-in, unapproved person with a kept code to `/invite` instead of showing the tester copy.

**D. Copy that changes.** The signed-out invite copy "Sign in with your tester account…" goes. `data-privacy.tsx`: "With an eligible account" → "With an account", the invitation line describes the event link ("Anyone with an event's link can join it while the link is on"), and "access is limited to approved testers" → "access comes with an invitation link or a tester invitation". `account.tsx` access-pending copy mentions the link: "If someone invited you to a resbite, open their link again."

**E. Route guards.** `/invite` stays unguarded; the Name step and the Email/Code steps are parts of `/invite` (local state), not routes, so a cold start with a kept code lands on `/invite` and resumes. Signing out clears the kept code and the kept tick as today.

### 5. Screens and copy (exact)

| Screen | Heading | Body / controls |
|---|---|---|
| Invite, signed out (05) | Create your account to reply | Context card; "Just your name for now. You can set up the rest later."; tick "I'm 18 or over" + "I agree to the Terms and Privacy Policy." + helper "Resbite is for people aged 18 and over."; Continue with Apple / Continue with Google / Continue with email; "I already have an account" |
| Email step (FU 07) | What's your email? | Field "Email"; "Send code" |
| Code step (FU 08) | Check your email | "We sent a 6-digit code to <email>."; six digit boxes; "Didn't get it? Send a new code in 0:30" → "Send a new code"; "Open email app"; errors "That code doesn't match. Try again." / "That code has expired. Send a new one." |
| Name step | What's your name? | Field "Your name"; helper "This is how the people you invite will see you."; "Continue" |
| Joining | (spinner) | "Joining…" |
| Dead link | — | GI1's state sentence; "Go to Resbite" |
| Sign-in screen | (unchanged) | "Continue with Apple" added above "Continue with Google" on iOS |

The event page, the reply and the after-reply state are UX2/UX3 as shipped.

### 6. Deletion

- `request_account_deletion` and `prepare_deletion_intent` accept "roster or grant". The cleanup revokes the grant and removes the roster row if any (as today).
- Re-authentication: password accounts enter the password (as today); Google accounts use the emailed code (as today); **Apple accounts sign in with Apple again** (the same `signInWithApple()`; `signInWithIdToken` refreshes the session, so the "fresh session under 5 minutes" rule passes). The Edge function's `freshIdentity` check accepts only `password` and `otp` today; it gains a third case, a fresh `oauth` entry **only when the user's identities include `apple` and none is `email`**, so Google accounts keep the emailed code and nothing else widens (my call). The deletion screen picks the method from the user's `providers`.
- The legacy raw RPC is retired (section 1).
- Apple token revocation on deletion is **not** in GI2: the native flow does not hand the app a refresh token, and revocation needs a signed client secret. Recorded as a follow-up before App Store release; TestFlight review does not block on it.
- Whether `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` is set for build 10 is the owner's decision (the status doc's rule: deletion before any wider beta; link guests are that wider beta).

### 7. Measurement

- `link_opens` rows (anonymous, timestamped) per link; `attendees` rows with `created_at`/`updated_at` give joins and replies; `beta_access.granted_at` gives accounts made from links. Opens are counted on every visit to `/invite?code=` with that code, signed in or not, once per visit. A read-only query in `qa/gi2-<date>/README.md` reports, per event: opens, accounts made, joins and replies, as counts (opens carry no person, so no per-person timing). Vercel's request logs give page views.
- The privacy sheet gains one line under "Account & shared plans": "Resbite counts how many times an event's link is opened in the app. It does not record who opened it."

### 8. Notifications

- The host's `invitation` notice on a join and the `rsvp` notice on a reply already exist; `notification_recipient_eligible` now also delivers to grant holders, so a link-made guest gets `plan_changed`, `plan_cancelled` and `guest_note` notices once they allow notifications (the existing push registration). Sending remains switched off in hosted until the owner enables it (UX2 rule).

## What's left to the builder

- Exact layout of the invite screen within the kit (StepScreen with a pinned footer, as the Where step), the tick row's component (a 24 pt box with a 44 pt target), and the disabled state's styling and VoiceOver hint.
- The Apple button: the kit's primary button labelled "Continue with Apple" with the Apple mark, or Apple's own `AppleAuthenticationButton`; either is acceptable to Apple's guidelines when the label is one of Apple's. The builder picks and records it.
- How the kept tick is stored (a second SecureStore key next to the kept code, or one JSON value).
- Test design for the SQL rules (a grant only from a live link; a revoked grant is absent; the roster still works; the attestation is written once; `note_link_open` never errors), for the app's state machine (every path in section 4 with stubbed Supabase, including a cancelled Apple sheet and a wrong code), and the browser scripts (`verify-links` grows the guest path; `verify-auth` the Apple chip; `verify-deletion` the Apple re-auth).
- The migration's slice order and the rehearsal's before/after checks.

## Rollout (owner and controller)

1. **Owner, before the build:** enable the Apple provider in Supabase (client id `com.resbite.app`); confirm the Magic Link template contains `{{ .Token }}` and the OTP expiry is 600 s; set `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` in the EAS production environment once the documents exist; decide `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED`.
2. **Migration** after the owner's approval by file name and sha256, with the before/after snapshots and advisors as GI1.
3. **Build 10** in Terminal.app (EAS adds the Sign in with Apple capability), submit, then the iPhone check: the guest path with a second Apple ID or a friend's phone (Apple, email code, Google), "I already have an account", a dead link, deletion of a link-made Apple account, VoiceOver and Larger Text on the invite screen.
4. **Firewall:** a per-address rate limit on `/rest/v1/rpc/note_link_open` and `/rest/v1/rpc/join_by_link` (Supabase's API gateway settings), next to the page's `/r/*` limit.

## For the owner to review (the calls I made)

1. Maybe stays on the reply (GI2-D6). The boards show Going and Can't go only.
2. Google stays on the guest screen (GI2-D5).
3. Email means a six-digit code for guests, no password (GI2-D4); the Confirm sign up email gains the code; the resend countdown is 1:00.
4. Link opens are counted anonymously without a consent step (GI2-D9), throttled in the database; no gateway rate limit exists for one RPC.
5. Apple token revocation on deletion is deferred (section 6); Apple accounts re-authenticate with Apple, and the Edge check accepts that for Apple-only accounts.
6. A revoked grant is a ban: the owner revokes by SQL, and no link lifts it. Turning a link off or removing a guest never revokes.
7. **Needed from you:** the Terms and Privacy Policy documents and their URLs; until then the tick's sub-label shows plain words. The tick's wording is Stephen's and is kept exactly.
8. **Needed from you:** whether deletion is switched on for build 10.
9. **Needed from you, and it shapes the rollout:** how a friend without Resbite gets the build. Today's testers are on the developer team, so there is no Beta App Review. A friend outside it needs a public TestFlight link (external testing), which brings Beta App Review: a way for the reviewer past the gate (a roster demo account or a standing demo link), a privacy policy URL, and working in-app deletion. In that case items 7 and 8 stop being options and become gates, and `APP_STORE_URL` on the page is the public link.
