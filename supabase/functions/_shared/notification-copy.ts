/**
 * UX2 notification text (spec "Notification wording", UX2-D4). The heading is the event title and the body
 * says what happened and who did it, with two exceptions: admin_added leads with who made you an admin and
 * puts the event title underneath, and the invitation to a repeating resbite's next occurrence reads
 * "<title> is on again" over its time. It never contains the place, the Meeting details, the Note to guests
 * itself, the description or the cover description (UX3). The two chat notices are the one place a person's
 * own words appear (CH-P7): the sender's first name and their message, each made one clean line and cut (the
 * name at 30 graphemes, the message at 120). Anything missing or unexpected falls back to the generic text.
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

/** The most of a person's message a chat notice shows, and of their first name, in graphemes (K-N3, H3, H18). */
const WORDS_CUT = 120;
const NAME_CUT = 30;
/** Half of a surrogate pair: no font draws it, and it makes the provider's JSON ill-formed. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** Controls (white space aside, which is collapsed first), and the bidi embeddings, overrides and isolates. */
const CONTROLS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;
/**
 * Zero-width and format characters, and the blank fillers that pass for a letter (Hangul, Braille). The joiner
 * (U+200D) is left out: inside a name it holds an emoji together, and senderName removes it only at the ends (H21).
 */
const ZERO_WIDTH = /(?!\u200D)[\p{Cf}\u115F\u1160\u3164\uFFA0\u2800]/gu;
/** All a reader cannot see: white space, controls, zero-width and format characters and Unicode's other ignorables. */
const INVISIBLE = /[\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]/gu;
let segmenter: Intl.Segmenter | undefined;
/**
 * The text's graphemes. Looked up when a cut is made, not when the module loads, so a runtime without Intl.Segmenter
 * still sends every notice; there the cut falls back to code points, which never split a surrogate pair.
 */
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== "function") return Array.from(text);
  segmenter ??= new Intl.Segmenter("en", { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/** One well-formed line: lone surrogates, controls and bidi controls gone, each run of white space one space. */
function oneLine(text: string): string {
  return text.replace(LONE_SURROGATE, "").replace(/\s+/g, " ").replace(CONTROLS, "").replace(/ {2,}/g, " ").trim();
}

/** The first `max` graphemes and "…", with no space before it; whole when it is no longer. */
function cut(text: string, max: number): string {
  const parts = graphemes(text);
  return parts.length > max ? `${parts.slice(0, max).join("").trimEnd()}…` : text;
}

const visible = (text: string) => text.replace(INVISIBLE, "") !== "";

/**
 * The sender as a chat notice names them: the first word of the name the claim gives (K-N3, rule 8), split on every
 * Unicode space as private.first_name splits, with zero-width and format characters removed before the split (so
 * none can hide the name), joiners kept inside it but not at its ends, a trailing ":", "," or ";" dropped, and at
 * most 30 graphemes.
 */
function senderName(name: string | null | undefined): string | null {
  const first = oneLine(name ?? "")
    .replace(ZERO_WIDTH, "")
    .trim()
    .split(" ")[0]
    .replace(/^\u200D+/, "")
    .replace(/[:,;\u200D]+$/, "");
  return visible(first) ? cut(first, NAME_CUT) : null;
}

/**
 * "<first name>: <words>" for a chat message, "Announcement from <first name>: <words>" for an announcement (CH-P7).
 * The words are one clean line cut at 120 graphemes, so no emoji, flag or accent is split (K-N3, H3). Words with
 * nothing visible in them count as none (H18).
 */
function chatBody(input: CopyInput): string | null {
  const first = senderName(input.actor_name);
  const words = oneLine(input.message_body ?? "");
  if (!first || !visible(words)) return null;
  const text = cut(words, WORDS_CUT);
  return input.kind === "announcement" ? `Announcement from ${first}: ${text}` : `${first}: ${text}`;
}

export const REPORT_COPY: Copy = Object.freeze({ title: "Resbite", body: "A new report is waiting." });

export function notificationCopy(input: CopyInput): Copy {
  // A moderator's push says only that a report is waiting: no title, name or text of the report.
  if (input.kind === "report_filed") return { ...REPORT_COPY };
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
