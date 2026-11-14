import type { Attachment, ChatMessage } from '../types';

/**
 * One vocabulary for "where is this thing?" — M1 STEP 1, consumed by M2.
 *
 * Before this module the answer lived in at least four places: `delivered` /
 * `seen` booleans on a message, `delivery === 'failed'`, the attachment
 * `status` union (twelve members, several of them the same idea twice), and the
 * copy in MessageCard. A transcript and a Devices sheet that each invent their
 * own words drift apart on the first change, and the person reading them has no
 * way to know which one is lying.
 *
 * The order is the promise: an item moves forward only.
 *
 *   queued → sending → sent → delivered → seen
 *
 * and may leave that line sideways into `failed`, `paused` or `expired`.
 * `sent` means the packet left this device; `delivered` and `seen` are receipts
 * from the other device and are never guessed.
 */
export type ItemState =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'seen'
  | 'failed'
  | 'paused'
  | 'expired';

/** The i18n key for each state. Existing keys only — no new words invented. */
export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  queued: 'status.waiting',
  sending: 'status.sendingShort',
  sent: 'msg.sent',
  delivered: 'msg.delivered',
  seen: 'msg.seen',
  failed: 'msg.couldNotSend',
  paused: 'status.paused',
  expired: 'status.cancelled',
};

/** Failure-shaped states: the item will not progress without a person. */
export const ITEM_STATE_FAILED: ItemState[] = ['failed', 'expired'];
export function isFailed(state: ItemState): boolean {
  return ITEM_STATE_FAILED.includes(state);
}

/** Still moving: worth showing a progress affordance. */
export function isInFlight(state: ItemState): boolean {
  return state === 'queued' || state === 'sending';
}

type MessageStateInput = Pick<ChatMessage, 'sender' | 'delivery' | 'delivered' | 'seen'> &
  Partial<Pick<ChatMessage, 'textRecipients'>>;

/**
 * The state of a text message, sender side.
 *
 * Multi-recipient sends carry per-device receipts; the message as a whole is
 * only "seen" when every addressed device has seen it, "delivered" when every
 * one has confirmed arrival, and otherwise "sent" — an aggregate that never
 * claims more than the weakest recipient.
 */
export function messageState(msg: MessageStateInput): ItemState {
  if (msg.delivery === 'failed') return 'failed';

  const recipients = msg.textRecipients;
  if (recipients && recipients.length > 0) {
    // Per-recipient states are transport states, not receipts: the weakest
    // one decides, so a fan-out never claims more than its slowest device.
    if (recipients.some((r) => r.state === 'failed')) return 'failed';
    if (recipients.every((r) => r.state === 'sent')) return 'sent';
    if (recipients.some((r) => r.state === 'pending' || r.state === 'waiting')) return 'queued';
    return 'sending';
  }

  if (msg.seen) return 'seen';
  if (msg.delivered) return 'delivered';
  return 'sent';
}

/**
 * The state of an attachment. The transfer machine has twelve statuses because
 * it has twelve things happening; a person needs five.
 *
 * `cancelled` folds into `expired`: both mean this item will not arrive unless
 * a new one is sent, and neither is a fault to apologise for.
 */
export function attachmentState(attachment: { status?: Attachment['status'] }): ItemState {
  switch (attachment.status) {
    case 'draft':
    case 'waiting':
      return 'queued';
    case 'preparing':
    case 'sending':
    case 'receiving':
    case 'resuming':
    case 'restoring':
    case 'interrupted':
      return 'sending';
    case 'paused':
      return 'paused';
    case 'complete':
      return 'sent';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'expired';
    default:
      return 'queued';
  }
}

/**
 * The single state word shown in the thread: only the most recent own message
 * carries one (DESIGN §19). Older own messages speak only when something is
 * wrong — "Waiting" or "Failed — Retry" — because a transcript of twenty
 * receipts is noise, while a transcript that hides a failure is a lie.
 */
export function showsStateWord(state: ItemState, isMostRecentOwn: boolean): boolean {
  if (isMostRecentOwn) return true;
  return isFailed(state) || state === 'queued';
}
