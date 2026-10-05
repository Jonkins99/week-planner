== Grundlegendes ==

In diesem Projekt ist die Nutzung von Git absolut VERBOTEN! Die hier gemachten Änderungen an Dateien werden auf keinen Fall irgendwo hincomittet oder gepushed. Stattdessen wird am Ende eines jeden Update-Prozesses eine .zip Datei im Root-Verzeichnis erzeugt, die hochzählt (week-planner-1.zip, week-planner-2.zip etc.). Diese Datei wird auf einen anderen Laptop übertragen, um den Stand ebenfalls dort zu haben. Wie gesagt aber auf jeden Fall komplett ohne Nutzung von Git oder anderen externen Services, um die Übertragung kümmere ich mich manuell.

Auch die Kommunikation zwischen Claude und dem Nutzer über das Claude Terminal ist absolut VERBOTEN! Es sollen keine Nachrichten von dir im Terminal erscheinen! Kommuniziert wird ausschließlich über die Datei task.md. Dort steht stets der aktuelle Arbeitsauftrag drin und ans Ende der Datei dürfen dabei auch Rückfragen gestellt oder wichtige Dinge kommuniziert werden.

Besagter anderer Laptop (UND AUSSCHLIEßLICH JENER!) bringt das Projekt dann nach GitHub, wo es mithilfe von GitHub Pages live gestellt werden. Am Ende einer Aufgabe sollst du daher immer in der task.md vermerken welche Konsolenbefehle ich auf dem anderen Laptop durchführen muss (also zB ein npm run build). Deployed werden soll aus dem docs/ Ordner heraus, wie oft bei GitHub Pages üblich.
== Projekt ==

„Week Planner": private, mobil-first Web-App (PWA, auf Android installierbar) für Elika und Janik. Vier Reiter in fester Fußleiste: Wochenplan, Einkauf, Rezepte, Vorrat. Jeder Reiter behält beim Wechsel seinen Zustand (Ansichten bleiben gemountet, nur unsichtbar; Scroll-Position, Woche, Suche, Sortierung und offenes Rezept werden zusätzlich in localStorage gemerkt). UI-Texte und Code-Kommentare auf Deutsch. Design-Vorgaben: DESIGN.md (Emaille-Geschirr-Welt), Produktkontext: PRODUCT.md. Für Design-Arbeit die /impeccable-Skills nutzen.

Stack: Vite + Alpine.js + Tailwind CSS v4 (Preflight + eigene Komponenten in resources/css/app.css), Lucide-Icons, Schrift Archivo Variable (selbst gehostet). Build nach docs/ (GitHub Pages). Kein Backend: alle Daten gerätelokal in localStorage (`wp-data-v1`), Sicherung/Wiederherstellung als JSON in den Einstellungen.

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
  - Ansichtswechsel (Reiter, Rezeptdetail) laufen über die View Transition API (`viewTransition()` in main.js). CSS ist in index.html verlinkt (nicht per JS importiert) und hat einen kleinen Inline-Grundstil, damit nichts ungestylt aufblitzt.
  - Plan-Einträge können `who: 'E' | 'J'` haben (nur Elika / nur Janik). Setzen per Drag auf die Felder „Nur Elika / Beide / Nur Janik", die im Ziel-Slot erscheinen, oder per Kontextmenü. Export: „🌙 E: Gericht".
  - Vorrat (pantry.mjs, pantry-ai.mjs, state.pantry): items {name, qty, place}. Orte: freezer/bricks/dish, freezer/bricks/component, freezer/other, fridge, dry. Geht ein Vorrat auf 0, fragt die App, ob er auf die Einkaufsliste (ohne Laden) soll. Brick-Kombis: 5 Vorschläge mit 2–3 Bricks, Modellkette ab Gemini 3.8 Flash OHNE Lite-Modelle.
  - Zugang (auth.mjs): einmalig Passwort, im Code nur gesalzener SHA-256-Hash; Freischaltung in localStorage `wp-auth-v1`. Auf localhost/127.0.0.1 keine Sperre. Passwort ändern = neuen Hash mit `hashPassword` erzeugen und PASS_HASH ersetzen.
  - Sicherung (backup.mjs): ZIP mit daten.json + Rezepte als Markdown (fflate). Einspielen nimmt ZIP oder altes JSON. Teilen per Web Share (z. B. an Drive) und optional direkter Upload über Google Drive API (drive.mjs, OAuth-Client-ID in den Einstellungen, Scope drive.file, Ordner „Week Planner Sicherungen").
  - PWA-Identität: manifest `id` ist fest „week-planner" (wird gegen den Origin aufgelöst). Nie `"./"` oder `"/"` verwenden: Auf derselben github.io-Domain läuft „Track a Snack" mit `start_url: "/"` — gleiche ID heißt für Android „App schon installiert". Bei Änderungen am Service Worker den CACHE-Namen hochzählen.
  - Übernommene Einkaufsposten aus dem Altbestand werden nicht als Produkte gemerkt (`keep: false`); bestehende Stände wurden einmalig bereinigt (Flag shopping.flags.seedCatalogCleared).

Abschluss jeder Aufgabe: npm test + npm run build, dann ZIP week-planner-<n>.zip im Root (ohne node_modules, .idea, ältere ZIPs; ab week-planner-2.zip nur die seit der letzten ZIP geänderten Dateien inkl. geänderter docs/-Dateien, Pfade relativ zum Projekt-Root) und in task.md vermerken, welche Befehle auf dem anderen Laptop nötig sind.
