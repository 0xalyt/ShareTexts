# Voice changes — P6 STEP 1a

English is the source every locale is drafted from, so the voice pass happens
here first. Each row below is a line that changed in `src/lib/messages/en.ts`
in this commit — the table is generated from `git diff`, so it cannot drift
from the code. Rules: `DESIGN.md` §1 (calm, quick, friendly, honest), §14
(anti-slop), §20 (front-door copy). Enforced by `node scripts/lint-voice.mjs`.

**40 edits.** Before → after:

| key | before | after | why |
|---|---|---|---|
| `app.404.cta` | Go Home | Go home | sentence case — one case convention in the app |
| `compat.body` | ShareTexts needs WebRTC, which this browser blocks or doesn't support. Tor's safest mode and most private blockers do this. Try Firefox, Chrome, Edge, or Brave — or allow WebRTC in your browser's settings. | ShareTexts needs WebRTC, which this browser blocks or doesn't support. Tor's safest mode and most private blockers do this. Try Firefox, Chrome, Edge, or Brave. Or allow WebRTC in your browser settings. | gate: 13-word sentence — split at the advice boundary |
| `app.ended.body.expired` | The connection expired. For privacy, a room can't be reopened — start a new one to continue. | The connection expired. A room can't be reopened. Start a new one. | the reassurance was buried in a dash clause |
| `app.ended.sub` | No account needed, and nothing is kept after the room closes. | No account needed. Nothing is kept after the room closes. | two facts, two sentences |
| `xfer.sentNone` | Couldn’t send — {failed} of {total} failed | Didn't send to {failed} of {total} devices. | the old line said "couldn't send" and "failed" in one breath |
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. No app. No account. No wires. | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | gate: three "no …" clauses — the triad tic the contract names |
| `home.features.space.body` | Hold files up to seven days, even when the other device is away. | Files stay up to seven days, even if that device is away. | gate: 13 words |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days, so the other device can collect it. | Leave a Temporary Space for up to seven days. The other device can collect it later. | gate: 15 words — two sentences instead of a comma splice |
| `home.badge.private` | Private | Encrypted | the badge now says what is true |
| `create.establishing` | Connecting securely… | Connecting… | "securely" was a claim the label cannot prove |
| `err.config` | ShareTexts's connection service isn't set up on this site. The site owner needs to fix this. | This site has no connection service set up. The site owner needs to fix this. | names the missing thing instead of "ShareTexts's connection service" |
| `err.p2p` | Couldn't connect directly. Try a different network, or use a code or link instead. | Couldn't connect directly. Try another network, or use a code or link. | shorter, and the fallback is the point |
| `conn.readyBody` | Send text, photos, or files from either device — they arrive instantly, in original quality. | Send text, photos, or files from either device. They arrive in original quality. | gate: banned "instantly" (the speed claim has no measurement) + 14 words |
| `conn.guidance.1s` | text lands instantly | text lands as typed | gate: banned "instantly" |
| `room.step.3` | Connect both — and you're ready to send. | Connect both. Then you're ready to send. | an em-dash splice becomes two sentences |
| `qr.scan.typeCode` | Camera not opening? Type the code instead | Camera not opening? Type the code. | cut the "instead" that repeated the question |
| `details.secure` | Secure connection | Encrypted connection | names the guarantee we actually make: in transit |
| `chat.empty.body` | Type, paste, or drop anything — text, links, photos, files. It goes straight to the other device. | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | the aside was doing the work of a sentence |
| `chat.suggest.hi` | Say hi 👋 | Say hello | gate: emoji in copy — §7 says emoji are reactions, not decoration |
| `chat.copyAll` | Copy All | Copy all | sentence case |
| `chat.drop.subtitle` | Files will be sent instantly | Files go over as they are | gate: banned "instantly" |
| `attach.largeImage` | {name} is over 100 MB, so it arrives as a file without a preview. Original quality, byte for byte. | {name} is over 100 MB. It arrives as a file, without a preview. Original quality. | dropped "byte for byte" jargon; the promise stayed |
| `attach.tooLarge` | This file is too large even for ShareTexts (the limit is 1 TB). Split it and send the parts one by one. | The limit is 1 TB. Split the file and send the parts one by one. | the limit first — that is what the reader needs |
| `composer.placeholder` | Drop anything — text, link, photo, file… | Drop anything. Text, link, photo, file… | the dash pause becomes a full stop |
| `composer.teach` | Type, paste, or drop a file — everything lands on the other device | Type, paste, or drop a file. Everything lands on the other device. | one thought per sentence |
| `msg.verifiedTitle` | Checked against the original — nothing was altered | Checked against the original. Nothing was altered. | two claims, two sentences |
| `composer.largePayload` | Large text — it will arrive in parts | Large text. It arrives in parts. | an em-dash pause becomes two sentences |
| `stay.title` | Stay Connected | Stay connected | sentence case |
| `nearby.failBody` | Make sure ShareTexts is open on your other device, or use a QR code instead. | Check ShareTexts is open on the other device. Or use a QR code. | gate: 14 words — one instruction per sentence |
| `nearby.why5` | Or connect with a code, QR, or link instead — that always works. | Or use a code, QR, or link instead. | cut "that always works" — nothing always works |
| `chat.empty.dest` | Everything here lands on {name} — instantly, in original quality. | Everything here lands on {name}, in original quality. | gate: banned "instantly" |
| `chat.empty.kinds` | TEXT · LINKS · PHOTOS · FILES | Text · links · photos · files | all-caps is shouting — the contract voice never shouts |
| `nearby.overlay.connect` | Connect with this device? | Connect to this device? | matches the button that follows (Yes) |
| `settings.reconnectHint` | The connection recovers on its own. This forces a reconnect now. | The connection recovers on its own. This forces one now. | cut the second "reconnect" in one sentence |
| `space.errTitle` | Something went wrong | That didn't work. | "Something went wrong" says nothing |
| `space.codeShareHint` | Tell the code to whoever should join — they enter it on their device. Codes close with the space. | Tell the code to whoever should join. They enter it on their device. Codes close with the space. | gate: 13 words — three short sentences |
| `demo.s5` | Device to device. No upload. | Device to device when it can be. | "No upload" is not true for relayed transfers |
| `demo.title` | How ShareTexts works — the demo, step by step | The ShareTexts demo, step by step | the aside moved into the noun where it belongs |
| `install.body` | Add it to your device like an app — one tap from the home screen. No store, no account. | Add it to your device like an app. One tap from the home screen. No store, no account. | gate: 14 words — one idea per sentence |
| `saved.emptyBody` | Save a text, link, photo or file from any sharing session, and it will be here on this device. | Save a text, link, photo or file while sharing. It stays on this device. | gate: 18 words — cut "any sharing session" |

## Words that are gone, and stay gone

- **"instantly"** — the product has no delivery-latency measurement
  (`docs/redesign/claims.md` #13), so the word is banned until one exists.
- **"securely" / "Private" as a badge** — the honest claim is *encrypted in
  transit*; the badge and the details row now say that.
- **"No upload"** in the demo — relayed transfers do pass through the server.
- **"Something went wrong"** — replaced wherever it appeared as a dead end.

## What was deliberately left alone

- `home.subtitle` lost its third "no" clause but kept the three-beat rhythm:
  the rule targets the habit, not the number three.
- `details.encryptedNote` keeps "Encrypted in transit. Gone when the room
  closes." — both halves are provable and both sentences are short.
- Task-screen labels stay one word (Send, Receive, Join, Room): they name a
  step, not an instruction. A verb there would be an instruction and a second
  primary action.

## The gate

| rule | threshold | why |
|---|---|---|
| banned words | fixed list of 40 | marketing filler, unprovable promises, corporate distance |
| exclamation marks | zero | §1 calm |
| sentence length | 12 words | §20 copy rule |
| "No X, no Y, no Z" | fewer than 3 clauses | the tic the contract names |
| emoji in copy | zero | §7 — emoji are reactions |
| placeholder balance | every `{` closed | a lost placeholder is a broken sentence in 20 languages |

Escape hatch: `// voice-ok: <reason>`, printed on every run so the list cannot
grow quietly. No string uses it today.
