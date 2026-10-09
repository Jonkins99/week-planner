# Design

Welt: **Emaille-Küchengeschirr.** Weiße Teller mit Kobaltrand auf porzellanblauem Grund, die Kopfleisten als Emailleschild. Kein Karten-Dashboard, kein Creme-und-Serif.

## Farben (Tokens in `resources/css/app.css`, `:root`)

| Rolle | Hell | Dunkel |
|---|---|---|
| Grund `--ground` | `#e7ecf3` | `#0d1322` |
| Teller `--plate` | `#fbfcfe` | `#18213a` |
| Rand / Schild `--rim` | `#1d3a8f` | `#3a5bc4` (Schild `#1b2a5e`) |
| Text `--ink` / `--ink-2` / `--ink-3` | `#14203f` / `#47557a` / `#66739a` | `#eef2fb` / `#b1bcd6` / `#8d99b8` |
| Aktion (FAB, Löschen) `--tomato` | `#d9432a` | `#ef6a4f` |

Mahlzeit-Farben, je mit `-ink` (Text/Icon) und `-tint` (Fläche): Frühstück **Safran** `#f4b63a`, Mittag **Jade** `#23917a`, Abend **Kobalt** `#2d4fb5`, Zusatz-Mahlzeiten **Violett** `#7b5ea7`. Safran ist zugleich Markierung für „aktiv" (Reiter-Pille, Heute-Abzeichen, Fokusring).

Dunkelmodus folgt `prefers-color-scheme`.

## Schrift

Eine Familie: **Archivo Variable** (selbst gehostet über `@fontsource-variable/archivo`, Achsen Breite + Gewicht).
- Schildschrift (KW-Nummer, Tagesnamen, Seitentitel, Abschnittstitel): `font-stretch: 72–80 %`, Gewicht 800–820, Versalien mit leichter Sperrung.
- Fließtext und Bedienelemente: normale Breite, 400–650.
- Rezepttitel im Detail: schmal-fett, aber gemischte Schreibung (lange Titel, ß).

## Formen

- Teller: `border: 2px solid var(--rim)`, Radius 16 px. Elevation nur über den Rand, Schatten nur für Schwebendes (Menü, Toast, FAB, gezogenes Gericht).
- Kopfleiste (`.sign`): Kobaltfläche, unten 24 px gerundet, innen eine feine weiße Schildlinie.
- Fußleiste: Kobalt, oben 22 px gerundet, aktiver Reiter als Safran-Pille.
- Gerichte: Fläche in der Mahlzeit-Tönung, Radius 11 px, Drei-Punkte rechts.
- Icons: Lucide, 2 px Strich, über die Direktive `x-icon`.

## Bewegung

Ein Moment mit Gewicht: das Anheben eines Gerichts beim Ziehen (leicht gedreht, skaliert, großer Schatten). Sonst nur Zustandswechsel 140–320 ms mit `cubic-bezier(0.16, 1, 0.3, 1)`: Blätter von unten, Seiten leicht von unten, Rezeptdetail von rechts. `prefers-reduced-motion` schaltet alles ab.

## Muster

- Bottom-Sheet für schnelle Eingaben (Eintragen, Ziel wählen, Mahlzeit hinzufügen), Vollbildseite für Rezept-Editor und Einstellungen.
- Kontextmenü als verankertes Popover.
- Rückgängig statt Rückfrage bei Plan-Änderungen; Rückfrage nur beim Löschen eines Rezepts und beim Einspielen einer Sicherung.

## Einkauf

- Läden als Teller je Laden mit Logo-Plakette im Kopf, „Ohne Laden" mit Safranrand ganz oben.
- Abteilungen als kleine Versal-Zwischenzeilen mit Lucide-Icon.
- Eingabe als schwebender Teller über der Fußleiste: Ladenwahl (Logos, Auswahl = Safranring), Textfeld, Mikrofon in Tomate. Beim Tippen verschwindet die Fußleiste.
- Rückgängig als dunkle Pille oben links mit ablaufendem Safranbalken (5 s).

## Ansichtswechsel

View Transitions: Reiter rechts davon gleiten von rechts herein, links davon von links (28 px, 180/280 ms); die Fußleiste bleibt stehen (`view-transition-name: tabbar`).

## Vorrat & Personen

- Vorrat nutzt dieselben Teller wie der Einkauf; je Hauptort ein Teller mit Rund-Icon. LEGO-Bricks als Safran-Band mit „Kombis vorschlagen", darunter eingerückt Gericht/Komponente.
- Mengen als Stepper: Minus · tippbares Zahlenfeld · Plus.
- Personen-Kennzeichen: runde Plakette „E" in Tomate, „J" in Kobalt vor dem Gerichtnamen.
- Zugangssperre: Kobaltfläche mit einem Teller in der Mitte (Logo, Passwortfeld), Schildlinie als doppelter Ring.

## Statistik, Küche, Rückblick

- Statistik als Vollbildseite mit Tellern je Kennzahl; Bestellquote groß in Tomate, Restaurants als Balken, Rezept/Freitext als geteilter Jade/Safran-Balken, Trends mit runden Pfeil-Plaketten (Jade hoch, Tomate runter).
- Küche heute: ein großer Teller mit dem Abendessen in Schildschrift, Rezept per Kobalt-Knopf aufklappbar (Zutaten/Schritte ~1,22 rem), Auftau-Frage als gestrichelte Kobalt-Fläche.
- Rückblick („Wrapped"): Vollbild-Folien in vollen Emaillefarben (Kobalt, Safran, Jade, Tomate, Nachtblau, Teller-Weiß), riesige schmale Versalien (Archivo 900, 62 % Breite), zwei Teller als Kreise im Hintergrund (drehender Rand, atmende Scheibe). Folienwechsel: Inhalte steigen gestaffelt mit leichter Unschärfe auf; Fortschrittsbalken oben, 9 s je Folie.

## Werkzeuge

- Jede Kachel hat ihre eigene Welt und eine leise Endlos-Animation (pausiert, wenn der Reiter nicht sichtbar ist; bei reduzierter Bewegung aus): Harry Potter (Weinrot/Gold, schwebende Kerzen, glimmender Blitz), Aquarium (Wasser, Fische, Blasen, Sand), To-do (Notizkarte, Haken zeichnen sich), Datei-Aussortierer (Pink, Kartenstapel wischt links/rechts), Kicktipp (Rasen, Ball, Spielstand), Pokémon Sleep (Nachthimmel, atmendes schlafendes Wesen, „z").
- Noch nicht verfügbare Kacheln: Graustufen, 62 % Deckkraft, Plakette „Bald".
- Harry-Potter-Player: eigene Welt (Große Halle bei Nacht): Mitternachtsgrund mit weinrotem Schein, schwebende Kerzen, Schrift Cinzel Decorative (Titel) und IM Fell English (Text), Gold `#f1d27a`/`#d4a73c`, Pergament `#efe2c4`. Bände als Wachssiegel I–VII, Fortschritt als Goldlinie mit Schnatz als Regler, Abspielknopf als Goldmünze. Kerzen schweben im freien Raum zwischen Titel und Bedienfeld (eigener Flex-Bereich, kollidiert nie mit Text), flackern unregelmäßig mit warmem Lichthof. Bücherregal (Dateiwahl) als eigene Ebene im selben Look, nie in den Haushalt-Einstellungen.
- Werkzeuge bleiben getrennt vom Haushalt: eigene Alpine-Komponente, eigene Daten, eigene Einstellungen und Sicherung, eigenes Stylesheet (`resources/css/tools.css`).
- Aquarium-Helfer: Unterwasser-Welt. Tiefes Petrol (`#05303f` → `#021720`) mit wanderndem Lichtschein oben, Glaspaneele (helle Linie, kein Schatten), Akzent Aquamarin `#5fe3c8` (im Ziel), Koralle `#ffa15e` (Abweichung), Rot `#ff7468` (akut), Himmelblau `#8fd8ff` für Wasserwechsel, Sand `#e2c48a` für Futter. Diagramme: Linie zeichnet sich beim Öffnen ein, Punkte ploppen gestaffelt auf, Zielbereich als Aquamarin-Band, Wasserwechsel als gestrichelte Linie mit Tropfen. Vollbild-Erinnerung wird mit jedem Aufschieben wärmer und lauter (Petrol → Bernstein → Rot, ab Stufe 3 pulsierend und wackelnd).
- Datei-Aussortierer: Pink-Nacht (`#24102a` → `#170a1a`), Akzent Pink `#ff4f8f`, Behalten Mint `#3fe0a2`, Weg Rot `#ff4d5e`, Punkte/Rang Gold `#ffd166`. Kartenstapel mit Stempeln „Weg"/„Behalten", die beim Ziehen einblenden; Karte fliegt mit Drehung hinaus, nächste steigt aus dem Stapel auf; Punkte schweben als Pillen auf; Kombo pulsiert ab 5; Rangaufstieg als Goldplakette; Gnadenfrist als schrumpfender Ring.
