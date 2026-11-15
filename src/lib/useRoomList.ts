import { useMemo } from 'react';
import type { SessionState } from '../types';

/**
 * useRoomList — the rooms this device is in, as the rail needs them.
 *
 * Today the app holds exactly one room at a time, so this returns one entry.
 * It is a hook, not a literal, because the rail must not hard-code that fact:
 * `hasMultiple` is the honest answer to "should the rail look like a list?",
 * and it is false until the day more than one room really exists. No room
 * codes, no secrets, no names beyond what the room already shows on screen.
 */
export interface RoomListEntry {
  /** Stable key for React; the session id when there is one. */
  id: string;
  /** The name the room already carries on screen. */
  label: string;
  /** 'room' today; kept open for the day a room can hold several. */
  kind: 'room';
  active: boolean;
  connected: boolean;
  messageCount: number;
}

export function useRoomList(session: SessionState & { id?: string }): {
  rooms: RoomListEntry[];
  hasMultiple: boolean;
} {
  const roomId = session.id ?? 'this-room';
  const label = session.partnerName || '';
  const messageCount = session.messages.length;
  const connected = !!session.partnerConnected;

  return useMemo(() => {
    const rooms: RoomListEntry[] = [
      { id: roomId, label, kind: 'room', active: true, connected, messageCount },
    ];
    return { rooms, hasMultiple: rooms.length > 1 };
  }, [roomId, label, connected, messageCount]);
}
