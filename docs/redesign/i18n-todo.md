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

### P3 Step 3–4 — connect moment and Settings

| key | English placeholder | where |
| --- | --- | --- |
| `connect.linking` | Connecting… | the beat's label while the link is drawn |
| `connect.sameNetwork` | Same network | resolved route, direct local link |
| `connect.throughShareTexts` | Through ShareTexts | resolved route, relayed link |
| `settings.title` | Settings | sheet heading and the gear's accessible name |
| `settings.device` | Device | group heading |
| `settings.deviceName` | Device name | inline edit row |
| `settings.appearance` | Appearance | group heading |
| `settings.themeLight` / `settings.themeAuto` / `settings.themeDark` | Light / Auto / Dark | the three segments |
| `settings.reduceTransparency` | Reduce transparency | switch; sets `html.no-glass` + `sharetext.noGlass` |
| `settings.language` | Language | group heading and the list's label |
| `settings.languageAutomatic` | Automatic (device language) | first row; clears `sharetext.locale` |
| `settings.feedback` | Feedback | group heading |
| `settings.haptics` | Haptics | switch, `sharetext.haptics` |
| `settings.hapticsHint` | Vibrates for connect and error. Android only. | helper under the switch |
| `settings.nearby` | Nearby | group heading |
| `settings.nearbyVisible` | Nearby visibility | switch, shares the Nearby sheet's state |
| `settings.autoConnect` | Auto-connect | switch, `sharetext.autoConnect.v1` |
| `settings.autoConnectHint` | Asks to connect when another device is available. | helper |
| `settings.about` | About | group heading |
| `settings.version` | Version | build marker row |

| `qr.art.label` | QR code to join this room | `aria-label` on the drawn QR (Send tab, room overlay, Space join) |

All eight locales carry the English placeholder; see the header rule — none of
these are translated yet, and the language list itself shows each language in
its own name, which needs no translation.

## P5 — front door copy (English placeholder in all eight locales)

These keys were added or corrected for the landing (DESIGN.md §20). English is
the source; the other eight dictionaries carry the English sentence until a
translator replaces it. `home.faq.a5` also lost an untrue sentence ("stores no
files, text, or history" — a Temporary Space stores files for up to seven days).

- `footer.github`
- `footer.language`
- `footer.madeBy`
- `footer.trust`
- `home.faq.a1`
- `home.faq.a2`
- `home.faq.a3`
- `home.faq.a4`
- `home.faq.a5`
- `home.faq.a6`
- `home.faq.a7`
- `home.faq.a8`
- `home.faq.q6`
- `home.faq.q7`
- `home.faq.q8`
- `home.small.browser`
- `home.small.dark`
- `home.small.eyebrow`
- `home.small.free`
- `home.small.heading`
- `home.small.install`
- `home.small.language`
- `home.small.nearby`
- `home.small.open`
- `home.small.pair`
- `home.three.eyebrow`
- `home.three.heading`
- `home.three.keep.body`
- `home.three.keep.lead`
- `home.three.pair.body`
- `home.three.pair.lead`
- `home.three.send.body`
- `home.three.send.lead`
