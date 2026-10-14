# WhatsApp events: benchmark for Resbite (researched 7 Oct 2026)

Evidence caveat: the official help-center "create an event" article could not be fetched (only the "How to respond to events" article surfaced, via search snippet). Creation details lean on 2024 press and the WhatsApp blog. The Sept 2026 Events hub is Android-beta only and is reported by WABetaInfo and press, not by WhatsApp itself.

## 1. Snapshot
- WhatsApp (Meta): free messaging app on iOS, Android, web and desktop, aimed at everyone. Events are a feature of group, community and 1:1 chats and cost nothing. [1][2]
- Launch: announced 1 May 2024 for Communities (announcement groups), "over the coming months" for all groups [2]. Press in Aug 2024 reports it available in all groups [5].
- 9 Apr 2025 blog update: events in 1:1 chats, "Maybe" RSVP, plus-one, end date/time for longer events, pinning events in a chat [3].
- Sept 2026 (Android beta 2.26.36.5, WABetaInfo 11 Sep 2026): a standalone Events hub with shareable guest links that work without a WhatsApp account, a cover photo, and a 1-hour default reminder [4][6]. **Flag: beta, gradual rollout, no iPhone date, unconfirmed by WhatsApp.**

## 2. Creation flow, step by step
- Open a group, community announcement group or 1:1 chat, tap "+" / attach icon, choose **Event**. Fill in the form, then tap the green send arrow. The event posts into the chat as a message [5][7].
- Fields: name, description, start date and time, optional end date/time (added 2025), location, optional WhatsApp call link (voice or video) [3][5][8].
- Required fields: not documented officially. Press implies name and start time. **Inference.**
- Minimal event: roughly 4 to 5 taps plus typing (attach, Event, name, date/time, send). **Inference**, not timed.
- Press: description up to 2,048 characters; call-link events cannot be scheduled more than 12 months ahead [8]. A Beebom/Benzinga-style guide says to turn off disappearing messages to create events in advance [8] (low-quality source).
- No templates, themes or cover images in the chat flow. The Sept 2026 hub adds a cover photo and defaults the host to the account name [4].
- Hub flow (beta): create outside a chat; the same fields plus cover photo, a guest-bring-someone toggle, and a reminder setting [4].

## 3. Event data model
- Title, description (text), start, optional end, location (free text; a map pin is not confirmed), optional call link. Time zone, all-day and recurrence are not documented. **No recurrence, capacity, cost or co-hosts** (creator is the only host) [8].
- Guests: plus-one allowed. In 2024 press the option could not be turned off [5]; the 2026 hub adds a toggle [4].
- Reminders: automatic notification as the event approaches [2]. 2024 press says the alert fired only at start time [5]. The 2026 hub defaults to 1 hour before and can be changed [4].
- Visibility: the audience is the chat's members. In the hub, anyone with the link can respond [4].

## 4. Sharing and invitations
- Invitation is the chat itself: the event card lands in the conversation and all members are notified. No separate invite step [5].
- Cannot invite people outside the group; the event cannot be forwarded to another chat [8]. People who join the group later do not see earlier events; the creator must delete and recreate [7][8].
- Events are listed on group info, and you only see events of groups you belong to. Events can be pinned in a chat [3][7].
- Hub (2026 beta): generated link; non-users enter a name and verify their phone number. Before confirming they see only name, date and time. Location and call link appear after they confirm [4][6]. Revocation is not documented.
- Privacy: PhoneArena states group events are end-to-end encrypted [9] (undated; the WhatsApp blog does not mention encryption [2]). **Inference:** this holds for in-chat events since they are chat messages; link-based hub events are unlikely to be E2EE (guest phone verification, host sees numbers). Unverified.

## 5. RSVP and guest experience
- Options: Going, Going with guest, Maybe, Not going ("Can't go" in press) [3][7].
- Those who answer Going/Maybe are notified if the creator changes or cancels the event. The group chat also gets a notice of changes [7].
- Guest list: organiser and members can see who responded [5]. In the hub, confirmed guests see other attendees' names and responses; phone numbers show only if the contact is saved; the host sees all numbers [4].
- Calendar: 2024 press says there is no sync to Google or other calendars [5]. Not re-verified for 2026.
- Comments: replies and chat happen in the same conversation. Event-specific comment threads are not documented. Photos after the event are not documented.
- Changing a response: possible by re-tapping (**Inference**, standard UI; the help article text was not retrievable).

## 6. Organizer management
- Creator edits or cancels; chat is notified [7]. Only one host. Exact edit/cancel steps were not found in text.
- No check-in, analytics, duplicate or recurrence.
- Hub (beta) gives one list of events you created or were invited to [4].

## 7. Notifications and reminders
- On creation: all chat members get the message and normal chat notification [5].
- Before start: automatic reminder to attendees [2]. Timing was start-time only in 2024 [5]; 1-hour default plus editable in the 2026 hub [4].
- Change or cancel: notice posted in chat and notification to Going/Maybe responders [7].
- Mute: follows chat mute settings. **Inference.**

## 8. Accessibility and usability
- No WhatsApp-specific accessibility documentation for events was found. Not substantiated.
- iOS/Android system text size and screen readers apply (general); Android also has an in-app chat font-size setting that covers chat text only [10, low quality].
- Usability: discoverability is low (hidden under the "+" attach menu, a point I infer rather than cite). Large groups: every RSVP posts into a shared list; no source documents "clutter" complaints. **Inference** that big groups get noisy, since the plus-one could not be disabled and anyone can create events.
- Cognitive load is low: one short form, and the guest already knows the chat.

## 9. Distinctive UI patterns
- Event as a message card inside the conversation: invite, discussion and RSVP in one place.
- Three-way RSVP plus an explicit "Going with guest" state.
- Pinning an event in chat and a per-group events list in group info.
- Hub (2026): progressive disclosure for link guests, who see name/date/time first and location only after confirming.
- Change/cancel notice posted into the chat so everyone sees it, not just responders.
- Optional end time (default is none), which keeps the first form short.

## 10. Ideas for Resbite
1. **Adapt** RSVP wording: add "Maybe" and a plus-one state to accepted/declined/withdrawn. Effort S, needs schema review.
2. **Adopt** "location revealed only after accepting" for link invitees. Fits privacy-first; effort M; needs the claim flow (already exists).
3. **Adopt** a short, optional-heavy form: only title, when, where required; end time and notes optional. Effort S (largely already so).
4. **Adapt** change/cancel visible in one activity place (event page timeline) as well as push. Effort M; depends on notifications being switched on (B1).
5. **Adapt** a default reminder (1 hour before, user-adjustable). Effort M; needs notifications.
6. **Avoid** unconditional plus-ones (WhatsApp 2024 could not disable); add an organizer toggle. Effort S.
7. **Avoid** relying on chat membership as the only invite channel; Resbite has no chat, so keep the claim link but make it as frictionless as WhatsApp's tap (one tap to RSVP after sign-in). Effort S.
8. **Adapt** attendee visibility rule: confirmed guests see names and responses, organizer-only contact details. Effort S/M; needs guest list UI.
9. **Avoid** calendar gap: WhatsApp had no calendar export; add "Add to Calendar" (ICS/EventKit). Effort M.
10. **Adapt** cover photo as optional (already built); do not make it central.

## 11. Sources
1. WhatsApp Help Center, "How to respond to events", https://faq.whatsapp.com/3855462068110340 (read via search snippet only; page body returned truncated; date unknown).
2. WhatsApp Blog, "New to Communities: Events and Replies in Announcement Groups", https://blog.whatsapp.com/new-to-communities-events-and-replies-in-announcement-groups (1 May 2024).
3. WhatsApp Blog, "New Feature Roundup: Updates to group chats, events, calls, channels and more", https://blog.whatsapp.com/new-feature-roundup-updates-to-group-chats-events-calls-channels-and-more (9 Apr 2025).
4. WABetaInfo, "WhatsApp introduces a new hub to create and manage events", https://wabetainfo.com/whatsapp-introduces-a-new-hub-to-create-and-manage-events/ (11 Sep 2026; Android beta).
5. SAYS Malaysia, "WhatsApp Users Can Now Organise Meetings & Events For Groups", https://says.com/my/tech/whatsapp-can-now-organise-meetings-events-for-groups (7 Aug 2024).
6. ProPakistani, "WhatsApp launches new events hub", https://propakistani.pk/2026/09/11/whatsapp-launches-new-events-hub/ (11 Sep 2026; snippet only).
7. WhatsApp Help Center summary via search (group info, going/maybe, old events), same as [1].
8. Third-party how-tos via search (Benzinga India, Gulf News, Beebom; limits, 2,048 chars, no forwarding, no co-hosts), https://in.benzinga.com/content/38573671/how-to-create-and-manage-an-event-on-whatsapp ; https://gulfnews.com/technology/whatsapp-organising-a-party-heres-how-to-create-an-event-1.1731925032656 (2024; snippets only).
9. PhoneArena, "WhatsApp is widely rolling out an event feature for group chats", https://www.phonearena.com/news/whatsapp-is-widely-rolling-out-an-event-feature-for-group-chats_id159937 (2024, date not shown; E2EE claim).
10. Font-size guides (Techloy, Technipages etc.) via search; low quality, used only for the Android chat font-size setting.
