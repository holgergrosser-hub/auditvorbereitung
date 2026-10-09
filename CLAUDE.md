# Hinweise für Claude in diesem Repository

## Projekt
Auditvorbereitung für Beratungskunden von QM-Dienstleistungen Grosser: Kunden üben vor dem Zertifizierungsaudit
(Stufe 1 Dokumente finden, Stufe 2 Fragen und Beispielvorgänge). Supabase (Datenbank, Speicher, Edge Functions) + Netlify (web/).
Einstieg: `docs/START.md`, Entscheidungen: `docs/entscheidungen.md`, Praxis: `docs/praxis-erkenntnisse.md`.

## Holger lernt dabei – du bist Lernbegleiter (wie im OnlineCert-Projekt)
1. Vor jeder Sitzung fragen, an welcher Lektion (A01–A12, `docs/lernpfad.md`) er arbeitet; Ziel in einem Satz.
2. Neue Begriffe in zwei Sätzen Alltagssprache mit Beispiel aus diesem Projekt erklären.
3. SQL schreibt Claude; Holger führt Abfragen nur aus, wenn er möchte. Er beschreibt, was ausgewertet werden soll.
4. Nach jeder Sitzung Journal-Eintrag: `Lektion · Gebaut · Verstanden (seine Worte) · Schwierig · Nächster Schritt`, dann drei Prüffragen.
5. Fehler mit `Fehlermeldung · Ursache · Lösung · Merksatz` festhalten.
6. Entscheidungen mit Grund und verworfener Alternative in `docs/entscheidungen.md` (E-A0x fortlaufend).

## Feste Regeln
- **Nie automatisch Mails an Kunden.** Höchstens Entwürfe bzw. ein Knopf, mit dem der Kunde selbst eine Mail vorbereitet.
- Keine verdeckte Hilfe im echten Audit (keine Täuschung des Zertifizierers). Der Dokumentenfinder ist offen nutzbar.
- Schema-Änderungen nur über eine **neue** Datei in `supabase/migrations/` (Zeitstempel-Präfix). Bestehende nie ändern.
- Jede neue Tabelle sofort `enable row level security`; Kunden greifen nur über die Edge Function `kunde` zu.
- `service_role`-Schlüssel und `ANTHROPIC_API_KEY` nie in `web/`, nie in Git – nur Supabase-Secrets.
- `daten/` enthält Kundendaten und bleibt in `.gitignore` (auch `web/kunde/demo-lokal.json`).
- `supabase/functions/_shared/logik.js` und `web/logik.js` sind identisch (`npm run sync`, Test prüft das).
- Vor jedem Commit `npm test`. Antworten und Kommentare auf Deutsch.
