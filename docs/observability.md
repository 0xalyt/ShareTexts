# Launch funnel

The existing free, aggregate event collector also counts these milestones:

| Event | When it counts | Deduplication |
| --- | --- | --- |
| `product.page_view` | The app loads | Once per page load |
| `product.code_shown` | A real room code is displayed | Once per page load |
| `product.connected` | A peer link is healthy, not just a room created | Once per page load |
| `product.first_item_received` | Text arrives or a complete file is assembled | Once per page load |
| `product.second_session` | A device connects to a different room after completing an item in an earlier room | Once per browser installation |

These are aggregate counts, not tracked-person conversion rates. A receiver
can arrive by QR or link without seeing a code, and a returning device can
start at a later milestone. Do not divide these numbers and label the result
a cohort conversion rate. No room IDs, codes, device names, filenames or
content leave the browser in these events; only the fixed event name does.
Clearing browser storage resets the local return-session marker.

# ShareText — Privacy-First Observability

Operational metrics without turning ShareText into a tracking product. The product's
"no tracking" claim stays true: **there is no client-side analytics SDK, no cookies,
no identifiers, and no content ever leaves the browser except encrypted transfer data.**

## What we collect

Anonymous aggregate counters, event-category only. Examples:

`rooms.created` · `rooms.closed:manual_close` · `rooms.closed:idle_timeout` ·
`joins.succeeded` · `joins.failed:invalid_code` · `joins.failed:room_full` ·
`joins.failed:rate_limited` · `joins.failed:session_expired` · `relay.text_messages` ·
`relay.binary_messages`

| Field | What | Why | Where | How long | Who |
|---|---|---|---|---|---|
| Event category | a metric-name string (`rooms.created`) | spot failures + volume | Metrics DO (worker) / in-memory map (Node) | worker: 48 h in hourly buckets; Node: until restart | operators |
| Aggregate totals | summed counts per category | trend + success rates | `/metrics` endpoint | derived on read | operators |
| Lifecycle logs | room/socket id **prefixes**, IP (Node), state | debugging | server stdout | ephemeral (deployment logs) | operators |

## What we deliberately do NOT collect

- message contents, file contents, filenames
- room codes (TOTP), room secrets, session secrets
- room IDs in full, peer IDs
- clipboard history, contact lists, personal identities
- permanent device fingerprints, user agents, browser family
- IP history beyond the Node server's per-request rate-limit bucket
- personal event histories (client milestones are fixed, aggregate names only)

No event payload exists — a metric event is literally `{ name: "rooms.created" }`.
There is no way to correlate a counter with a user, device, or session.

## Where

- **Cloudflare Worker**: `Metrics` Durable Object (`worker/src/metrics.ts`), one
  instance, hourly buckets in SQLite-backed storage, `GET /metrics` on the worker.
  Optional `METRICS_TOKEN` env gates `/metrics` behind a bearer token.
- **Node server**: in-memory counter map + `GET /metrics` (reset on restart,
  documented in the response).

## How to read it

- Session create success: `rooms.created` ≈ expected daily volume.
- Join health: `joins.succeeded` vs. `joins.failed:*` — a spike in `room_full`
  suggests abandoned rooms; `rate_limited` suggests abuse; `invalid_code` is normal
  (typos + probes).
- Relay load: `relay.text_messages` / `relay.binary_messages` — high binary counts
  mean many WebRTC-less sessions (firewalls), a TURN-sizing signal.
- Error categories map 1:1 to the app's machine-readable codes (ROOM_FULL,
  RATE_LIMITED, INVALID_CODE, SESSION_EXPIRED, …), so support conversations and
  dashboards speak the same language.

## Privacy policy note

If/when a public privacy policy is published, the truthful statements are:
"ShareText does not use analytics cookies or tracking scripts", "ShareText keeps
anonymous aggregate usage counters to operate the service", "live-room transfer
contents are encrypted in transit", and "temporary rooms close automatically".
Temporary Spaces retain content for up to seven days; Hop retains encrypted
items for up to 30 days. This inventory is the source of truth for that copy.
