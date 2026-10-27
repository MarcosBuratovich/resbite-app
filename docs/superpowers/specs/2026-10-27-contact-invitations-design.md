# Contact invitations and phone accounts

**Date:** 27 October 2026. **Status:** agreed with the owner in conversation on 27 October 2026. The builder check is done and its questions are answered (test mode, CI-D13) or parked ([Open](#open-to-decide-before-sms-goes-live)). Written design for the owner's approval.
**Builds on:** the `ux3` branch (UX3, GI1 and GI2), not on `main`. That branch is unmerged, but its migrations are live on the hosted project (`ux3_event_details`, `gi1_event_links`, `gi2_guest_accounts`). See `docs/implementation-status.md` on `ux3`.
**Mockups:** `mockups/2026-10-27-contact-invitations/invitee-web-journey.html` (direction A chosen for the last screen) and `host-side.html`. Both are HTML fragments drawn for the brainstorming browser, so their styling is approximate.

## Intent

A resbite should only ever contain people the host chose or approved. The GI1/GI2 open link let anyone who received it, including someone it was forwarded to, join and get beta access. The owner reverses that.

From now on the host invites people from their phone contacts, and every invitation is tied to that person's phone number:
- **Already on Resbite:** the invitation simply appears in their app.
- **Not on Resbite yet:** they get a personal link that only works once they prove, by code, that they own the invited number. They can answer on the web.
- **After answering on the web:** the page works hard to get them into the app. They sign up there with the same number and the event is already waiting.

The open event link survives, but whoever answers through it waits for the host's approval.

Phone numbers become everyone's identity on Resbite, which is also the base for the next project: groups and "circles of trust".

**Success:**
- Marcos invites four contacts to a picnic. The two already on Resbite see it in the app with a notification. The two who aren't get a WhatsApp message from Marcos himself.
- One of them confirms their number on the web, says Going, installs the app, signs in with that number and finds the picnic there.
- A forwarded personal link gets the forwarder nowhere.
- Someone who answers through the open link appears in Marcos's "Waiting for you" list until he approves them.

## Owner decisions (27 October 2026)

| # | Decision |
|---|---|
| CI-D1 | Nobody joins an event unless the host invited them personally or approved them. Forwarded links must not let anyone in. |
| CI-D2 | The host invites from their phone contacts. Each invitation is tied to the invitee's phone number. |
| CI-D3 | A contact who already has a Resbite account gets a direct in-app invitation: no link, no code. |
| CI-D4 | A contact without an account gets a personal link to `link.resbite.com`. There they confirm the invited number with a code before they can answer. |
| CI-D5 | After answering on the web they see the "get the app" screen, direction **A**: "You're going!", a list of what the app gives them, one "Get Resbite" button, "Sign up with +44 ••• 834 and this resbite will be waiting", and a small "Not now". |
| CI-D6 | In the app they create their account with the same phone number, and the event is already there. |
| CI-D7 | A verified phone number is required on **every** account, including existing email, Google and Apple accounts. |
| CI-D8 | Sign in with Apple and Google stay, as the quick way to fill in name and email during onboarding. The phone is required on top. |
| CI-D9 | The open event link stays. Everyone who answers through it waits for the host to approve or decline them. |
| CI-D10 | No paid SMS service yet. |
| CI-D11 | Push notifications are part of this work. |
| CI-D12 | Groups and circles of trust are the next project, designed separately on top of this one. |
| CI-D13 | **Test mode for now:** keep the whole flow, but every code step accepts **000000 for any number**, with no SMS sent, so the complete journey can be tested without paying for SMS. The owner chose "any number" over a list of registered test numbers after hearing the risk (see [Test mode](#test-mode)). |

### Proposals the owner accepted ("looks right, go with your proposals", "Perfect")

| # | Decision |
|---|---|
| CI-P1 | **Sending:** the host sends personal links from their own phone. WhatsApp or Messages opens with that person and their link filled in. Resbite never sends texts itself. One send per person is accepted, because each link is tied to one number. |
| CI-P2 | **Codes before paying:** the real path is Supabase's phone sign-in, with a provider connected later through Supabase's Send SMS hook. Until then, test mode (CI-D13) stands in for the code check. *Amended 27 October: the owner replaced "registered test numbers only" with test mode for any number.* |
| CI-P3 | **Contact lookup:** only the numbers the host actually picks are checked against accounts, at that moment. The address book is never uploaded. |
| CI-P4 | **What the web page shows:** who invited them, title, time, rough area, the going count, and "This invitation is for the number ending ••34". The exact address, meeting details and other guests' names stay in the app; direction A lists them as reasons to install. |
| CI-P5 | **Number check:** the invitee types their number, and a code is sent only when it matches the invited one. The page never reveals the full number. |
| CI-P6 | **After "Can't go":** a softer version of the screen ("Marcos will know" and a smaller nudge to get Resbite). |
| CI-P7 | **Web verification creates the account:** confirming the number on the web creates their Resbite account, tied to that phone, holding their first name and answer. In the app they sign in with the same number. The phone number carries them across, so "tap the link again" is no longer needed. |
| CI-P8 | **App sign-up order:** number and code first, then "Continue with Apple" or "Continue with Google" to fill name and email, or type the name. The 18+ and terms tick from GI2 stays on the first screen. |
| CI-P9 | **Existing accounts:** the next time they open the app, "Add your phone number" appears before anything else, once. |
| CI-P10 | **Email and password:** new accounts no longer use them. Existing password accounts keep signing in, but must add a phone (CI-P9). |
| CI-P11 | **Shorter sign-up:** birth date, city and interests leave sign-up and stay optional in Account details. |
| CI-P12 | **Linking providers:** Apple and Google attach to a phone account through Supabase identity linking. It must be enabled in the project and confirmed to work with native Apple sign-in. |
| CI-P13 | **Push in scope**, because the in-app invitation (CI-D3) and the "get the app" promises (CI-D5) depend on it. |

## Goals, non-goals, anti-goals

**Goals**
- The host flow in `host-side.html`:
  1. Pick contacts, with "On Resbite" badges.
  2. "Invite N".
  3. "Almost there", sending the rest by WhatsApp or Messages.
  4. The guest area with "Waiting for you" and the event link card.
- The invitee web flow in `invitee-web-journey.html`: invitation → confirm it's you → answer → get the app (A).
- Phone-first sign-up and sign-in, the "Add your phone number" gate for existing accounts, and Apple or Google to fill name and email.
- An in-app invitation for existing users at the top of My resbites, answerable on the card.
- Host approval for open-link answers.
- Push notifications switched on for the events listed under [Notifications](#notifications).

**Non-goals (this project)**
- Groups and circles of trust (CI-D12). The device-only People & groups lists are left as they are.
- A paid SMS provider (CI-D10).
- Android.
- Capacity, "spaces left" and the full state (GI3's other half).
- Chat.
- Inviting by email.
- Sending one message to many people.
- Deferred deep-link services.
- Changing an answer from a computer beyond the web page described here.
- An optional WhatsApp nudge to contacts already on Resbite.

**Anti-goals: failures even if everything technically works**
- Once test mode is off, a forwarded personal link or a guessed code lets someone else in, or see more than the web page shows. While test mode is on, a forwarded link still requires typing the full invited number.
- The web page, the share text or a notification reveals someone's phone number, or the exact place, to someone not yet entitled to it.
- Resbite texts or messages people on its own initiative.
- The host's address book, or any number they didn't pick, leaves the phone.
- One person ends up with two Resbite accounts, one from the web and one from the app.
- The "get the app" screen promises something the app can't deliver.
- "Not now" disappears. Capture by persuasion, not by trapping.

## The flows

### 1. The host invites (mockup `host-side.html`, screens 1–2)

1. **Entry points:** "Invite people" after "It's on!", and Invite on the event page. Both replace GI1's link-only screen.
2. **Picking:** the contact picker reuses the existing contacts permission handling (limited access, paging, Settings return) from `people.tsx` and `src/services/contacts.ts`, with search and a selected-chips strip.
   - Each contact shows one number. A contact with several numbers asks which one.
   - Numbers are normalized to international format. A number without a country code takes the host's own country, from the host's verified number.
   - A number that can't be parsed can't be picked, and the picker says why.
3. **Badges:** as numbers are picked, the app asks the server which of them belong to accounts that can be invited, and shows "On Resbite" on those. The ask is limited to the picked numbers, a small batch at a time, rate-limited, and available only to approved users.
   - **"On Resbite"** means an account that has signed into the app at least once. *My call, from the builder check.* An account that only answered on the web (CI-P7) still gets a personal link, because an in-app invitation would never reach it.
   - The same "has used the app" marker drives the account merge in flow 5, so it exists from the first phase.
4. **"Invite N":**
   - Contacts on Resbite become invitees straight away and get the in-app invitation.
   - Everyone else gets a personal invitation tied to their number.
   - Re-inviting the same number to the same event reuses that person's invitation and link.
5. **"Almost there":**
   - It confirms who was invited in the app.
   - It lists the rest, each with a WhatsApp button and a Messages button that open with the person's number and their personal link, plus the share text.
   - After the host comes back, that person shows "Sent on WhatsApp" or "Sent on Messages". Like today's "Shared", this records that the host opened the composer, not that the message was delivered.
   - WhatsApp opens through its link format with the number and text. Messages opens the native composer with the recipient filled in.
6. **Later:** the host can resend a personal link from the guest list, or remove an invitee. Removing someone kills their personal link. To fix a wrong number, the host removes the invite and invites again with the right number.

### 2. An invitee already on Resbite (screen 4)

- They're added to the event as not-yet-answered. The organizer view counts them as invited.
- An in-app invitation grants beta access to an account that was still waiting for it, just as a verified personal link does. *My call.*
- They get a push notification (see [Notifications](#notifications)).
- My resbites shows an **Invitations** section above Upcoming, with the event card and Going / Maybe / Can't go on the card. Answering uses the existing respond path. The card then moves to Upcoming, and the event page works as today.
- What they see before answering follows the current rules: area, not exact place; guest list after answering (UX2-D5, GI1 decision 10).

### 3. An invitee not on Resbite (mockup `invitee-web-journey.html`)

The page is `link.resbite.com/i/<code>`, a new path next to GI1's `/r/<code>`.

1. **Invitation:**
   - Shows the host's name, image, title, time range and area, and the going count ("Be one of the first" when there's none).
   - Shows "This invitation is for the number ending ••34" (last two digits only).
   - One "Answer" button, with "Not your number? Ask Marcos to check it."
   - The link preview in chats shows the same basics, never the place or the number.
2. **Confirm it's you:**
   - Requires the 18+ and terms tick first (GI2-D3 wording, sent with the result).
   - The person types their mobile number. If it doesn't match the invited number, they're told so and no code is sent.
   - If it matches, a 6-digit code goes to that number, then a resend countdown. A wrong code keeps them on the step.
3. **Your answer:**
   - A verified chip ("✓ Verified · ••34"), the event basics, and "Your first name" (required, 1–80 characters).
   - Going / Maybe / Can't go, "Send answer" and "Marcos will see your answer."
4. **Get the app (A):**
   - Shown after Going or Maybe. The list:
     - Hear when the time or place changes
     - See who else is going
     - Get the exact address and meeting details
     - Reminders before it starts
     - Add it to your calendar
   - One "Get Resbite" button pointing to the TestFlight invitation (`APP_STORE_URL`) until the app is public. Below it, "Sign up with +44 ••• 834 and this resbite will be waiting." and "Not now".
   - After Can't go, the softer variant (CI-P6).
5. **Coming back:** reopening the personal link after verifying, on the same browser, shows their answer and the get-the-app screen. They can change their answer there while the event is open. A different browser has to verify again.
6. **Refusals:** a cancelled, started or removed invitation shows an inactive page, as GI1's states do. It never confirms whether a number has an account.

### 4. Creating the account in the app

1. **First screen for a signed-out person:** the 18+ and terms tick, "Your mobile number", "Continue", then the code. The existing landing page and introduction slides may stay in front of it.
2. **"About you":**
   - "Continue with Apple" or "Continue with Google" fills name and email in one tap.
   - Or they type a name. Email is optional.
   - A name already given on the web is prefilled.
3. **Account tied to the number:** an invitee who verified on the web signs into the same account (CI-P7), so the event and their answer are already in My resbites.
4. **Access:** a person whose number has a personal invitation is approved for the beta when they verify it, on the web or in the app.
   - People who came through the open link are approved when the host approves them.
   - Anyone else waits on today's access-pending screen unless they're on the tester roster.
5. **Signing in later:** a code to their number, or Apple or Google once linked.

### 5. Existing accounts add a phone

- After sign-in, any account without a verified phone sees "Add your phone number": number, then code. It blocks the rest of the app until done, with Sign out as the only other exit.
- Today that's a handful of accounts: the owner, coworkers on TestFlight and GI2 guests, if any joined.
- **Collision:** if the number already belongs to an account created from a web invitation that was never used in the app, that account is folded into the one adding the phone. Its invitations, answers and attestation move over, and the empty account is removed. A number already in use by a real app account is refused, with a support line.
- Ship the gate before contact invitations go out, so existing users can be found by number.

### 6. The open event link, with approval (screen 3)

- GI1's `/r/<code>` page and link card stay, now on the event page: "Anyone can answer with it, and you approve them first." Share, Copy and Turn off work as in GI1.
- **Answering through the open link:**
  - Same web steps as a personal invitation, except any number can be confirmed (no "ending ••34" match).
  - They answer, then see "Marcos will confirm your spot" with the get-the-app screen.
  - In the app they appear as waiting until the host decides.
  - Resbite users opening the link in the app get the same waiting state.
- **The host:**
  - Sees "Waiting for you" on the event page, each entry with name, answer, "via event link", the last digits of the number, and Approve / Decline. They get a push for each new request.
  - Approve makes them a normal guest with their answer.
  - Decline removes them. They're told they weren't added, never why.
  - Turning the link off doesn't remove people already approved.
- **Waiting people:** they see only what the web page shows. They don't count in "going", and they can't see guests, the exact place or meeting details until approved.
- **Already joined:** people who joined through GI2's automatic grant before this ships keep their access and places.

## Notifications

Push is switched on in this project (CI-D11). The existing outbox, ledger and Expo sender (`supabase/functions/deliver-notifications`, `_shared/notification-*`) and the app's registration helpers (`src/services/pushRegistration.ts`) are the base. UX2-D4 governs wording: title, what happened and who, never the place, notes, descriptions or phone numbers.

Events:
- a new in-app invitation, to the invitee;
- an answer, to the host ("Sam is going.");
- a new approval request, to the host;
- approved, to the person who asked; declined is not pushed;
- a change of time or place, and cancellation, under the UX2 audience rules;
- a Note to guests (UX3-P6).

**Permission:**
- Asked once, after the person's first answer or first created event, behind a short card saying what they'll get.
- Denying never blocks the app.
- Notification settings shows the real state.
- Tapping a notification opens the event after an authorized refetch.

Needs:
- an APNs key on the owner's Apple developer account;
- the push entitlement in the next EAS build;
- the sender deployed and switched on, with the owner's approval of each hosted migration and function.

Today the GI2 local-only companion migration bundles the sender with the deletion lifecycle. It has to be split, so push can go live without the deletion work.

## Test mode

The owner's decision (CI-D13) is to keep the whole flow but accept 000000 for any number until an SMS provider is connected.

**How it works:**
- **One switch:** test mode is a single setting on the server, on for now. The app and the web pages ask the server which mode is active; neither decides it on its own. Switching it off, once a provider is connected, sends every code step down the real Supabase phone path, with no new app build.
- **Codes:**
  - No text is sent.
  - The code cells, countdown and resend look and behave as they will for real.
  - 000000 is accepted for any number; any other code fails as a wrong code.
  - This applies to every code step: the web "Confirm it's you", app sign-up and sign-in, and the "Add your phone number" step.
- **Rules still apply:**
  - A personal link still requires the invited number before the code step.
  - Rate limits, the 18+ tick and the one-account-per-number rule are unchanged.
- **Kept quiet:** no screen or page shows 000000 or says test mode is on, because the open-link page is public. Testers are told the code directly. *My call.*
- **No side effects:** test mode never adds, changes or resets another sign-in method of an account (for example, it must not set a password).
- **Logged:** every test-mode verification is recorded with its time, the account and the last digits of the number, so they can be reviewed and cleaned up later.
- **Real path built too:** the real path (Supabase phone sign-in with the Send SMS hook) is built at the same time. It's proven with at least one Supabase test number, so turning test mode off needs no new app build.

**Accepted risk (owner, 27 October 2026).** While test mode is on, anyone who knows an account's phone number can sign into that account with 000000 on the live project. That includes the owner's and the coworkers' accounts. What keeps it contained:
- the app is only on closed TestFlight;
- the repository is private;
- the code is never shown;
- the switch goes off when an SMS provider is connected.

**Mechanism:** Supabase's built-in test codes need each number listed in advance, so "any number" needs our own server step that checks 000000 and completes the sign-in or phone confirmation with admin rights. The builder chooses how, within the rules above.

## Open, to decide before SMS goes live

- **Web-only accounts:** accounts made on the web that never reach the app, including strangers the host declined on the open link. *Proposed:*
  - remove them automatically 30 days after their last event ends;
  - remove them straight away when declined and they have nothing else on Resbite.

  This runs on the account-deletion system, which is still switched off. Parked because test mode involves no real strangers. The schema should still carry the "has used the app" marker (flow 1) so this needs no migration of its own later.

## Constraints

- **Hosted changes:**
  - Every migration is applied only after the owner approves it by file name and sha256.
  - Each is tested first with `scripts/test-database.sh --hosted-baseline`, with a rehearsed rollback and before/after snapshots under `qa/`.
  - The hosted project is shared and live. Older TestFlight builds (8, and build 10 if it shipped) must keep working or fail safely between migration and new build, as GI1 and UX3 did.
- **SMS:** no paid SMS (CI-D10). Development and acceptance run in test mode (CI-D13). The phone provider is enabled through the Send SMS hook, so connecting a provider later is a configuration change plus switching test mode off, not a redesign. The builder confirms on the hosted project that phone sign-in can be enabled with the hook standing in for a provider.
- **Abuse limits:** per invitation and per number (Supabase's own OTP limits plus ours), because paid SMS will invite SMS-pumping abuse later.
- **Contact lookup:** only picked numbers, only approved callers, rate-limited. It reveals to the host which picked numbers are on Resbite; the Data & privacy text says so. Contact names never leave the phone; the invitee's name comes from the invitee.
- **Personal invitation secrets:** stored hashed, as today's `private.invitations` tokens are. The `/i/` code is unguessable, but possession of it alone grants nothing without the number check.
- **Account deletion:** must cover phone-only accounts (re-proof by SMS code) and the new records. Deletion is still gated; extend its design rather than enabling it here.
- **App build:** a new TestFlight build is needed (push entitlement, new screens).
- **Visual style:** the existing kit and the UX design principles (one short heading, chips, one primary action, ⓘ for explanations, Larger Text, VoiceOver, Reduce Motion).
- **Linux machine:** this work happens on the Linux box. Fix the Mac-only harness paths in `scripts/test-database.sh` and the case-sensitive path in `nativeImports.test.ts` first.

## What changes from GI1 and GI2

- **Kept:**
  - `/r/<code>` and its page, `plan_links`, Turn off, `link_opens`.
  - Sign in with Apple, Google sign-in, the 18+ tick, the beta-access grant table (now granted by a verified personal invitation or host approval).
- **Changed:**
  - `join_by_link` no longer admits on its own; it creates a waiting request.
  - The organizer's Invite people screen becomes the contact flow.
  - The guest screen at `/invite` and the email-code sign-up are replaced by phone sign-in.
- **Kept working:** old per-person `/invite#token=` links already shared, until they expire with their events.

## Left to the builder

- Table and function design: the phone-bound invitation, the approval request, the contact-lookup batch size and limits, and how the web session proves the verified number to the database.
- How the web pages run the phone check (the GI1 pages are server-rendered with a strict CSP) and which Supabase calls they make.
- The order of work and the TestFlight build count. A sensible order:
  1. phone accounts and the gate;
  2. contact invitations and the web flow;
  3. open-link approval;
  4. push.
- Copy not given here, for the owner's usual copy pass. Errors, recovery and protected wording keep their existing text.
- How the folding of a web-only account into an existing one (flow 5) is made safe and atomic.
- Tests at the usual levels: SQL (including forwarded-link, wrong-number and approval cases), app unit tests, browser scripts, captures at 390 and 320 px and with Larger Text, then the owner's iPhone check.
