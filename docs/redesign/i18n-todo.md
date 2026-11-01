# i18n to-do (P2)

New user-visible strings added in P2 live in `src/lib/messages/en.ts` and are
copied into the other eight locales as **English placeholder text**, so the
typecheck is satisfied and nothing falls back silently.

| key | English | why |
|---|---|---|
| `nav.more` | More | the phone header's overflow control (§18: at most 3 controls) |
| `nav.search` | Search | the command/search entry, named where More lists it |
| `nearby.title` | Nearby | the Home row's noun (the status word "Available" is a state, not a name) · P2 |

Translate these three, then delete this table's rows.

## P3 — Send, Receive, connect, Settings

Added in P3, English placeholder in all eight other locales (same rule as
above). Translate these, then delete the rows.

| key | English | why |
|---|---|---|
| `send.title` | Send | the hand-over screen's name (the step, not an instruction) |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | the ONE instruction on the screen |
| `send.roomCode` | Room code | the label above the digits |
| `send.validFor` | Valid for {t} | real remaining time of the code window, m:ss |
| `send.expired` | Code expired | the code window closed and could not be renewed |
| `send.newCode` | New code | the one action when the code expired |
| `send.offline` | Can't reach ShareTexts. Check your connection. | server unreachable, without a blame-y idiom |
| `send.tabsLabel` | How to hand over the code | accessible name of the Code/QR/Link tablist |
| `send.tab.code` | Code | segment label |
| `send.tab.qr` | QR | segment label |
| `send.tab.link` | Link | segment label |
| `send.qrCaption` | Scan this with your other device. | under the QR plate |
| `send.waiting` | Waiting for your other device… | live status while the room waits |
| `send.connecting` | Connecting… | live status once the other device joins |
| `receive.titleShort` | Receive | the join screen's name (the step, not an instruction) |
| `receive.subtitle` | Enter the code from your other device. | the ONE instruction on the screen |
| `receive.join` | Join | the visible primary action, disabled until six digits |
| `receive.joining` | Joining… | the same button, mid-attempt (no spinner, no layout change) |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | the rejection sentence, replacing the server's "Invalid or expired" |

Changed, not added: `receive.note` now says "Codes change every 90 seconds.
If yours stops working, ask for a new one." — the old "every 30 seconds" was
wrong (see B27).
