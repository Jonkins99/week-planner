# Product

<!-- impeccable:product-schema 1 -->

> Hinweis: Ein Interview war nicht möglich (Kommunikation ausschließlich über `task.md`). Alle mit *(abgeleitet)* markierten Punkte stammen aus dem Auftrag in `task.md` und dem Backup der Vorgänger-App, nicht aus einer Bestätigung.

## Platform

web

## Stack

delegated: Vite + Alpine.js + Tailwind CSS v4, statisch nach `docs/` für GitHub Pages, als PWA installierbar. Gewählt, weil die Schwester-Projekte des Nutzers (jh-draft-league) denselben Stack nutzen und die Gemini-Logik von dort übernommen wird. *(abgeleitet)*

## Users

Ein Paar, Elika und Janik, das gemeinsam die Mahlzeiten der Woche plant, kocht und einkauft. Genutzt fast ausschließlich auf dem Android-Handy, vom Home Screen gestartet, oft nebenbei: abends auf dem Sofa beim Planen der Woche, in der Küche beim Kochen, im Supermarkt beim Einkaufen. *(abgeleitet)*

## Product Purpose

Ersetzt die bisherige App „My Recipe Box" (RecetteTek). Ein Ort für Wochenplan, eigene Rezeptsammlung (mit beiderseitiger Bewertung), Einkauf und Vorrat. Erfolg: Die Woche ist in wenigen Fingertipps geplant und per WhatsApp geteilt, Rezepte aus Reels/Websites landen per KI-Import strukturiert in der Sammlung.

## Positioning

Kein Rezeptportal, sondern das private Küchenbuch eines Haushalts: zwei Bewertungen pro Rezept (Elika / Janik), eine Historie realer Wochenpläne seit März 2025, Instagram-Reels als primäre Rezeptquelle.

## Operating Context

- Wochenplan mit Frühstück / Mittag / Abend, Montag bis Sonntag; Mittag ist häufig der Rest vom Vorabend.
- Einträge sind oft freie Notizen statt Rezepte („J: Teamevent, E: Pasta alla Toscana", „Bestellen").
- Rezeptquellen: Instagram-Reels, YouTube-Shorts, Chefkoch, HelloFresh.
- Teilen des Wochenplans über WhatsApp.

## Capabilities and Constraints

- Vier Hauptreiter in fester Fußleiste: Wochenplan, Einkauf, Rezepte, Vorrat. Jeder Reiter behält seinen Zustand beim Wechsel.
- Daten liegen gerätelokal (localStorage), Gemini-API-Schlüssel ebenfalls. Kein Backend.
- Einkauf und Vorrat sind in dieser Ausbaustufe noch Platzhalter; folgen in späteren Aufträgen.
- Kein Git auf dem Entwicklungsrechner; Übergabe per hochzählender ZIP.

## Brand Commitments

- Name: „Week Planner". UI-Sprache Deutsch.
- Logo: schlichte Kombination aus Wochenplan-, Koch- und Einkaufs-Symbol (Vorgabe aus dem Auftrag).

## Evidence on Hand

- `scripts/data/` bzw. das Backup `backup_myrecipebox_2026-10-05.rtk`: 64 Rezepte, 504 Wochenplan-Einträge (2025-03 bis 2026-10).
- Keine Fotos in Gebrauch; die 22 Rezeptbilder des Backups werden derzeit nicht übernommen.

## Product Principles

1. Planen in Sekunden: Eintragen eines Gerichts ist ein Textfeld mit Vorschlägen, kein Formular.
2. Freitext ist ein gleichwertiger Eintrag, ein Rezept ist optional.
3. Das Handy ist die Plattform: Daumenreichweite, Touch-Drag, Zurück-Taste von Android.
4. Nichts geht verloren: Zustand je Reiter bleibt, Daten lassen sich sichern und wiederherstellen.

## Accessibility & Inclusion

Kein spezifischer Standard vereinbart. Mindestmaß: WCAG-AA-Kontraste, Touch-Ziele ab 44 px, reduzierte Bewegung respektieren.
