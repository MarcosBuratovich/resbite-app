# GI1: one link per event and the web event page

**Date:** 21 October 2026. **Status:** approved in conversation by the owner; written spec for review.
**Source:** Figma "GI · Guest invitation flow V1.1" (node 473-3213), "Invitations research: pattern map (Oct 2026)" (473-2553) and "Refer-a-friend UK Regulations" (473-2549), decisions agreed with Stephen on 12 October 2026. **Builds on:** UX3 (`docs/superpowers/specs/2026-10-15-ux3-design.md`), live on 16 October 2026.

## Intent

A host shares one link for a resbite anywhere (WhatsApp, SMS, email). Anyone who opens it sees who invited them, what, when, roughly where and how many are going, and one button: RSVP. The link opens the app when it is installed; otherwise the page sends people to get it. The host turns the link off and gets a new one whenever they want.

Stephen's reason, from the research board: "Resbite is a social network and needs people on the app. Being invited is the best moment to turn a guest into a user, so registering is part of replying." GI1 builds the link and the page. GI2 builds the guest's account and reply in the app. GI3 builds capacity and host approval.

Success: Stephen shares one link in his film-club group; everyone sees the preview and the page; friends who have the app land on the invitation; cancelling, turning the link off and removing a guest all behave as the page and the app say.

## Owner decisions (21 October 2026)

| # | Decision |
|---|---|
| GI-D1 | **The invite link grants access.** An account created from a valid link is approved for the beta automatically; the tester roster stays for everyone else. Built in GI2; GI1 keeps today's roster gate. |
| GI-D2 | **The page and the preview show the basics, as designed:** host's name, title, time, area, count and image. The exact place, Meeting details, the Note to guests and guests' names stay behind an account and a reply. This reverses UX3-D2's generic preview, deliberately. |
| GI-D3 | **Three parts:** GI1 (this spec), GI2 (guest account and reply), GI3 (capacity and host approval). Not now: the group chat, replying on a computer, change notifications (B1), inviting from contacts. |
| GI-D4 | **The Invitations screen is replaced** by the event's link: Share, Copy link, Turn off this link. Per-person links go. Removing a guest moves to the guest list. |
| GI-D5 | **An optional "Area" field** on the Where step, shown before people reply; the existing place is the exact one, shown after. |
| GI-D6 | **The image is the cover photo, else the activity illustration, else the Resbite mark.** The cover photo becomes visible to anyone with the link. Video is out. |
| GI-D7 | **The page is rendered by a server function on the existing Vercel project** (`link.resbite.com`), reading one public database function. Not an Edge Function; not a static page with a browser-side fetch (the preview needs server-rendered tags). |

Design proposals the owner accepted with the sections: the count shows Going only ("6 going"), or "Be one of the first" when nobody has replied; the "why join" box promises only what the app does today; no analytics in GI1.

## Scope

**In GI1:**
- one link per event, made and kept by the database, with Turn off (which makes a new one);
- the web page at `link.resbite.com/r/<code>` with four states, the preview, and the "Join Resbite to reply" sheet;
- the Area field;
- the organizer's link screen, Remove on the guest list;
- the app opening `/r/<code>` links and joining the event (signed-in, approved testers);
- SQL tests, rollback, rehearsal; page tests; app unit and browser tests; captures.

**Not in GI1:**
- the guest's account creation from an invitation, the 18+ tick, Sign in with Apple, the link granting access (GI2);
- "spaces left", the full state, host approval (GI3);
- deferred deep links through a service; "tap the link again" is the fallback (GI2 measures whether people get lost);
- analytics; the group chat; the computer path; change notifications; capacity.

## Approach

- **One hosted-compatible migration**, built in reviewed slices with SQL tests in full and hosted-baseline modes, a rehearsal and a rollback, as UX3 was.
- **The page is a Node function** in `links/` deployed with the existing `resbite-link` Vercel project. It calls the database with the publishable key, so it can read nothing beyond `invitation_page`. One Supabase secret key lives only on Vercel, used only to sign short-lived cover URLs.
- **The app keeps its kit, wording and accessibility rules** (UX1/UX4): one short heading, icon-first chips, explanations behind ⓘ, 44 pt targets, Larger Text, VoiceOver, Reduce Motion, no Reanimated layout animations, curly apostrophes.
- **Old links keep working.** `claim_invite` and the `/invite#token=` page stay until the events they belong to pass.
- **Release coupling.** Build 8 can't open `/r/` links, so the migration ships with a new TestFlight build. GI1 starts from `main` after `ux3` is accepted and merged.

## Design

### 1. Data and rules (the migration)

**`private.plan_links`:** `id`, `plan_id` → plans (cascade), `code text unique` (16 random bytes, base64url, 22 characters, made by the database), `created_at`, `revoked_at`. At most one row per plan with `revoked_at is null` (partial unique index). No client access; only the functions below.

**Owner-only functions** (`private` security definer with `set search_path=''`, `public` invoker wrappers, revoke-then-grant to `authenticated`; the owner of an active plan that has not started, else `42501`):
- `plan_link(p_plan) returns text`: the active code, created on first call.
- `rotate_plan_link(p_plan) returns text`: revokes the active link and returns a new code.
- `remove_guest(p_plan, p_user) returns void`: deletes the attendee row (the organizer cannot remove themself; a user who is not on the plan is a no-op). Reminders on that guest's phone disappear on their next sync, as with Can't go.

**`plans.area text not null default ''`**, at most 80 characters, trimmed. `create_plan_v3` / `change_plan_v3` gain `p_area text default null` as a new last argument: `null` (the argument not sent, as by builds up to 8) leaves the stored area unchanged, `''` clears it, text sets it. v2 never sends it. The redaction trigger blanks it on account deletion.

**`public.invitation_page(p_code text) returns jsonb`**, callable by `anon` and `authenticated`, security definer, `stable`. It returns exactly:

```
{ state: 'open' | 'cancelled' | 'happened' | 'inactive',
  host: text, title: text, starts_at, ends_at, time_zone, area: text,
  going: integer, image: { kind: 'cover' | 'activity' | 'mark', ref: text } }
```

- `inactive` for an unknown code, a revoked link, or a plan that no longer exists. The function does the same lookup work for unknown and known codes and returns `{state:'inactive'}` with no other keys.
- `cancelled` for `status='cancelled'`; `happened` once `starts_at <= now()`; else `open`. Cancelled and happened return the host and title only (the page needs the host's name for its sentence).
- `host` is the organizer's `display_name`. `going` counts attendees with `response='accepted'`.
- `image.ref` is the cover path, the activity id, or empty. Never the place, Meeting details, the note, the description or guests' names.

**`public.claim_plan_link(p_code text) returns uuid`**: for a signed-in tester (`require_tester`), joins the plan as `pending` (idempotent for the same user), queues the existing `invitation` notice to the organizer, and refuses with `42501` an inactive link, a cancelled or started plan, and with `22023` the organizer claiming their own. Mirrors `claim_invite`.

**Rollback** drops the table, the column (restoring the v3 signatures without `p_area`), the functions and grants, and restores the redaction trigger body. The rehearsal snapshots and compares them as UX3's did.

### 2. The web page and the preview

**Address:** `https://link.resbite.com/r/<code>`. The Vercel project gains a function for `/r/:code` and `/r/:code/image`; `/invite` and the Apple link file stay as they are, and the Apple link file now covers `/r/*` too.

**The open page**, top to bottom (wireframe 02): "Stephen invited you" with a small avatar placeholder; the image; the title (one heading); the date and time in the event's time zone, in the app's own format ("Fri 23 Oct, 19:30 – 22:00"; no end: "19:30"); the area, or nothing, and the line "Exact address after you reply"; "6 going" or "Be one of the first"; the box "With a free Resbite account you can · See who's going · Add it to your calendar · Reminders before it starts" and "Free. No ads. No public profile."; a pinned **RSVP** button.

**RSVP** opens a sheet (wireframe 03): "Join Resbite to reply", "Stephen will see your answer.", the event summary (image, title, date), "Free. No ads. No public profile.", **Get the app** (the App Store page; the TestFlight invitation link until the app is public) and **I have Resbite: open the app** (`resbite://r/<code>`). If the app doesn't open within a moment, the sheet says "If Resbite doesn't open, install it first."

**Other states:** cancelled: "Stephen cancelled this resbite."; happened: "This resbite has already happened." plus "Plan your own with Resbite" linking to the app; inactive: "This invitation is no longer active." Each keeps the one heading and the landmarks; none has an RSVP.

**Preview tags** (open state): `og:title` = the title; `og:description` = "Fri 23 Oct, 19:30 · Invited by Stephen"; `og:image` = `https://link.resbite.com/r/<code>/image`, which serves the cover (through a signed URL the function makes with the Vercel-only secret, valid for minutes), the activity illustration from `links/assets/activities/`, or the Resbite mark. Other states and unknown codes get today's generic "You’re invited to a resbite" tags and the mark. The description never contains the area or the place.

**Smart app banner:** `apple-itunes-app` with `app-argument` set to the page's own URL, so Safari offers to open the app on the invitation once the app is in the App Store.

**Protection:** `X-Robots-Tag: noindex` and the meta tag; `Cache-Control: no-store`; `Referrer-Policy: no-referrer`; the strict CSP (self only; the image route is same-origin); no cookies, analytics or third-party scripts; a per-address rate limit through Vercel's firewall; the function answers unknown codes in the same time as known ones. Readable contrast, 44 px targets, `lang`, no zoom blocking.

### 3. The app

**Organizer's link screen** (replaces `app/invitations.tsx`): heading "Invite people"; a card showing what guests will see (image, title, date, "Invited by <name>"); chips **Share** (the system sheet with "<Title>, <date>. RSVP: <link>"), **Copy link**, **Turn off this link** (confirmation: "People with the old link will see that it’s no longer active. You’ll get a new link." → Turn off / Keep); ⓘ "Invitation links": one link per resbite, anyone with it sees the basics, the exact place and Meeting details only after replying, turn it off to stop it. The link is read from `plan_link` on open and after rotating; never stored on the device. Entry points unchanged: after creating, "Invite someone" on the event page, People. The per-person rows, Prepare, Retry, Revoke, "Invite another", the local invitation journal and "Review invitations" on People go.

**Guest list:** the organizer's Guests sheet gets **Remove** per guest (confirmation: "Remove <name> from this resbite?"), calling `remove_guest`, then refreshing the list and the counts.

**Where step:** after "Meeting place", an optional field "Area, shown before people reply" with placeholder "Near Old Street", hint "Anyone with the link sees this. The exact place shows after they reply." Review shows "Area · <text>" when set. Drafts keep it.

**Links:** `parseInvitationLink` accepts `https://link.resbite.com/r/<code>` and `resbite://r/<code>` (22-character base64url code), next to today's token links. `+native-intent` routes them to `/invite?code=<code>`. The invite screen: signed in and approved → `claim_plan_link` then the event page; signed out → keep the code (the pending-invite store gains a `code` kind beside `token`) and run today's sign-in path; the GI2 screen replaces that path later. The code is cleared after a successful claim, as tokens are.

**Native config:** nothing new; `applinks:link.resbite.com` already covers the domain.

## Testing

- **SQL** (`supabase/tests/gi1.sql`, block prefixes `g1`–`g3`): one active link per plan; `plan_link` is stable across calls; `rotate` revokes and the old code reads `inactive`; `invitation_page` for open, cancelled, started, revoked and unknown codes, the Going count (accepted only), the image choice, and that its JSON never contains the place, Meeting details, the note, the description or names; `claim_plan_link` success, idempotence, inactive/cancelled/started/owner refusals and the organizer's notice; `remove_guest` owner-only, self no-op, reminders unaffected server-side; `area` saves through v3, is left alone by v2 and old-argument v3 calls, and is blanked by redaction. Full and hosted-baseline modes; the rehearsal and rollback files.
- **Page** (`links/page.test.mjs`): each state's HTML; the preview tags per state; no address, Meeting details or names anywhere in the output; headers; `noindex`; the image route's three branches; a run of the function locally against a fixture.
- **App:** unit tests for the parser (both new forms, rejects malformed codes), the organizer's link model and the Area field; browser scripts: `verify-invitations` rewritten for the link screen (share text, copy, turn off with confirmation and the new link), `verify-event` gains Remove on the guest list, `verify-steps`/`verify-planning` gain the Area field and `p_area`, a new check for opening `/r/<code>` signed in (claims, lands on the event) and signed out (kept, sign-in path); `review-ui` captures the new screens at 390 and 320 px and under Larger Text.

## Rollout and acceptance

Each live step waits for the owner's explicit approval; the finished branch waits for the iPhone check before merging.
1. `ux3` accepted on the iPhone and merged; GI1 branches from `main`.
2. Vercel: add the secret key as an environment variable on `resbite-link`, deploy the function, check `/r/<unknown>` (inactive, generic preview), headers and `noindex`.
3. Rehearse the migration, snapshot the live database, approve the file by name and sha256, apply, snapshot again, run the advisors.
4. Build and submit to TestFlight straight after.
5. **Owner's iPhone check:** make an event with an area and a cover; open Invite people; share the link in WhatsApp and see the preview (title, date, host, image); open the link on a phone without the app (the page, RSVP, the sheet) and with it (lands on the invitation); turn the link off (old link says inactive, new link works); remove a guest; cancel an event and open its link; Larger Text and VoiceOver on the link screen.
6. The coworker opens a real link from Messages. Adding testers stays a separate approval.

## Risks

- **A forwarded link reveals the basics** to anyone who gets it (title, date, host, area, count, image). Accepted (GI-D2); the exact place, Meeting details and names stay private, and the host can turn the link off.
- **The cover photo leaves the app.** Accepted (GI-D6). Hosts choose it; the page says nothing about it being private.
- **People without the app on a phone** hit the "Join Resbite to reply" sheet and, in GI1, still need to be on the tester roster to get in. GI2 removes that step.
- **Links opened inside WhatsApp's or Instagram's own browser** may not open the app; "I have Resbite: open the app" is the way out.
- **Old builds** cannot open `/r/` links until updated; they keep making per-person links.
- **The Vercel-only secret** can sign URLs for any storage object. Keep it to that project, rotate it if the project's membership changes, and never put it in the repo.
