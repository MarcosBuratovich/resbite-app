# Connections and circles of trust

**Date:** 10 November 2026. **Status:** approved by the owner on 10 November 2026 after the builder check and the mockup review.
**Builds on:** `main` at `8958fef` (everything through creating-a-resbite is live on the hosted project; the TestFlight build of that code is pending).
**Figma:** file `DTOeOkGCdYWf0e4vlD2j8y`. Background: **OM · Dev brief: Resbite object map V0.3** (page "Object map", node `473:2221`: Connection, Group, Participation), **IN · Dev brief: Inviting V0.1** (page "↳ IN · Inviting", `479:103`) and the sketch **IN · Inviting with connections: sketch V0.1** (`590:104`, screens IN-C1 to IN-C3), **DIR · How might we: Resbite V1.2** theme A "Connecting through Resbite" (`331:5905`). The sketch says "what a connection is and when it is created is still design work in the CO flow"; this document is that design, decided by the owner.
**Mockups (10 Nov):** app-look mockups checked by the owner in the browser: `docs/superpowers/specs/2026-11-10-connections-groups-chat-mockups/connections.html` (CO-01, CO-02, CO-03) and `circle-of-trust.html` (CO-04, CO-05, CO-07). Open them in a browser.
**Companion design:** `2026-11-10-groups-and-chat-design.md` (the chat, report and block). Build this one first; nothing here depends on the chat.

## Intent

Today a host invites phone contacts, or shares the open link and approves whoever answers through it. Someone who came to a resbite through a friend, or through the link, is not in the host's phone book, so inviting them again means asking for their number first. And a host cannot let a trusted guest bring a friend: every newcomer either needs a personal link from the host or waits in "Waiting for you".

Two things fix that, both decided by the owner on 10 November 2026:

- **A Resbite connection** is Resbite's own memory of "we have shared a resbite". It is made from the people list of a resbite the two people share, needs the other person's acceptance, lasts after the resbite ends, and lets each invite the other inside the app, with a push. There is no search, no browsing, no profile pages: a connection can only start where two people already met.
- **A circle of trust** is a setting on a resbite: the host says how many people each guest may bring and how far that trust travels. A guest brings a Resbite connection or a phone contact, exactly as a host invites today, and whoever they bring is in without the host's approval, because the host trusted the guest's judgement in advance. The host sees who brought whom and can remove anyone.

Stephen's framing stands behind both: "connections between people are the point of Resbite" (12 Oct 2026), and the Good Unicorn Code of Ethics' "closed circles of trust": a stranger never reaches a resbite without someone the host trusts vouching for them.

**Success**
- Pedro and Ana were both at Board game night. Pedro opens the people list, taps the dots on Ana, taps "Connect on Resbite". Ana gets "Pedro wants to connect", opens Connections and taps Accept. Next month Ana creates a picnic, opens Invite people, ticks Pedro under "Your connections" and taps Invite. Pedro gets the invitation push, with no phone numbers involved.
- Ana sets her Thursday board games to "Each person can bring 1, 2 levels". Pedro taps "Bring someone" and picks Clara from his phone contacts; WhatsApp opens with Clara's own link. Clara signs up, says Going and is on the list as "Clara · Brought by Pedro". Clara brings Martín the same way; Martín can bring nobody. Ana approved none of it and can remove any of them.
- A stranger with a forwarded open link still waits for Ana's approval, connection or not.

## Owner decisions (10 November 2026)

| # | Decision |
|---|---|
| CO-D1 | **Two kinds of people to invite:** phone contacts who have a Resbite account, as today, and **Resbite connections**, accounts you are linked to inside Resbite without needing their number in your phone. |
| CO-D2 | **A connection is earned, not searched.** There is no place to browse or look people up. You can only connect with someone who was invited to the same resbite as you, or who was at one you were at. |
| CO-D3 | **The other person has to accept.** Pedro's tap sends a request; until Ana accepts, nothing changes for either of them. |
| CO-D4 | **Circles of trust.** The host sets two numbers on a resbite: how many people each person may bring (invites) and how far trust travels (levels). With 1 invite and 1 level, each person the host invited may bring one person. With 2 levels, the person who was brought may bring one more. A guest at the last level can't bring anyone. |
| CO-D5 | **People brought inside the circle are in without approval.** "You give the trust to the people you invited." The host can still remove them. |
| CO-D6 | **The open link is the host's door: everyone who answers through it waits for approval, connections included.** This overrides the IN brief's "people the host is connected to join straight away" (IN brief, What to build 6, and lane C of the guest-approval flow), which followed Stephen's "connected people get the easiest path" of 12 October. The easiest path is the direct invitation inside the app, not a shortcut past the host. To raise with Stephen. |
| CO-D7 | **Real accounts only.** A guest brings a Resbite connection or a phone contact who then signs up. There is no unnamed "plus one" (a child without a phone, "Going +1"); that stays on the for-later list with spaces and waitlists. |
| CO-D8 | The three mockups of 10 November are the design of the screens (CO-01 to CO-07 below). |

## Calls made while writing (the owner checks these)

| # | Call |
|---|---|
| CO-P1 | **Where Connect lives:** on the people list (`/guests`), which already has a three-dots sheet per row for the owner and admins. Every row now gets the dots for everyone. For a guest the sheet holds the connection action only ("Report or block" joins it with the groups-and-chat design; until then it is absent). The owner's sheet keeps its admin actions and gains the connection action at the top. |
| CO-P2 | **Who can connect with whom, precisely.** Pedro may send a request to Ana from a resbite when (a) Pedro can see names there, which is today's rule `can_see_guests`: he is a host, or he has answered; and (b) Ana is on that resbite as its owner, an admin, or a person who has **answered** (Going, Maybe or Can't go). Someone invited in the app who hasn't answered yet can't be asked, because the request would tell them who else is on the list before they answered (UX2-D6); they become askable the moment they answer. The exception is a **group** (a repeating resbite, companion design CH-P21): there every member sees the people list whatever their reply, so every member can ask and be asked. Because attendee rows stay after the end, "we were both at one" and "we were both invited to one" are the same test. People invited by personal link who never answered have no account and no row, so no Connect. Hosts and admins can connect with anyone who answered, and anyone who answered with them. |
| CO-P3 | **States of a pair:** none, requested (by one of them), connected. The unit is the **series**, not the occurrence (a Thursday group is one resbite for this purpose, so nobody can ask again every week). "Not now" deletes the request and remembers the refusal for that series: Pedro cannot ask Ana again from it; he can from another resbite they later share. **The refusal is invisible to Pedro:** his sheet on that resbite keeps showing "Request sent" (without Cancel), the server never returns a refused state to him, and a stale cancel is a quiet no-op; from another shared resbite he sees "Connect on Resbite" again. A requester can cancel a live request from the sheet ("Request sent · Cancel request"). Accept and "Not now" are only offered to the person asked. |
| CO-P4 | **What a connection does, and all it does.** Each person appears under "Your connections" on the other's Invite people screen, selectable like a contact who is on Resbite: inviting creates the same in-app invitation and `invitation` push as today. Connected people read each other's name and avatar. Nothing else: no profile page, no list of someone else's connections, no "mutual connections", no shortcut through the open link (CO-D6), no messaging outside a resbite's chat. |
| CO-P5 | **Pushes:** "Pedro wants to connect" with the line "You're both going to Board game night" (someone is waiting, so it is essential under the Code of Ethics), and "You and Ana are now connected" to the requester on acceptance. "Not now", cancelling a request and removing a connection are silent. Tapping either push opens Connections. |
| CO-P6 | **The Connections screen** is a new row in Profile, above "People & groups", with a count. It lists Requests (Accept / Not now, newest first), then Connected (alphabetical) with "Met at <resbite title>" under each name. Its three dots hold "Remove connection" with an in-place confirm; removing is silent for the other side. The device-only "People & groups" lists stay as they are (CI-D12); the row is renamed **"People lists"**, because "group" now means a repeating resbite's crew (companion design). The owner can keep the old name. |
| CO-P7 | **Where the circle is set:** on Invite people, in a "Circle of trust" card above the connections, for the owner and admins, while the resbite is open. Two choices: **Each person can bring** (Nobody · 1 · 2 · 3; default Nobody) and **How far it goes** (1 level · 2 levels · 3 levels; default 1, shown only when the first choice is not Nobody), and a sentence that says what the two mean with a real first name from the list. Saved on the resbite as it changes, like the link settings today. The plan screen and Edit do not carry it; the Invite screen is the one place (rule 5 of the CR design: one entry per action). |
| CO-P8 | **Who may bring, precisely.** A person may bring while the resbite is open and they are Going or Maybe, their own level is within the limit, and they have an invite left. Levels: the owner and admins are level 0; everyone the host invited, approved through the link, or carried along a series is level 1; a person brought by a level-n person is level n+1. With "2 levels", level 1 and level 2 may bring; level 3 may not. Hosts never use the circle to bring: they invite. |
| CO-P9 | **How bringing works:** a "Bring someone" row on the resbite page (CO-05), shown only while the person may bring. It opens Invite people in **bring mode** (CO-06): the same connections and phone-contacts picker, capped at the invites left, without the event link, link settings or the circle card. A connection gets the in-app invitation and a push "Pedro invited you to Board game night"; a phone contact gets a personal link sent from the guest's phone, with the message "Pedro invited you to Ana's Board game night, Thu 20 Nov 19:00. Reply here: <link>". The web page says who invited them and who hosts. The brought person joins without approval when they answer, and the host-side notices say "Clara is going · brought by Pedro". |
| CO-P10 | **Counting invites.** An invite is used while the person brought is Going, Maybe or not yet answered (an in-app invitation pending, or a personal link not yet answered). It frees when they say Can't go, are removed, or when the bringer removes an unanswered link they sent (the people list shows those under "Invited, not answered yet · brought by you" with Send again and Remove, as the host sees their own). |
| CO-P11 | **Host control.** The people list shows "Brought by Pedro" under a brought person and indents them under the person who vouched, one level per hop (CO-07). Removing a person never removes the people they brought; they stay, still marked "Brought by Pedro". Lowering the numbers later stops new bringing and removes nobody; "Nobody" hides "Bring someone" everywhere. |
| CO-P15 | **The circle is enforced when the invitation is sent, and a sent invitation stands.** The allowance is checked once, inside `invite_contacts`. After that, Clara's link or in-app invitation works whatever happens to the circle or to Pedro: the host lowers the numbers, Pedro says Can't go or is removed, Clara answers weeks later. Neither `answer_phone_invitation` nor `respond` looks at the circle. The host's remedy is the people list: remove the person, or remove the unanswered link, as with their own invitations. Clara changing her reply later never re-spends or re-checks anything; the invite count of CO-P10 only matters for Pedro's *next* bringing. |
| CO-P12 | **Series.** The circle settings copy to the next occurrence with the rest of the plan (CR-P22), and so do "brought by" and level on the people carried along (CR-P24), so a brought person counts against their bringer's invites on every occurrence while they are in. |
| CO-P13 | **Approval through the link is untouched** (CO-D6): a request from the open link still waits in "Waiting for you"; an approved person is level 1. |
| CO-P14 | **Blocking** (companion design) ends a connection and refuses future requests between the two. Until the block exists, "Remove connection" is the only way out, and it is enough: a removed person cannot ask again from the same series (CO-P3). |

## Goals

- People who shared a resbite can connect and invite each other again inside Resbite, with consent on both sides.
- A host can let guests bring people, see the chain, and keep the power to remove.
- Both are invisible until used: a host who sets nothing sees Invite people exactly as today, plus an empty "Your connections" section once they have any.
- Every hosted change arrives as one approved migration with a rollback file, snapshots and a runbook, as the last three rollouts did.

## Non-goals (this build)

- A way to find people: search, suggestions, QR codes, "people you may know", mutual connections.
- Profiles, bios, photos beyond the avatar, connection counts shown to others.
- Groups as private lists of people (Stephen's object map "Group"; the device-only People lists stay device-only) and the repeating resbite's group and chat (companion design).
- Unnamed plus-ones, spaces, waitlists (CO-D7).
- A connection changing how the open link works (CO-D6).
- Connecting from the web page, or anything on the link site beyond naming who invited and who hosts.
- Prompting people to connect after a resbite ("You met 5 people"). For later.
- Android.

## Anti-goals

- Anyone reaching names before they have answered (UX2-D6 holds).
- A connection, or anything else, letting someone in through the open link without the host's approval.
- An invitation sent through the circle when the host set Nobody, when the bringer is past the last level, when the bringer has no invite left, or when the bringer isn't Going or Maybe. (Once sent, an invitation stands; CO-P15.)
- Anyone listing someone else's connections, or learning that two other people are connected.
- An address book uploaded: the lookups stay "only the numbers you pick" (CI-P3).
- A forwarded personal link letting the wrong person in: the phone key check stays as it is.
- Requests used as a nudge: one request per pair per resbite, silent refusals.

## Constraints

- Hosted changes: nothing touches the hosted project without the owner's approval by migration file name and sha256; `supabase db push` is never used; every migration ships a `supabase/rollback/<name>.rollback.sql`, is replayed against `supabase/tests/hosted-baseline/`, and gets a runbook under `qa/`.
- The app is Expo SDK 57 (read the v57 docs before Expo code), iOS first, built on the Mac through EAS; the link site deploys through Vercel as in the phone-key runbook.
- Functions keep the house shape: `private.x` security definer with `search_path=''` and a thin `public.x` wrapper with explicit grants; private tables have RLS on and no policies; error codes 42501, 22023, 40001 as today.
- Pushes go through the existing outbox, eligibility check and `deliver-notifications` sender; wording follows UX2-D4 (title, what happened and who; never a place, note or number).
- Copy lives in `mobile/src/domain/*Copy.ts` with a colocated test of the exact strings; the browser scripts under `mobile/scripts/verify-*.mjs` cover the flows.
- Accessibility rules of UX1: 44 pt targets, labels on every control, states in words, screen reader order.

## The flow

```
People list (any resbite you can see names on)
  ├─ dots on a person ──▶ CO-01 sheet: Connect on Resbite ──▶ push to them ──▶ CO-02 Connections: Accept ──▶ push to you ──▶ connected
  │                                                                       └─ Not now ──▶ nothing, silent
  └─ dots on a connected person ──▶ sheet shows "Connected" (no action)

Invite people (host) ──▶ CO-03 Your connections (ticks) + Phone contacts + Event link ──▶ Invite N
                    └─▶ CO-04 Circle of trust card ──▶ saved on the resbite

Resbite page (guest, Going or Maybe, invite left, level within limit) ──▶ CO-05 "Bring someone" ──▶ CO-06 bring mode ──▶ Invite 1
  ├─ connection ──▶ in-app invitation + push; they reply; on the list "Brought by Pedro"
  └─ phone contact ──▶ personal link from the guest's phone ──▶ web page "Pedro invited you to Ana's …" ──▶ sign-up, Going ──▶ on the list

People list (host) ──▶ CO-07 chain, Remove as today
Profile ──▶ Connections (CO-02) ──▶ Remove connection
```

## Screens

### CO-01 The people list with Connect (`connections.html`, phone 1)

The existing `/guests` page. Every row ends in the three-dots button (44 pt, "Actions for Ana" for screen readers), for every viewer who can see names. The sheet (grabber, avatar, name, status line "Hosting · Board game night" / "Going" / "Admin") holds, at the top:

- **Connect on Resbite** with the sub-line "Ana decides. Then you can invite each other in the app." when there is no connection and no request;
- **Request sent** (not a button) with a second row **Cancel request** when you asked; after a refusal you never learn of, the same "Request sent" without the Cancel row (CO-P3);
- **Accept** and **Not now** when they asked you;
- a **Connected** label when connected.

Then, for the owner and admins only, the actions that exist today (Make admin, Remove, Send again, Approve, Decline), with the separator before the destructive row. Your own row has no dots. A row for a person without an account (invited by WhatsApp or Messages, not answered) has the host's actions only. On the list a connected person's name carries a small "Connected" badge, for you only.

### CO-02 Connections (`connections.html`, phone 2)

Full page from Profile, title "Connections", Back on the left. Groups: **Requests · N** (a card per person: avatar, name, "You're both going to Board game night" or "You were both at Picnic in the park", then two pills, Accept and Not now; Not now asks nothing and removes the card) and **Connected · N** (rows with avatar, name and "Met at <title>", three dots → "Remove connection" with the in-place confirm "Remove Ana from your connections? Neither of you will be told."). Empty state: "Nobody yet. You can connect with people who share a resbite with you, from its people list." A line at the bottom whenever the list is not empty: "You can only connect with people who share a resbite with you. There is no search." Under Larger Text the two pills stack.

Entry: the Profile tab's grouped rows get **Connections** (icon: two linked rings) with the count of pending requests as a badge when there are any, above "People lists" (CO-P6). Tapping a connection push lands here.

### CO-03 Invite people with connections (`connections.html`, phone 3)

The existing `/invitations` page, order from the top: the circle card (hosts only, CO-04), **Your connections · N** (rows with avatar, first name and a tick; "Invited" in place of the tick for a connection already invited to this resbite, who cannot be selected again; alphabetical; a search field above when there are more than eight), **Phone contacts** (the contact picker as today, "Choose phone contacts", "Resbite checks only the numbers you pick."), then the **Event link** card as today, whose hint now reads "Anyone who answers through the link waits for your approval." The button "Invite N" counts connections and contacts together; the Almost there / Send step is unchanged for contacts, and connections are simply done ("Marta and Pedro are invited. They'll see it in Resbite."). With no connections, the section is absent (no empty state here; the sketch's "Share the link. Your connections will appear here" line is dropped because the link no longer makes connections).

### CO-04 The circle of trust card (`circle-of-trust.html`, phone 1)

On Invite people, owner and admins, while the resbite is open. Heading "Circle of trust", hint "Let the people you invite bring someone you don't know. Whoever they bring is in, without your OK." Segmented **Each person can bring**: Nobody · 1 · 2 · 3. When not Nobody, segmented **How far it goes**: 1 level · 2 levels · 3 levels, and a sentence in a tinted box that uses the first guest's first name, or "Each guest" when there is none: "Pedro can bring 1 person." / "Pedro can bring 1 person, and that person can bring 1 more." / "Pedro can bring 2 people, and each of them can bring 2 more, and so on for 3 levels." Always ending "Only people with a Resbite account." Each change saves at once and shows the saved state; failure shows the usual error line and keeps the previous value. After the end the card is read-only text ("Circle of trust: 1 each, 2 levels") or absent when Nobody.

### CO-05 "Bring someone" on the resbite (`circle-of-trust.html`, phone 2)

On the guest's resbite page, after the people row: a row card with the add-person icon, "Bring someone" and the line "Ana trusts you to bring 1 person. They're in, no approval needed." ("2 people" / "1 more person" once one is used). Shown only while CO-P8 holds. When all invites are used it reads "You brought Clara" / "You brought Clara and Martín" with no chevron. Not shown to hosts, to people who haven't answered or said Can't go, past the last level, after the end, or when the host set Nobody.

### CO-06 Bring mode of Invite people (no mockup)

The Invite people page opened from CO-05, title "Bring someone", a line under the title "Ana trusts you to bring 1 person to Board game night.", then **Your connections** and **Phone contacts** exactly as CO-03, no circle card, no event link. Selecting more than the invites left is prevented and the button says "Invite 1" at most. The send step for a phone contact is the host's send step with the message of CO-P9. Done returns to the resbite, where the row now reads "You brought Clara".

### CO-07 The people list with the chain (`circle-of-trust.html`, phone 3)

The host's `/guests`: a hint line under the title, "Circle of trust: each person brings 1, two levels." when set. In each group a brought person sits right under the person who brought them, indented with a thin left rule, with "Brought by Pedro" as the status line, nested again for the next level. Someone brought by personal link who hasn't answered shows "Invited by WhatsApp · brought by Sol" in "Invited, not answered yet", and the bringer sees their own such rows there too (the bringer's list otherwise stays a guest's list: counts only until they answer, names after). The sheet actions are today's; removing a bringer keeps the people under them, who move up one level in the display but keep their level and "Brought by".

## Rules that cut across screens

1. **Names before answering: never** (UX2-D6). Connect, badges and the chain appear only where names already do.
2. **One request per pair per series.** A refusal is silent and final for that series, and invisible to the requester (CO-P3). A cancelled request may be sent again.
3. **A connection is symmetric** and stored once. Either side removes it; the other is not told.
4. **Connections do not open doors**: the open link still waits for approval (CO-D6); nothing a connection grants bypasses a host.
5. **The circle is the host's and is per resbite** (carried along a series). Hosts and admins set it; guests see only what it allows them.
6. **Levels and invites are enforced on the server**, not only hidden in the app: `invite_contacts` refuses a caller who is not a host and may not bring (42501 "Not allowed to bring people here"), or who has no invite left (22023 "No invites left").
7. **The end is the boundary for bringing, not for connecting** (CR-D14). Bringing and the circle card stop at the end like inviting does. Connecting stays possible on an ended resbite, because "we were both at one" is the point (CO-D2); the people list of a past resbite keeps its dots.
8. **Pushes:** `connection_request` to the person asked, `connection_accepted` to the requester, both opening Connections; the `invitation` push to a brought connection names the bringer as actor; the host-side `rsvp` push appends "· brought by Pedro" when the person was brought. No push for Not now, cancel, remove, or for a bringing that hasn't been answered.
9. **Series:** circle settings, "brought by" and level ride along with the plan and its people (CO-P12).
10. **Deletion:** deleting an account removes its connections, requests and refusals; "brought by" on other people's rows becomes empty and the display says nothing (no "Brought by a deleted account").
11. **Accessibility:** the chain's indentation is also in words ("Clara, brought by Pedro"); the segmented controls are radio groups; the tinted sentence is read after the controls; 44 pt everywhere.

## Data

**Tables**

- `public.connections (user_a uuid, user_b uuid, state text check (state in ('requested','connected')), requested_by uuid, series_id uuid null, created_at timestamptz, accepted_at timestamptz null, primary key (user_a, user_b), check (user_a < user_b))`, both users referencing `profiles`. `series_id` is the resbite (series) they met at; "Met at" shows the title of that series' latest occurrence, or nothing when it is gone. RLS: select where `auth.uid() in (user_a, user_b)`; no insert, update or delete policies (functions only).
- `private.connection_refusals (series_id uuid, from_user uuid, to_user uuid, refused_at timestamptz, primary key (series_id, from_user, to_user))`.
- **Deletion is explicit.** Account deletion keeps the `profiles` row as "Deleted member" (`20261022120001_gi2_local_delivery_and_deletion.sql`), so foreign-key cascades do nothing here: the deletion lifecycle deletes the person's `connections` rows and refusals (both directions) and sets `brought_by` to null on other people's attendee rows.
- `public.plans`: `bring_invites smallint not null default 0 check (bring_invites between 0 and 3)`, `bring_levels smallint not null default 1 check (bring_levels between 1 and 3)`. Readable through `plan_read`; written by the new function below and copied by `roll_repeating_plans`.
- `public.attendees`: `brought_by uuid null references profiles on delete set null`, `level smallint not null default 1 check (level between 1 and 4)`. Hosts' own rows, if any, stay level 1 (hosts are level 0 by role, not by row).
- `private.phone_invitations`: `level smallint not null default 2` meaning the level the answerer will get; `invited_by` already exists and now also holds a bringer.

**Functions** (each `private.x` plus the `public.x` wrapper, grants to `authenticated`)

- `request_connection(p_user uuid, p_plan uuid)`: checks CO-P2 with `can_see_guests(p_plan, caller)`, that `p_user` is on `p_plan` as owner, admin or an attendee who answered (or any attendee when the series is a group, CH-P21 of the companion design), that no refusal exists for (the plan's `series_id`, caller, p_user) and no block either way, that the pair is not connected or requested; inserts `requested` with `requested_by = caller` and the `series_id`; queues `connection_request` to `p_user` with `plan_id = p_plan`, `actor_id = caller`, dedupe `connect:<a>:<b>:<series>`. When a refusal exists it returns success and does nothing (CO-P3).
- `accept_connection(p_user uuid)`: the pair must be `requested` with `requested_by = p_user`; sets `connected`, `accepted_at`; queues `connection_accepted` to the requester, dedupe `connected:<a>:<b>`.
- `decline_connection(p_user uuid)`: same precondition; deletes the row and inserts the refusal for the request's `series_id`.
- `cancel_connection_request(p_user uuid)`: the caller must be `requested_by`; deletes the row.
- `remove_connection(p_user uuid)`: deletes a `connected` row where the caller is one side.
- `my_connections()`: returns three sets in one call (incoming requests, outgoing requests, connected) with the other person's id, display name, avatar path and revision, the plan title for "Met at" (null when the plan is gone) and the request's context line.
- `plan_connection_states(p_plan uuid)`: for the people list, the state of the caller's pair with each person on the plan (`none`, `requested_by_me`, `requested_by_them`, `connected`), only when `can_see_guests`. A refusal of the caller's own request on this series is reported as `requested_by_me` (CO-P3); the refuser sees `none`.
- `set_plan_circle(p_plan uuid, p_invites smallint, p_levels smallint)`: hosts only (`require_link_owner`), while open; updates the two columns and bumps `version` without notifying anyone.
- `private.bring_allowance(p_plan uuid, p_user uuid) returns table (allowed smallint, used smallint, level smallint, may_bring boolean)`: level 0 for hosts; otherwise the caller's attendee level; `may_bring` is open plan and response in (accepted, maybe) and `bring_invites > 0` and `level <= bring_levels`; `used` counts attendee rows with `brought_by = p_user` and response in (pending, accepted, maybe) plus unanswered, unrevoked `phone_invitations` with `invited_by = p_user`.
- `invite_contacts(p_plan, p_invites)`: admits a non-host caller when `bring_allowance(...).may_bring` and the number of new invitations fits in `allowed - used` (checked inside the row lock, so two phones can't both spend the last invite). Accepts a new item shape `{"user": "<uuid>"}` for a connection: requires a `connected` pair with the caller, creates the pending attendee with `brought_by = caller` (null when the caller is a host) and `level = caller level + 1` (1 for hosts), queues `invitation` with `actor_id = caller`. Phone items from a non-host store `invited_by = caller` and `level = caller level + 1`.
- `answer_phone_invitation`, `claim_invite`: when creating the attendee row, copy `brought_by = invited_by` when the inviter is not a host of the plan, and the stored `level`.
- `plan_people` (the people list's source, whatever it is today in `useEvent`): returns `brought_by`, its first name, and `level`, so the app can nest rows.
- `personal_invitation_page(code)`: returns the inviter's first name and the host's when they differ, so the web page can say "Pedro invited you to Ana's Board game night".
- `roll_repeating_plans()`: copies `bring_invites`, `bring_levels`, and each carried attendee's `brought_by` and `level`.
- `profiles` read policy: `can_read_profile` also true when a `connections` row (requested or connected) joins the two.
- `notification_recipient_eligible`: new branch for `connection_request` and `connection_accepted` (recipient is a side of the pair; no plan membership test; mutes don't apply); `notification-copy.ts` gets the two kinds ("Pedro wants to connect" / "You're both going to Board game night"; "You and Ana are now connected"); the sender's payload carries `data.type = "connection"` for them, and the app's tap routing (`pushTaps.ts`, `pushRoute.ts`) sends that type to `/connections`. The `rsvp` copy appends "· brought by <first name>" when the attendee row has `brought_by`.
- Account deletion: the existing lifecycle also clears `connections`, `connection_refusals` for the user.

**Outbox:** `kind` check gains `connection_request` and `connection_accepted`; `plan_id` stays not null (both carry the resbite they met at).

**App**

- `app/connections.tsx` (CO-02) and `mobile/src/state/useConnections.ts`; `mobile/src/services/connections.ts` wraps the RPCs; copy in `mobile/src/domain/connectionsCopy.ts` with its test.
- `app/guests.tsx` and `mobile/src/domain/eventPage.ts`: dots for everyone, the connection rows in the sheet, nested rows for the chain, the "brought by you" invited rows for a bringer.
- `app/invitations.tsx`, `ContactPicker.tsx`, `useContactInvites.ts`: the connections section, the circle card, bring mode (`?bring=1`), the cap, the bringer's message.
- `app/event.tsx`: the "Bring someone" row; `eventPage.ts` decides when it shows from the plan's circle fields and the caller's allowance (fetched with the people).
- `(tabs)/profile.tsx`: the Connections row and the rename.
- `links/server/lib/personal.mjs` and the page: the inviter line.

**Tests**

- SQL (`supabase/tests/connections.sql`): request needs visible names and a shared plan, and an answered target (any member on a group); no second request after a refusal on the same series (the second call succeeds quietly and inserts nothing) but yes on another series; a request to a pending person on a one-off refused; accept only by the person asked; connected pairs read each other's profile and nobody else's connections; `bring_allowance` across levels 1–3 and used/free transitions; `invite_contacts` refusing a non-host without allowance, a Can't go bringer, a last-level bringer and an over-cap batch under concurrency (two sessions, one invite left); the roll carrying circle fields, `brought_by` and `level`; deletion clearing rows.
- Mobile unit tests: the copy files; `eventPage` grouping with nested brought rows and the "Bring someone" visibility matrix; the bring-mode cap.
- Browser scripts: `verify-connections.mjs` (request, accept, invite a connection, remove) and `verify-circle.mjs` (set the circle, bring a connection, the chain, the cap), both asserting the RPC names and arguments; `links/verify-personal.mjs` extended with the inviter line.
- Edge: `notification-copy.test.ts` for the two kinds and the brought suffix.

## Left to the builder

- The exact icon for Connect and for the Connections row; how the kit nests the chain (the mockup's thin left rule).
- Whether `plan_connection_states` is merged into the people query or fetched beside it.
- How bring mode is passed to the Invite screen (`?bring=1` is the suggestion) and how the cap is shown when the picker already holds more selections than allowed.
- The order of migrations (one for connections, one for the circle, or one for both) and the runbook's step list, following `qa/creating-a-resbite-2026-10-31/README.md`.
- Updating `knowledge-base/08-decisions.md` with CO-D1–D8 and CO-P1–P14, and `docs/implementation-status.md` at rollout.

## Open for the owner (not blocking the plan)

- Tell Stephen that connected people wait for approval through the open link like everyone else (CO-D6 overrides the IN brief), and that a connection is now defined as request-and-accept from a shared resbite.
- The Profile row rename to "People lists" (CO-P6), or another name.
- For later: prompting people to connect after a resbite; unnamed plus-ones (CO-D7); suggestions limited to your connections (DIR · For later).
