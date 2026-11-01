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
