7.zip, keine Kommunikation übers Terminal! Hier Anweisungen für die Umsetzungen von Extra-Widgets, die im +Menüpunkt platziert sind und nicht in die Koch-Einkauf-Views reinbleeden sollen

- Hörspiel-Player:
  - Die Hörbuch-Auswahl oben wird durch den Player jetzt komplett abgeschnitten auf meinem Smartphone und ist nur noch halb sichtbar, korrigier das unbedingt

- Aquarium-Helfer:
  - Durch die Farbwahl ist in der Kachel im +Menü die Schrift des Tools nicht lesbar
  - Die Benachrichtigungen lösen keine wirklichen Android-Benachrichtigungen aus (noch nicht mal Push-Benachrichtigungen, schon gar nicht die Full Screen Dinger) solange die App nicht aktiv geöffnet ist. So bringt mir das wenig. Ich brauche die Benachrichtigungen, auch wenn die App geschlossen ist oder das Handy gesperrt


---

## Ergebnis (week-planner-7.zip)

### Hörbuch-Player
- Die Band-Siegel oben werden nicht mehr gestaucht: Alle Bereiche des Players behalten ihre Höhe, nur der Kerzen-Bereich gibt nach; wird es zu eng, scrollt der Player. Auf schmalen Handys werden die Siegel leicht kleiner, damit alle sieben in eine Zeile passen.

### Aquarium-Helfer
- Kachel: Schrift jetzt weiß auf dem Wasser, der Sand liegt darunter – gut lesbar.
- **Benachrichtigungen bei geschlossener App / gesperrtem Handy:** neuer kleiner **Weckdienst** im Ordner `push-server/` (Cloudflare Worker, kostenloser Tarif). Er kennt nur Uhrzeiten, keine Inhalte: Die App meldet ihm die Termine der nächsten 14 Tage, er schickt zur Minute einen Web-Push, der Service Worker wacht auf und zeigt die echte Android-Benachrichtigung mit „Erledigt" / „In 1 h erneut" bzw. „Morgen wieder erinnern". Die Knöpfe funktionieren auch bei geschlossener App (Verschieben meldet die neue Zeit selbst an den Dienst, ab dem 2. Verschieben wird der Text eindringlicher). Beim nächsten Öffnen übernimmt die App alles.
- Einen echten Vollbild-Wecker (Full-Screen-Intent wie bei der Uhr-App) erlaubt Android Web-Apps leider grundsätzlich nicht. Am nächsten dran: in den Android-Einstellungen für die App „Pop-up auf dem Bildschirm", „Auf Sperrbildschirm anzeigen" und ggf. „Bitte nicht stören überschreiben" aktivieren (steht auch in den Aquarium-Einstellungen). Dringende Wasserwechsel-Meldungen bleiben stehen, bis man reagiert, und vibrieren länger. Öffnet man die App, erscheint zusätzlich der Vollbild-Hinweis.

### Einmalig: Weckdienst einrichten (auf dem anderen Laptop)
Braucht ein kostenloses Cloudflare-Konto (externer Dienst – du hattest Benachrichtigungen bei geschlossener App ausdrücklich verlangt, deshalb so gelöst; ohne Einrichtung läuft alles wie bisher).
```
cd push-server
npx wrangler login                          # Browser-Login bei Cloudflare
npx wrangler kv namespace create PUSH       # ausgegebene id in wrangler.toml bei HIER_KV_ID_EINTRAGEN eintragen
node gen-vapid.mjs                          # gibt VAPID_PUBLIC und VAPID_PRIVATE_JWK aus
#   → VAPID_PUBLIC in wrangler.toml bei HIER_OEFFENTLICHEN_SCHLUESSEL_EINTRAGEN eintragen
npx wrangler secret put VAPID_PRIVATE_JWK   # den ausgegebenen JSON-Wert einfügen (nicht in eine Datei schreiben)
npx wrangler deploy                         # zeigt die Adresse, z. B. https://week-planner-push.<name>.workers.dev
```
Dann am Handy (App vom Homescreen): Werkzeuge → Aquarium → Zahnrad → „Benachrichtigungen erlauben", Adresse des Weckdienstes eintragen → „Einrichten" → „Probe in 1 Min." → App schließen, Handy sperren: nach 1–2 Minuten muss „Weckdienst funktioniert" kommen. Auf jedem Handy (Elika/Janik) einmal einrichten.
Falls die Probe nicht kommt: Akku-Optimierung für Chrome/Week Planner auf „Nicht eingeschränkt" stellen.

### Befehle auf dem anderen Laptop
```
unzip -o week-planner-7.zip
npm install
npm test
npm run build
git add -A && git commit -m "Weckdienst für Aquarium-Erinnerungen, Player- und Kachel-Fixes" && git push
```
Danach (nur einmal) den Weckdienst wie oben einrichten. Service Worker hat einen neuen Cache-Namen (v7): App nach dem Deploy einmal öffnen, schließen, wieder öffnen.


============
Bitte antworte hier in der Datei: Ich glaube ich habe ab dem Punkt "npx wrangler secret put VAPID_PRIVATE_JWK" verkackt. Ich habe den Befehl genau so abgeschickt, also mit "VAPID_PRIVATE_JWK" drin. Dann sollte ich einen Secret Value eingeben und habe ein Passwort eingegeben. Ich glaube das war falsch. Die JSON aus der vorherigen Ausgabe habe ich nirgends eingegeben. Es kam dann "There doesnt seem to be a Worker called "week-planner-push". Ich hab ihn das dann anlegen lassen und die Secrets (das Passwort) hinterlegen lassen. Es kam dann "Success! Uploaded secret VAPID_PRIVATE_JWK". Der Deploy Befehl scheitert wegen "KV namespace "HIER_KV_ID_EINTRAGEN" is not valid"

---

## Antwort (week-planner-8.zip)

Halb so wild, nichts ist kaputt. Was passiert ist:
- `npx wrangler secret put VAPID_PRIVATE_JWK` war genau richtig abgeschickt (der Name gehört so in den Befehl). Als „Secret Value" hätte aber **die JSON-Zeile** aus `node gen-vapid.mjs` eingefügt werden müssen, kein Passwort. Jetzt liegt dein Passwort als Schlüssel im Worker. Das ist harmlos und wird einfach überschrieben.
- Dass der Worker dabei angelegt wurde, ist in Ordnung.
- Der Deploy scheitert, weil in `push-server/wrangler.toml` noch die Platzhalter stehen (KV-id und öffentlicher Schlüssel). Die hätten von Hand eingetragen werden müssen. Diese Schritte waren zu fehleranfällig.

Deshalb gibt es jetzt `push-server/setup.mjs`, das alles selbst erledigt: Anmeldung prüfen, KV-Speicher anlegen bzw. einen schon angelegten wiederfinden, id und öffentlichen Schlüssel in wrangler.toml eintragen, den privaten Schlüssel direkt an Cloudflare übergeben (du musst nichts einfügen), hochladen und die Adresse ausgeben.

### Befehle auf dem anderen Laptop
```
unzip -o week-planner-8.zip
npm install
npm test
npm run build
cd push-server
node setup.mjs --neue-schluessel
cd ..
git add -A && git commit -m "Einrichtungsskript für den Weckdienst" && git push
```
`--neue-schluessel` ist dieses eine Mal nötig, damit das Passwort-Secret durch einen echten Schlüssel ersetzt wird. Später reicht `node setup.mjs` (z. B. nach Änderungen am Worker), dann bleiben die Schlüssel erhalten.

Am Ende steht `✓ Weckdienst läuft: https://week-planner-push.<name>.workers.dev`. Diese Adresse am Handy eintragen: Werkzeuge → Aquarium → Zahnrad → Weckdienst → „Einrichten" → „Probe in 1 Min." → App schließen, Handy sperren. Nach 1–2 Minuten muss „Weckdienst funktioniert" kommen.

Zur Kontrolle kann die Adresse auch im Browser geöffnet werden. Dort steht `"keys":"ok"`, wenn die Schlüssel stimmen, sonst ein Hinweis, was fehlt.

Hinweis zu git: `wrangler.toml` enthält danach die KV-id und den öffentlichen Schlüssel. Beides ist nicht geheim und darf mit ins Repo, der private Schlüssel liegt nur bei Cloudflare.
