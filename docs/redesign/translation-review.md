# Translation review — how a locale stops being a draft

The app ships eleven locales. **None of them has been read by a native
speaker.** They are machine drafts carried forward from earlier phases, which
is why every one of them is marked `STATUS = 'draft'` in its own file and why
the Language sheet shows **Beta** beside it.

Promotion is a deliberate act by the owner, not a side effect of a commit:

1. A native reader works through the checklist for that language below.
2. They fix what sounds wrong, directly in `src/lib/messages/<code>.ts`.
3. `node scripts/verify-locales.mjs` must stay green, and the language's count
   of still-English strings in `docs/redesign/i18n-allowlist.json` must be zero.
4. The owner changes `STATUS` to `'reviewed'` in that file. The Beta tag
   disappears on the next deploy.

`verify-locales.mjs` refuses to accept `reviewed` while English strings remain
in the locale — a beta label on a half-copied dictionary is honest; a
"reviewed" label on one is not.

## Where each language stands today

Measured by `node scripts/verify-locales.mjs` (last run in this commit):

| locale | language | translated | still English |
|---|---|---|---|
| es | Spanish | 725 keys carried | 35 / 725 |
| fr | French | 725 keys carried | 44 / 725 |
| de | German | 725 keys carried | 46 / 725 |
| pt-BR | Portuguese (Brazil) | 725 keys carried | 40 / 725 |
| pt-PT | Portuguese (Portugal) | 23 keys carried (rest inherits pt-BR) | 40 / 725 |
| hi | Hindi | 725 keys carried | 33 / 725 |
| ja | Japanese | 725 keys carried | 33 / 725 |
| zh-Hans | Chinese (Simplified) | 725 keys carried | 31 / 725 |
| zh-Hant | Chinese (Traditional) | 26 keys carried (rest inherits zh-Hans) | 31 / 725 |
| ar | Arabic | 725 keys carried | 33 / 725 |

The "still English" column is the backlog. It is also the allow-list: the gate
fails if a *new* English string appears in a locale, so the number can only go
down. To pay it down, translate a key and delete its line from the allow-list
in the same commit.

## The 25 strings to read before promoting

The same 25 in every language, in the order a reader meets them. They are the
ones that decide whether the app feels written or generated: the front door,
Send, Receive, the empty room, one honest error, and the Language row itself.

## Spanish (`es`)

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | Del teléfono al portátil, o del portátil al teléfono. Sin app que instalar, sin cuenta. Fotos y archivos llegan con calidad original: nada se comprime. Al cerrar la pestaña, desaparece. |
| `home.send` | Send | Enviar |
| `home.receive` | Receive | Recibir |
| `intent.placeholder` | Text, link, or code | Texto, enlace o código |
| `intent.create` | Create room | Crear sala |
| `home.three.heading` | Three things it does. | Hace tres cosas. |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | Abre Enviar en un dispositivo y Recibir en el otro. Un código de seis dígitos los une. |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | Deja un Espacio temporal hasta siete días. El otro dispositivo lo recoge después. |
| `home.small.heading` | Small, and true. | Pequeño, y cierto. |
| `footer.trust` | Free. No account. Works in your browser. | Gratis. Sin cuenta. En tu navegador. |
| `send.title` | Send | Enviar |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | Abre ShareTexts en el otro dispositivo y toca Recibir. |
| `send.roomCode` | Room code | Código de sala |
| `send.validFor` | Valid for {t} | Válido por {t} |
| `send.expired` | Code expired | Código caducado |
| `receive.titleShort` | Receive | Recibir |
| `receive.subtitle` | Enter the code from your other device. | Escribe el código del otro dispositivo. |
| `receive.join` | Join | Unirse |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | Ese código no funcionó. Revisa los dígitos o pide otro. |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | Escribe, pega o suelta lo que quieras: texto, enlaces, fotos, archivos. Va directo al otro dispositivo. |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | Este dispositivo está sin conexión. Conéctate a Wi-Fi o datos e inténtalo de nuevo. |
| `settings.language` | Language | Idioma |
| `settings.languageAutomatic` | Automatic (device language) | Automático (idioma del dispositivo) |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | Abre el menú Compartir y elige «Añadir a pantalla de inicio». Se abre como una app, con un toque. |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.

## French (`fr`)

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | Du téléphone vers l’ordinateur, ou l’inverse. Aucune appli à installer, aucun compte à créer. Photos et fichiers arrivent en qualité originale — rien n’est compressé. Fermez l’onglet, tout disparaît. |
| `home.send` | Send | Envoyer |
| `home.receive` | Receive | Recevoir |
| `intent.placeholder` | Text, link, or code | Texte, lien ou code |
| `intent.create` | Create room | Créer une salle |
| `home.three.heading` | Three things it does. | Trois choses. |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | Ouvrez Envoyer sur un appareil et Recevoir sur l’autre. Un code à six chiffres les relie. |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | Laissez un Espace temporaire jusqu’à sept jours. L’autre appareil le récupère ensuite. |
| `home.small.heading` | Small, and true. | Petit, et vrai. |
| `footer.trust` | Free. No account. Works in your browser. | Gratuit. Sans compte. Dans votre navigateur. |
| `send.title` | Send | Envoyer |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | Ouvrez ShareTexts sur l’autre appareil et touchez Recevoir. |
| `send.roomCode` | Room code | Code de la salle |
| `send.validFor` | Valid for {t} | Valable {t} |
| `send.expired` | Code expired | Code expiré |
| `receive.titleShort` | Receive | Recevoir |
| `receive.subtitle` | Enter the code from your other device. | Saisissez le code de l’autre appareil. |
| `receive.join` | Join | Rejoindre |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | Ce code n’a pas marché. Vérifiez les chiffres ou demandez-en un autre. |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | Tapez, collez ou déposez n’importe quoi — texte, liens, photos, fichiers. Ça va directement sur l’autre appareil. |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | Cet appareil est hors ligne. Reconnectez-vous au Wi-Fi ou aux données, puis réessayez. |
| `settings.language` | Language | Langue |
| `settings.languageAutomatic` | Automatic (device language) | Automatique (langue de l’appareil) |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | Ouvre le menu Partager, puis choisis « Sur l’écran d’accueil ». Ça s’ouvre comme une appli, en un appui. |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.

## German (`de`)

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | Vom Telefon zum Laptop oder umgekehrt. Keine App zum Installieren, kein Konto. Fotos und Dateien kommen in Originalqualität an – nichts wird komprimiert. Schließt du den Tab, ist alles weg. |
| `home.send` | Send | Senden |
| `home.receive` | Receive | Empfangen |
| `intent.placeholder` | Text, link, or code | Text, Link oder Code |
| `intent.create` | Create room | Raum erstellen |
| `home.three.heading` | Three things it does. | Drei Dinge. |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | Öffne Senden auf einem Gerät und Empfangen auf dem anderen. Ein sechsstelliger Code verbindet beide. |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | Lass einen Temporären Space bis zu sieben Tage stehen. Das andere Gerät holt es später ab. |
| `home.small.heading` | Small, and true. | Klein, und wahr. |
| `footer.trust` | Free. No account. Works in your browser. | Kostenlos. Kein Konto. Im Browser. |
| `send.title` | Send | Senden |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | Öffne ShareTexts auf dem anderen Gerät und tippe auf Empfangen. |
| `send.roomCode` | Room code | Raumcode |
| `send.validFor` | Valid for {t} | Gültig {t} |
| `send.expired` | Code expired | Code abgelaufen |
| `receive.titleShort` | Receive | Empfangen |
| `receive.subtitle` | Enter the code from your other device. | Gib den Code vom anderen Gerät ein. |
| `receive.join` | Join | Beitreten |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | Der Code hat nicht funktioniert. Prüfe die Ziffern oder bitte um einen neuen. |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | Tippe, füge ein oder lege etwas ab – Text, Links, Fotos, Dateien. Es geht direkt auf das andere Gerät. |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | Dieses Gerät ist offline. WLAN oder mobile Daten verbinden und erneut versuchen. |
| `settings.language` | Language | Sprache |
| `settings.languageAutomatic` | Automatic (device language) | Automatisch (Sprache des Geräts) |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | Öffne das Teilen-Menü und wähle „Zum Home-Bildschirm“. Es öffnet sich wie eine App, mit einem Tipp. |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.

## Portuguese (Brazil) (`pt-BR`)

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | Do celular para o laptop, ou do laptop para o celular. Sem app para instalar, sem conta para criar. Fotos e arquivos chegam em qualidade original — nada é comprimido. Ao fechar a aba, tudo some. |
| `home.send` | Send | Enviar |
| `home.receive` | Receive | Receber |
| `intent.placeholder` | Text, link, or code | Texto, link ou código |
| `intent.create` | Create room | Criar sala |
| `home.three.heading` | Three things it does. | Três coisas. |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | Abra Enviar em um aparelho e Receber no outro. Um código de seis dígitos liga os dois. |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | Deixe um Espaço temporário por até sete dias. O outro aparelho pega depois. |
| `home.small.heading` | Small, and true. | Pequeno, e verdadeiro. |
| `footer.trust` | Free. No account. Works in your browser. | Grátis. Sem conta. No seu navegador. |
| `send.title` | Send | Enviar |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | Abra o ShareTexts no outro aparelho e toque em Receber. |
| `send.roomCode` | Room code | Código da sala |
| `send.validFor` | Valid for {t} | Válido por {t} |
| `send.expired` | Code expired | Código expirado |
| `receive.titleShort` | Receive | Receber |
| `receive.subtitle` | Enter the code from your other device. | Digite o código do outro aparelho. |
| `receive.join` | Join | Entrar |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | Esse código não funcionou. Confira os dígitos ou peça outro. |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | Digite, cole ou solte qualquer coisa — texto, links, fotos, arquivos. Vai direto para o outro dispositivo. |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | Este dispositivo está offline. Reconecte ao Wi-Fi ou dados móveis e tente de novo. |
| `settings.language` | Language | Idioma |
| `settings.languageAutomatic` | Automatic (device language) | Automático (idioma do aparelho) |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | Abra o menu Compartilhar e escolha “Adicionar à Tela de Início”. Ele abre como um app, num toque. |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.

## Portuguese (Portugal) (`pt-PT`) — inherits `pt-BR`

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | Do telemóvel para o portátil, ou do portátil para o telemóvel. Nada para instalar, nenhuma conta. As fotografias e os ficheiros chegam na qualidade original. |
| `home.send` | Send | Enviar |
| `home.receive` | Receive | Receber |
| `intent.placeholder` | Text, link, or code | Texto, link ou código |
| `intent.create` | Create room | Criar sala |
| `home.three.heading` | Three things it does. | Três coisas. |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | Abra Enviar em um aparelho e Receber no outro. Um código de seis dígitos liga os dois. |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | Deixe um Espaço temporário por até sete dias. O outro aparelho pega depois. |
| `home.small.heading` | Small, and true. | Pequeno, e verdadeiro. |
| `footer.trust` | Free. No account. Works in your browser. | Grátis. Sem conta. No seu navegador. |
| `send.title` | Send | Enviar |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | Abra o ShareTexts no outro aparelho e toque em Receber. |
| `send.roomCode` | Room code | Código da sala |
| `send.validFor` | Valid for {t} | Válido por {t} |
| `send.expired` | Code expired | Código expirado |
| `receive.titleShort` | Receive | Receber |
| `receive.subtitle` | Enter the code from your other device. | Digite o código do outro aparelho. |
| `receive.join` | Join | Entrar |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | Esse código não funcionou. Confira os dígitos ou peça outro. |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | Digite, cole ou solte qualquer coisa — texto, links, fotos, arquivos. Vai direto para o outro dispositivo. |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | Este dispositivo está offline. Reconecte ao Wi-Fi ou dados móveis e tente de novo. |
| `settings.language` | Language | Idioma |
| `settings.languageAutomatic` | Automatic (device language) | Automático (idioma do aparelho) |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | Abra o menu Compartilhar e escolha “Adicionar à Tela de Início”. Ele abre como um app, num toque. |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.

## Hindi (`hi`)

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | फ़ोन से लैपटॉप, या लैपटॉप से फ़ोन। कोई ऐप इंस्टॉल नहीं, कोई खाता नहीं। फ़ोटो और फ़ाइलें मूल गुणवत्ता में पहुँचती हैं — कुछ भी कंप्रेस नहीं होता। टैब बंद करते ही सब खत्म। |
| `home.send` | Send | भेजें |
| `home.receive` | Receive | प्राप्त करें |
| `intent.placeholder` | Text, link, or code | टेक्स्ट, लिंक या कोड |
| `intent.create` | Create room | रूम बनाएं |
| `home.three.heading` | Three things it does. | तीन काम। |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | एक डिवाइस पर भेजें और दूसरे पर प्राप्त करें खोलें। छह अंकों का कोड दोनों को जोड़ता है। |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | सात दिन तक के लिए एक अस्थायी स्पेस छोड़ें। दूसरा डिवाइस बाद में उठा लेता है। |
| `home.small.heading` | Small, and true. | छोटा, और सच। |
| `footer.trust` | Free. No account. Works in your browser. | मुफ़्त। कोई खाता नहीं। आपके ब्राउज़र में। |
| `send.title` | Send | भेजें |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | दूसरे डिवाइस पर ShareTexts खोलें और प्राप्त करें दबाएँ। |
| `send.roomCode` | Room code | रूम कोड |
| `send.validFor` | Valid for {t} | {t} तक मान्य |
| `send.expired` | Code expired | कोड की समय-सीमा खत्म |
| `receive.titleShort` | Receive | प्राप्त करें |
| `receive.subtitle` | Enter the code from your other device. | दूसरे डिवाइस से कोड डालें। |
| `receive.join` | Join | जुड़ें |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | वह कोड काम नहीं आया। अंक जाँचें या नया कोड माँगें। |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | कुछ भी टाइप करें, पेस्ट करें या छोड़ें — टेक्स्ट, लिंक, फ़ोटो, फ़ाइलें। सीधा दूसरे डिवाइस पर पहुँचता है। |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | यह डिवाइस ऑफ़लाइन है। Wi-Fi या डेटा से जुड़ें और फिर से कोशिश करें। |
| `settings.language` | Language | भाषा |
| `settings.languageAutomatic` | Automatic (device language) | स्वचालित (डिवाइस की भाषा) |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | शेयर मेन्यू खोलें और “Add to Home Screen” चुनें। यह ऐप की तरह, एक टैप में खुलता है। |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.

## Japanese (`ja`)

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | スマホからパソコンへ、パソコンからスマホへ。アプリのインストールもアカウント作成も不要。写真もファイルも元の画質のまま届きます — 圧縮は一切なし。タブを閉じれば消えます。 |
| `home.send` | Send | 送信 |
| `home.receive` | Receive | 受信 |
| `intent.placeholder` | Text, link, or code | 文章・リンク・コード |
| `intent.create` | Create room | ルームを作成 |
| `home.three.heading` | Three things it does. | 三つのこと。 |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | 片方で送信、もう片方で受信を開きます。6桁のコードが二台をつなぎます。 |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | 一時スペースを最大7日置いておけます。もう一方の端末が後で受け取れます。 |
| `home.small.heading` | Small, and true. | 小さくて、本当のこと。 |
| `footer.trust` | Free. No account. Works in your browser. | 無料。アカウント不要。ブラウザで動く。 |
| `send.title` | Send | 送信 |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | もう一方の端末で ShareTexts を開き、受信をタップします。 |
| `send.roomCode` | Room code | ルームコード |
| `send.validFor` | Valid for {t} | 残り {t} |
| `send.expired` | Code expired | コードの期限切れ |
| `receive.titleShort` | Receive | 受信 |
| `receive.subtitle` | Enter the code from your other device. | もう一方の端末のコードを入力します。 |
| `receive.join` | Join | 参加 |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | そのコードではつながりませんでした。数字を確認するか、新しいコードをもらってください。 |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | 入力・貼り付け・ドロップしたもの（テキスト、リンク、写真、ファイル）はそのまま相手へ届きます。 |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | このデバイスはオフラインです。Wi-Fi またはモバイルデータに接続してから、もう一度お試しください。 |
| `settings.language` | Language | 言語 |
| `settings.languageAutomatic` | Automatic (device language) | 自動（端末の言語） |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | 共有メニューを開き「ホーム画面に追加」を選びます。アプリのようにワンタップで開きます。 |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.

## Chinese (Simplified) (`zh-Hans`)

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | 手机到电脑，或电脑到手机。无需安装应用，无需注册账号。照片和文件以原始画质到达——不做任何压缩。关闭标签页，一切即消失。 |
| `home.send` | Send | 发送 |
| `home.receive` | Receive | 接收 |
| `intent.placeholder` | Text, link, or code | 文本、链接或代码 |
| `intent.create` | Create room | 创建房间 |
| `home.three.heading` | Three things it does. | 三件事。 |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | 一台设备打开发送，另一台打开接收。六位数字把两台连起来。 |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | 临时空间可以留七天。另一台设备之后再来取。 |
| `home.small.heading` | Small, and true. | 小，但真实。 |
| `footer.trust` | Free. No account. Works in your browser. | 免费。无需账号。在浏览器里运行。 |
| `send.title` | Send | 发送 |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | 在另一台设备上打开 ShareTexts，点接收。 |
| `send.roomCode` | Room code | 房间代码 |
| `send.validFor` | Valid for {t} | 剩余 {t} |
| `send.expired` | Code expired | 代码已过期 |
| `receive.titleShort` | Receive | 接收 |
| `receive.subtitle` | Enter the code from your other device. | 输入另一台设备上的代码。 |
| `receive.join` | Join | 加入 |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | 这个代码没用。检查数字，或要一个新代码。 |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | 输入、粘贴或拖放任何内容——文字、链接、图片、文件，都会直接传到另一台设备。 |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | 此设备已离线。请连接 Wi-Fi 或移动数据后重试。 |
| `settings.language` | Language | 语言 |
| `settings.languageAutomatic` | Automatic (device language) | 自动（设备语言） |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | 打开分享菜单，选择“添加到主屏幕”。它会像应用一样一点即开。 |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.

## Chinese (Traditional) (`zh-Hant`) — inherits `zh-Hans`

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | 手機到電腦，或電腦到手機。無需安裝應用程式，無需註冊帳號。照片與檔案以原始畫質傳送。關閉分頁，一切即消失。 |
| `home.send` | Send | 傳送 |
| `home.receive` | Receive | 接收 |
| `intent.placeholder` | Text, link, or code | 文本、链接或代码 |
| `intent.create` | Create room | 创建房间 |
| `home.three.heading` | Three things it does. | 三件事。 |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | 一台设备打开发送，另一台打开接收。六位数字把两台连起来。 |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | 临时空间可以留七天。另一台设备之后再来取。 |
| `home.small.heading` | Small, and true. | 小，但真实。 |
| `footer.trust` | Free. No account. Works in your browser. | 免费。无需账号。在浏览器里运行。 |
| `send.title` | Send | 发送 |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | 在另一台设备上打开 ShareTexts，点接收。 |
| `send.roomCode` | Room code | 房间代码 |
| `send.validFor` | Valid for {t} | 剩余 {t} |
| `send.expired` | Code expired | 代码已过期 |
| `receive.titleShort` | Receive | 接收 |
| `receive.subtitle` | Enter the code from your other device. | 输入另一台设备上的代码。 |
| `receive.join` | Join | 加入 |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | 这个代码没用。检查数字，或要一个新代码。 |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | 输入、粘贴或拖放任何内容——文字、链接、图片、文件，都会直接传到另一台设备。 |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | 此设备已离线。请连接 Wi-Fi 或移动数据后重试。 |
| `settings.language` | Language | 語言 |
| `settings.languageAutomatic` | Automatic (device language) | 自动（设备语言） |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | 打开分享菜单，选择“添加到主屏幕”。它会像应用一样一点即开。 |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.

## Arabic (`ar`)

Read these out loud. Tick the ones that sound like a person wrote them, and
change the rest. Nothing here has been read by a native speaker yet, which is
exactly why the Language sheet marks this locale **Beta**.

| key | English (source) | shipped |
|---|---|---|
| `home.subtitle` | Photos, links, notes. Phone to laptop, laptop to phone. Nothing to install, no account. | من الهاتف إلى الحاسوب، أو العكس. لا تطبيق للتثبيت ولا حساب للإنشاء. تصل الصور والملفات بجودتها الأصلية — لا ضغط ولا تغيير. وعند إغلاق التبويب، يختفي كل شيء. |
| `home.send` | Send | إرسال |
| `home.receive` | Receive | استقبال |
| `intent.placeholder` | Text, link, or code | نص أو رابط أو رمز |
| `intent.create` | Create room | إنشاء غرفة |
| `home.three.heading` | Three things it does. | ثلاثة أشياء. |
| `home.three.pair.body` | Open Send on one device and Receive on the other. A six-digit code joins them. | افتح «إرسال» على جهاز و«استقبال» على الآخر. رمز من ستة أرقام يجمعهما. |
| `home.three.keep.body` | Leave a Temporary Space for up to seven days. The other device can collect it later. | اترك مساحة مؤقتة حتى سبعة أيام. يأخذها الجهاز الآخر لاحقًا. |
| `home.small.heading` | Small, and true. | صغير، وصحيح. |
| `footer.trust` | Free. No account. Works in your browser. | مجاني. بلا حساب. في متصفحك. |
| `send.title` | Send | إرسال |
| `send.subtitle` | Open ShareTexts on your other device and tap Receive. | افتح ShareTexts على الجهاز الآخر واضغط استقبال. |
| `send.roomCode` | Room code | رمز الغرفة |
| `send.validFor` | Valid for {t} | صالح {t} |
| `send.expired` | Code expired | انتهت صلاحية الرمز |
| `receive.titleShort` | Receive | استقبال |
| `receive.subtitle` | Enter the code from your other device. | أدخل الرمز من الجهاز الآخر. |
| `receive.join` | Join | انضمام |
| `receive.wrongCode` | That code didn't work. Check the digits or ask for a new one. | لم يعمل هذا الرمز. تحقق من الأرقام أو اطلب رمزًا جديدًا. |
| `receive.note` | Codes change every 90 seconds. If yours stops working, ask for a new one. | Codes change every 90 seconds. If yours stops working, ask for a new one. **(still English)** |
| `chat.empty.body` | Type, paste, or drop anything. Text, links, photos, files. It goes straight to the other device. | اكتب أو الصق أو أسقط أي شيء — نص، روابط، صور، ملفات. يصل مباشرة إلى الجهاز الآخر. |
| `err.offline` | This device is offline. Reconnect to Wi-Fi or data, then try again. | هذا الجهاز غير متصل بالإنترنت. اتصل بشبكة Wi-Fi أو بيانات الجوال ثم حاول مجددًا. |
| `settings.language` | Language | اللغة |
| `settings.languageAutomatic` | Automatic (device language) | تلقائي (لغة الجهاز) |
| `install.iosBody` | Open the Share menu, then choose “Add to Home Screen”. It opens like an app, in one tap. | افتح قائمة المشاركة ثم اختر «إضافة إلى الشاشة الرئيسية». يفتح كتطبيق، بلمسة واحدة. |

- [ ] Every sentence sounds like the way a person speaks this language.
- [ ] The six-digit code, the seven-day space and the 1 TB limit are right.
- [ ] No sentence claims more than the English does (look for speed or
      privacy claims the English does not make).
- [ ] Placeholders still read as words: `{name}`, `{count}`, `{t}`.
- [ ] Counts are grammatically right for 1, 2, 5 and 11 (the plural rule
      differs by language; if a form is wrong, add `.one`/`.few`/`.many`
      keys — the engine reads them through Intl.PluralRules).
- [ ] The task-screen labels are single words that name the step (Send,
      Receive, Join, Room), not instructions.
- [ ] Nothing is in Title Case, all caps, or ends with an exclamation mark.
- [ ] Right-to-left (Arabic only): the screenshots in `audit/p6-rtl/` mirror
      correctly and nothing is clipped.
