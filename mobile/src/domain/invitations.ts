export type InvitationSlot = {
  id: string;
  token: string;
  planId: string;
  targetKey: string;
  label: string;
  state: "pending" | "ready" | "revoking" | "revoked";
};
export type InvitationJournal = {
  reserveInvitation: (
    scope: string,
    slot: InvitationSlot,
  ) => Promise<InvitationSlot>;
  setInvitationState: (
    scope: string,
    id: string,
    state: InvitationSlot["state"],
  ) => Promise<void>;
};
export type InvitationGateway = {
  create: (slot: InvitationSlot) => Promise<void>;
  revoke: (id: string) => Promise<void>;
};
export async function prepareInvitation(
  journal: InvitationJournal,
  gateway: InvitationGateway,
  scope: string,
  candidate: InvitationSlot,
  assertCurrent: () => void = () => {},
) {
  if (scope === "preview")
    throw Error("Invitations are disabled in design preview.");
  assertCurrent();
  const slot = await journal.reserveInvitation(scope, candidate);
  assertCurrent();
  if (slot.state === "revoking")
    throw Error("Finish revoking this link before preparing another.");
  await gateway.create(slot);
  assertCurrent();
  await journal.setInvitationState(scope, slot.id, "ready");
  assertCurrent();
  return { ...slot, state: "ready" as const };
}
export async function revokeInvitation(
  journal: InvitationJournal,
  gateway: InvitationGateway,
  scope: string,
  slot: InvitationSlot,
  assertCurrent: () => void = () => {},
) {
  if (scope === "preview")
    throw Error("Invitations are disabled in design preview.");
  assertCurrent();
  if (slot.state !== "ready" && slot.state !== "revoking")
    throw Error("Confirm preparation before revoking this link.");
  // A failed response leaves sharing disabled until revocation can be confirmed.
  await journal.setInvitationState(scope, slot.id, "revoking");
  assertCurrent();
  await gateway.revoke(slot.id);
  assertCurrent();
  await journal.setInvitationState(scope, slot.id, "revoked");
}
