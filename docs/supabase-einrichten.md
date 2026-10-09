# Supabase einrichten (Lektionen A13–A15)

Einmalig, etwa 20 Minuten. Danach kommt jede Änderung automatisch über GitHub.

1. **Projekt anlegen:** supabase.com → New project, Name `auditvorbereitung`, Region Frankfurt (eu-central-1). Datenbank-Passwort sicher ablegen.
2. **Öffentliche Werte an Claude:** Project URL (`https://….supabase.co`) und Publishable key (`sb_publishable_…`). Sie kommen in `web/config.js`. **Nie** den Secret-/service_role-Schlüssel weitergeben.
3. **Reference ID:** Project Settings → General.
4. **Access Token:** Konto → Access Tokens → Generate new token (`github-auditvorbereitung`).
5. **GitHub-Geheimnisse:** Repository → Settings → Secrets and variables → Actions:
   `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
   Danach unter *Actions → Supabase ausspielen → Run workflow* einmal starten (oder auf den nächsten Push warten).
6. **Backoffice-Zugang:** Authentication → Users → Add user (E-Mail, Passwort, Auto Confirm).
   Dann einmal im SQL Editor (Claude schreibt die Zeile, Sie fügen nur ein):
   `insert into public.backoffice_nutzer (email, name) values ('ihre@mail.de', 'Ihr Name');`
7. **Netlify:** Add new site → Import from GitHub → `auditvorbereitung`. `netlify.toml` regelt den Rest.
   Kunden: `https://<site>/kunde/?t=…` · Backoffice: `https://<site>/backoffice/`
8. **Optional KI:** Edge Functions → Secrets: `ANTHROPIC_API_KEY`, `KI_MODELL`; in `config.js` `ki: true`.

## Neuer Kunde
1. Unterlagen an Claude (PDFs, Excel, Auditplan/Prüfliste des Zertifizierers, Termine).
2. Claude baut das Paket (`npm run paket -- daten/<kunde>`) und schickt die Zip.
3. Backoffice → **+ Kunde importieren** → Zip wählen → importieren.
4. Reiter **Link** → Link erzeugen → in Ihre E-Mail an den Kunden kopieren (nichts geht automatisch raus).

## Lokal testen (ohne Internet)
`PGRST=… DENO=… bash test/mini-supabase/starten.sh` – dann `http://localhost:54321/backoffice/` (Anmeldung `test@example.com`, beliebiges Passwort).
