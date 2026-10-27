Für die 10.zip. Git ist wieder tabu, Kommunikation übers Terminal auch. Spawne keinerlei Agenten oder Sub-Agenten oder sonst was, erledige alles straight und minimalistisch

Neues Tool: Weihnachtsplaner
- Zwei Tabs: Adventskalender und Geschenke
- Adventskalender
  - Das Tool soll mir helfen für jemanden einen Adventskalender zu planen
  - 24 Tag-Slots
  - Ich muss Geschenke eintragen können
  - Das Geschenk muss schnell und einfach den Status wechseln können: Besorgen / Vorhanden / Verpackt
  - Geschenke müssen per Drag + Drop umsortierbar sein und gelöscht werden können
- Geschenke
  - Anlegen verschiedenster Personen
  - Anlegen einer oder mehrerer Geschenke pro Person
  - Status je Geschenk: Idee / Besorgen / Vorhanden / Verpackt
  - Geschenke müssen löschbar sein
- Design: Cozy und weihnachtlich

Kicktipp-Support:
- Einzelne Spiele sorgen für Overflow, wenn man sie ausklappt
- Unterschiedliche Ligen (und damit Qualitätsstufen der Vereine) scheinen nicht ausreichend von der KI beachtet zu werden und setzen ein allgemeines Fragezeichen hinter die Aussagekraft der KI-Einschätzung. Für das heutige DFB-Pokal-Spiel zwischen RW Essen und RB Leipzig wird zB der sehr unwahrscheinliche Tipp 2:1 vorgeschlagen, obwohl Leipzig klar favorisiert ist und die 3 Ergebnisse mit höchster Wahrscheinlichkeit [0:2 (14%), 1:2 (11%) und 0:3 (9%)] sind. Selbst "Jeddeloh" (Viertligist) gegen Hertha wird mit 3:2 getippt
- Allgemein scheint das Ergebnis 1:2 / 2:1 überproportional häufig empfohlen zu werden

To-Do-Liste:
- Setze die To-Do-Liste um
- So simpel und intuitiv wie möglich
- Sie soll in der Lage sein Benachrichtigungen zu versenden (konfigurierbar je To-Do) und dafür die Benachrichtigungsumsetzung nutzen, die bereits der Aquariumhelfer nutzt
- Es soll möglich sein, dass To-Dos regelmäßig wiederkehren. Das soll leicht steuerbar sein oder per Freitext als Vorgabe funktionieren können. Per KI soll dieser Freitext dann in eine Cronjob-Konfiguration überführt werden, die der Anforderung entspricht

Hörbücher:
- Ich werde jedes mal wieder beim Öffnen gefragt, ob auf die Datei zugegriffen werden darf. Wenn möglich soll die Erlaubnis gespeichert werden.
- Der Player der bei laufendem Hörbuch wie eine Push-Benachrichtigung angezeigt wird hat das Weekplanner-App-Icon als verpixeltes Vorschaubild. Falls möglich wäre eine Darstellung eher wie das Werkzeug-Widget wünschenswert

Pokémon-Sleep-Helper:
- Verwerfe ihn komplett

---

## Erledigt (week-planner-10.zip)

**Weihnachtsplaner** (neue Kachel, Weinrot mit Schneefall und hüpfendem Geschenkdeckel)
- Reiter „Adventskalender“: Für-Wen-Feld, 24 Türchen, je Türchen „+“ zum Eintragen. Status-Knopf antippen schaltet Besorgen → Vorhanden → Verpackt. Am Griff (⋮⋮) ziehen verschiebt Geschenke zwischen und innerhalb der Türchen (scrollt am Rand automatisch mit). Antippen des Titels öffnet ein Blatt mit Titel, Türchen, Status und Löschen. Heutiges Türchen (1.–24.12.) ist golden umrandet.
- Reiter „Geschenke“: Personen anlegen (Name direkt umbenennbar, Papierkorb entfernt), je Person beliebig viele Geschenke, Status Idee → Besorgen → Vorhanden → Verpackt per Antippen, ✕ löscht.

**To-do-Liste** (Kachel jetzt aktiv)
- Unten eintippen = neue Aufgabe. Kästchen = erledigt (wiederkehrende rücken zum nächsten Termin vor). Antippen öffnet: Fälligkeit (Heute/Morgen/Nächster Montag oder Datum+Uhrzeit), Schalter „Erinnern“, Wiederholen: Nie/Täglich/Wöchentlich/Monatlich/Jährlich/Eigene. Bei „Eigene“ Freitext (z. B. „jeden 2. Dienstag um 18 Uhr“, „alle 2 Wochen montags“) → ✨ übersetzt per Gemini in Cron; der Cron-Ausdruck bleibt sichtbar und editierbar.
- Erinnerungen laufen über dieselbe Technik wie das Aquarium (Takt in der App, Service-Worker-Plan, Weckdienst bei geschlossener App) mit Knöpfen „Erledigt“ / „In 1 Std.“. Der Weckdienst wird weiterhin in den Aquarium-Einstellungen eingerichtet; der Push-Server selbst musste nicht geändert werden.
- Erledigte unter „Erledigt“ (aufklappbar), dort wieder öffnen oder gesammelt löschen.

**Kicktipp**
- Overflow beim Aufklappen behoben (Kartenraster darf nicht mehr breiter als der Bildschirm werden, KI-Ergebnisse umbrechen).
- Ursache der Fehltipps gefunden: ESPN liefert für den DFB-Pokal keine Quoten, „Tipp“ kam daher aus den Torschnitten – ohne Rücksicht auf die Liga (Essen/Jeddeloh haben fast nur Pokalspiele). Jetzt: Spielklasse fließt ins Modell ein (Amateur-/unbekannte Liga = Form wird ignoriert, je Klasse Unterschied deutlicher Abschlag), und sobald eine KI-Einschätzung da ist, wird „Tipp“ ohne Quoten aus deren drei Ergebnissen gewählt. Die KI bekommt die Spielklasse beider Teams und klare Hinweise (Heim:Auswärts, Klassenunterschied, kein Reflex-2:1). Live geprüft für heute: Essen–Leipzig jetzt 1:2, Großaspach–Augsburg 1:2, Jeddeloh–Hertha 0:1 (vorher 2:1 bzw. 3:2).
- Zu 2:1/1:2: Bei Spielen MIT Quoten ist 2:1 bzw. 1:2 bei Regeln 4/3/2 für einen leichten bis mittleren Favoriten tatsächlich oft der Tipp mit den meisten erwarteten Punkten (Tendenz + Tordifferenz werden häufig mitgenommen). Das ist kein Fehler, sondern Absicht von „Tipp“; die drei wahrscheinlichsten Ergebnisse stehen links daneben.

**Hörbücher**
- Zugriffsfrage: Chrome auf Android merkt sich den Dateizugriff nicht über einen Neustart. Darum werden auf dem Handy neue Dateien immer einmalig in den App-Speicher kopiert. Bereits gemerkte Bände werden nach der nächsten Zugriffsfrage still im Hintergrund dorthin übernommen (Meldung „liegt jetzt im App-Speicher“) – danach wird nicht mehr gefragt. Braucht freien Speicher in Höhe des Bandes.
- Medien-Benachrichtigung: zeigt jetzt ein eigenes Cover im Look der Kachel (Weinrot/Gold, Blitz, Band-Nummer, „Harry Potter“) statt des verpixelten App-Icons.

**Pokémon-Sleep-Helfer**: Kachel samt CSS entfernt.

**Prüfung**: `npm test` → „Alle Tests bestanden“ (neue Tests für Cron/To-do, Weihnachtsplaner, Kicktipp-Spielklasse). `npm run build` ✓. Browser-Test (Playwright) bei 260/320/360/1280 px: kein horizontaler Overflow, Drag&Drop im Adventskalender verschiebt korrekt, keine Konsolenfehler.

**Hinweis**: Service-Worker-Cache auf v9 hochgezählt – nach dem Deploy die App einmal schließen und neu öffnen.

### Befehle auf dem anderen Laptop
```
unzip -o week-planner-10.zip
npm install
npm test
npm run build
```
Danach den docs/-Ordner wie gewohnt nach GitHub bringen. (Da Vite docs/ beim Bauen leert, entstehen alte Asset-Dateien dort nicht neu – gern vorher `docs/assets` löschen, `npm run build` erzeugt alles neu.)

Zum Testen nach dem Deploy: https://<dein-github-name>.github.io/week-planner/ → Reiter „Werkzeuge“ (Plus) → To-do-Liste, Weihnachtsplaner, Kicktipp-Support, Harry Potter.
