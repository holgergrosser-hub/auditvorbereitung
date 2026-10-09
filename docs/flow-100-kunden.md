# Ablauf für viele Kunden (Ziel: 100 parallel, ca. 10 Minuten Berater-Zeit je Kunde)

| Schritt | Wer | Was passiert | Werkzeug |
|---|---|---|---|
| 1 Kunde anlegen | Berater | Firma, Mitarbeiter, Auditdaten | Backoffice-Seite (zu bauen) |
| 2 Unterlagen hochladen | Berater | Auditplan + Prüflisten des Zertifizierers (DOCX/PDF), Kundendokumente (PDF/XLSX) oder Drive-Ordner | Backoffice, Supabase-Speicher |
| 3 Automatik | System | Formulare lesen, Auszüge, Fahrplan, Seitenzahlen prüfen, Widerspruchs-Check, Faktencheck- und Stolperfallen-Vorschläge (KI) | Edge Function `ki`, `logik.js` |
| 4 Freigabe | Berater | Befunde, Faktencheck, Stolperfallen kurz prüfen und freigeben | Backoffice |
| 5 Einladung | Berater | Persönlicher Link als Mail-Entwurf (nie automatisch) | Backoffice → Gmail-Entwurf |
| 6 Üben | Kunde | Technik, Faktencheck, Fahrplan, Fragen mit KI-Coach | Kundenseite |
| 7 Überblick | Berater | Ein Dashboard für alle Kunden: Audittermin, Prüfungsreife, letzte Aktivität, Baustellen, Faktencheck-Korrekturen; Ampel „anrufen“ | Backoffice-Dashboard |
| 8 Erinnerung | System → Berater | Wer 5 Tage vor dem Audit unter 60 % liegt, erscheint auf der Anrufliste bzw. als Mail-Entwurf | geplanter Lauf |
| 9 Nach dem Audit | Kunde/Berater | Rückmeldung, Fragen aus dem echten Audit → Fragenbank | Kundenseite, Fragenbank |

Voraussetzung: Supabase-Projekt (Datenbank, Speicher, Edge Functions) statt Testfassung je Kunde.
