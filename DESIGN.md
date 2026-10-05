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
