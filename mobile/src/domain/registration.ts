export const registrationInterests = [
  "Outdoors",
  "Food & drink",
  "Arts & creativity",
  "Relaxation",
  "Learning",
  "Time with friends",
] as const;
export type RegistrationDetails = {
  name: string;
  birthDate: string;
  phone: string;
  city: string;
  interests: string[];
};
export const emptyRegistration: RegistrationDetails = {
  name: "",
  birthDate: "",
  phone: "",
  city: "",
  interests: [],
};
export function validateDetails(
  value: RegistrationDetails,
  now = new Date(),
): string | null {
  if (!value.name.trim() || value.name.trim().length > 80)
    return "Use a name between 1 and 80 characters.";
  return validateOptionalDetails(value, now);
}
export function validateOptionalDetails(
  value: RegistrationDetails,
  now = new Date(),
): string | null {
  if (value.birthDate) {
    const date = new Date(`${value.birthDate}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value.birthDate ||
      value.birthDate >
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` ||
      date.getUTCFullYear() < 1900
    )
      return "Choose a valid date of birth, from 1900 through today.";
  }
  if (
    value.phone.trim() &&
    !/^\+[1-9]\d{6,14}$/.test(value.phone.replace(/[ ()-]/g, ""))
  )
    return "Include your country code, for example +44 7700 900123.";
  if (value.city.trim().length > 100)
    return "Keep your city to 100 characters or fewer.";
  if (
    value.interests.some(
      (x) => !(registrationInterests as readonly string[]).includes(x),
    )
  )
    return "Choose interests from the list.";
  return null;
}
export function registrationMetadata(value: RegistrationDetails) {
  return {
    display_name: value.name.trim(),
    registration_details: optionalMetadata(value),
  };
}
export function optionalMetadata(value: RegistrationDetails) {
  return {
    birth_date: value.birthDate || null,
    phone: value.phone.replace(/[ ()-]/g, "") || null,
    city: value.city.trim() || null,
    interests: [...new Set(value.interests)].sort(),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function detailsFromMetadata(metadata: unknown): RegistrationDetails {
  const meta = record(metadata),
    details = record(meta.registration_details);
  const string = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    name: string(meta.display_name || meta.full_name || meta.name).slice(0, 80),
    birthDate: string(details.birth_date),
    phone: string(details.phone),
    city: string(details.city),
    interests: Array.isArray(details.interests)
      ? [
          ...new Set(
            details.interests.filter(
              (v): v is string =>
                typeof v === "string" &&
                (registrationInterests as readonly string[]).includes(v),
            ),
          ),
        ].sort()
      : [],
  };
}
// This records only an optional onboarding choice; it is never an access decision.
export function hasReviewedDetails(metadata: unknown): boolean {
  const meta = record(metadata),
    details = record(meta.registration_details);
  return (
    meta.registration_details_version === 1 ||
    ["birth_date", "phone", "city", "interests"].every((key) =>
      Object.prototype.hasOwnProperty.call(details, key),
    )
  );
}
