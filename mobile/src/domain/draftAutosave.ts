// Decides what the editor's autosave does with the on-device draft.
// An untouched editor never creates a draft; a draft this session wrote or
// restored is removed once the editor is untouched again; a pending
// (in-flight or unconfirmed) save is always kept.
export type DraftAutosaveAction = "write" | "remove" | "skip";

export function draftAutosaveAction(state: {
  dirty: boolean;
  pending: unknown | null;
  persisted: boolean;
}): DraftAutosaveAction {
  if (state.pending !== null || state.dirty) return "write";
  return state.persisted ? "remove" : "skip";
}
