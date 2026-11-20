# Chromium-Build (Chrome und Edge)

> **Status (Stand 2026-11-17): lokale Übernahme abgeschlossen, echte
> Store-Tests ausstehend.** Der frühere Ansatz mit **219** generierten
> `regexFilter`-Regeln ist gescheitert: `isRegexSupported` meldete
> `memoryLimitExceeded`, weil die kompilierten RE2-Ausdrücke das 2-KB-Limit
> überschritten. Diese Regeln werden **nicht mehr gepackt**. Die früher genannten
> Zahlen „0 installierte Regeln“ und „8 von 10 Modelltests“ beschreiben diesen
> alten Stand und sind **keine** Aussage über den aktuellen Ansatz.
>
> Der neue Ansatz arbeitet mit kleinen, settings-abhängigen DNR-**Gate**-Regeln
> pro aktiviertem Marktplatz. Die Regel greift generell auf `/s`-Pfaden des
> Hauptframes, also auch auf Verfeinerungen; ob eine Suche frisch ist, entscheidet
> erst der gemeinsame Kern. Es wird deshalb **nicht** behauptet, nur frische
> Suchen sähen die Gate-Seite. Der Service-Worker validiert die Quelle, berechnet
> das Ziel mit `lib/rewrite.js` und setzt eine exakte, tab-gebundene
> Session-Allow-Regel. Die Gate-Seite ruft danach `location.replace` auf das Ziel
> auf. Pro normalem Gatefall entstehen **zwei** Dokumente: die lokale Gate-Seite
> und die finale Amazon-Ergebnisseite. Bei einem Serverredirect können weitere
> lokale Gate-Dokumente hinzukommen. Ziel ist, **keine doppelte
> Amazon-Ergebnisseite** zu erzeugen; genau ein Dokument wird nicht behauptet.
>
> `webRequest` beobachtet `onBeforeRequest`, `onBeforeRedirect`, `onCompleted`
> und `onErrorOccurred` nur, um einmalige Session-Bypässe zuzuordnen und wieder
> zu entfernen. Es dient **nicht** mehr dazu, einen eigenen DNR-Rewrite zu
> erkennen. Der Guard wird vor der Zielnavigation gespeichert; das logische
> Fenster beträgt 5 Sekunden. Der Zustand (Original- und Ziel-URL, Tab-IDs,
> Zeitstempel, Bypass-IDs) liegt flüchtig im Arbeitsspeicher und in
> `chrome.storage.session`; die Gate-Seite hält Quelle, Zähler und Zeitstempel
> zusätzlich kurz in tabbezogenem `sessionStorage`. **Keine URL** landet in
> `storage.sync`. Der Sessionzustand ist nicht auf den Arbeitsspeicher des
> Workers beschränkt. Die Gate-Quelle steht temporär im lokalen URL-Fragment der
> Gate-Seite. Die Bypass-TTL beträgt 15 Sekunden als Best Effort. Timer- und
> Alarm-Bereinigung sind vorgesehen, garantieren aber keine exakte Löschung. Bei
> einem Browserneustart löscht der Browser `chrome.storage.session`; tabbezogenes
> `sessionStorage` folgt der Sitzungsverwaltung des Browsers, eine
> Wiederherstellung ist nicht pauschal auszuschließen. Die Gate-Seite wird ohne
> Referrer geladen.
>
> **Prüfstand:** `node --test tests/chromium.test.cjs` ist 18/18 grün
> (Kern-Parität für 19 Märkte, lange URL über 9000 Zeichen, Fehlerpfade,
> deterministische Regression für gecachte Einstellungen nach Ausschalten).
> Beide Builds enthalten 20 Einträge; 17 Firefox-Dateien sind SHA256-unverändert,
> Runtime und gemeinsamer Core beider Pakete sind bytegleich zu ihren Quelldateien. Das unveränderte gebaute Chrome-Paket in
> einem frischen Playwright-Chromium-156.0.8078.4-Profil meldet 19/19
> Gate-Regeln unterstützt und installiert, das Badge bleibt leer. Eine separat
> abgeleitete Loopback-Testkopie mit bytegleichem Shared Core und nur
> angepasstem Origin, Regeln und Zielprüfung besteht 47/47 Browsermatrix (45
> Fälle, darunter 3 Fälle global/neither/markets-off ohne Gate und eine URL mit
> 9000 Zeichen), 6/6 Grenzfälle sowie echten Worker-Stopp/Restart,
> Tab-Isolation, Tab-Schließen und Guard-Ablauf. Die Session-Allow-Regeln sind
> nach den Tests leer. Es gab keine Amazon-Anfragen und keinen Test im
> gebrandeten Google Chrome oder Edge. Die Store-Pakete bleiben **gesperrt**.
> Offen sind außerdem Storegrafiken, die öffentliche Datenschutz-URL nach einem
> Push und die Verantwortlichendaten. Kein Upload, keine Einreichung.
>
> **Status (as of 2026-11-17): local takeover complete, real store tests
> pending.** The earlier approach with **219** generated `regexFilter` rules
> failed: `isRegexSupported` reported `memoryLimitExceeded` because the compiled
> RE2 expressions exceeded the 2 KB limit. Those rules are **no longer
> packaged**. The earlier figures “0 installed rules” and “8 of 10 model tests”
> describe that old state and are **not** a statement about the current
> approach.
>
> The new approach uses small, settings-driven DNR **gate** rules per enabled
> marketplace. The rule applies to `/s` paths in the main frame in general,
> including refinements; whether a search is fresh is decided by the shared core.
> It is therefore **not** claimed that only fresh searches see the gate page. The
> service worker validates the source, computes the target with `lib/rewrite.js`
> and installs an exact, tab-scoped session allow rule. The gate page then calls
> `location.replace` to the target. A normal gate case produces **two**
> documents: the local gate page and the final Amazon results page. A server
> redirect can add further local gate documents. The goal is to avoid a
> **duplicate Amazon results page**; exactly one document is not claimed.
>
> `webRequest` observes `onBeforeRequest`, `onBeforeRedirect`, `onCompleted` and
> `onErrorOccurred` only to map and remove one-time session bypasses. It is **no
> longer** used to detect the extension's own DNR rewrite. The guard is stored
> before the target navigation; the logical window is 5 seconds. State (original
> and target URLs, tab IDs, timestamps, bypass IDs) is transient in memory and
> in `chrome.storage.session`; the gate page also keeps source, counter and
> timestamp briefly in tab-scoped `sessionStorage`. **No URL** enters
> `storage.sync`. Session state is not confined to worker memory. The gate source
> sits temporarily in the local URL fragment of the gate page. The bypass TTL
> is 15 seconds as best effort. Timer and alarm cleanup are intended but do not
> guarantee exact deletion. On a browser restart the browser clears
> `chrome.storage.session`; tab-scoped `sessionStorage` follows the browser's
> session management, so restoration cannot be ruled out across the board. The
> gate page is loaded without a referrer.
>
> **Verification:** `node --test tests/chromium.test.cjs` is 18/18 green (core
> parity for 19 marketplaces, a URL over 9000 characters, error paths, and a
> deterministic regression for cached settings after switching off). Both
> builds contain 20 entries; 17 Firefox files are SHA256-unchanged and both
> packages contain runtime and shared-core files byte-identical to their sources. The unchanged built Chrome package
> in a fresh Playwright Chromium 156.0.8078.4 profile reports 19/19 gate rules
> supported and installed with an empty badge. A separately derived loopback test
> copy with a byte-identical shared core and only origin, rules and target check
> adapted passes 47/47 browser matrix (45 cases, including 3 global/neither/
> markets-off cases without a gate and a 9000-character URL), 6/6 limit cases,
> plus real worker stop/restart, tab isolation, tab close and guard expiry. The
> session allow rules are empty after the tests. There were no Amazon requests
> and no test in branded Google Chrome or Edge. The store packages stay
> **blocked**. Store graphics, the public privacy URL after a push and the
> controller details are still open. No upload, no submission.

Baut aus den Firefox-Quellen zwei separate Store-Pakete für Chromium. Die
Firefox-Dateien (`manifest.json`, `background/`, `content/`) bleiben unverändert.

## Voraussetzungen

- Node.js 24, keine npm-Pakete
- Chromium-Runtime vorhanden: `chromium/gate-rules.js`,
  `chromium/service-worker.js`, `chromium/gate.html`, `chromium/gate.js`,
  `chromium/content.js`
- Gemeinsamer Kern unverändert: `lib/storage.js`, `lib/rewrite.js`
- `docs/privacy-chrome.md` und `docs/privacy-edge.md`

## Aufruf

Im Ordner `app-files`:

```powershell
node scripts/build-chromium.mjs all
node scripts/build-chromium.mjs chrome
node scripts/build-chromium.mjs edge --out-dir ..\builds\chromium
```

Standardziel ist `../builds/chromium` (bezogen auf `app-files`).

## Ausgabe

- `prime-filter-price-sort-for-amazon-chrome-1.0.5/` und `.zip`
- `prime-filter-price-sort-for-amazon-edge-1.0.5/` und `.zip`

Diese Artefakte sind nicht storefertig; echte Amazon-, Chrome- und Edge-Tests
stehen aus (siehe Status oben).

`manifest.json` liegt im ZIP-Wurzelverzeichnis. Es werden nur die ausgewählten
eigenen Paketordner und ZIPs ersetzt.

## Inhalt

Whitelist mit **20 Dateien**: Manifest, `lib/storage.js`, `lib/rewrite.js`,
`chromium/gate-rules.js`, `chromium/service-worker.js`, `chromium/gate.html`,
`chromium/gate.js`, `chromium/content.js`, Popup-Dateien, Icons 16 bis 128,
`_locales/en|de`, `LICENSE` und die browserbezogene Datenschutzerklärung als
`PRIVACY.md`. Das alte `chromium/rules.js` mit den 219 RE2-Regeln wird nicht
mehr gepackt.

## Ablauf im Browser

1. Eine DNR-Gate-Regel leitet Amazon-Suchpfade (`GET`, Hauptframe,
   `https://www.<marktplatz>/s...`) auf `chromium/gate.html#source` um. Das
   schließt Verfeinerungen ein; ob eine Suche frisch ist, entscheidet erst der
   gemeinsame Kern. Die Regeln werden nur für aktivierte Marktplätze und nur bei
   sinnvollen Einstellungen erzeugt. Die Gate-Seite ist die einzige
   web-accessible Ressource und wird auf die 19 Amazon-Hosts begrenzt.
2. Die Gate-Seite liest die Quelle aus dem Fragment. Der Worker prüft sie
   strikt (nur `https`, kein Port, keine Zugangsdaten, nur die 19 Hosts und
   Pfad `/s` oder `/s/...`), berechnet das Ziel mit `lib/rewrite.js` und legt
   eine exakte Allow-Regel für genau diesen Tab und diese Ziel-URL an. Für die
   Berechnung sind keine externen Abrufe nötig.
3. Die Gate-Seite navigiert per `location.replace` zum Ziel. Die Allow-Regel
   verhindert, dass die Gate-Regel die Ziel-URL erneut abfängt. Eine defensive
   Bounce-Bremse hält Quelle, Zähler und Zeitstempel in einem kurzen Zeitfenster
   in `sessionStorage` und bricht nach mehr als drei Wiederholungen derselben
   Quelle ab.
4. `webRequest`-Beobachtung ordnet die einmaligen Bypässe zu und entfernt sie
   wieder. Der Guard liegt vor der Zielnavigation vor, das logische Fenster ist
   5 Sekunden, die Bypass-TTL 15 Sekunden Best Effort.

Die Gate-Quelle steht dabei temporär im lokalen URL-Fragment der Gate-Seite. Der
Zustand liegt in Arbeitsspeicher, `chrome.storage.session` und tabbezogenem
`sessionStorage`; keine dieser URLs wird nach `storage.sync` geschrieben. Der
Sessionzustand ist nicht auf den Arbeitsspeicher des Workers beschränkt. Exakte
Löschung nach Ablauf des Zeitfensters ist nicht garantiert. Beim Browserneustart
löscht der Browser `chrome.storage.session`; tabbezogenes `sessionStorage` folgt
der Sitzungsverwaltung des Browsers, eine Wiederherstellung ist nicht pauschal
auszuschließen.

## Popup-Anpassung

Nur im Paket wird `popup/popup.html` ersetzt: falsche Aussagen zu lokalem
Speicher, DSGVO und DOM-APIs werden durch neutrale Formulierungen ersetzt und
ein Link auf die browserbezogene Datenschutzerklärung ergänzt. Weicht der
Originaltext ab, bricht der Build mit Fehler ab. Version `1.0.5`, Design und
Spendenlinks bleiben unverändert.

## Prüfungen

Der Build prüft Manifestfelder (MV3, Version, Permissions, Host- und
Content-Script-Listen, keine Gecko-Reste, kein `webRequestBlocking`),
Beschreibungslängen (max. 132 Zeichen), die Popup-Ersetzungen, die
web-accessible Ressource (nur `chromium/gate.html` auf den 19 Amazon-Hosts) und
den ZIP-Inhalt (kein Pfad-Traversal, keine Skripte, Dokumentationsordner, `.git`
oder Secrets).

`webRequest` ist nur beobachtend erlaubt. Ausgeschlossen ist ausschließlich
`webRequestBlocking`; „keine webRequest-Reste“ wäre also falsch.

Der Build ist kein Laufzeitnachweis. Reale Amazon-, Chrome- und Edge-Tests
stehen aus; Testergebnisse werden hier nicht behauptet.
