# Entscheidungen Auditvorbereitung

**E-A01 Name „Auditvorbereitung“, eigenes Repo und eigenes Supabase-Projekt.** Grund: Probeaudit bleibt unverändert, Kundendaten getrennt. Verworfen: Erweiterung des Probeaudits.

**E-A02 Kunden ohne Login, persönlicher Link mit Token.** Grund: Zielgruppe hat wenig Technik-Erfahrung. Gespeichert wird nur die Prüfsumme. Verworfen: Supabase-Login für Kunden.

**E-A03 Mails nur als Entwurf bzw. vom Kunden selbst ausgelöst.** Grund: Holgers feste Regel „ich muss immer drüber schauen können“. Verworfen: automatischer Versand.

**E-A04 Stufe 1 übt „Dokument finden“, Stufe 2 übt „Fragen und Beispielvorgänge“.** Grund: Praxisgespräche (P01, P04) – Kunden scheitern am Finden, nicht am Antworten. Verworfen: Frage-Antwort-Training für beide Stufen.

**E-A05 „Wo steht das?“ ohne KI über Auszüge (Seite/Reiter) und Volltextsuche.** Grund: läuft ohne Server und ohne Kosten, nachvollziehbar, Seitenverschiebung wird erkannt. KI kommt optional dazu. Verworfen: nur KI-Suche.

**E-A06 Dokumentprüfung per Texterkennung im Browser (Tesseract), KI-Bildprüfung optional.** Grund: funktioniert in der Testfassung ohne Server; Fotos verlassen den Rechner des Kunden nicht. Verworfen: Bilder immer an eine KI schicken.

**E-A07 Testfassung als Paket für Netlify Drop, Fortschritt im Browser, Ergebnis als Datei.** Grund: erster Kundentest am 10.10.2026, bevor Supabase eingerichtet ist; keine Kundendaten in Git. Verworfen: Kundendaten ins Repository; Test erst nach Server-Einrichtung.

**E-A08 Keine verdeckte Hilfe im echten Audit.** Grund: Täuschung des Zertifizierers gefährdet das Zertifikat. Der Dokumentenfinder ist offen nutzbar wie eine ausgedruckte Liste. Verworfen: „Souffleur“-Modus.

**E-A09 Stolperfallen und Faktencheck werden vom Berater freigegeben.** Grund: Inhalte stammen aus Gesprächen und Widerspruchs-Check; Kunde soll nichts Falsches lernen. Verworfen: automatische Veröffentlichung.

**E-A10 Fehlerbuch ohne eigene Tabellen.** Ursache je Frage als Eintrag (`kunden_eintraege`, art `lernen`), Baustelle schließt nach zweimal in Folge sicher. Je Ursache eine andere Übung; schwer auffindbare Fundstellen gehen als Hinweis an den Berater. Verworfen: drei neue Tabellen und KI-Ursachenvorschlag aus dem Steckbrief (Regel-Vorschlag genügt), „zwei verschiedene Tage“ (Vorbereitung oft nur wenige Tage).

**E-A11 „Erklär es dem Azubi“ zuerst ohne KI.** Prozesse aus den Handbuch-Auszügen, Nachplappern über gleiche Wortfolgen, feste Anfänger-Nachfragen, Beispielkiste für den Spickzettel. Das echte Gespräch mit Nachbohren kommt mit der KI-Funktion nach der Supabase-Einrichtung. Verworfen: vier neue Tabellen und Avatar.

**E-A12 Stadion-Modus erst nach Supabase, freiwillig, ab 60 % Prüfungsreife, nicht in den letzten 3 Tagen.** Grund: Holgers Botschaft „Der Auditor ist ein Gespräch und hilft“ darf nicht untergraben werden. Verworfen: Vergessenskurve als Ersatz für den Ruhemodus.

**E-A13 Testfassung: Stand per Netlify-Formular an den Berater.** Der Kunde klickt „Stand senden“, der Berater sieht ihn in Netlify (Forms) und kann sich per Mail benachrichtigen lassen. Ohne Fotos. Verworfen: nur Datei-Download per Mail (zu umständlich), automatisches Senden ohne Klick.

**E-A14 PDF-Kopien der Kundendokumente im Paket.** Falls der Kunde keinen Zugriff auf die Originale hat, öffnet „PDF-Kopie“ die richtige Seite bzw. den richtigen Reiter. Verworfen: nur Google-Links.

**E-A15 Spickzettel je Programmpunkt des Auditplans.** Je Punkt: Normkapitel, Thema, Dokument mit Seite/Reiter – zum Danebenlegen, nicht zum Lernen. Verworfen: Liste aller Fundstellen nach Dokument (unübersichtlich).

**E-A16 Eigener Seitenbetrachter (pdf.html mit PDF.js, lokal mitgeliefert) statt `datei.pdf#page=N`.** Im Test mit Holger öffnete der Chrome-PDF-Betrachter bei „S. 5“ die Seite 3 – das verunsichert Kunden. Der eigene Betrachter springt immer auf die angegebene Seite, markiert die Fundstelle gelb und hat „zur Fundstelle“. Ein Test öffnet jeden Link und prüft die sichtbare Seite gegen die Fußzeile „Seite N von“ bzw. den Reiternamen. Verworfen: `#page` (Browser-abhängig, Safari ignoriert es), Einzelseiten-PDFs (Kontext fehlt), PDF.js vom CDN (Firmennetze sperren das).

**E-A17 Senden jederzeit aus der Kopfzeile, mit Nachricht.** Änderungswünsche vor dem Audit dürfen nicht erst „nach dem Audit“ abgeschickt werden. Faktencheck-Korrekturen haben einen eigenen Senden-Knopf mit vorausgefülltem Text. Verworfen: „E-Mail vorbereiten“ (leere Mail, Anhang von Hand).

**E-A18 Übersicht zuerst, Farben je Bereich.** „Heute“ zeigt oben Termin (Tage bis zum Audit), Prüfungsreife als Ring und *einen* großen nächsten Schritt; darunter Kacheln je Bereich mit Stand und Fortschrittsbalken. Farben: Einrichten violett, Üben petrol, Audit-Tag blau, Nachschlagen orange – Grün/Gelb/Rot bleiben allein für den Ampel-Stand. Jede Detailseite trägt die Farbe ihres Bereichs und hat „‹ Übersicht“. Verworfen: lange Seite mit allen Karten untereinander (Holger: „Moderne Apps sind übersichtlich“).

**E-A19 Supabase statt Netlify Drop je Kunde.** Holger erwartet viele Kunden; je Kunde eine Zip bauen und eine Netlify-Site anlegen macht keinen Spaß und skaliert nicht. Jetzt: ein eigenes Supabase-Projekt (Frankfurt), eine Netlify-Site aus GitHub für alle Kunden, Backoffice mit Übersicht. Verworfen: OnlineCert-Projekt mitnutzen (Kundendaten und Rechte zweier Systeme vermischt).

**E-A20 Ausspielen per GitHub Action.** Migrationen und Edge Functions kommen bei jedem Push automatisch nach Supabase (drei GitHub-Geheimnisse). Verworfen: SQL von Hand in den SQL Editor kopieren (fehleranfällig, bei jeder Änderung erneut).

**E-A21 Kunden zuerst per Paket-Import.** Das Backoffice importiert die Zip der Testfassung (paket.json + PDFs). Claude baut das Paket aus den Unterlagen (Auszüge, Fahrplan, Faktencheck, Stolperfallen) – die erprobte Kette bleibt. Selbst-Upload mit Texterkennung im Browser folgt als nächster Schritt. Verworfen: sofort alles im Browser nachbauen (größeres Risiko vor den nächsten Audits).

**E-A22 Nachrichten statt Netlify-Formular.** „✉ An … senden“ schreibt im Servermodus in die Tabelle `nachrichten`; Holger sieht sie im Backoffice (orange Zahl). Keine automatische Mail, kein Spamfilter. Höchstens 30 Nachrichten je Kunde und Tag.

**E-A23 Testen ohne Internet: Mini-Supabase.** `test/mini-supabase/` startet Datenbank mit allen Migrationen, PostgREST, die Edge Function „kunde“ (Deno) und einen kleinen Server für Anmeldung und Speicher. So laufen Import, Link, Kundenseite und Seitenbetrachter Ende-zu-Ende, bevor etwas zu Supabase geht.

**E-A24 KI nur aus den eigenen Dokumenten.** „🤖 KI fragen“ (Wo steht das?) sucht zuerst ohne KI die passenden Textstellen und gibt der KI nur diese – sie antwortet in höchstens 5 Sätzen, nennt die Quellen (Knopf „Seite X öffnen“) und sagt ehrlich, wenn nichts drinsteht. Ohne Treffer wird die KI gar nicht gefragt (keine Kosten, kein Erfinden). Dazu: Probegespräch mit dem KI-Auditor (Lernen) mit Rückmeldung nach Holgers Formel, KI-Coach bei Stufe-2-Antworten jetzt mit Auszügen. Kostenbremse 300 KI-Aufrufe je Kunde und Tag. Verworfen: KI mit allgemeinem Normwissen antworten lassen (klingt gut, passt aber nicht zu den Dokumenten des Kunden – der Auditor prüft genau das).

**E-A25 Erfundener Testkunde im Repository.** `test/testkunde/` (Beispiel Haustechnik GmbH, Musterstadt) mit eigenen PDFs, Excel und Prüfliste als JSON; `test/browser/alles.py` spielt 35 Funktionen Ende-zu-Ende durch (Backoffice, Kundenseite, KI, Sperren, Löschen). Vor jeder größeren Änderung laufen lassen. Nebenbei: Prüflisten anderer Zertifizierer können jetzt als JSON (`pruefpunkte`) ins Paket. Verworfen: mit MESTO-Daten testen (Kundendaten gehören nicht in Tests).

**E-A26 Lehren aus der Tawuniya-App (UX Design Award 2025).** Eine kräftige Hauptkarte (Termin + genau ein nächster Schritt, Farbe des Bereichs), sonst ruhig weiß/grau; Bereichsfarben nur noch als Etikett; Schnellzugriffe als runde Knöpfe; Abschnitte mit Etikett und Auf-/Zuklappen; untere Leiste am Handy (Heute · Üben · Nachschlagen · Audit-Tag · Mehr); Schrittanzeige mit kleinem Kreis; „ⓘ Wo finde ich das?“ je Dokument; Filter-Chips im Fahrplan. Verworfen: seitlich wischbare Karten (für wenig technikerfahrene Kunden leicht zu übersehen).

**E-A27 Fortschritt der Testfassung hängt am Firmennamen, nicht am Paketdatum.** Vorher verlor ein neu gebautes Paket den Stand im Browser (Schlüssel mit Erstelldatum). Jetzt fester Schlüssel; ein Stand unter dem alten Schlüssel wird beim ersten Öffnen übernommen.

**E-A28 Supabase über die Claude-Verbindung eingerichtet statt per GitHub Action.** Holger hat Claude mit Supabase verknüpft. Projekt `auditvorbereitung` (Frankfurt, kostenloser Plan, ID `xpqcivhywtwfhkevybvd`), alle Migrationen eingespielt (Versionsnummern wie die Dateinamen, damit `supabase db push` später nichts doppelt einspielt), Edge Functions `kunde` und `ki` ausgespielt. Die ausgespielten Functions laden `logik.js` festgenagelt auf einen Commit von GitHub (jsDelivr) – im Repository bleibt der Import `../_shared/logik.js`. Die GitHub Action läuft nur noch auf Knopfdruck (sonst schlägt jeder Push ohne Geheimnisse fehl). Verworfen: Datenbank-Passwort und Access Token in GitHub hinterlegen (mehr Geheimnisse an mehr Orten, für einen Nutzer unnötig).

**E-A29 Weg nach SAP: Standard statt Einzelanfertigung (`docs/weg.md`).** Ein Werkzeug für alle, angepasst über Daten; jeder Kunde macht es besser (Fragenbank als „Prozess-Schatz“); Kundenwünsche nur, wenn sie allen helfen. Verworfen: Sonderfunktionen je Kunde (SAP-Customizing-Falle).

**E-A30 Kostenloser Testmonat über LinkedIn mit erfundener Beispielfirma.** Ablauf: Formular `/test/` → Tabelle `testanfragen` (über die Edge Function, Honigtopf, höchstens 3 Anfragen je E-Mail und 60 je Tag) → Holger prüft im Backoffice → **Freischalten** kopiert die Vorlage (Beispiel Haustechnik GmbH) für genau diesen Teilnehmer (`testkunde_anlegen`, Termine relativ: Stufe 1 = +14 Tage) → Chat-Text mit Link und Schlüssel zum Kopieren, Holger schickt ihn **selbst** im LinkedIn-Chat. Teilnehmer geben über „💡 Verbesserung“ Rückmeldung (Note, Geholfen, Fehlt, „mit eigenen Dokumenten: ja/vielleicht/nein“), gesammelt im Backoffice unter „Feedback“. Verworfen: Teilnehmer laden eigene Dokumente hoch (Kundendaten Fremder, Prüfaufwand, noch kein Self-Upload); ein gemeinsamer Demo-Zugang für alle (Übungsstände würden sich mischen, keine Grenze je Teilnehmer möglich); automatische Mail mit dem Schlüssel (Grundregel).

**E-A31 Grenzen je Teilnehmer in der Datenbank.** `kunden.grenzen` (Standard im Testmonat: 20 KI-Fragen je Tag, 150 gesamt, 5 Nachrichten je Tag, 30 Fotos), Laufzeit über den Link (30 Tage). Gezählt wird in `nutzung` mit `nutzung_buchen()` – zählt und prüft in einem Schritt, damit zwei gleichzeitige Klicks die Grenze nicht überlisten. Echte Kunden haben keine Testgrenzen (nur die alte Kostenbremse 300 KI/Tag, 30 Nachrichten/Tag). Holger kann Grenzen je Teilnehmer im Reiter „Verwalten“ ändern. Verworfen: Zähler im Browser (umgehbar), Zähler in `kunden_eintraege` (nicht atomar).

**E-A32 Teilnehmer teilen die Dateien der Vorlage.** Die PDF-Kopien werden nicht je Teilnehmer kopiert (Speicherplatz im kostenlosen Plan). Beim Löschen eines Kunden bleiben Dateien liegen, die ein anderer Kunde noch nutzt. Getestet (T8).

**E-A33 Eigene Dokumente bleiben im Browser des Teilnehmers.** Holger: „Dann sehe ich niemals die Daten – ich will die nicht sehen.“ Im Testmonat wählt der Teilnehmer *Beispielfirma* oder *eigene Dokumente*. Eigene PDFs liest PDF.js im Browser; Dateien, Seitentexte und Übungsstand liegen in IndexedDB/localStorage dieses Browsers (`web/kunde/eigene.js`). Der Fahrplan entsteht aus den Standardfragen ISO 9001 je Kapitel, Fundstellen schlägt die Suche ohne KI vor („bitte prüfen“). Der Server bekommt nur `start` und Verbesserungsvorschläge (geprüft: E7). „KI fragen“ schickt die passenden Textstellen (höchstens 8 × 1.400 Zeichen) mit der Frage; die Funktion `ki` reicht sie nur durch und protokolliert keine Inhalte. „An Holger senden“ ist in diesem Modus ausgeblendet. Verworfen: Hochladen nach Supabase (Holger will und darf die Daten nicht sehen), ganz ohne KI (Holger: durchreichen ist in Ordnung). Grenze: nur PDFs mit Text – Scans findet die Suche nicht (Hinweis beim Einrichten); nur auf diesem Gerät/Browser.

**E-A34 Werbliches nur am Anfang und am Ende (`web/kunde/marke.js`).** Ruhige Fußzeile auf jeder Seite (seit 1994, über 1.000 Audits, ★ 5,0 bei Google, Impressum, Datenschutz). Nach dem Audit erst nach eingetragenem Ergebnis: Bitte um Google-Bewertung an *alle* (Google untersagt das Auswählen nur Zufriedener) und Karte „Und nächstes Jahr?“ mit Link auf die bestehende Angebotsseite vorbereitung-auf-audit.netlify.app (ca. 6–12 Std. à 135 €, nach Aufwand; der Kunde fordert selbst an) – im Testmonat als „Persönliche Begleitung für Ihr Audit?“, auch auf der Testseite. Spickzettel mit Fußzeile „Auditvorbereitung mit QM-Dienstleistungen Grosser · qm-guru.de“ – offen sichtbar, keine verdeckte Hilfe. Im Testmonat keine Bewertungs-/Folgejahr-Karten. Verworfen: Werbung beim Üben (Kunde soll sich nicht als Werbefläche fühlen), Bewertungsbitte nur bei „bestanden“ (Review Gating).
