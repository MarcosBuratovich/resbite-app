export type Person = {
  key: string;
  name: string;
  address: string;
  kind: "email" | "phone";
};
export type PeopleGroup = { id: string; name: string; members: Person[] };
export function person(name: string, address: string): Person | null {
  const value = address.trim();
  if (!name.trim()) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    const email = value.toLowerCase();
    return {
      key: `email:${email}`,
      name: name.trim(),
      address: email,
      kind: "email",
    };
  }
  // Keep country prefixes as entered; never guess a country or merge by suffix.
  if (!/^\+?[\d\s().-]+$/.test(value)) return null;
  const phone = value.replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,15}$/.test(phone)) return null;
  return {
    key: `phone:${phone}`,
    name: name.trim(),
    address: phone,
    kind: "phone",
  };
}
export function mergePeople(...lists: Person[][]): Person[] {
  return Array.from(
    new Map(lists.flat().map((p) => [p.key, { ...p }])).values(),
  );
}
export function togglePerson(selected: Person[], p: Person): Person[] {
  return selected.some((x) => x.key === p.key)
    ? selected.filter((x) => x.key !== p.key)
    : mergePeople(selected, [p]);
}
