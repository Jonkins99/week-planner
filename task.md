Für die 9.zip. Git ist wieder tabu, Kommunikation übers Terminal auch

- Bei den Benachrichtigungen scheint es immer noch der Fall sein zu müssen, dass die App zufindest im Hintergrund geöffnet ist und nicht komplett geschlossen sein darf, damit sie als Push Benachrichtigung angezeigt werden. Kannst du das noch optimieren?
- Entwickle nun den Kicktipp-Support-View
  - Ich tippe die 1. Bundesliga, die 2. Bundesliga, die Champions League und den DFB-Pokal
  - Der View soll mir kategorisiert nach Liga (einzelne Ligen jeweils ein- und ausklappbar) immer die Spiele der nächsten 3 Tage anzeigen
  - Achte darauf, dass man selbst auf dem halben Handybildschirmen (Split View) den View noch sauber bedienen kann und alles wichtige erkennt. Ich werde den View nämlich im aufrechten Split Screen mit Kicktipp geteilt nutzen, um die Ergebnisse basierend auf dem Helper einzutragen
  - Je Spiel soll mir folgendes angezeigt werden:
    - Letzte 5 Ergebnisse jedes Teams mit Gegner (turnierübergreifend)
    - Durchschnittstore und Gegentore beider Teams jeweils in den letzten 3, 5 und 10 Spielen
    - Aktueller Tabellenplatz
      - Gilt für 1. Liga und 2. Liga, sowie die CL Gruppenphase
      - In der CL-KO-Phase soll aktueller Platz in der Liga des Vereins angezeigt werden sowie Endplatz in der CL-Gruppenphase
      - Im DFB-Pokal soll aktueller Platz in der Liga des Vereins angezeigt werden
    - KI-Einschätzung der 3 wahrscheinlichsten Ergebnisse mit ungefährer Prozent-Chance. Ggf. können dafür auch Daten aus Wettportalen genutzt werden?
- Wenn dir noch sehr gute Features einfallen, die bei der Entscheidung helfen können, setze sie gerne mit um. Es soll aber alles auch nicht so überladen sein, dass die Entscheidung für den Tipp wiederum wieder erschwert wird oder man auf dem sehr geringen Screen-Platz nicht alle Infos für ein Spiel gleichzeitig erfassen kann

---

## Erledigt (week-planner-9.zip)

### Benachrichtigungen bei komplett geschlossener App
- Der Code-Weg war bereits vollständig (Weckdienst → leerer Web-Push → Service Worker zeigt die Meldung). Ich habe keinen Fehler gefunden, der das nur bei offener App funktionieren ließe. Der typische Grund für „geht nur, solange die App im Hintergrund lebt": Android-Akku-Optimierung hält die Pushes für Chrome zurück. Ob das bei dir so ist, kann ich von hier nicht prüfen, deshalb gibt es jetzt eine Diagnose:
- Aquarium → Einstellungen → Weckdienst → **„Prüfen"**: zeigt nächsten Weckruf, wann der Dienst zuletzt geweckt hat (und ob der Push-Dienst das angenommen hat) und wann auf diesem Handy zuletzt ein Weckruf angekommen ist. Mit konkreter Abhilfe je Befund (Akku auf „Nicht eingeschränkt", Samsung „Apps im Tiefschlaf", Neu verbinden …).
- Weckrufe leben jetzt 6 h statt 1 h beim Push-Dienst (kommen also nach, wenn das Handy kurz offline oder im Tiefschlaf war).
- Empfohlener Ablauf: Weckdienst neu veröffentlichen (siehe unten) → in der App „Probe in 1 Min." → App komplett schließen, Handy sperren, 2 Min. warten → App öffnen → „Prüfen".
  - Steht dort „verschickt, aber nicht angekommen": Akku-Einstellungen von Chrome (bzw. der installierten App) auf „Nicht eingeschränkt".

### Kicktipp-Support (Werkzeuge-Reiter, Kachel ist jetzt aktiv)
- Spiele von heute bis übermorgen für 1. BL, 2. BL, CL und DFB-Pokal, je Wettbewerb ein- und ausklappbar (gemerkt).
- Je Spiel eine Karte in zwei Spalten (Heim | Auswärts): Tabellenplatz (Liga; CL-Ligaphase = CL-Platz; CL-K.-o. = Platz in der eigenen Liga + Endplatz der CL-Ligaphase; Pokal = Platz in der eigenen Liga), letzte 5 Pflichtspiele mit Gegner, Ergebnis und H/A bzw. Wettbewerb (turnierübergreifend, Testspiele ausgenommen), Tore/Gegentore im Schnitt der letzten 3/5/10.
- Darunter: Quoten als 1/X/2-Balken (DraftKings, Marge herausgerechnet), die KI-Einschätzung (3 wahrscheinlichste Ergebnisse mit Prozent und ein kurzer Grund) und die **„Tipp"-Plakette**.
- Zusatz-Feature „Tipp": Aus den Quoten wird ein Torerwartungs-Modell geschätzt; „Tipp" ist das Ergebnis mit den meisten *erwarteten Kicktipp-Punkten* (das ist oft nicht das wahrscheinlichste Ergebnis). Die Punkteregeln eurer Runde lassen sich über das Zielscheiben-Symbol oben einstellen (Standard 4/3/2, Tordifferenz zählt nicht bei Remis). Falls eure Runde anders zählt, dort anpassen.
- Zusatz-Feature „getippt": Haken rechts oben an der Karte. Getippte und beendete Spiele schrumpfen auf eine Zeile (antippen klappt sie wieder auf), so bleibt im Split View nur Offenes groß. Laufende Spiele zeigen den Live-Stand.
- Getestet bei 400 × 430 px (halber Handybildschirm): eine Spielkarte passt vollständig in den sichtbaren Bereich.
- Daten: öffentliche ESPN-Schnittstelle (kein Schlüssel nötig). Die KI nutzt den vorhandenen Gemini-Schlüssel aus den Haushalt-Einstellungen (Kette ab Gemini 3.8 Flash, 10 Spiele pro Anfrage, Ergebnis 12 h gemerkt). Ohne Schlüssel siehst du stattdessen die drei wahrscheinlichsten Ergebnisse laut Modell.
- Hinweis: Unterklassige Pokal-Gegner (Regionalliga u. ä.) hat ESPN kaum erfasst; dort steht dann „Keine Spieldaten". Die echte KI-Antwort konnte ich hier ohne Gemini-Schlüssel nicht live prüfen; Prompt und Auswertung sind getestet.

### Befehle auf dem anderen Laptop
```
npm install
npm test
npm run build
cd push-server && npx wrangler deploy
```
(`npx wrangler deploy` veröffentlicht den geänderten Weckdienst. `wrangler.toml` ist nicht in der ZIP, deine eingetragene KV-id und dein Schlüssel bleiben also unberührt. Danach wie gewohnt committen und pushen, ausgeliefert wird aus `docs/`.)
