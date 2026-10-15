import test from "node:test";
import assert from "node:assert/strict";
import {
  againConflict,
  againDraft,
  BLANK_DRAFT_BASELINE,
  cardChips,
  cardLabel,
  coverNotice,
  dateBadgeParts,
  draftRoute,
  groupPlans,
  guestArea,
  guestGroups,
  mapsUrl,
  responseText,
  reviewLabels,
  spokenWhen,
  timeText,
} from "./eventView.ts";
import type { Plan } from "./plans.ts";

function inZone<T>(zone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test("date badge, start time and the one label a card reads as", () =>
  inZone("Europe/London", () => {
    const now = new Date("2026-10-07T12:00:00+01:00");
    const start = new Date(2099, 9, 10, 10, 0).toISOString();
    assert.deepEqual(dateBadgeParts(start), { weekday: "SAT", day: "10" });
    assert.equal(dateBadgeParts(null), null);
    assert.equal(timeText(start), "10:00");
    assert.equal(timeText(null), "");
    assert.equal(
      cardLabel({ title: "Picnic in the park", startsAt: start, place: "Riverside park", chips: ["Hosting", "3 going"] }, now),
      "Picnic in the park, Saturday 10 October 2099 at 10:00, Riverside park, Hosting, 3 going",
    );
    assert.equal(cardLabel({ title: " ", startsAt: null, place: "", chips: [] }, now), "Your resbite, date not set");
  }));

test("card chips: Cancelled, then the role, then guests or the invitee's answer", () => {
  assert.deepEqual(cardChips({ owner: true, status: "active", going: 0 }), ["Hosting"]);
  assert.deepEqual(cardChips({ owner: true, status: "active", going: 2 }), ["Hosting", "2 going"]);
  assert.deepEqual(cardChips({ owner: false, status: "active", response: "accepted" }), ["Invited", "Going"]);
  assert.deepEqual(cardChips({ owner: false, status: "active", response: "pending" }), ["Invited", "Not answered"]);
  assert.deepEqual(cardChips({ owner: false, status: "active", response: "withdrawn" }), ["Invited", "Can’t go now"]);
  assert.deepEqual(cardChips({ owner: true, status: "cancelled", going: 3 }), ["Cancelled", "Hosting"]);
  assert.equal(responseText("declined"), "Can’t go");
  assert.equal(responseText(undefined), "Not answered");
});

test("Review parts read as full phrases and say when something is missing", () =>
  inZone("Europe/London", () => {
    const now = new Date("2026-10-07T12:00:00+01:00");
    assert.deepEqual(
      reviewLabels(
        {
          title: "Garden picnic",
          startsAt: new Date(2026, 9, 10, 10, 0).toISOString(),
          place: "Riverside park",
          categories: ["natural", "community"],
        },
        now,
      ),
      {
        picture: "Edit photo",
        title: "Edit name, Garden picnic",
        date: "Edit date and time, Saturday 10 October at 10:00",
        place: "Edit place, Riverside park",
        chips: "Edit vibe, Natural and Community",
      },
    );
    assert.deepEqual(reviewLabels({ title: " ", startsAt: null, place: "", categories: [] }, now), {
      picture: "Edit photo",
      title: "Edit name, not set",
      date: "Edit date and time, not set",
      place: "Edit place, not set",
      chips: "Edit vibe, not set",
    });
  }));

test("UX3 time ranges: cards and Review read the end when there is one; labels without an end are unchanged", () =>
  inZone("Europe/London", () => {
    const now = new Date("2026-10-07T12:00:00+01:00");
    const start = new Date(2026, 9, 10, 10, 0).toISOString();
    const end = new Date(2026, 9, 10, 12, 0).toISOString();
    const late = new Date(2026, 9, 11, 2, 0).toISOString();
    assert.equal(spokenWhen(start, null, now), "Saturday 10 October at 10:00");
    assert.equal(spokenWhen(start, end, now), "Saturday 10 October, from 10:00 to 12:00");
    assert.equal(spokenWhen(start, late, now), "Saturday 10 October, from 10:00 to 02:00 on Sunday 11 October");
    // An end that isn't after the start is ignored, as on the card.
    assert.equal(spokenWhen(start, start, now), "Saturday 10 October at 10:00");
    assert.equal(spokenWhen(null, end, now), "");
    assert.equal(
      cardLabel({ title: "Picnic", startsAt: start, endsAt: end, place: "Park", chips: ["Hosting"] }, now),
      "Picnic, Saturday 10 October, from 10:00 to 12:00, Park, Hosting",
    );
    assert.equal(
      cardLabel({ title: "Picnic", startsAt: start, endsAt: null, place: "Park", chips: ["Hosting"] }, now),
      "Picnic, Saturday 10 October at 10:00, Park, Hosting",
    );
    assert.equal(
      reviewLabels({ title: "Picnic", startsAt: start, endsAt: end, place: "Park", categories: [] }, now).date,
      "Edit date and time, Saturday 10 October, from 10:00 to 12:00",
    );
  }));

test("Upcoming is active and ahead, soonest first; Past is started or cancelled, latest first", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const plan = (id: string, starts_at: string, status = "active") => ({ id, starts_at, status });
  const { upcoming, past } = groupPlans(
    [
      plan("later", "2026-10-20T10:00:00Z"),
      plan("cancelled-ahead", "2026-10-09T10:00:00Z", "cancelled"),
      plan("soon", "2026-10-08T10:00:00Z"),
      plan("starting-now", "2026-10-07T12:00:00Z"),
      plan("started", "2026-10-07T11:00:00Z"),
      plan("old", "2026-09-01T10:00:00Z"),
    ],
    now,
  );
  assert.deepEqual(upcoming.map((p) => p.id), ["soon", "later"]);
  assert.deepEqual(past.map((p) => p.id), ["cancelled-ahead", "starting-now", "started", "old"]);
});

test("Open in Maps uses saved coordinates, then a typed coordinate pair, else the place name", () => {
  assert.equal(mapsUrl({ place_label: "Fixture café" }), "https://maps.apple.com/?q=Fixture%20caf%C3%A9");
  assert.equal(
    mapsUrl({ place_label: "Riverside park", latitude: 51.5074, longitude: -0.1278 }),
    "https://maps.apple.com/?ll=51.5074,-0.1278&q=Riverside%20park",
  );
  assert.equal(
    mapsUrl({ place_label: "51.50740, -0.12780" }),
    "https://maps.apple.com/?ll=51.50740,-0.12780&q=51.50740%2C%20-0.12780",
  );
  // Out-of-range numbers are a name, not coordinates.
  assert.equal(mapsUrl({ place_label: "95.1, 10.0" }), "https://maps.apple.com/?q=95.1%2C%2010.0");
  assert.equal(mapsUrl({ place_label: "  " }), null);
});

const plan: Plan = {
  id: "p1",
  activity_id: "coffee-together",
  title: "Coffee evening",
  description: "Bring a book",
  categories: ["community", "uplifting"],
  starts_at: "2026-09-01T15:00:00Z",
  time_zone: "UTC",
  place_label: "Fixture café",
  note: "Window table",
  status: "cancelled",
  version: 4,
  owner_id: "u1",
  cover_path: "u1/p1/a.jpg",
  cover_revision: 2,
};
const options = { scope: "u1", requestId: "r1", zone: "Europe/London", now: new Date("2026-10-07T12:00:00Z") };

test("Do this again copies the event text, place, Meeting details, never the date, end, guests, cover or idea", () => {
  const draft = againDraft(plan, options);
  assert.deepEqual(draft, {
    schema: 1,
    scope: "u1",
    key: "new",
    activityId: null,
    requestId: "r1",
    original: null,
    initial: BLANK_DRAFT_BASELINE,
    title: "Coffee evening",
    description: "Bring a book",
    categories: ["community", "uplifting"],
    start: "",
    place: "Fixture café",
    note: "Window table",
    zone: "Europe/London",
    pending: null,
    updatedAt: "2026-10-07T12:00:00.000Z",
  });
  assert.notEqual(draft.categories, plan.categories, "The categories are a copy");
  // The again-draft has text in it, so it is dirty against the all-empty baseline and must be saved or cleared.
  const snapshot = JSON.stringify([draft.title, draft.description, draft.categories, draft.start, draft.place, draft.note]);
  assert.notEqual(snapshot, draft.initial);
});

test("Do this again never replaces an unconfirmed save and asks before replacing a draft", () => {
  const draft = againDraft(plan, options);
  const write = {
    id: "r1",
    activityId: "coffee-together",
    details: {
      title: "Coffee evening",
      description: "",
      categories: plan.categories,
      starts_at: "2099-01-01T10:00:00Z",
      ends_at: null,
      time_zone: "UTC",
      place_label: "Fixture café",
      note: "",
    },
  };
  assert.equal(againConflict([]), "none");
  assert.equal(againConflict([{ ...draft, key: "edit-p1" }, { ...draft, key: "new-coffee-together" }]), "none");
  assert.equal(againConflict([draft]), "replace");
  assert.equal(againConflict([{ ...draft, pending: write }]), "blocked");
});

test("drafts reopen the editor that wrote them", () => {
  assert.deepEqual(draftRoute({ key: "edit-p1", planId: "p1", activityId: "coffee-together" }), { plan: "p1" });
  assert.deepEqual(draftRoute({ key: "new-coffee-together", activityId: "coffee-together" }), { activity: "coffee-together" });
  assert.deepEqual(draftRoute({ key: "new", activityId: "coffee-together" }), {});
  assert.deepEqual(draftRoute({ key: "new", activityId: null }), {});
});

test("cover outcomes keep their action wording", () => {
  assert.equal(
    coverNotice("pending"),
    "Your resbite is saved, but its cover photo hasn’t uploaded yet. Open Edit plan to retry.",
  );
  assert.equal(
    coverNotice("failed"),
    "Your resbite is saved, but its cover photo couldn’t be prepared. Open Edit plan to add it again.",
  );
  assert.equal(coverNotice("saved"), null);
  assert.equal(coverNotice(undefined), null);
  assert.equal(coverNotice(["pending"]), null);
});

test("UX2 answer labels: Maybe; UX3-D7: Can’t go, and Can’t go now after Going", () => {
  assert.equal(responseText("maybe"), "Maybe");
  assert.equal(responseText("withdrawn"), "Can’t go now");
  assert.equal(responseText("declined"), "Can’t go");
  assert.equal(responseText("pending"), "Not answered");
  assert.deepEqual(cardChips({ owner: false, status: "active", response: "maybe" }), ["Invited", "Maybe"]);
});

test("guest area: only the organizer until an invitee answers (UX-P5)", () => {
  const guests = [
    { userId: "me", name: "Fixture", response: "maybe" },
    { userId: "g1", name: "Alex", response: "accepted" },
    { userId: "g2", name: "Bea", response: "pending" },
  ];
  assert.deepEqual(guestArea({ owner: false, response: "pending", organizer: " Jo ", guests: guests.slice(0, 1) }), {
    kind: "hidden",
    organizer: "Jo",
  });
  assert.deepEqual(guestArea({ owner: false, response: null, organizer: null, guests: [] }), {
    kind: "hidden",
    organizer: "Tester",
  });
  assert.deepEqual(guestArea({ owner: false, response: "maybe", organizer: "Jo", guests }), {
    kind: "list",
    names: ["Alex"],
    label: "1 going, 1 maybe",
  });
  assert.deepEqual(guestArea({ owner: false, response: "declined", organizer: "Jo", guests: guests.slice(1) }), {
    kind: "list",
    names: ["Alex"],
    label: "1 going",
  });
  assert.deepEqual(guestArea({ owner: true, response: null, organizer: null, guests: [] }), { kind: "none" });
  assert.deepEqual(guestArea({ owner: true, response: null, organizer: null, guests: guests.slice(2) }), {
    kind: "list",
    names: [],
    label: "0 going",
  });
});

test("guest groups: Going, Maybe, Can’t go, Not answered yet; empty groups hidden", () => {
  assert.deepEqual(
    guestGroups([
      { userId: "a", name: "Ana", response: "pending" },
      { userId: "b", name: "Ben", response: "withdrawn" },
      { userId: "c", name: "Cy", response: "accepted" },
      { userId: "d", name: "Di", response: "declined" },
    ]),
    [
      { title: "Going", guests: [{ userId: "c", name: "Cy", note: null }] },
      {
        title: "Can’t go",
        guests: [
          { userId: "b", name: "Ben", note: "Can’t go now" },
          { userId: "d", name: "Di", note: null },
        ],
      },
      { title: "Not answered yet", guests: [{ userId: "a", name: "Ana", note: null }] },
    ],
  );
  assert.deepEqual(guestGroups([]), []);
});

test("photo descriptions are read with cards and the Review picture; a failed description save is said", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  assert.equal(
    cardLabel({ title: "Picnic", startsAt: null, place: "Park", chips: ["Hosting"], photo: " Two mugs " }, now),
    "Picnic, date not set, Park, Hosting, Photo: Two mugs",
  );
  assert.equal(cardLabel({ title: "Picnic", startsAt: null, place: "Park", chips: [], photo: "  " }, now), "Picnic, date not set, Park");
  const picture = (photo?: string) => reviewLabels({ title: "Picnic", startsAt: null, place: "Park", categories: [], photo }, now).picture;
  assert.equal(picture("Two mugs"), "Edit photo, Two mugs");
  assert.equal(picture(undefined), "Edit photo");
  assert.equal(
    coverNotice("description"),
    "Your resbite is saved, but the photo description didn’t save. Open Edit to add it again.",
  );
});
