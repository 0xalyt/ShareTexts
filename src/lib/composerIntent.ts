// One local handoff, invalidated by every explicit session teardown.
let generation = 0;
export const composerIntentGeneration = () => generation;

export function discardComposerIntent(roomId?: string | null) {
  generation++;
  const w = window as Window & { __stHomeDropFiles?: File[]; __stPendingIntentText?: string };
  delete w.__stHomeDropFiles;
  delete w.__stPendingIntentText;
  // A deliberate exit also discards the room-owned queue saved for refresh.
  if (roomId) void import('./draftStore').then(m => m.clearDraft(roomId)).catch(() => {});
}
