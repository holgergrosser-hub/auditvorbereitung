# Auditvorbereitung – Start

## Drei Betriebsarten
| Art | Wofür | Daten | Fortschritt |
|---|---|---|---|
| **Demo** | Vorführen, Werbung | erfundene Firma (`web/kunde/demo.js`) | wird nicht gespeichert |
| **Testfassung (Paket)** | erster Test mit einem echten Kunden, ohne Server | `paket.json` aus `daten/<kunde>/` | im Browser des Kunden; Kunde schickt die Ergebnis-Datei per Mail |
| **Server (Supabase)** | Dauerbetrieb mit vielen Kunden | Supabase-Datenbank und Speicher | in der Datenbank, Berater sieht alles |

## Testfassung für einen Kunden bauen (ohne Server)
1. Ordner `daten/<kunde>/quellen/` anlegen: Auditplan (A00F201, .docx), ausgefüllte Prüflisten (A00F221, .docx), Kundendokumente als PDF bzw. XLSX.
2. `daten/<kunde>/paket-quelle.json` ausfüllen (Vorlage: `daten/mesto/…`, nicht in Git): Firma, Audits, Mitarbeiter, Dokumente mit Link, Faktencheck, Stolperfallen, Aufgaben, Rundgang.
3. `npm run paket -- daten/<kunde>` → Ordner `daten/<kunde>/netlify/` und `befunde.json` (Widersprüche + verschobene Seitenzahlen für den Berater).
4. `befunde.json` lesen, Stolperfallen und Faktencheck prüfen.
5. Ordner `daten/<kunde>/netlify/` auf **https://app.netlify.com/drop** ziehen → Adresse an den Kunden. Nach dem Audit die Seite in Netlify löschen.
6. Ergebnis-Datei des Kunden in `…/auswertung/` öffnen (Ampel je Mitarbeiter, Faktencheck-Korrekturen, Fragen aus dem echten Audit → Fragenbank-CSV).

Voraussetzungen: Node 20+, Python 3 mit `openpyxl`, `pdftotext` (poppler).

## Server einrichten (Supabase)
1. Neues Supabase-Projekt anlegen (Region Frankfurt).
2. Migrationen der Reihe nach im SQL Editor ausführen: `supabase/migrations/*.sql`.
3. Im Table Editor bei `backoffice_nutzer` die eigene E-Mail eintragen; unter Authentication denselben Nutzer anlegen.
4. Edge Functions: `supabase functions deploy kunde --no-verify-jwt` und `supabase functions deploy ki --no-verify-jwt`.
5. Secrets: `supabase secrets set ERLAUBTE_HERKUNFT=https://<netlify-adresse> ANTHROPIC_API_KEY=… KI_MODELL=claude-sonnet-5-5`.
6. `web/config.js`: `supabaseUrl`, `anonKey` (anon public), `ki: true` falls KI gewünscht.
7. Netlify: Repository verbinden, Publish-Verzeichnis `web`.
8. Kundenlink: im SQL Editor `select zugang_anlegen('<kunde-uuid>', 60);` → Link `https://<netlify>/kunde/?t=<token>` (Token wird nur einmal angezeigt).

## Tests
`npm test` (Logik, Formulare, Stufe 1, Lernen; Praxisproben laufen nur, wenn `daten/beispiel/` vorhanden ist).
