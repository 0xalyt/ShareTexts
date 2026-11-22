import { productEvent } from './telemetry';

const KEY = 'sharetext.completedItems.v1';
export const COMPLETED_EVENT = 'sharetext:completed-item';
type History = { count: number; ids: string[]; room?: string };
function read(): History {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Number.isSafeInteger(value?.count) && value.count >= 0 && Array.isArray(value.ids)) return value;
  } catch { /* private mode */ }
  return { count: 0, ids: [] };
}
let fallback: History | null = null;
export function completedItemCount(): number { return (fallback ?? read()).count; }

/** Called only when an inbound item is complete or the peer acknowledged
 * our outbound item, never on connection, metadata, or an unfinished send. */
export function noteCompletedItem(id: string, received: boolean, room: string | null): void {
  const history = fallback ?? read();
  if (history.ids.includes(id)) return;
  history.count += 1;
  if (room) history.room = room;
  history.ids = [...history.ids, id].slice(-128);
  try { localStorage.setItem(KEY, JSON.stringify(history)); } catch { fallback = history; }
  if (received) productEvent('product.first_item_received');
  window.dispatchEvent(new Event(COMPLETED_EVENT));
}

export function noteConnectedRoom(room: string): void {
  productEvent('product.connected');
  const previous = (fallback ?? read()).room;
  if (previous && previous !== room) productEvent('product.second_session');
}
