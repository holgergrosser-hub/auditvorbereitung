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
