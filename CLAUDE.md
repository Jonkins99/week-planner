== Grundlegendes ==

In diesem Projekt ist die Nutzung von Git absolut VERBOTEN! Die hier gemachten Änderungen an Dateien werden auf keinen Fall irgendwo hincomittet oder gepushed. Stattdessen wird am Ende eines jeden Update-Prozesses eine .zip Datei im Root-Verzeichnis erzeugt, die hochzählt (week-planner-1.zip, week-planner-2.zip etc.). Diese Datei wird auf einen anderen Laptop übertragen, um den Stand ebenfalls dort zu haben. Wie gesagt aber auf jeden Fall komplett ohne Nutzung von Git oder anderen externen Services, um die Übertragung kümmere ich mich manuell.

Auch die Kommunikation zwischen Claude und dem Nutzer über das Claude Terminal ist absolut VERBOTEN! Es sollen keine Nachrichten von dir im Terminal erscheinen! Kommuniziert wird ausschließlich über die Datei task.md. Dort steht stets der aktuelle Arbeitsauftrag drin und ans Ende der Datei dürfen dabei auch Rückfragen gestellt oder wichtige Dinge kommuniziert werden.

Besagter anderer Laptop (UND AUSSCHLIEßLICH JENER!) bringt das Projekt dann nach GitHub, wo es mithilfe von GitHub Pages live gestellt werden. Am Ende einer Aufgabe sollst du daher immer in der task.md vermerken welche Konsolenbefehle ich auf dem anderen Laptop durchführen muss (also zB ein npm run build). Deployed werden soll aus dem docs/ Ordner heraus, wie oft bei GitHub Pages üblich.
== Projekt ==

„Week Planner": private, mobil-first Web-App (PWA, auf Android installierbar) für Elika und Janik. Fünf Reiter in fester Fußleiste: Wochenplan, Einkauf, Rezepte, Vorrat, Werkzeuge (großes Plus). Jeder Reiter behält beim Wechsel seinen Zustand (Ansichten bleiben gemountet, nur unsichtbar; Scroll-Position, Woche, Suche, Sortierung und offenes Rezept werden zusätzlich in localStorage gemerkt). UI-Texte und Code-Kommentare auf Deutsch. Design-Vorgaben: DESIGN.md (Emaille-Geschirr-Welt), Produktkontext: PRODUCT.md. Für Design-Arbeit die /impeccable-Skills nutzen.

Stack: Vite + Alpine.js + Tailwind CSS v4 (Preflight + eigene Komponenten in resources/css/app.css), Lucide-Icons, Schrift Archivo Variable (selbst gehostet); nur im Harry-Potter-Player zusätzlich Cinzel Decorative + IM Fell English (@fontsource). Build nach docs/ (GitHub Pages). Kein Backend: alle Daten gerätelokal in localStorage (`wp-data-v1`), Sicherung/Wiederherstellung als JSON in den Einstellungen.

Befehle:
  npm install
  npm run dev        # Devserver
  npm run build      # Build nach docs/
  npm test           # Logik-Tests (scripts/test.mjs, node:assert, framework-frei)
  npm run icons      # PNG-Icons aus public/icons/logo.svg (braucht devDependency sharp)
  node scripts/import-myrecipebox.mjs <backup.rtk>   # Altbestand aus „My Recipe Box" nach resources/data/seed.json

Aufbau resources/js:
  main.js           Alpine-Komponente `app` (gesamter UI-Zustand, Ebenen/Zurück-Taste, Aktionen)
  model.mjs         Datenmodell + reine Operationen (Plan-Einträge, Zusatz-Mahlzeiten, Rezepte, sanitizeState)
  dates.mjs, search.mjs (unscharfe Suche), whatsapp.mjs (Export), video.mjs (YouTube/Instagram-Einbettung)
  drag.mjs          Touch-Drag&Drop (lange drücken), Autoscroll, Wochenwechsel über den Pfeilen
  gemini.mjs        aus jh-draft-league übernommen: mehrere Schlüssel, Modellkette, Sperrliste (QuotaBook)
  recipe-ai.mjs     KI-Import: Prompt, Schema, Säubern. Erstes Modell gemini-3.5-flash-lite, danach modelChain()
  legacy-import.mjs Umwandlung des RecetteTek-Backups (Typ 900 Frühstück, 800 Mittag, 700/ohne Typ Abend)
  storage.mjs       localStorage-Schlüssel, Seed beim allerersten Start
  suggest.mjs       Abendessen-Vorschläge, Kochhistorie, Zutat → Produktname, Vorratsabgleich, Dubletten
  stats.mjs         Zeiträume (Woche/Monat/Jahr), Kennzahlen, Vergleich mit Vorzeitraum
  nutrition-ai.mjs  Nährwert-Schätzung je Zeitraum (Gemini, Kette ab 3.8 Flash)
  wrapped-image.mjs Rückblick als PNG (Canvas, 1080×1920) zum Teilen
  hp.mjs, hp-store.mjs  Hörbuch-Player: Logik (Abend-Startpunkt, Weiterschalten, Spulen) und Dateiablage

Fachliches:
  - Plan: Tag = { slots: { breakfast, lunch, dinner, <extraId> }, extras: [{id,label}] }; leere Tage werden entfernt. Ein Slot darf mehrere Gerichte haben.
  - Eintrag = { id, title, recipeId?, note? }. Verknüpfte Einträge zeigen live den Rezepttitel. Wird ein Rezept gelöscht, bleiben Einträge als Freitext.
  - Rezept: Titel Pflicht; ratingElika/ratingJanik 0–5 in halben Sternen (0 = unbewertet); ingredients[]/steps[]; video; notes; source.
  - Altbestand hatte nur eine gemeinsame Bewertung; sie wurde beim Import für beide übernommen.
  - Gemini-Schlüssel liegen separat (`wp-gemini-v1`) und gehören nie in eine Sicherung.
  - Jede Overlay-Ebene ist ein History-Eintrag (Android-Zurück schließt sie). history.go ist asynchron: neue Ebenen warten per Queue auf das popstate; nie zwei closeLayer direkt hintereinander, sondern eine Ebene tiefer schließen (schließt alles darüber mit).
  - Eintrag im Plan kann eine Notiz haben (`note`), klein unter dem Titel; nie im WhatsApp-Export. Altbestand-Notizen sind oft nur Reel-Links (Anzeige dann als Host).
  - Einkauf (shopping.mjs / shopping-ai.mjs, Daten unter state.shopping): items {name, qty (0 = ohne Menge), store, dept}, catalog (jedes je eingetragene Produkt mit gemerkter Abteilung, Quelle der Vorschläge), stores (nur eigene Läden). Feste Läden mit SVG-Logo im Code: Lidl, Aldi (Nord), Netto (Marken-Discount), Edeka, Rossmann, Rewe.
  - Abteilungen in fester Reihenfolge: Obst & Gemüse, Kühlung, TK, Nährmittel, Snacks & Süßes, Haushalt, Sonstiges. Neue Produkte werden gesammelt und per Gemini 3.5 Flash Lite (Kette wie beim Import) zugeordnet; Änderung per langem Drücken gilt dauerhaft für das Produkt.
  - Liste: „Ohne Laden" immer oben, dann Läden (auf-/zuklappbar), darin nach Abteilung. Abhaken = löschen, Rückgängig-Knopf oben links 5 s.
  - Spracheingabe: Mikrofon gedrückt halten (MediaRecorder), Audio als inlineData an Gemini, Antwort = strukturierte Einträge inkl. Laden.
  - Reiterwechsel laufen über die View Transition API (`viewTransition()` in main.js); im Update-Callback nie auf Alpine.nextTick warten (Alpine hält nextTick bis zum nächsten Frame zurück, in der View Transition gibt es keinen → 4 s Hänger). Das Rezeptdetail gleitet nur per x-transition herein (schneller als eine View Transition). CSS ist in index.html verlinkt (nicht per JS importiert) und hat einen kleinen Inline-Grundstil, damit nichts ungestylt aufblitzt.
  - `recipesById` ist über eine WeakMap je Rezeptliste gecacht (neu gebaut nur, wenn sich die Liste/Länge ändert).
  - Plan-Einträge können `who: 'E' | 'J'` haben (nur Elika / nur Janik). Setzen per Drag auf die Felder „Nur Elika / Beide / Nur Janik", die im Ziel-Slot erscheinen, oder per Kontextmenü. Export: „🌙 E: Gericht".
  - Vorrat (pantry.mjs, pantry-ai.mjs, state.pantry): items {name, qty, place}. Orte: freezer/bricks/dish, freezer/bricks/component, freezer/other, fridge, dry. Geht ein Vorrat auf 0, fragt die App, ob er auf die Einkaufsliste (ohne Laden) soll. Brick-Kombis: 5 Vorschläge mit 2–3 Bricks, Modellkette ab Gemini 3.8 Flash OHNE Lite-Modelle.
  - Zugang (auth.mjs): einmalig Passwort, im Code nur gesalzener SHA-256-Hash; Freischaltung in localStorage `wp-auth-v1`. Auf localhost/127.0.0.1 keine Sperre. Passwort ändern = neuen Hash mit `hashPassword` erzeugen und PASS_HASH ersetzen.
  - Sicherung (backup.mjs): ZIP mit daten.json + Rezepte als Markdown (fflate). Einspielen nimmt ZIP oder altes JSON. Teilen per Web Share (z. B. an Drive) und optional direkter Upload über Google Drive API (drive.mjs, OAuth-Client-ID in den Einstellungen, Scope drive.file, Ordner „Week Planner Sicherungen").
  - PWA-Identität: Manifest heißt `public/week-planner.webmanifest`, `id` fest `/week-planner/app`, `scope`/`start_url` relativ (`./`). Nie `"./"` oder `"/"` als id verwenden (wird gegen den Origin aufgelöst = ganze github.io-Domain). Auf derselben Domain läuft auch die JH Draft League. Bei Änderungen am Service Worker den CACHE-Namen hochzählen.
  - Gemini (gemini.mjs): je Anlauf Zeitdeckel `timeoutMs` (Standard 30 s); Überlastung/5xx/Zeitüberschreitung → sofort nächstes Modell, 429 → nächster Schlüssel (Sperrliste), sonstiger 400er → nächster Schlüssel, Schema-400 → nächstes Modell. In Antwort-Schemas nie leere Strings in `enum` (HTTP 400), stattdessen Platzhalter wie `NO_STORE` („Kein Laden"). Brick-Namen stehen als Enum im Schema (`brickSchema(items)`).
  - Fußleiste nur mit Icons (Name als aria-label/title), Kopfleisten kompakt; Rezept-Sortierung als Icon-Umschalter neben der Suche.
  - Installation: Chrome/Android erlaubt pro Origin praktisch nur eine Web-App (alles unter <name>.github.io gilt als dieselbe Herkunft). Sicher getrennt nur über einen eigenen Origin (z. B. eigene GitHub-Organisation → <org>.github.io). Der Code ist dank `base: './'` origin-unabhängig.
  - Übernommene Einkaufsposten aus dem Altbestand werden nicht als Produkte gemerkt (`keep: false`); bestehende Stände wurden einmalig bereinigt (Flag shopping.flags.seedCatalogCleared).

Abschluss jeder Aufgabe: npm test + npm run build, dann ZIP week-planner-<n>.zip im Root (ohne node_modules, .idea, ältere ZIPs; ab week-planner-2.zip nur die seit der letzten ZIP geänderten Dateien inkl. geänderter docs/-Dateien, Pfade relativ zum Projekt-Root) und in task.md vermerken, welche Befehle auf dem anderen Laptop nötig sind.
  - Rest von gestern: Mittag-Eintrag `leftover: true` zeigt live das Abendessen des Vortags (Knopf im leeren Mittag-Slot). Bestellt: Eintrag `order: { rid, amount, instead }` (Restaurant aus state.restaurants, Betrag, ursprüngliches Gericht); nur Abendessen heute/vergangen, über Icon im Eintragen-Blatt oder Kontextmenü. Altbestand „Bestellen" als Freitext zählt in der Statistik als Bestellung (`isOrder`).
  - Abendessen-Vorschläge (Glühbirne im leeren Abend-Slot): 10 Gerichte, gewichtet nach Bewertung und „lange nicht gegessen", kürzlich gezeigte treten zurück (`wp-suggest-v1`). Freitext nur ab 3× und ohne ähnliches Rezept.
  - Statistik (Wochenplan-Menü ☰ → Statistiken): Woche/Monat/Jahr, gezählt bis heute. Rückblick („Wrapped") öffnet einmalig beim ersten Start nach Monatswechsel (im Januar zusätzlich das Jahr), gemerkt in `wp-wrapped-v1`; Teilen als PNG ohne Nährwerte. Nährwerte werden je Zeitraum in `wp-nutrition-v1` gemerkt.
  - Küche heute (Kochmütze links in der Kopfleiste oder „Heute"-Plakette): heutiges Abendessen mit aufklappbarem Rezept in großer Schrift, morgen Frühstück/Mittag, Auftau-Hinweis für morgen Abend; hält den Bildschirm wach (Wake Lock).
  - Einkauf: Antippen eines Produkts = „verfügbar ab" Wochentag (`item.from`, Label „ab Do."), Haken gedrückt halten = direkt in den Vorrat, lange drücken = Bearbeiten inkl. „alle X Wochen" (`shopping.recurring`, fällige landen beim Start automatisch auf der Liste). Vorrat: Mindestbestand `min` je Produkt, darunter automatisch auf die Liste.
  - Teilen-Ziel: Manifest `share_target` (GET auf ./index.html mit share_title/share_text/share_url) öffnet den Rezept-Editor und startet den KI-Import.
  - Sicherung: optional wöchentlich automatisch in Drive (Start beim ersten Antippen nach dem Öffnen, still mit `prompt: 'none'`), danach bleiben nur die letzten 3 Sicherungen im Ordner. Letzte Sicherung (alle Wege) in `wp-backup-last-v1`.
  - Werkzeuge-Reiter: Kacheln mit eigenem Look und Loop-Animationen; aktiv: Harry Potter, Aquarium-Helfer, Datei-Aussortierer. To-do, Kicktipp, Pokémon Sleep sind ausgegraut.
  - Werkzeuge bluten nie in den Haushalt: eigene Alpine-Komponenten (`resources/js/tools/*-app.mjs`, per `registerAqua`/`registerSorter` angemeldet, geöffnet per `$dispatch('aqua-open' | 'sorter-open')`), eigene localStorage-Schlüssel, IndexedDB `wp-tools` (photos, kv, inbox), eigenes CSS `resources/css/tools.css`. Von der App nutzen sie nur openLayer/closeLayer/isOpen/notify/confirm (Scope-Vererbung). Namen in den Komponenten dürfen nicht mit Eigenschaften von `app` kollidieren (sonst greifen App-Methoden auf das Werkzeug-Feld zu). `dropLayers` meldet geschlossene Ebenen per Event `wp-layer-closed`.
  - Aquarium (tools/aqua.mjs Logik, aqua-ai.mjs, chart.mjs SVG-Zeitdiagramm, notify.mjs, aqua-app.mjs; Daten `wp-aqua-v1`): zwei feste Becken (`t54` „54 Liter", `cube` „Cube"), Messungen {at, values{ph,kh,gh,ec,no3,co2,temp}, phase before|after, note, created}, Zielwerte je Becken, Wasserwechsel-Marke = Mitte zwischen Vor- und Nach-Messung (≤ 48 h), Futterplan 7 Tage × max. 3 Slots, Futtermittel global. Erinnerungen: Schlüssel `wc:<tank>:<fälliger Tag>` bzw. `feed:<tank>:<Tag>:<hh:mm>`; Aufschieben WW = morgen zur Uhrzeit, Füttern = +1 h; Eskalation ab 2. Aufschieben. Zustellung: Takt in der App + Vollbild-Ebene `aqua-alert`, Systembenachrichtigung mit Aktionen über den Service Worker, Plan für den SW in IndexedDB (kv `aqua-schedule`), Antworten über die Inbox. Periodic Background Sync `tool-reminders` (nur installierte App). Echte zeitgenaue Push-Meldungen bräuchten einen Server. Eigene ZIP-Sicherung in den Aquarium-Einstellungen.
  - Datei-Aussortierer (tools/sorter.mjs, sorter-app.mjs; `wp-sort-v1` Statistik, `wp-sort-kept-v1` Behalten-Liste): Ordner per showDirectoryPicker (readwrite, Griffe in IndexedDB kv `sorter-roots`), Löschen per removeEntry nach 20 s Gnadenfrist. Einmal Behaltenes (Schlüssel Pfad/Name|Größe) wird NIE wieder vorgeschlagen. Ohne File System Access Nur-Lese-Modus mit Liste zum Nachlöschen. PDF-Vorschau per pdfjs-dist (nur bei Bedarf nachgeladen).
  - Harry-Potter-Player: Dateien je Band im Bücherregal (Bibliothek-Knopf oben rechts im Player, Ebene `hp-files`, nicht in den Haushalt-Einstellungen); mit File-System-Access werden nur Dateigriffe gemerkt (IndexedDB `wp-hp`), sonst einmalig ins OPFS kopiert. Audio-Element liegt außerhalb von Alpine (läuft im Hintergrund weiter, Media Session). Nach Band 7 wieder Band 1. Position je Band in `wp-hp-v1`; Abend-Startpunkt = Stelle nach den ersten 5 Minuten am Stück ab 20 Uhr, wird am Folgetag ab 6 Uhr beim Öffnen einmalig übernommen.
