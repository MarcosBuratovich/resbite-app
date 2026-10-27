/**
 * UX2 notification text (spec "Notification wording", UX2-D4). The heading is the event title and the body
 * says what happened and who did it. It never contains the place, the Meeting details, the Note to guests
 * itself, the description or the cover description (UX3). Anything missing or unexpected falls back to the
 * generic text.
 */
export type CopyInput = {
  kind?: string | null;
  detail?: string | null;
  title?: string | null;
  starts_at?: string | null;
  time_zone?: string | null;
  actor_name?: string | null;
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
      return name && said ? `${name} ${said}` : null;
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

export function notificationCopy(input: CopyInput): Copy {
  const title = input.title?.trim();
  const text = title ? body(input) : null;
  return title && text ? { title, body: text } : GENERIC_COPY;
}
