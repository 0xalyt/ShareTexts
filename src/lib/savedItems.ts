/**
 * React bindings for the Saved Items store.
 *
 * The store owns persistence and a cached snapshot; these hooks are the only
 * surface components touch (useSyncExternalStore — no extra state library,
 * no global mutable singleton leaking into components). Every subscriber sees
 * the same snapshot object, so the landing header, the room settings row, the
 * bookmark buttons, and the library can never disagree about what is saved.
 */

import { useSyncExternalStore } from 'react';
import {
  getSavedSnapshot,
  subscribeSavedItems,
  hasSavedItem,
  type SavedSnapshot,
} from './savedStore';

export function useSavedSnapshot(): SavedSnapshot {
  return useSyncExternalStore(subscribeSavedItems, getSavedSnapshot, getSavedSnapshot);
}

/** The saved list, newest first. Reflects PERSISTED state only — a save that
 *  hasn't committed does not appear here, so the UI never lies about it. */
export function useSavedItems() {
  return useSavedSnapshot().items;
}

/** True once this origin key is durably saved. */
export function useIsSaved(originKey: string): boolean {
  return hasSavedItem(useSavedSnapshot().items, originKey);
}

/** Restrained count for the landing-header entry (0 = show nothing). */
export function useSavedCount(): number {
  return useSavedSnapshot().items.length;
}
