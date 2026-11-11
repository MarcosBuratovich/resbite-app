/**
 * UX2 notification text (spec "Notification wording", UX2-D4). The heading is the event title and the body
 * says what happened and who did it, with two exceptions: admin_added leads with who made you an admin and
 * puts the event title underneath, and the invitation to a repeating resbite's next occurrence reads
 * "<title> is on again" over its time. It never contains the place, the Meeting details, the Note to guests
 * itself, the description or the cover description (UX3). The two chat notices are the one place a person's
 * own words appear (CH-P7): the sender's first name and their message, cut at 120 characters. Anything missing
 * or unexpected falls back to the generic text.
 */
export type CopyInput = {
  kind?: string | null;
  detail?: string | null;
  title?: string | null;
  starts_at?: string | null;
  time_zone?: string | null;
  actor_name?: string | null;
  /** An rsvp's bringer, by first name: "Clara is going · brought by Pedro." Other kinds ignore it. */
  brought_by_name?: string | null;
  /** The message a chat_message or announcement notice is about. Every other kind ignores it. */
  message_body?: string | null;
};
export type Copy = { title: string; body: string };
export const GENERIC_COPY: Copy = Object.freeze({
  title: "Resbite",
  body: "You have an update. Open Resbite to see it.",
});

/** "Sat 17 Oct, 10:00" in the event's own time zone, or null if the time or zone is unusable. */
function eventTime(startsAt: string | null | undefined, zone: string | null | undefined): string | null {
  if (!startsAt || !zone) return null;
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: zone,
    }).format(date);
  } catch {
    return null;
  }
}

function answer(detail: string | null | undefined): string | null {
  switch (detail) {
    case "accepted":
      return "is going.";
    case "maybe":
      return "might come.";
    case "declined":
      return "can’t go.";
    case "withdrawn":
      return "can’t go now.";
    default:
      return null;
  }
}

function body(input: CopyInput): string | null {
  const name = input.actor_name?.trim();
  switch (input.kind) {
    case "rsvp": {
      const said = answer(input.detail);
      if (!name || !said) return null;
      // Circles of trust: the host hears who brought them, before the full stop. A name that ends a sentence itself
      // ("Dr.", "Pedro!") takes no second one, as a title in the connection copy below.
      const bringer = input.brought_by_name?.trim();
      if (!bringer) return `${name} ${said}`;
      return `${name} ${said.slice(0, -1)} · brought by ${bringer}${/[.!?…]$/.test(bringer) ? "" : "."}`;
    }
    case "invitation":
      return name ? `${name} joined from your invite.` : null;
    case "invited":
      return name ? `${name} invited you.` : null;
    case "join_request":
      return name ? `${name} asked to join.` : null;
    case "join_approved":
      return name ? `${name} approved your request.` : null;
    case "plan_cancelled":
      return "This resbite was cancelled.";
    case "guest_note":
      return name ? `${name} posted a note to guests.` : null;
    case "plan_changed": {
      if (input.detail === "place") return "The place changed.";
      const time = eventTime(input.starts_at, input.time_zone);
      if (!time) return null;
      if (input.detail === "time") return `New time: ${time}.`;
      if (input.detail === "time_place") return `New time: ${time}, and a new place.`;
      return null;
    }
    default:
      return null;
  }
}

/** The most of a person's message a chat notice shows, in code points. */
const CHAT_CUT = 120;

/**
 * "<first name>: <words>" for a chat message, "Announcement from <first name>: <words>" for an announcement (CH-P7).
 * The first name is the first word of the name the claim gives (K-N3, rule 8), read as private.first_name reads it
 * for the chat's own lines: every Unicode space splits (JavaScript's \s is the same set), then control characters
 * go. The cut counts code points, not UTF-16 units, so an emoji is never split in half (K-N3).
 */
function chatBody(input: CopyInput): string | null {
  const first = input.actor_name?.trim().split(/\s+/)[0].replace(/\p{Cc}/gu, "");
  const words = input.message_body?.trim();
  if (!first || !words) return null;
  const points = Array.from(words);
  const cut = points.length > CHAT_CUT ? `${points.slice(0, CHAT_CUT).join("")}…` : words;
  return input.kind === "announcement" ? `Announcement from ${first}: ${cut}` : `${first}: ${cut}`;
}

export function notificationCopy(input: CopyInput): Copy {
  const title = input.title?.trim();
  if (input.kind === "chat_message" || input.kind === "announcement") {
    const text = title ? chatBody(input) : null;
    return title && text ? { title, body: text } : GENERIC_COPY;
  }
  // The one notice that leads with who did it: the plan's title is the line underneath.
  if (input.kind === "admin_added")
    return title ? { title: `${input.actor_name?.trim() || "Someone"} made you an admin`, body: title } : GENERIC_COPY;
  // The two connection notices lead with who did it; the title is the resbite the two share.
  if (input.kind === "connection_request" || input.kind === "connection_accepted") {
    const name = input.actor_name?.trim();
    if (!name) return GENERIC_COPY;
    if (input.kind === "connection_accepted")
      return { title: `You and ${name} are now connected`, body: "You can invite each other from Invite people." };
    if (!title) return GENERIC_COPY;
    // The database says how the two stand; with no detail, fall back to the start time.
    const end = /[.!?…]$/.test(title) ? "" : ".";
    const start = input.starts_at ? new Date(input.starts_at).getTime() : NaN;
    let sentence: string;
    switch (input.detail) {
      case "going": sentence = `You're both going to ${title}`; break;
      case "invited": sentence = `You're both invited to ${title}`; break;
      case "were_invited": sentence = `You were both invited to ${title}`; break;
      case "met": sentence = `You were both at ${title}`; break;
      default: sentence = Number.isFinite(start) && start > Date.now() ? `You're both going to ${title}` : `You were both at ${title}`;
    }
    return { title: `${name} wants to connect`, body: sentence + end };
  }
  // The next occurrence of a repeating resbite (CR-P24): the title says it is on again, the body says when.
  if (input.kind === "invited" && input.detail === "again") {
    const time = eventTime(input.starts_at, input.time_zone);
    return title && time ? { title: `${title} is on again`, body: time } : GENERIC_COPY;
  }
  const text = title ? body(input) : null;
  return title && text ? { title, body: text } : GENERIC_COPY;
}
