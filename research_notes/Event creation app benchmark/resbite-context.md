# Resbite context for the event-creation benchmark (7 October 2026)

Resbite is a small private-beta iPhone app (Expo/React Native + Supabase) for arranging wellbeing-oriented get-togethers ("resbites") with friends. It is in an owner-only private beta; the next milestone (B1) brings a second tester and real two-person flows (invite, RSVP, edit, cancel, notifications).

## What exists today
- **Create tab:** "Start your own resbite" (blank event) on top; "Or start from an idea" below (11 curated, illustrated ideas with search and category filters). Choosing an idea pre-fills an editable event.
- **Event fields:** required title, date/time and place (zone, place name, optional note, optional coordinates); optional description; one or two of seven wellness categories (Creative, Intellectual, Mindful, Natural, Physical, Community, Uplifting); optional organizer cover photo (JPEG, private storage, signed links).
- **Editor:** one screen with sections; drafts autosave on the device; leaving with unsaved changes prompts to keep a draft; Save creates/updates on the server.
- **Sharing:** the organizer creates an invitation link (random token; optionally restricted to an email). A person who opens it, signs in (approved testers only) and claims it becomes an invitee/attendee.
- **RSVP:** invitee responds accepted / declined / withdrawn; versioned to avoid stale overwrites.
- **Organizer actions:** edit details, cancel the event (invitees are told). One organizer per event.
- **Notifications:** a server outbox exists (invitation claimed → organizer, RSVP → organizer, plan changed/cancelled → invitees) but delivery is still switched off; copy is generic ("You have an update").
- **Not built yet:** guest list UI beyond names/responses, reminders, calendar export, recurring events, capacity/waitlist, co-hosts, comments/chat (sample only), photos after the event, public events, payments.
- **Principles:** privacy-first (events visible only to the organizer and claimed invitees), accessibility matters (Larger Text, VoiceOver, Reduce Motion are acceptance checks), calm/simple UI, small group of friends rather than public audiences.

## The owner's framing
The owner's boss considers **Luma the best** event app but **complex and not very accessible**. The research should identify what makes each app good, what makes it hard to use or inaccessible, and what Resbite should adopt, adapt or avoid.
