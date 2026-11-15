/**
 * limits.ts — every number a Circle mailbox enforces, in one place.
 *
 * These are abuse bounds, not product promises: a circle of real devices will
 * never come near them. They are exported so the Worker, the client and the
 * gate all quote the same numbers instead of drifting apart.
 */
export const CIRCLE_LIMITS = {
  /** One sealed chunk: 1 MiB of ciphertext. */
  chunkBytes: 1024 * 1024,
  /** Chunks per item → 200 MiB sealed per item. */
  chunksPerItem: 200,
  /** Items retained per circle (oldest expire first). */
  itemsPerCircle: 500,
  /** An item leaves the mailbox 30 days after it was sealed. */
  itemTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** Devices per circle. Small on purpose: this is a personal circle. */
  membersPerCircle: 12,
  /** Signed membership-log entries kept. */
  logEntries: 5000,
  /** Outstanding invites. */
  invitesPerCircle: 20,
  /** Invite lifetime (ADR: 10 minutes). */
  inviteTtlMs: 10 * 60 * 1000,
  /** Request clock window. */
  clockSkewMs: 60 * 1000,
  /** Nonce memory (ADR: 5 minutes). */
  nonceWindowMs: 5 * 60 * 1000,
  /** Hard request body cap: one chunk plus headers. */
  bodyBytes: 1024 * 1024 + 8192,
} as const;
