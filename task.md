6.zip, keine Kommunikation übers Terminal! Hier Anweisungen für die Umsetzungen von Extra-Widgets, die im +Menüpunkt platziert sind und nicht in die Koch-Einkauf-Views reinbleeden sollen

- Hörspiel-Player:
  - Der Fortschrittsslider reagiert nicht auf Touch Gesten bevor das Hörbuch läuft
  - Das Bücherei-Icon oben rechts macht nichts
  - Die Kerzen sind so platziert, dass sie mit dem Titel kollidieren. Sie könnten sich noch bisschen mehr bewegen und leuchten / flackern
  - Das Hinterlegen der Dateien soll nicht in den Koch-Haushalt-Einstellungen liegen, sondern in eigenen Einstellungen. Tools sollen nie in die Haushaltapp bluten

- Aquarium-Helfer:
  - Ich habe zwei Aquarien, die fest integriert sein sollen: 54 Liter und Cube
  - Wasserwerte:
    - Hauptfunktion des Tools
    - Je Becken soll man folgende Werte zu jedem möglichen Zeitpunkt eintragen können. Es müssen nicht zwingend alle Werte eingegeben werden, man kann auch einzelne Werte angeben
      - PH
      - KH
      - GH
      - Leitwert
      - NO3
      - CO2
      - Temperatur
    - Je Messung muss es möglich sein die Labels "Vor Wasserwechsel" oder "Nach Wasserwechsel" zu aktivieren
    - Je Messung muss es möglich sein eine Notiz zu hinterlegen
    - Zu jeder Messung (die dann wiederum mehrere Werte beinhalten kann) muss der Zeitpunkt des Eintragens gespeichert werden
    - Für die Becken müssen Zielwerte für die verschiedenen Werte hinterlegbar sein
    - Darstellung der Messwerte in Diagrammen (je Wert) oder Liste (alle Werte, jedoch einzeln ein- und ausblendbar) ermöglichen
    - Diagramme müssen zeitlich exakt sein. Also nicht nur Werte in gleichen Abständen, sondern in zeitlich korrekt abgebildeten Abständen
    - Diagramme sauber animiert
    - Diagramme zoombar und scrollbar
    - Beim Anklicken von Werten im Diagramm Ausgabe der exakten Werte, Notiz etc.
    - Anzeigen der Zielwerte im Diagramm
    - Anzeigen von "Wasserwechsel" (Mitte zwischen "vor Wasserwechsel" Messung und "nach Wasserwechsel" Messung) im Diagramm
    - Ableitung von To-Dos und Schieflagen (evtl. mit KI auch Vorschläge machen lassen für konkrete Maßnahmen) anhand der Zielwerte und der Bestandswerte
  - Das Widget muss in der Lage sein Benachrichtigungen zu verschicken, oder besser noch Full-Screen-Intents
  - Es muss möglich sein je Becken einen Futterplan (stellt eine Woche dar, wiederholt sich dann jede Woche) zu hinterlegen mit bis zu 3 Futterslots am Tag. Dafür Anlegen von Futtermitteln ermöglichen, die dann nur noch ausgewählt werden müssen je Tag. Uhrzeit einstellbar und resultiert dann in einer Benachrichtigung, die die Optionen "Erledigt" oder "In 1h erneut erinnern" als Option anbietet
  - Wasserwechsel-Erinnerungen und Historie: Je Becken einstellbar machen alle wieviele X Tage ein Wasserwechsel stattfinden soll und um welche Uhrzeit die Erinnerung aufpoppen soll. Die Benachrichtigung hat die Option "Erledigt" oder "Morgen wieder erinnern", falls man es gerade nicht schafft. Die Benachrichtigung soll in Optik und Inhalt aufdringlicher werden je öfter man verschiebt (ab dem 2. Tag des Aufschiebens soll dieser Effekt losgehen)
  - Möglichkeit Bestand je Becken einzutragen: Freitextfeld für die Bezeichnung der Tierart oder Pflanzenart, Menge pflegbar. Nach dem Eintragen rattert ein Crawler oder die KI los und hinterlegt einen Steckbrief mit allen für die Aquaristik wichtigen Infos über das Tier oder die Pflanze und wie es ihm / ihr gut geht. Diese Infos sind dann auf Detailseiten bei Klick auf den Fisch verfügbar. Je Tierart außerdem ermöglichen ein Foto / Vorschaubild zu hinterlegen / zu schießen

  
- Datei-Aussortierer Tinder-Style
  - "Scan starten"-Button, dabei steuerbar welche Kategorien (default: alle) durchsucht werden sollen: Screenshots, Fotos, Videos, Dokumente, Apps
  - Identifiziert Dateien nach einem schlauen Algorithmus, die als ehesten als Löschkandidaten gelten:
    - Große Dateien eher vorschlagen als kleine
    - Ältere Dateien eher vorschlagen als Neuere
    - Screenshots und Downloads eher vorschlagen als selbst geschossene Fotos
    - Lange nicht geöffnete Dateien eher vorschlagen als zuletzt geöffnete
  - Nach einem Scan kann das Aussortieren gestartet werden:
    - Gamification mit Animationen, Scores und Statistiken an Löschungen etc.
    - Aussortieren im Tinder-Style: Swipen zum Behalten oder zum zur Löschung freigeben
    - Datei wird dann direkt gelöscht, wenn entsprechend geswiped wird und ein "Reverse"-Buttonn nicht in den nächsten 20 Sekunden gedrückt wird
    - In der Ansicht sollen Bilder direkt angezeigt werden, Videos direkt als Vorschau angezeigt werden, PDFs die erste Seite teasern etc, außerdem Dateiname, Speicherort, Dateigröße etc. anzeigen
    - Das ganze muss schnell gehen: Dateien dürfen nicht lange laden und beim Swipen muss dann auch schnell die nächste Slide kommen
  - Gesamtstatistiken irgendwo anzeigen
  - Gerne /impeccable Skills nutzen, zB für die Animationen



Noch nicht umsetzen:
- Advanced Youtube-Player adblocker?
- To-Do-Liste
- Pokémon Sleep Helfer
- Kicktipp-Support
- Abnehmhelfer

---

## Ergebnis (week-planner-6.zip)

### Harry-Potter-Player
- Spulen geht jetzt schon vor dem ersten Abspielen: Beim Öffnen des Players wird der aktuelle Titel still geladen (ohne abzuspielen), damit die Länge bekannt ist. Tippt man den Regler an, bevor das fertig ist, springt er nach dem Laden direkt an die Stelle.
- Das Bücherei-Symbol oben rechts öffnet jetzt das neue **Bücherregal** (eigene Ebene im Harry-Potter-Look). Dort werden die Dateien je Band gewählt. Der Abschnitt ist aus den Haushalt-Einstellungen komplett verschwunden.
- Kerzen: schweben jetzt im freien Raum zwischen Titel und Bedienfeld (eigener Bereich, kollidieren nicht mehr mit Text), 7 statt 5, bewegen sich deutlich mehr (schweben, pendeln, kippen) und flackern unregelmäßig mit warmem Lichthof. Auch auf der Kachel.

### Aquarium-Helfer (Kachel ist jetzt aktiv)
- Zwei feste Becken: „54 Liter" und „Cube" (Name und Liter in den Aquarium-Einstellungen änderbar). Drei Bereiche unten: Werte, Pflege, Bestand.
- **Werte:** Kacheln mit dem letzten Wert je Parameter (grün im Ziel, rot außerhalb). Messung über „+ Messung": Zeitpunkt frei wählbar (Standard jetzt, Eintragezeit wird zusätzlich gespeichert), pH, KH, GH, Leitwert, NO₃, CO₂, Temperatur – beliebige Teilmenge, +/–-Knöpfe, Label „Vor/Nach Wasserwechsel", Notiz. Antippen in der Liste = bearbeiten/löschen.
- **Zielwerte** je Becken (Kachel „Zielwerte"), mit sinnvollen Standards.
- **Diagramme** je Wert: zeitlich exakte Achse, Linie zeichnet sich animiert ein, Zielbereich als Band, Wasserwechsel als gestrichelte Linie mit Tropfen (Mitte zwischen Vor- und Nach-Messung; zusätzlich per „Jetzt gewechselt" erfasste Wechsel). Zeitraum 7 T/30 T/3 M/1 J/Alles, Zoom-Knöpfe, Ziehen verschiebt, zwei Finger zoomen – alle Diagramme bewegen sich gemeinsam. Antippen eines Punkts zeigt die ganze Messung (alle Werte, Notiz, Vor/Nach, rechnerisches CO₂ aus pH/KH) mit „Bearbeiten".
- **Liste:** alle Messungen als Tabelle, Spalten einzeln ein-/ausblendbar (wird gemerkt).
- **Aufgaben & Schieflagen:** Werte außerhalb des Ziels (mit konkretem Tipp), Trends, die die Grenze in ≤ 7 Tagen reißen, CO₂ passt nicht zu pH/KH, Wasserwechsel fällig/überfällig, lange nicht gemessen. Knopf „KI-Maßnahmen": Gemini schlägt priorisierte, konkrete Schritte vor (nutzt Werte, Ziele, Besatz).
- **Pflege:** Wasserwechsel „alle X Tage um HH:MM", „Jetzt gewechselt", Abkürzungen für Vor-/Nach-Messung, Verlauf mit Abständen. Futterplan Mo–So mit bis zu 3 Fütterungen pro Tag (Uhrzeit + Futtermittel aus der Liste), „für alle Tage übernehmen", „Heute füttern" mit Erledigt-Knopf. Futtermittel anlegen/löschen.
- **Erinnerungen:** Fütterung → „Erledigt" oder „In 1 h erneut erinnern". Wasserwechsel → „Erledigt" oder „Morgen wieder erinnern"; ab dem 2. Aufschieben wird es eindringlicher (Text, Vibration, bleibt stehen, Vollbild wird Bernstein → Rot, ab Stufe 3 pulsierend). Ist die App offen, erscheint ein Vollbild-Hinweis (das Gegenstück zum Full-Screen-Intent); sonst eine Systembenachrichtigung mit den beiden Knöpfen. Benachrichtigungen in den Aquarium-Einstellungen erlauben (mit Vorschau normal/dringend).
- **Bestand:** Art als Freitext + Menge → die KI legt einen Steckbrief an (deutscher und wissenschaftlicher Name, Herkunft, Größe, Alter, Temperatur/pH/GH/KH-Bereiche, Mindestbecken, Gruppe, Verhalten, Vergesellschaftung, Ernährung, Licht/CO₂/Platz, Vermehrung, „So geht es ihr gut", Warnzeichen). Detailseite beim Antippen, Foto aufnehmen oder aus der Galerie wählen, Warnung, wenn die Art nicht zu den Zielwerten des Beckens passt.
- **Eigene Sicherung** (ZIP mit Daten + Fotos) in den Aquarium-Einstellungen – nicht Teil der Haushalt-Sicherung.

### Datei-Aussortierer (Kachel ist jetzt aktiv)
- Kategorien wählbar (Standard alle): Screenshots, Fotos, Videos, Dokumente, Apps. Ordner hinzufügen (am Handy z. B. DCIM, Pictures, Movies, Download einzeln) – bleiben gemerkt. „Scan starten" mit Radar und Live-Zählern.
- Bewertung: groß vor klein, alt vor neu, Screenshots/Downloads/Installationsdateien/Messenger vor eigenen Kamerafotos, lange unverändert vor kürzlich, mögliche Duplikate (gleiche Größe + Endung) bekommen einen Bonus. Gründe stehen als Plaketten auf der Karte.
- Wischen wie bei Tinder: links = weg, rechts = behalten (auch per Knöpfe/Pfeiltasten). Stempel „Weg"/„Behalten" beim Ziehen, Karte fliegt raus, nächste steigt sofort auf (die nächsten 3 Vorschauen werden vorab geladen). Bilder direkt, Videos als laufende stumme Vorschau, PDFs mit gerenderter erster Seite, Textdateien als Ausschnitt; dazu Name, Ordner, Größe, Datum, Kategorie.
- Gelöscht wird nach 20 Sekunden Gnadenfrist (Ring-Countdown, „Rückgängig"); der Rückgängig-Knopf in der Mitte nimmt die letzte Entscheidung zurück.
- **Deine Ergänzung umgesetzt:** Einmal als „behalten" markiert, wird eine Datei nie wieder vorgeschlagen (gemerkt über Pfad, Name und Größe – auch über neue Scans hinweg).
- Gamification: Punkte (Löschen nach Größe), Tempo-Kombo bis 3×, 7 Ränge mit Aufstiegs-Animation, Rundenabschluss mit Zusammenfassung. Gesamtstatistik auf der Startseite (freigeräumt, gelöscht, behalten, Runden, beste Runde, beste Kombo, größter Brocken, Anteil je Kategorie).

### Wichtig – was technisch (noch) nicht geht
1. **Benachrichtigungen zu festen Uhrzeiten bei geschlossener App:** Eine Web-App ohne eigenen Server kann keine Meldung „vorbestellen". Umgesetzt ist: pünktlich, solange die App offen ist oder im Hintergrund noch läuft; als installierte App prüft Chrome zusätzlich regelmäßig im Hintergrund (wie oft, entscheidet Chrome – eher stündlich bis selten); spätestens beim Öffnen kommt alles Fällige als Vollbild. Echte Full-Screen-Intents gibt es im Browser nicht. **Rückfrage:** Soll ich einen kleinen kostenlosen Push-Dienst anbinden (z. B. Cloudflare Worker + Web Push), damit Fütterung und Wasserwechsel auch bei geschlossener App pünktlich kommen? Das wäre ein externer Dienst – daher erst nach deinem OK.
2. **Datei-Aussortierer auf dem Handy:** Echtes Löschen braucht Ordnerzugriff mit Schreibrecht (File System Access). Wo der Browser das nicht anbietet, läuft der Nur-Lese-Modus: Ordner/Dateien wählen, wischen, am Ende eine Liste der weggewischten Dateien zum Löschen in der Dateien-App. Bitte einmal am Handy testen, welcher Modus erscheint (bei „Ordner hinzufügen" = voller Modus). Android lässt außerdem bestimmte Wurzelordner (gesamter Speicher, Download-Wurzel je nach Version) nicht freigeben – dann Unterordner wählen. Die „zuletzt geöffnet"-Zeit liefert der Browser nicht; stattdessen zählt das Änderungsdatum.
3. **KI** (Steckbriefe, Maßnahmen) nutzt die Gemini-Schlüssel aus den Haushalt-Einstellungen (nur lesend).

### Befehle auf dem anderen Laptop
```
unzip -o week-planner-6.zip
npm install          # neue Abhängigkeit: pdfjs-dist (PDF-Vorschau im Aussortierer)
npm test
npm run build        # erzeugt docs/ komplett neu
git add -A && git commit -m "Aquarium-Helfer, Datei-Aussortierer, Hörbuch-Player-Fixes" && git push
```
Hinweis: Der Service Worker hat einen neuen Cache-Namen (v6); nach dem Deploy die App einmal öffnen, schließen und erneut öffnen, damit die neue Version greift.
