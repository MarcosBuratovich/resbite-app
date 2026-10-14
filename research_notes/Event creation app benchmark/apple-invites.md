# Apple Invites (benchmark research, accessed 2026-10-07)

Method note: read-only. Apple Support pages were read via the en-az regional copy of the Invites guide (same content as other regions; the US URL 404ed). Mentions of version numbers and dates are from press coverage, not Apple release notes (App Store listing not fetched). Items marked **Inference** are mine.

## 1. Snapshot
- Apple Invites: free iPhone app (iOS 18+) plus web at icloud.com/invites, for gatherings of friends and family. Announced and released 4 Feb 2025 [1][2]. Positioned as Evite/Partiful-like, not for business meetings [3][11]. No native iPad/Mac app found (one source, pre-dating later updates) [10].
- Pricing: download free. **Creating** events needs iCloud+ (from US$0.99/month, 50GB). **Responding** is free for anyone, with no Apple Account or Apple device needed [1][2][4]. Apple Music playlists need a subscription; Image Playground needs Apple Intelligence hardware (iPhone 15 Pro or later) [1].
- Update timeline (press): Sep 2025 Liquid Glass redesign, calendar sync, in-app video playback [8]; 1.8 manual guest-list edit, event time zone, adults/kids counts, countdown widget [10]; 11 Mar 2026 widget "Next Upcoming" [9]; 23 Jun 2026 co-hosting, new backgrounds, guest list can be shown to all attendees [7]; Jul 2026 emoji reactions to replies and confetti [10]; v1.12 (about early Oct 2026) full-resolution Shared Albums that non-Apple guests can join and add to, photorealistic Image Playground backgrounds, one-tap email verification link instead of a code [6].

## 2. Creation flow, step by step (iPhone, Apple Support [4])
1. Tap New Event (top right). **Every detail is optional** (the guide says "any of these"). Fields appear on one scrolling canvas that is the invitation itself.
2. Background image: photo library, take a photo, or emoji, photographic or colour backgrounds from a gallery; Image Playground if Apple Intelligence is on. Editable via Edit Background.
3. Title with a choice of font style.
4. Date and time, time zone, end time, all-day.
5. Location: search or suggestion, optional custom name. Apple Maps info and a weather forecast (if a date is set) are added automatically.
6. Event details: description, editable host name.
7. Shared album (Create Album, name it); Link (URL, optional title and description); Shared playlist (library, public or new; collaborative toggle; Apple Music subscription needed).
8. Tap **Preview**, then Next. Exit then Save Event saves a draft.
9. Event Settings, then invite guests (see section 4).
- Web flow is the same but background comes from iCloud Photos or an upload; web sign-in with Apple Account required for hosts [4].
- Minimal event: **Inference**, roughly 3 to 4 taps (New Event, title, Preview, Next) since nothing is required; drafts exist.
- Children under 13 cannot create events (age varies by region) [4].

## 3. Event data model
- Title (+ font style), background image (+ **background image description for screen-reader users**), start, end, time zone, all-day, location (Apple Maps place + custom name), host name, description, link (URL/title/description), shared album, shared playlist (collaborative option) [4][5].
- Settings [5]: Additional Guests (number of extras each guest may bring), Specify Number of Kids, Show Who's Invited (default: guests see the list only after replying; since Jun 2026 hosts can show it to all attendees [7]), Approve Guests, Remove Background Preview (limit the image to verified-email or private-link viewers), Duplicate Event (guests do not carry over), Cancel/Restore, Delete.
- Co-hosts: up to five; can edit details, invite guests, edit links; cannot delete the event, add co-hosts, playlists or albums. A person must have replied before being made co-host [12].
- Not found: recurrence, capacity/waitlist, cost, RSVP deadline, registration questions, custom slugs, online-meeting link type (a generic Link field exists).

## 4. Sharing and invitations
- Invite with link (Copy or Share Link), invite a contact (one at a time; generates a personal link), or New Guest by name [13]. Share the invitation as an image. In Messages, the "+" apps drawer has Invites. Review criticism: sending individually is "more laborious than expected" [3].
- Anyone with the link can view and join; **Approve Guests** applies only to people arriving through the public link; individually invited guests join automatically. Deny blocks the person from re-requesting; Unblock plus resending the link re-invites [14].
- Non-users: open the link on the web, verify by email code (v1.12: tap a link in the email instead) or sign in with Apple Account. Without an Apple Account, they can RSVP but could not add to the shared album/playlist as of the Support page [15]; v1.12 reportedly opens full-resolution albums to non-Apple guests [6]. Forum anecdotes say some non-Apple guests found sign-in a barrier [16] (anecdotal).
- Guests not responding via link will not appear in tracking [16].

## 5. RSVP and guest experience
- Options: **Going, Not Going, Maybe**, plus optional note visible to host and other guests; Send Reply [15]. Host statuses add Not Responded [13]. Guests can edit display name and profile picture or initials [15]. Guests may leave the event, or report it [1].
- Additional adults/kids are declared by guest within host limits [5][10]. (The Support RSVP page itself does not mention counts: **Inference** it was documented later in settings.)
- Hosts can edit a guest's reply or additional guests, and remove guests (guest gets a notification) [17].
- Guest list visible only after replying by default [5]; emoji reactions to replies (Jul 2026) [10].
- Host can post a **Note** visible to all guests, for changes or reminders [18].
- Directions via Maps, forecast via Weather, shared album and playlist on the invite [2].
- Calendar: Calendar Sync (Sync All Events, choose a calendar) in app settings [19]. Home Screen countdown widget [9].
- Cancel: event shows crossed-out title, RSVP closed, guests notified automatically, restorable. Delete: guests notified, no recovery; album and playlist remain [20].
- Calendar relation: Apple Calendar's own invitations (iCloud/Exchange invitees) are meeting-style Accept/Maybe/Decline invites; Invites is the social layer and syncs into Calendar (above). Calendar-based invitations were not researched in depth here.

## 6. Organizer management
Edit event after sending, Manage Guests (resend, allow guest to invite others, change reply, remove), approve/deny, co-hosts, notes, duplicate, cancel/restore/delete, event drafts [4][5][12][13][14][17]. No analytics or check-in found.

## 7. Notifications and reminders
- Push and email toggles per app; "changes to events you host or attend" [19]. Guests notified on cancel, delete, reply change, removal [17][20]. Support page lists no reminder timing; no host-configurable reminder to guests found (**gap, not substantiated either way**). Note is the only host-to-guest broadcast.

## 8. Accessibility and usability
- Documented: a per-event **Background Image Description** setting for screen readers [5]. This is the only Invites-specific accessibility feature found. Apple's page or press on VoiceOver and Dynamic Type for Invites: **not found**, so not substantiated. Text legibility over photo backgrounds: no review found; **Inference** risk exists because title sits on user photos, and Apple's own font styles are the only text control.
- Reception: "perfectly nice" but doubts about a standalone app [3]; iCloud+ gate read as services-revenue push [21][22]; Partiful pointed to cross-platform and simpler confirmation, Apple has albums/playlists [21]; forum complaints about non-Apple guests [16]. "Why is this a separate app" appeared as skepticism (Clips comparison) [3].
- Complexity: low (single canvas, all optional) but individual invite sending is tedious [3].

## 9. Distinctive UI patterns
- The editor is the invitation: WYSIWYG canvas with background filling the screen, then an explicit Preview step.
- Everything optional, nothing required, with draft saving.
- Auto-enrichment: location adds map and weather without extra steps.
- Per-guest personal links vs one public link, with approval only on the public link.
- Guest list hidden until you reply; the host can change it.
- Add-ons are attachments: album, playlist, link.
- Share the invite as a rendered image or from Messages' app drawer.
- Host Note as a single announcement channel; emoji reactions on replies.
- Privacy toggle to hide background preview in link unfurls.
- Alt-text field for the background image.

## 10. Ideas for Resbite
1. **Adopt**: per-event alt-text for cover photo (Apple does it). S. Fits accessibility principle; cover photo already exists.
2. **Adopt**: Show Who's Invited toggle defaulting to "after replying"; fits privacy-first. M. Needs guest list UI.
3. **Adapt**: explicit Preview step showing the invitation as invitees see it (not a full-screen photo canvas). S/M. Helps organisers check before sharing.
4. **Adapt**: host Note to all guests for changes/reminders, simpler than chat. M. Needs notifications on.
5. **Adapt**: personal invite links per guest plus optional approval; Resbite already has tokens and email-restricted links. M. Approval needs B1.
6. **Adopt**: cancel with restore (crossed-out title, RSVP closed) rather than delete only. S/M.
7. **Adapt**: Maybe response (Resbite has accepted/declined/withdrawn); consider "Maybe". S. Product decision.
8. **Adapt**: duplicate event. S.
9. **Avoid**: paid gate on creation and Apple-account-only extras; Resbite is invite-only already.
10. **Avoid**: text over arbitrary photos without a contrast scrim; **Inference** from the lack of legibility evidence. Keep cover photos separate from text.
11. **Adapt**: calendar sync/add-to-calendar on RSVP (Apple has Calendar Sync). M. Listed not built.
12. **Adapt**: cohost cap and narrower co-host powers (cannot delete). L. Later than B1.

## 11. Sources
1. Apple Newsroom, Introducing Apple Invites, 4 Feb 2025: https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/
2. Business Wire copy of Apple press release, 4 Feb 2025: https://www.businesswire.com/news/home/20250203932522/en/
3. Six Colors (Jason Snell), 4 Feb 2025: https://sixcolors.com/link/2025/02/apples-invites-invites-you-to-send-invitations/
4. Apple Support, Create an event: https://support.apple.com/en-az/guide/apple-invites/dev1d1c7cb6b/1.0/ios/1.0
5. Apple Support, Change event settings: https://support.apple.com/en-az/guide/apple-invites/dev7e7cef88f/1.0/ios/1.0
6. MacTrast, v1.12 update, Oct 2026: https://www.mactrast.com/2026/10/apple-invites-app-has-been-updated-adding-three-new-features/amp/
7. MacRumors, co-hosting, 23 Jun 2026: https://www.macrumors.com/2026/06/23/apple-invites-app-gets-co-hosting/
8. AppleInsider, calendar syncing and video playback, 23 Sep 2025 (via search snippet; page 403): https://appleinsider.com/articles/25/09/23/apple-invites-adds-calendar-syncing-and-video-playback
9. MacTrast, 11 Mar 2026: https://www.mactrast.com/2026/03/heres-whats-new-in-apples-update-invites-app/
10. Web search summaries of MacRumors/MacTrast/Cult of Mac update coverage (v1.8, v1.10, iPad/Mac status), 2025-2026; secondary.
11. Wikipedia, Apple Invites (accessed 2026-10-07): https://en.wikipedia.org/wiki/Apple_Invites
12. Apple Support, Add a cohost: https://support.apple.com/en-az/guide/apple-invites/h71m0jnjl5gj/1.0/ios/1.0
13. Apple Support, Invite guests: https://support.apple.com/en-az/guide/apple-invites/dev851dd16db/1.0/ios/1.0
14. Apple Support, Approve or deny RSVP requests: https://support.apple.com/en-az/guide/apple-invites/dev48e9e39e0/1.0/ios/1.0
15. Apple Support, RSVP to an event: https://support.apple.com/en-az/guide/apple-invites/devc9d9cdbd5/1.0/ios/1.0
16. MacRumors forum thread on Invites update (search snippets only, page 403; anecdotal) and iGeeks Blog via search.
17. Apple Support, Manage or remove guests: https://support.apple.com/en-az/guide/apple-invites/p7831yg2q6qn/1.0/ios/1.0
18. Apple Support, Send a note to guests: https://support.apple.com/en-az/guide/apple-invites/deve337623d8/1.0/ios/1.0
19. Apple Support, Change notification settings: https://support.apple.com/en-az/guide/apple-invites/devd1a3c152e/1.0/ios/1.0
20. Apple Support, Cancel or delete an event: https://support.apple.com/en-az/guide/apple-invites/devb73654655/1.0/ios/1.0
21. heise, Partiful comparison, Feb 2025 (via search snippet): https://heise.de/-10270788
22. TidBITS and Alex Reviews Tech on iCloud+ gating (via search snippets), Feb 2025.
