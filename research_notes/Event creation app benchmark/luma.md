# Luma (luma.com / lu.ma) benchmark

Accessed 2026-10-07. Help-center pages carry no publication dates (treat as current as of access). Read-only: no signup, no hands-on use. Facts are cited [n]; inferences are marked **Inference**.

## 1. Snapshot
- Event platform for hosts who run events regularly (meetups, communities, workshops, ticketed events). Web plus iOS and Android apps (Luma Labs, Inc.) [1][3]. The App Store lists tech, crypto, wellness and social events, Apple Wallet tickets, event chat, QR check-in, cohosts and calendar subscriptions [3].
- App Store: 4.9/5 from about 19K ratings, Editors' Choice, free, requires iOS 18. Version 2.18 rebuilt "much of the app for better speed and smoothness" and added Arabic and Hebrew. 2.17 (Sep) added drop-a-pin and a host Insights view [3]. Exact release dates are not shown on the page.
- Pricing: free for basic events. Luma Plus unlocks some features, including check-in staff and split first/last name fields [5][6]. Paid tickets carry fees (not researched in detail). Luma's own comparison page positions Partiful as "casual parties" and Luma as the tool for recurring hosts with calendars [13]. That page is promotional.
- Launch date of the event feature: not found.

## 2. Creation flow, step by step
Entry: web luma.com/create, iOS "+", Android "+ Create" [1]. Everything below is the documented single creation screen, not a wizard.
1. Title, start/end date and time, timezone (defaults from the location). A multi-day event needs both dates [1].
2. Event type: in-person, online or hybrid. Location is a Google Maps address with an optional "Adjust Pin" (drag up to 1 km), or an online meeting link [1].
3. Description with bold, italic, lists, links and emoji [1].
4. Cover image: curated gallery or upload [1].
5. Theme: over 40, in groups such as Minimal, Quantum, Ambient, Emoji, Confetti, Pattern, Playful and Seasonal. Colours are customisable with a live preview [1].
6. Calendar: personal by default, or a team calendar, or create a new one [1].
7. Visibility: Public, Private (unlisted, link-only) or Member-Only [1][2].
8. Registration options: capacity and over-capacity waitlist. Require Approval is set on the ticket type after creation, in the Registration tab [1].
9. "Create Event" makes the event live immediately, then goes to the management page [1]. A Feb 2026 critique notes that after creation the app offers review, invite or exit [7].
- Required: title (the submit check mark stays greyed out until a name is entered). Luma does not mark required fields otherwise [7].
- Minimal event: open create, type a title, confirm the pre-filled date, tap create. **Inference:** about 3 to 5 taps plus typing, since a default date is present. Defaults for date, duration and end time are not documented.
- A third-party showcase says a multi-page form was condensed into one screen, with date and time in overlays [9]. The page is undated.
- Management tabs after creation: Registration (tickets, price, capacity, questions), Guests, Blasts, More (custom URL, integrations, analytics, clone) [1].

## 3. Event data model
- Core: title, description (rich text), start/end, timezone, in-person/online/hybrid, address with adjustable pin, online link (changeable "without sending new invites") [1].
- Cover image and theme [1].
- Calendar ownership, tags for filtering [8].
- Visibility: public, private, member-only. Per-calendar default visibility. Location can be hidden from approved guests separately [2].
- Tickets with price, per-ticket capacity, sale windows, coupons, Require Approval. Event capacity plus a waitlist [1][10][11].
- Registration questions: text, single/multi option, social profile, company, checkbox, terms, website. Name and email are always collected. Changes apply only to new registrations [12].
- Hosts: up to 5 per event (70 with a verified calendar). Manager vs non-manager (display only). Check-in staff role needs Plus. Creator cannot be removed [14].
- Recurrence: there is no native recurring event. The workaround is cloning to up to 30 dates, with a recurrence pattern, on the web only (not iOS). Guests, blasts and sale dates are not shifted on clone [15].
- Not documented or not found: all-day events, +1/plus-one options, RSVP deadline, custom slug detail (a "custom URL" exists under More) [1].

## 4. Sharing and invitations
- Invite by email (everyone gets Accept Invite / View Event, optional custom message, no cover image in the email), by SMS/WhatsApp if a phone is linked, and by push for app users. On iOS you can invite by phone number alone [4].
- Invite links work for whoever opens them. They are not tied to the invited email, so a forwarded link can bypass Require Approval. An invite cannot be resent. Duplicate emails are skipped. Invites bypass approval [4].
- Public sharing: the event URL itself. Private events are unlisted and not indexed, but "only people with the link can register" [2]. No documented link revocation. **Inference:** the only control is moving people to Not Going or changing visibility.
- Calendar followers ("subscribers") can be emailed newsletters of upcoming events; "All Contacts" includes followers [4][8].
- Guest without an account: registration needs only name and email, no Luma account or sign-in. If the email matches an account the registration attaches to it [5]. Confirmation email includes a calendar invite that adds itself to the guest's calendar. Online events get a per-guest luma.com/join link [5]. No email verification is described [5]. Contrast: the app itself reportedly needs email sign-up and verification at onboarding [9].

## 5. RSVP and guest experience
- Guest states: Confirmed/Going, Pending approval, Waitlisted, Declined, Not Going [5][10]. Approval and waitlist guests get a "pending/waitlist" email, not the confirmation [5].
- Waitlist triggers only when the whole event is full. Waitlisted guests can't see event details such as virtual links. Spots do not auto-fill after a cancellation; the host approves manually [10].
- Tickets live in the app and Apple/Google Wallet; wallet passes work offline [16].
- Reminders: 1 day and 1 hour before, by email, SMS and push, to registered guests only. Hosts can no longer edit automated reminders, so custom text goes through Blasts. Guests can turn reminders off [17].
- Guest list visibility, comments, photos, edit/cancel notification behaviour: not verified in the sources I reached. Chat among attendees exists per the App Store [3].

## 6. Organizer management
- Edit after publishing (Manage Event). Visibility changeable at any time [2].
- Blasts: scheduled or immediate announcements by email/SMS/push, also shown on the event page [17].
- Guest tab: approve/decline individually or in bulk with a message [10].
- Check-in: QR scan with Standard mode (confirm) or Express mode (auto, colour-coded), manual search, staff roles, hardware scanners [16].
- Clone event; recurrence via clone, web only [15]. Registration stays open after the event ends unless manually switched off [15]. Insights/analytics exist [3][1].

## 7. Notifications and reminders
- Invite to guest: email, SMS/WhatsApp, push [4]. Reminders at 1 day and 1 hour, with plans to batch into a daily summary [17]. Confirmation, approval, decline and waitlist emails [5][10]. Blasts for host announcements [17]. There is a FAQ on disabling notifications (not read in full).

## 8. Accessibility and usability
Documented support:
- App Store accessibility labels: VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate Without Color Alone, Sufficient Contrast, Reduced Motion [3]. These are developer self-declarations, not audited.
- Luma's accessibility page: aims for keyboard, screen-reader support on web, iOS and Android across discover, register, check-in and host. It has no VPAT, no WCAG report and no Section 508 certification, and says it prioritises real-world usability over certification [18].

Evidence for "the best":
- 4.9/5 on about 19K ratings and Editors' Choice [3]. A user review says the design is "far ahead of Eventbrite" [3]. A Feb 2026 design critique calls creation "an example of good design", with clear signifiers, a disabled submit until a title exists, and a short description under each setting [7]. A product showcase calls it "highly polished", with a one-screen creation form and responsive transitions [9].

Evidence for "complex":
- Thin. I found no independent review or forum thread that says Luma is too complicated. Documented structure suggests complexity, flagged as **Inference**:
  - Host settings spread over four tabs (Registration, Guests, Blasts, More) [1].
  - Require Approval, questions, capacity and waitlist are not in the creation form and sit in the Registration tab [1].
  - The calendar concept (every event belongs to a calendar, subscribers, team calendars, permissions, tags, membership) is a heavy layer for a casual user [8].
  - Waitlist rules are subtle: the whole event must be full, and it doesn't auto-fill [10].
  - Recurrence only through cloning, web only [15].
  - Invite vs Blast confusion, noted by the critique [7]. Required fields not marked [7]. No clear home button on the event page; own vs suggested events hard to tell apart [7].
  - Reminders were removed from host control [17].

Evidence for "not very accessible":
- None found. Luma's own statement and App Store labels claim support [3][18]. Absence of complaints is not evidence of good accessibility: very few independent reviews exist and no audit was found. A Ticket Tailor review notes Luma has little footprint on G2/Capterra [19] (competitor, treat with caution).
- Inferences only, not verified (no hands-on testing allowed):
  - Themed backgrounds, animated themes (Confetti, Emoji) and text over cover images can create contrast and motion risks, though the App Store claims Sufficient Contrast and Reduced Motion.
  - Web-first patterns on mobile: some features, such as multi-date clone, exist only on the web [15].
  - Dense host UI is a cognitive load issue for Larger Text users.
- The boss's "not very accessible" may mean cognitive/usability accessibility (many options, concepts) rather than screen-reader failure. Worth asking.

## 9. Distinctive UI patterns
1. Cover image plus theme with live preview, so the page is designed while creating [1].
2. One-screen creation form with date/time overlays; event live immediately [1][9].
3. Post-create prompt to "Invite Guests" as the natural next step [7][9].
4. Short helper description under every setting [7].
5. Registration with name and email only; guests need no account [5].
6. Confirmation email with an auto-adding calendar invite and per-guest join link [5].
7. Wallet ticket plus QR, offline-capable [16].
8. Express check-in with colour-coded results [16].
9. One-tap accept from the invite [4].
10. Clone event as the repeat mechanism [15].

## 10. Ideas for Resbite
1. Adapt: cover image plus category-tinted preview as you edit. Resbite already has covers and categories. Keep to a few vetted, high-contrast looks rather than 40 themes. Effort M. No dependency.
2. Avoid: animated or confetti themes and user-tinted text over images. Contrast, Reduce Motion and Larger Text risk, and off-brand for calm. Effort none.
3. Adopt: after Save, a "Share invite" next step as the default screen. Effort S. Needs the invite link flow (exists).
4. Adopt: one-line helper text under each field or setting. Cheap and good for VoiceOver and cognition. Effort S.
5. Adopt: mark required vs optional explicitly (Luma's gap [7]). Effort S.
6. Adapt: guest accept/decline without friction. Resbite requires sign-in by design (private beta), so keep it but make the claim screen minimal. Effort M. Needs B1 testing.
7. Avoid: calendars, subscribers, tags and member-only visibility. Heavy concepts, public-audience oriented. Effort none.
8. Avoid: link-based invites that work for anyone. Luma's forwardable link bypasses approval [4]. Keep Resbite's email-restricted token option and add revocation. Effort S to M.
9. Adapt: clone event ("Do this again") with a new date, with guests not copied. Effort S to M. Good wellbeing fit (repeat walks). Skip native recurrence for now.
10. Adapt: reminders to going guests only, in a small fixed cadence (e.g. 1 day, 1 hour), with a guest mute. Skip host-editable text. Effort M. Needs notification delivery switched on.
11. Adopt: clear statuses (going, declined, pending) with plain-language copy in notifications instead of generic "You have an update" [5]. Effort S. Needs outbox delivery.
12. Avoid: tiered host tabs with approvals, waitlists and ticketing. Add capacity only if requested, as a single number. Effort S if ever.

## 11. Sources
1. Creating an Event, https://help.luma.com/p/creating-an-event (Luma help, undated, accessed 2026-10-07)
2. Setting your Event Visibility, https://help.luma.com/p/setting-your-event-visibility (undated)
3. Luma: Events & Invites, App Store, https://apps.apple.com/app/id1546150895 (version 2.18 current; reviews 2024-2025)
4. Inviting and Adding Guests to Your Event, https://help.luma.com/p/inviting-and-adding-guests-to-your-event (undated)
5. Event Registration Process, https://help.luma.com/p/event-registration-process (undated)
6. Help center index, https://help.luma.com (undated)
7. Design Critique: Luma, IXD@Pratt, https://ixd.prattsi.org/2026/02/luma-design-critique/ (2026-02-17; student critique, a single reviewer)
8. Luma Calendar Overview, https://help.luma.com/p/luma-calendar-overview (undated)
9. Decoding Luma, ScreensDesign, https://screensdesign.com/showcase/luma-delightful-events (undated, © 2026)
10. Waitlist, https://help.luma.com/p/waitlist (undated)
11. Help center index (capacity, tickets), same as 6
12. Collect Registration Questions, https://help.luma.com/p/collect-registration-questions (undated)
13. Luma vs Partiful, https://help.luma.com/p/luma-vs-partiful (vendor comparison, seen via search snippet only)
14. Adding Hosts and Managers, https://help.luma.com/p/adding-hosts-and-managers-to-your-event (undated)
15. Cloning Events, https://help.luma.com/p/cloning-events (undated)
16. Check In Guests for In-Person Events, https://help.luma.com/p/check-in-guests-for-in-person-events (undated)
17. Update to Reminders on Luma, https://help.luma.com/p/update-to-reminders-on-luma (undated)
18. Accessibility, https://help.luma.com/p/accessibility (undated)
19. Luma reviews summary, Ticket Tailor, https://www.tickettailor.com/blog/luma-reviews-summary-pros-cons (competitor blog, undated, via search snippet only)

Not substantiated: independent accessibility audit or user complaints; "complex" complaints from real users (no Reddit/forum access found); default date/duration; guest list visibility, +1s, edit/cancel notifications; Android app review data; event feature launch date.
