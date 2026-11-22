// One local handoff, invalidated by every explicit session teardown.
let generation = 0;
export const composerIntentGeneration = () => generation;

export function discardComposerIntent() {
  generation++;
  const w = window as Window & { __stHomeDropFiles?: File[]; __stPendingIntentText?: string };
  delete w.__stHomeDropFiles;
  delete w.__stPendingIntentText;
}
