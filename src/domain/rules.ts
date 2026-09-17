export type Activity = {
  id: string;
  title: string;
  category: string;
  description: string;
  tips: string[];
  durationMinutes: number | null;
  artwork: string;
  sourceIds: string[];
};
export function filterActivities(
  items: Activity[],
  query: string,
  category: string,
): Activity[] {
  const term = query.trim().toLocaleLowerCase();
  return items.filter(
    (x) =>
      (category === "All" || x.category === category) &&
      x.title.toLocaleLowerCase().includes(term),
  );
}
export function validateRegistration(
  email: string,
  password: string,
): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Enter a valid email address.";
  if (password.length < 8)
    return "Use at least 8 characters for your password.";
  return null;
}
export function validatePlan(
  start: string,
  place: string,
  now = Date.now(),
): string | null {
  const date = Date.parse(start);
  if (!Number.isFinite(date) || date <= now)
    return "Choose a date and time in the future.";
  if (!place.trim()) return "Add a meeting place.";
  return null;
}
export function safeAuthCode(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "resbite:" &&
      u.hostname === "auth" &&
      u.pathname === "/callback"
      ? u.searchParams.get("code")
      : null;
  } catch {
    return null;
  }
}
export function motionPolicy(reduce: boolean) {
  return {
    duration: reduce ? 120 : 180,
    pressScale: reduce ? 1 : 0.97,
    enterOffset: reduce ? 0 : 10,
  };
}
