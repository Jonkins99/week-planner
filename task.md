Setze das folgende Projekt von Grund auf gemäß Infos aus dem Auftrag und der CLAUDE.md um. Aktualisiere die CLAUDE.md auch mit den wichtigen Infos aus diesem Auftrag.

- Week Planner: Eine Website mit absolutem Fokus auf die Aufspielung auf Mobilgeräten.
- Die Website muss auf Android-Geräten auf dem Home Screen installierbar sein, deshalb wird sie im weiteren Verlauf auch oft als App bezeichnet
- Logo und App Icon: Eine schlichte optisch ansprechende Kombination aus einem Wochenplan-Icon, einem Icon, das fürs Kochen steht und ein Icon das fürs Einkaufen steht
- Nutzung der /impeccable Skills für ein ansprechendes Design ist explizit erwünscht


- Die App hat 4 Hauptreiter, die in einer statischen Fußleiste auswählbar sein sollen mit Titel und Icon:
  - Wochenplan
  - Einkauf
  - Rezepte
  - Vorrat
- Der aktuelle Stand je Reiter soll dabei stets "im Hintergrund" gespeichert werden. Wechselt man also zwischen den Views, dann müssen die Views jeweils an der Stelle bleiben an der sie beim Verlassen des Views waren und nicht neu frisch initialisieren

- Wochenplan:
  - Planung von Gerichten für die ganze Woche
  - Listen-Ansicht der Wochentage der aktuellen Woche von oben nach unten
  - Oben die Möglichkeit zwischen den Wochen zu wechseln
  - Jeder Tag hat 3 Mahlzeit-Slots: Frühstück, Mittagessen, Abendessen
  - Weitere Slots sollen hinzufügbar sein zu einem einzelnen Tag, das darf aber versteckt genug sein, da es nicht oft benötigt wird
  - Verschieben der Drag+Drop
  - Duplizieren von Gerichten per Drei-Punkte-Kontextmenü
  - Export-Funktion: Kopiert direkt in die Zwischenablage einen für die Ausgabe in Whatsapp optimiert formatierten Text des Wochenplans. Wirklich sauber strukturiert mit Angabe des Wochentags + Datums, der Mahlzeit als Kürzel oder Icon (Frühstück / Mittag / Abend) und der jeweilige Titel des Gerichts. Alles weitere was an Gerichten / Rezepten speicherbar sein wird soll nicht enthalten sein
  - Beim Eintragen eines Gerichtes in einen Mahlzeitslot soll es ein Textfeld geben in das man den Titel als freien Text eintragen kann. Gleichzeitig soll das Textfeld aber auch als Suche fungieren aus bestehenden Rezepten, die als Vorschlagliste angeboten und dann ausgewählt werden können. Die Suche muss möglichst intelligent sein, also mindestens Substring-basiert
  - Beim Eintragen eines neuen Gerichtes in den Wochenplan muss es auch die Möglichkeit geben dieses direkt als neues Rezept zu speichern

- Rezepte:
  - Titel als einziges Pflichtfeld
  - Zwei Sternebewertungen: Jeweils 0-5 mit halben Sternen möglich; "Bewertung Elika" und "Bewertung Janik"
  - Zutaten
  - Zubereitung
  - Video (Instareel oder Youtube, sollen beide in der App direkt eingebettet abspielbar sein)
  - Im Rezepte-View müssen Rezepte durchsucht werden können, neue Rezepte anlegbar sein, Rezepte sortierbar sein (nach Stern-Durchschnitt oder Alphabet) und Rezepte bearbeitbar sein
  - Rezepte müssen auch löschbar sein
  - Beim Anlegen eines neuen Rezeptes (sowohl im Rezepte View als auch über den Wochenplan) muss es eine intelligente Import-Funktion geben.
    - Dafür muss es in einem Einstellungsbereich die Möglichkeit geben mehrere Gemini-API-Tokens zu hinterlegen
    - Das soll genau so funktionieren wie im draft/jh-draft-league Repo: Mehrere Keys, die automatisch durchrotieren, wenn ein Modell oder ein Key überlastet ist. Prüfe vorab ob für die Aufgabe an dieser Stelle Gemini 3.5 Flash Lite ausreichend gut ist für zufriedenstellende Ergebnisse. Falls ja, soll hier präferiert dieses Modell genutzt werden. Falls nein, soll wie bei der jhdl die Kette der besseren Modelle gestartet werden
    - Die Importfunktion besteht aus einem großen Textfeld in das ein großer Rezept-String eingefügt werden kann
    - Die Gemini-API soll aus dem Text sauber den Titel, die Zutaten und die Zubereitung (in Stichpunkten, nicht zu ausführlich, nichts für routinierte Hobbyköche selbstverständliches erklären ("Karotten anbraten" statt "Brate die Karotten an indem du ...")) extrahieren und so als strukturierte Daten zurückliefern, dass das Rezept direkt in der App gespeichert werden kann


Unter [backup_myrecipebox_2026-10-05.rtk](../../../../Downloads/backup_myrecipebox_2026-10-05.rtk) liegt ein Dump meiner bisherigen App für solche Themen ("My Recipe Book"). Importiere die Historie an Wochenplänen und die Liste gespeicherte Rezepte aus der App

Für den Moment sollst du erst mal diesen Teil implementieren. Weitere Infos (die dann auch alle noch in die -1.zip sollen) folgenden dann in weiteren Folgeaufträgen. Öffne die App zur lokalen Ansicht für mich im Browser, nachdem du fertig bist.

---

## Status (Claude)

**Umgesetzt (Stand week-planner-1.zip):**

- Grundgerüst als installierbare PWA (Manifest, Service Worker, Icons, offline nutzbar), Build nach `docs/`.
- Logo/App-Icon: Kalenderblatt mit Kochtopf und Einkaufswagen-Plakette (`public/icons/logo.svg`).
- Design über /impeccable: Welt „Emaille-Küchengeschirr" (weiße Teller mit Kobaltrand, Emailleschild-Kopfleisten, Mahlzeit-Farben Safran/Jade/Kobalt), hell und dunkel. Festgehalten in `DESIGN.md`, Produktkontext in `PRODUCT.md`.
- Fußleiste mit 4 Reitern; jeder Reiter behält Scroll-Position und Zustand (auch über einen Neustart der App hinweg).
- Wochenplan: Wochenwechsel, Frühstück/Mittag/Abend, weitere Mahlzeit pro Tag über das „…"-Menü am Tag, Drag & Drop per langem Drücken (Verweilen über den Wochenpfeilen blättert die Woche um), Drei-Punkte-Menü mit Bearbeiten/Duplizieren/Verschieben/Rezept öffnen/Entfernen, Rückgängig-Funktion, WhatsApp-Export (Teilen-Symbol oben rechts kopiert in die Zwischenablage).
- Eintragen: Textfeld mit Vorschlägen (Rezepte + früher geplante Freitexte; Suche ist teilwort-, umlaut- und tippfehlertolerant), Option „Auch als neues Rezept speichern" oder „Mit Details oder KI-Import anlegen".
- Rezepte: Suche, Sortierung nach Ø-Bewertung oder A–Z, Anlegen/Bearbeiten/Löschen, zwei Bewertungen (Elika/Janik) mit halben Sternen, Zutaten (abhakbar beim Kochen), Zubereitung, Video eingebettet (Instagram-Reels und YouTube inkl. Shorts), Notizen, Quelle, „Einplanen".
- KI-Import mit mehreren Gemini-Schlüsseln (Einstellungen über das Zahnrad), Rotation wie in der jhdl (Logik von dort übernommen).
- Import aus „My Recipe Box": 64 Rezepte und 504 Wochenplan-Einträge (März 2025 bis Oktober 2026) werden beim ersten Start geladen.

**Wichtige Hinweise / Entscheidungen:**

- **Gemini 3.5 Flash Lite:** Ohne Schlüssel konnte ich nicht live testen. Die Aufgabe ist reine Extraktion in ein festes JSON-Schema plus Kürzen der Arbeitsschritte, das schaffen die Lite-Modelle zuverlässig. Deshalb ist 3.5 Flash Lite erstes Modell; bei Überlastung/Kontingent geht es über die Flash-Kette der jhdl weiter. Falls die Ergebnisse in der Praxis zu knapp oder unsauber sind, kurz hier vermerken, dann stelle ich auf 3.8 Flash als Start um.
- **Bewertungen aus dem Altbestand:** Die alte App hatte nur eine gemeinsame Bewertung. Sie wurde für Elika und Janik übernommen und kann im Rezept direkt angepasst werden.
- **Alte Einträge ohne Mahlzeit-Typ** (vor Mai 2026) liegen beim Abendessen.
- **Rezeptbilder** (22 Stück im Backup) wurden nicht übernommen, weil es dafür noch kein Feld gibt. Notizen und Quell-Links (Chefkoch, HelloFresh) sind erhalten.
- **Einkaufslisten** aus dem Backup wurden nicht importiert (war nicht Teil des Auftrags), Einkauf und Vorrat sind vorerst Platzhalter.
- **Daten liegen nur auf dem jeweiligen Gerät** (kein Server). Elikas und Janiks Handy haben also getrennte Stände. Über Einstellungen → „Sicherung herunterladen/einspielen" lässt sich ein Stand übertragen. Falls ihr eine gemeinsame Live-Synchronisation wollt (z. B. Firestore wie in der jhdl), bitte hier vermerken.
- Lokale Ansicht läuft unter http://127.0.0.1:5288/ (Vite-Devserver).

**Befehle auf dem anderen Laptop** (nach dem Entpacken von week-planner-1.zip):

```bash
npm install
npm test
npm run build
```

Danach den Ordner `docs/` committen und pushen; GitHub Pages auf „Deploy from branch", Ordner `/docs` stellen. `docs/` liegt bereits gebaut in der ZIP, `npm run build` erzeugt ihn nur neu.


============

Runde 2, alles noch für die -1 zip:

- Im Wochenplan soll es möglich sein in dem Slot neben dem Gericht noch eine Notiz anzulegen, die klein unter dem Titel ausgegeben werden soll. Dabei ist egal ob es sich um einen reinen Gerichttitel oder ein Rezept handelt. Funktion ist dafür da um zB reinzuschreiben "In größerer Menge kochen als Meal Prep" und ähnliches. Die Notiz landet nicht im Export
- Wochenplan: Positionierung der Pfeile zum Wochenwechsel ist mir zu assymmetrisch
- Export-Funktion funktioniert zumindest auf Desktop nicht. Wenn es auf dem Handy schon klappt, ist alles fine und du musst nichts ändern

- Beim View-Wechsel scheint manchmal kurz CSS zu fehlen und die Seite flashed weiß auf mit schwarzer Schrift. Optimier das und implementiere ViewTransitions bei jedem View-Wechsel

- Einkauf
  - Unten ein zentrales Input-Feld in das eine Sache die einzukaufen ist eingetragen werden kann. Bei Nutzung von Enter wird sie direkt eingetragen
  - Jede Sache, die ein mal eingetragen wurde wird gespeichert und bei zukünftigen Eintragungen als Schnellauswahl basierend auf den eingetippten Zeichen zur Verfügung gestellt
  - Mikrofon-Button (push to talk): In freier Gesprächsform sollen alle Informationen eingesprochen werden können für mehrere Dinge, die auf die Einkaufsliste müssen mit der Möglichkeit weitere Informationen (zum Beispiel welcher Laden und Abteilung) frei mit einsprechen zu können. Die Audio-Datei soll dann ebenfalls an die Gemini API geschickt werden, die auch hier so strukturiert antworten muss, dass direkte Einträge in die Liste daraus resultieren.
  - Es gibt folgende Geschäfte fest zur Auswahl: Lidl, Aldi [zur Einordnung: Nord], Netto [zur Einordnung: Markendiscount], Edeka, Rossmann, Rewe. Für diese Läden soll ihr Logo fest im Code hinterlegt sein
  - Es ist außerdem möglich weitere Läden manuell zu ergänzen. Statt einem Logo wird ihr Name ausgespielt. Diese Läden lassen sich auch einfach wieder löschen
  - Beim Eintragen muss man einen der aktuellen Läden unkompliziert vorauswählen können. Alle Eintragungen die mit dieser aktiven Auswahl erfolgen werden direkt dem Laden zugeordnet
  - Bei allen Einträgen ohne Marktzuordnung muss es möglich sein ohne Extradialoge durch kleine Buttons einen Laden hinzuzufügen
  - Die Liste wird automatisch von oben nach unten durchkategorisiert basierend auf den Läden. Die Kategorien (Läden) lassen sich auf- und zuklappen. Sauber animiert. Die Einträge ohne Laden stehen stets ganz oben
  - Die Einträge lassen sich über ein direkten Button löschen (=> sobald man sie in den Einkaufskorb gelegt hat) und über einen wenig störenden kleinen Static Button oben links rückgängig machen für die nächsten 5 Sekunden
  - Hält man einen Eintrag lange gedrückt kann man Dinge ändern: Den Text / Namen, den Laden und die Einordnung in eine Abteilung
  - Abteilungen: Obst & Gemüse / Kühlung / TK / Nährmittel / Snacks & Süßes / Haushalt / Sonstiges
  - Wenn ein Produkt erstmals eingetragen wird, soll es von Gemini 3.5 Flash Lite in eine Abteilung zugeordnet werden. Diese Abteilung bleibt für die Zukunft gespeichert für das Produkt und kann dann aber eben über das Gedrückt-Halten auch dauerhaft verändert werden
  - Die Abteilungen sollen genau in der oben beschriebenen Reihenfolge genutzt werden als sekundäre Sortierung der Liste innerhalb der einzelnen Läden
  - Schnell verfügbare Buttons um die Anzahl mit + hochzuziehen; default: 0; Minus erst mit anzeigen, wenn es >1 ist
  - Möglichkeit alle Einträge eines Ladens oder sogar die gesamte Liste jeweils nach expliziter Bestätigung in Dialog auf ein mal zu löschen



---

## Status Runde 2 (Claude)

Alles in **week-planner-1.zip** aktualisiert.

- **Notizen im Wochenplan:** Im Eintragen-Fenster unten links „Notiz". Die Notiz steht klein unter dem Titel, nicht im Export.
- **Wochenpfeile:** Kopfzeile jetzt symmetrisch: Teilen · ‹ · KW · › · Einstellungen.
- **Export am Desktop:** Kopieren läuft jetzt zuerst über den klassischen synchronen Weg, dann über die Clipboard-API. Klappt beides nicht, öffnet sich ein Fenster mit dem Text zum manuellen Kopieren.
- **Weißes Aufblitzen:** Ursache war, dass das CSS per JavaScript nachgeladen wurde (vor allem im Devserver sichtbar). CSS ist jetzt direkt im HTML verlinkt, dazu ein kleiner Inline-Grundstil. Reiterwechsel und Rezeptdetail laufen mit View Transitions (seitliches Gleiten, Fußleiste bleibt stehen).
- **Einkauf** komplett umgesetzt: Eingabefeld unten (Enter trägt ein), Vorschläge aus allen je eingetragenen Produkten, Mikrofon zum Gedrückthalten (freie Sprache, Gemini liefert die Einträge inkl. Laden und Menge), feste Läden mit Logo (Lidl, Aldi Nord, Netto, Edeka, Rossmann, Rewe), eigene Läden über „+" in der Ladenleiste anlegen und dort wieder löschen (oder Laden-Chip lange drücken), Ladenvorauswahl für neue Einträge, Mini-Logo-Buttons an Einträgen ohne Laden, Gruppen je Laden auf-/zuklappbar, „Ohne Laden" immer oben, Sortierung nach Abteilung, Abhaken = löschen mit Rückgängig-Knopf oben links (5 s), langes Drücken zum Ändern von Name/Laden/Abteilung, Mengen-Plus (Minus ab 2), Laden oder ganze Liste nach Bestätigung leeren (Drei-Punkte-Menüs).
- Abteilungen werden für neue Produkte automatisch per Gemini 3.5 Flash Lite ermittelt (gesammelt in einer Anfrage) und für das Produkt gemerkt.
- Die Einkaufslisten aus dem My-Recipe-Box-Backup (Lidl, Edeka) werden jetzt ebenfalls übernommen, auch auf Geräten, die den alten Stand schon geladen hatten.

**Hinweise:**
- Ohne hinterlegten Gemini-Schlüssel funktionieren Mikrofon und automatische Abteilungen nicht (Einträge landen dann unter „Sonstiges", werden nachgeholt, sobald ein Schlüssel da ist).
- Das Mikrofon braucht HTTPS (GitHub Pages passt) und beim ersten Mal die Freigabe im Browser.
- Die Laden-Logos sind vereinfachte Nachbauten als SVG im Code (`resources/js/shopping.mjs`).

**Befehle auf dem anderen Laptop** (unverändert):

```bash
npm install
npm test
npm run build
```

Danach `docs/` committen und pushen.


====
Runde 3, alles noch für die -1 zip:

- Wochenplanung: Per Drag and Drop muss es auch möglich sein ein Gericht in seinem Zeitslot auf "Nur Elika" oder "Nur Janik" ziehen zu können. In solchen Fällen ist es möglich zwei Gerichte in einen Slot einzufügen, wenn beide etwas anderes essen sollten. Im Export mit J: oder E: gekennzeichnet

- Wenn man initial auf die Website geht muss man das Passwort "janik" eingeben um Zugriff auf das Tool zu haben. Nachdem das ein mal erfolgt ist soll der Zugang frei sein. Speichere das Passwort nicht als Klartext im Code, sondern verschlüsselt um etwas weniger leicht auslesbar zu machen. In der dev-Umgebung soll das Passwort entfallen (wann immer das Tool auf dem localhost läuft)
- Alles soll sicher auf dem lokalen Gerät gespeichert werden. In den Einstellungen muss man aber die Möglichkeit haben einen Export / Backup als Zip zu speichern und ggf. direkt nahtlos in sein Google Drive pushen zu können. Diese Backups sollen alle App-Inhalte enthalten

- In der Laden-Auswahl bei Einkauf kann man noch nicht durch alle Läden durchsliden
- Der aktuelle Initialbestand in der Einkaufsliste soll noch nicht dauerhaft als Produkte gespeichert werden, sondern erst die neu hinzugefügten dann
- Checkbox nach rechts, rechts vom Plus

- Vorrat
  - Für den Moment kaum Interaktion mit den anderen Reitern, sondern eher standalone
  - Suchfunktion oben
  - Auflistung der Vorräte
  - 3 Hauptkategorien mit 2 Ebenen von Sub-Kategorien: Gefriertruhe [LEGO-Bricks [Gericht, Komponente], Sonstiges], Kühlschrank, Ungekühlt
  - Es wird nicht der komplette Vorrat abgebildet, sondern ich will nur jene Dinge eintragen über die man oft den Überblick verliert (Gefriertruhe) sowie Dinge, bei denen man häufig denkt man hat sie bestimmt noch, aber es ist am Ende nicht so
  - Außerdem betreibe ich den LEGO-Brick Mealprep-Style. Dabei friere ich sowohl ganze Gerichte in Bricks ein für ein schnelles Mittagessen als auch Komponenten für größere schnelle Mahlzeiten. Den Überblick über diese Bricks will ich eben auch abbilden können
  - KI-Funktion (Gemini 3.8 Flash initial, nicht Lite an dieser Stelle!) um 5 Vorschläge aus den bestehenden modularen Bricks zu machen (2 bis 3 Bricks je Essen) für eine vollständige Mahlzeit, die geschmacklich etc. gut zusammenpasst
  - Schnelle Möglichkeit die Anzahl ohne große Umstände einzugeben und mit +- zu korrigieren
  - Wenn ein Produkt auf "0" Vorrat geht öffnet sich ein Dialog, der vorschlägt es auf die Einkaufsliste (ohne Laden-Vorauswahl) zu schreiben

---

## Status Runde 3 (Claude)

Alles in **week-planner-1.zip** aktualisiert.

- **Nur Elika / Nur Janik:** Beim Ziehen eines Gerichts erscheinen im Ziel-Slot drei Felder „Nur Elika · Beide · Nur Janik". Darauf fallen lassen setzt die Zuordnung (geht auch im gleichen Slot). Alternativ über das Drei-Punkte-Menü. Kennzeichnung als runde E-/J-Plakette, im WhatsApp-Export als „🌙 E: Lasagne" / „🌙 J: Proteintopf".
- **Passwort:** Beim ersten Öffnen wird „janik" abgefragt (Groß-/Kleinschreibung egal), danach bleibt das Gerät freigeschaltet. Im Code steht nur ein gesalzener SHA-256-Hash. Auf localhost/127.0.0.1 entfällt die Abfrage.
- **Sicherung:** Einstellungen → „ZIP herunterladen" (alle Inhalte: Rezepte, Wochenpläne, Einkauf, gemerkte Produkte, Läden, Vorrat, plus Rezepte als lesbare Markdown-Dateien). Auf dem Handy zusätzlich „Teilen, z. B. an Drive" (Android-Teilen-Menü → Drive). „Sicherung einspielen" nimmt die ZIP (und alte JSON-Sicherungen). Die Gemini-Schlüssel sind bewusst nicht in der Sicherung.
- **Google Drive direkt:** Optional per „In Drive sichern". Dafür einmalig eine Client-ID anlegen (siehe unten).
- **Ladenauswahl im Einkauf:** War per Touch scrollbar, am Desktop aber nicht. Jetzt auch mit Mausrad und Ziehen mit der Maus, und am Desktop mit schmaler Scrollleiste (gilt auch für die Mini-Logos an den Einträgen).
- **Altbestand der Einkaufsliste** wird nicht mehr als Produkt-Vorschlag gemerkt, erst neu eingetragene Sachen. Bereits geladene Stände werden beim nächsten Start einmalig bereinigt.
- **Abhaken-Kreis** steht jetzt rechts, rechts vom Plus.
- **Vorrat** umgesetzt: Suche oben, Gefriertruhe (LEGO-Bricks → Gericht / Komponente, Sonstiges), Kühlschrank, Ungekühlt. Eingabe unten mit Ortsauswahl, Enter trägt ein (gleiches Ding am gleichen Ort erhöht die Anzahl). Anzahl direkt antippen und eintippen oder mit −/+ korrigieren. Lange drücken: Name, Anzahl, Ort ändern oder löschen. Fällt etwas auf 0, kommt die Frage, ob es auf die Einkaufsliste soll (ohne Laden).
- **Brick-Kombis:** Button „Kombis vorschlagen" im LEGO-Bricks-Bereich. Gemini 3.8 Flash (bei Auslastung die anderen Flash-Modelle, keine Lite-Modelle) schlägt 5 Mahlzeiten aus 2–3 vorrätigen Bricks vor. „Das gibt's" bucht die Bricks direkt aus dem Vorrat aus.

**Google-Drive-Client-ID anlegen (einmalig, optional):**
1. https://console.cloud.google.com öffnen, ein Projekt wählen oder anlegen (das Projekt der Gemini-Schlüssel geht auch).
2. „APIs & Dienste" → „Bibliothek" → **Google Drive API** aktivieren.
3. „OAuth-Zustimmungsbildschirm": Nutzertyp „Extern", App-Name z. B. „Week Planner", unter „Testnutzer" eure beiden Google-Konten eintragen.
4. „Anmeldedaten" → „Anmeldedaten erstellen" → „OAuth-Client-ID" → Typ **Webanwendung**. Unter „Autorisierte JavaScript-Ursprünge" die GitHub-Pages-Adresse eintragen, z. B. `https://<name>.github.io` (ohne Pfad).
5. Die angezeigte Client-ID (endet auf `.apps.googleusercontent.com`) in der App unter Einstellungen → Google Drive eintragen und „In Drive sichern" tippen. Beim ersten Mal fragt Google nach der Erlaubnis; die App sieht nur ihre eigenen Sicherungsdateien.

**Befehle auf dem anderen Laptop:**

```bash
npm install
npm test
npm run build
```

Danach `docs/` committen und pushen. (`npm install` ist diesmal nötig, weil `fflate` für die ZIP-Sicherung dazugekommen ist.)


==== 

Runde 4, bitte in die -2.zip, die dann auch nur die angepassten Dateien enthalten soll:

- Es schlägt derzeit fehl, dass ich die App als Shortcut auf meinem Home Bildschirm installieren kann. Das System denkt die App gibt es bereits, vermutlich weil über den gleichen github account schon eine andere app läuft (beides unter der gleichen URL bis auf nach den /). Sorge dafür, dass es trotz der größtenteils gleichen URL beides installiert werden kann, und zwar nicht als chrome-verknüpfung sondern eigenständige app

---

## Status Runde 4 (Claude)

Neu: **week-planner-2.zip** (nur die geänderten Dateien, Pfade wie im Projekt; einfach über den bestehenden Stand entpacken und überschreiben).

**Ursache:** Auf derselben github.io-Adresse läuft „Track a Snack" mit `"start_url": "/"`. Für Android ist die Identität einer Web-App ihre Manifest-ID; ohne eigene ID wird sie aus der Start-Adresse gebildet, und die Week-Planner-ID `"./"` wurde gegen den Domain-Stamm aufgelöst. Beide Apps hatten damit dieselbe ID `https://<name>.github.io/`, deshalb meldete Android „gibt es schon".

**Lösung:** Der Week Planner hat jetzt eine feste, eigene ID (`"id": "week-planner"`), dazu eine eindeutige Start-Adresse (`./?source=pwa`) und einen eigenen Bereich (`scope: ./`). Der Service Worker hat einen neuen Cache-Namen, damit Geräte das neue Manifest sofort laden.

**Danach auf dem Handy:** Seite in Chrome einmal neu laden (ggf. zweimal, damit der neue Service Worker übernimmt), dann über das Menü „App installieren" wählen. Sollte schon eine alte Verknüpfung auf dem Home-Bildschirm liegen, diese vorher entfernen.

**Empfehlung für Track a Snack** (nicht Teil dieses Projekts, nichts geändert): Dort im `manifest.json` ebenfalls eine eigene ID setzen und den Bereich auf den eigenen Unterordner begrenzen, also `"id": "track-a-snack"`, `"start_url": "./"`, `"scope": "./"`. Mit `start_url: "/"` beansprucht die App sonst die ganze Domain und kann auch bei künftigen Apps Ärger machen. Achtung: Eine bereits installierte Track-a-Snack-App muss danach einmal neu installiert werden.

**Befehle auf dem anderen Laptop:**

```bash
npm run build
```

(`npm install` ist nicht nötig.) Danach `docs/` committen und pushen.
