# Lernpfad Auditvorbereitung (A01–A15)

| Lektion | Thema | Im Projekt | Stand |
|---|---|---|---|
| A01 | Repository, Ordner, `.gitignore` | warum `daten/` nie zu GitHub geht | ✓ |
| A02 | Datenmodell | Kunden, Audits, Planpunkte, Prüfpunkte, Fragen, Antworten | ✓ |
| A03 | Migration | Schema als nummerierte SQL-Dateien, nie nachträglich ändern | ✓ |
| A04 | Zeilensicherheit (RLS) | Backoffice sieht alles, Kunden nur über die Edge Function | ✓ |
| A05 | Zugang per Link | Token, Prüfsumme, Ablaufdatum, `zugang_anlegen` | ✓ |
| A06 | Edge Function | `kunde`: eine Tür für alle Kundenaktionen | ✓ (ungetestet gegen echtes Supabase) |
| A07 | Formulare lesen | Word = ZIP mit XML, TÜV-Auditplan und Prüfliste | ✓ |
| A08 | Auszüge und Suche | „Wo steht das?“: Seiten/Reiter, Suche ohne KI | ✓ |
| A09 | Testfassung ohne Server | Paket, Netlify Drop, Fortschritt im Browser, Ergebnis-Datei | ✓ |
| A10 | Bildschirm und Texterkennung | Bildschirm teilen, Foto, Texterkennung im Browser | ✓ |
| A11 | KI sicher einbinden | Geheimnis als Secret, Kostenbremse, Rückfall auf Regeln, Antworten nur aus eigenen Dokumenten | ✓ lokal getestet (Ersatz-KI), echter Schlüssel fehlt |
| A12 | Auswertung und Fragenbank | Ampel je Mitarbeiter, Fragen aus echten Audits | ✓ (Datei-Auswertung) |
| A13 | Supabase-Projekt | Eigenes Projekt (Frankfurt), öffentlicher Schlüssel vs. Geheimschlüssel, Backoffice-Nutzer | in Arbeit |
| A14 | Automatisch ausspielen | GitHub Action spielt Migrationen und Edge Functions ein; Mini-Supabase für Tests ohne Internet | in Arbeit |
| A15 | Backoffice für viele Kunden | Übersicht aller Kunden, Import, persönlicher Link, Nachrichten, Ergebnisse | in Arbeit |

## Begriffe A13–A15 (in Alltagssprache)
- **Access Token:** ein Schlüssel, mit dem GitHub in Ihrem Namen Änderungen bei Supabase einspielt. Beispiel: Eine neue Spalte für Nachrichten kommt ohne Ihr Zutun in die Datenbank.
- **GitHub-Geheimnis (Secret):** ein Tresor im Repository; niemand sieht den Wert, nur das automatische Einspielen nutzt ihn. Wichtig, weil das Repository öffentlich ist.
- **GitHub Action:** ein kleiner Arbeitsauftrag, der bei jedem Hochladen von Code von selbst läuft. Beispiel: `supabase.yml` spielt neue Migrationen ein.
- **Publishable key (öffentlicher Schlüssel):** darf in die Webseite; was damit erlaubt ist, entscheidet die Zeilensicherheit. Der Secret-/service_role-Schlüssel dagegen öffnet alles und bleibt bei Supabase.
- **Sicht (View):** eine gespeicherte Abfrage, die wie eine Tabelle aussieht. Beispiel: `kunden_uebersicht` rechnet je Kunde Termine, Übungsstand und neue Nachrichten zusammen.
- **Signierter Link:** ein Link auf eine Datei im Speicher, der nach wenigen Minuten verfällt. Beispiel: Der Seitenbetrachter holt sich so die PDF-Kopie des Handbuchs.
