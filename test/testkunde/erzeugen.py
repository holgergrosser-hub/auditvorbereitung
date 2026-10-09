#!/usr/bin/env python3
"""Erfundener Testkunde fuer Ende-zu-Ende-Tests (keine echten Kundendaten, darf ins oeffentliche Repository).
Erzeugt quellen/*.pdf, quellen/QM-Uebersicht.xlsx (+ PDF-Kopie) und paket-quelle.json.
Absichtlich eingebaute Stolpersteine: Zertifizierer "in Auswahl", Platzhalter, Notfallplan ENTWURF, Rollen widerspruechlich.
Aufruf: python3 test/testkunde/erzeugen.py && npm run paket -- test/testkunde"""
import json, os, datetime
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak
import openpyxl

HIER = os.path.dirname(os.path.abspath(__file__)); Q = os.path.join(HIER, 'quellen'); os.makedirs(Q, exist_ok=True)
FIRMA = 'Beispiel Haustechnik GmbH'; STAND = '01.10.2026'
st = getSampleStyleSheet(); H1 = ParagraphStyle('h1', parent=st['Heading1'], fontSize=16, textColor=colors.HexColor('#1F4E79'))
H2 = ParagraphStyle('h2', parent=st['Heading2'], fontSize=12.5, textColor=colors.HexColor('#1F4E79')); P = ParagraphStyle('p', parent=st['BodyText'], fontSize=10.5, leading=14)

def pdf(datei, kopf, seiten, quer=False):
    """seiten: Liste von Listen von Flowables; jede innere Liste = eine Seite"""
    gr = landscape(A4) if quer else A4
    gesamt = len(seiten)
    def rahmen(c, d):
        c.saveState(); c.setFont('Helvetica', 8.5); c.setFillColor(colors.HexColor('#555555'))
        c.drawString(2 * cm, gr[1] - 1.3 * cm, kopf + ' | ' + FIRMA); c.drawRightString(gr[0] - 2 * cm, gr[1] - 1.3 * cm, 'Stand: ' + STAND)
        c.drawString(2 * cm, 1.2 * cm, 'Erstellt: QMB | Freigabe: GF'); c.drawRightString(gr[0] - 2 * cm, 1.2 * cm, 'Seite %d von %d' % (d.page, gesamt)); c.restoreState()
    doc = BaseDocTemplate(os.path.join(Q, datei), pagesize=gr, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2.2 * cm, bottomMargin=2 * cm)
    doc.addPageTemplates([PageTemplate(frames=[Frame(2 * cm, 2 * cm, gr[0] - 4 * cm, gr[1] - 4.2 * cm)], onPage=rahmen)])
    fl = []
    for i, s in enumerate(seiten):
        fl += s
        if i < gesamt - 1: fl.append(PageBreak())
    doc.build(fl)

def tab(zeilen, breiten=None, kopf=True):
    t = Table([[Paragraph(str(c), P) for c in z] for z in zeilen], colWidths=breiten)
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#9AAAB8')), ('VALIGN', (0, 0), (-1, -1), 'TOP')] + ([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DCE6F0'))] if kopf else [])))
    return t

def prozess(nr, name, art, verantw, schritte, hinweis):
    return [Paragraph(name, H1), Paragraph(art, P), Paragraph('1. Stammdaten', H2),
            tab([['Prozess-Nr.', nr], ['Prozessname', name], ['Kategorie', art], ['Verantwortlich', verantw]], [5 * cm, 12 * cm], kopf=False),
            Paragraph('2. Prozessablauf', H2), tab([['Nr.', 'Tätigkeit', 'Verantwortlich', 'Hilfsmittel / Dokument']] + [[str(i + 1)] + list(s) for i, s in enumerate(schritte)], [1.2 * cm, 8 * cm, 3.8 * cm, 4 * cm]),
            Paragraph('3. Hinweise', H2), Paragraph(hinweis, P)]

# ---------------------------------------------------------------- Handbuch (17 Seiten)
uph = [
 [Paragraph('Unternehmens- und Prozesshandbuch', H1), Paragraph(FIRMA + ', Musterstraße 1, 12345 Musterstadt', P), Spacer(1, 12),
  Paragraph('Inhalt: 1 Dokumentenübersicht · 2 Anwendungsbereich · 3 Kontext und Prozesse · 4 Unternehmen und Qualitätspolitik · 5 Rollen · 6 Risiken, Chancen und Ziele · 7 Ressourcen und Kompetenz · 8 Prozessbeschreibungen · 9 Verbesserung', P)],
 [Paragraph('Dokumentenübersicht', H1), Paragraph('VA – Dokumentierte Informationen. Alle Dokumente liegen in Google Drive im Ordner „QM“. Gelenkt werden Handbuch, QM-Übersicht (Excel mit Reitern), Managementbewertung, Auditprogramm, Auditbericht und Notfallplan.', P),
  tab([['Dokument', 'Kürzel', 'Stand'], ['Unternehmens- und Prozesshandbuch', 'UPH', STAND], ['QM-Übersicht', 'QMÜ', STAND], ['Managementbewertung 2026', 'MB', '15.09.2026'], ['Auditprogramm 2026–2028', 'AP', '01.09.2026'], ['Notfallplan', 'NFP', 'ENTWURF']])],
 [Paragraph('Anwendungsbereich und Kontext der Organisation', H1), Paragraph('Geltungsbereich: Planung, Installation und Wartung von Heizungs- und Sanitäranlagen für Privat- und Gewerbekunden. Ausschluss: 8.3 Entwicklung (wir planen nach Herstellervorgaben, keine eigene Produktentwicklung).', P),
  Paragraph('Interne und externe Themen', H2), Paragraph('Fachkräftemangel im Handwerk, steigende Energiepreise, Förderprogramme für Wärmepumpen, Lieferzeiten bei Bauteilen. Die Themen bewerten wir jährlich in der Managementbewertung.', P)],
 [Paragraph('Interessierte Parteien und Prozesse', H1), Paragraph('Kunden: pünktliche Termine, saubere Baustelle, nachvollziehbare Rechnung. Lieferanten: verlässliche Abnahme. Mitarbeiter: sichere Arbeitsplätze, Weiterbildung. Behörden: Einhaltung von Arbeitsschutz und Trinkwasserverordnung.', P),
  Paragraph('Prozesslandkarte', H2), Paragraph('Führungsprozesse: F1 Managementbewertung, F2 Internes Audit. Wertschöpfung: W1 Angebots- und Auftragsbearbeitung, W2 Durchführung der Montage. Unterstützung: U1 Einkauf, U2 Lieferantenbewertung, U3 Kundenreklamationen, U4 Wartung der Werkzeuge und Prüfmittel.', P)],
 [Paragraph('Unternehmen und Qualitätspolitik', H1), Paragraph('Die ' + FIRMA + ' ist ein Familienbetrieb mit Kundendienst und Montage. Qualität heißt für uns: Der Kunde bekommt, was vereinbart ist – pünktlich und sauber.', P),
  Paragraph('Qualitätspolitik', H2), Paragraph('Wir halten Termine ein, arbeiten sicher und bilden unsere Mitarbeiter laufend weiter. Reklamationen sehen wir als Chance zur Verbesserung. Freigabe: Geschäftsführung.', P)],
 [Paragraph('Rollen, Verantwortlichkeiten und Befugnisse', H1), tab([['Rolle', 'Person'], ['Geschäftsführung', 'Erika Beispiel'], ['Qualitätsmanagementbeauftragter (QMB)', 'Max Probe'], ['Kundendienst und Disposition', 'Max Probe'], ['Montage', 'Team Montage (4 Monteure)']]),
  Paragraph('Hinweis: Im Organigramm der QM-Übersicht ist Max Probe zusätzlich als „Geschäftsführung“ eingetragen.', P)],
 [Paragraph('Risiken, Chancen und Qualitätsziele', H1), Paragraph('Risiken und Chancen bewerten wir in der QM-Übersicht, Reiter „Risiken“ und „Chancen“ (Eintrittswahrscheinlichkeit × Auswirkung). Die Qualitätsziele stehen im Reiter „Ziele & Kennzahlen“: Reklamationsquote unter 2 %, 95 % der Termine pünktlich, 16 Schulungsstunden je Monteur und Jahr.', P)],
 [Paragraph('Ressourcen, Kompetenz und Schulung', H1), Paragraph('Werkzeuge und Prüfmittel (Druckprüfgerät, Abgasmessgerät) werden nach Plan geprüft, siehe QM-Übersicht, Reiter „Prüfmittel“. Schulungen plant die Geschäftsführung im Reiter „Schulungsplan“; Nachweise liegen in der Personalakte.', P)],
 prozess('F1', 'Managementbewertung', 'Führungsprozess', 'Geschäftsführung', [('Daten sammeln (Ziele, Reklamationen, Audits, Lieferanten)', 'QMB', 'QM-Übersicht'), ('Bewertung einmal jährlich durchführen', 'Geschäftsführung', 'Managementbewertung'), ('Maßnahmen und neue Ziele festlegen', 'Geschäftsführung', 'Reiter Ziele & Kennzahlen')], 'Normbezug: ISO 9001 Kapitel 9.3. Die Managementbewertung findet jedes Jahr im September statt.'),
 prozess('F2', 'Internes Audit', 'Führungsprozess', 'QMB', [('Auditprogramm für drei Jahre planen', 'QMB', 'Auditprogramm 2026–2028'), ('Audit durchführen (extern beauftragter Auditor)', 'QMB', 'Auditbericht'), ('Feststellungen in den Maßnahmenplan übernehmen', 'QMB', 'QM-Übersicht')], 'Normbezug: ISO 9001 Kapitel 9.2. Jeder Prozess wird mindestens einmal in drei Jahren auditiert.'),
 prozess('W1', 'Angebots- und Auftragsbearbeitung', 'Wertschöpfungsprozess', 'Kundendienst', [('Anfrage aufnehmen (Telefon, E-Mail)', 'Kundendienst', 'Kundenkartei'), ('Vor-Ort-Termin und Aufmaß', 'Monteur', 'Aufmaßblatt'), ('Angebot schreiben und nachfassen', 'Kundendienst', 'Angebot'), ('Auftrag bestätigen und Termin planen', 'Kundendienst', 'Auftragsbestätigung')], 'Normbezug: ISO 9001 Kapitel 8.2. Jedes Angebot wird nach einer Woche nachgefasst.'),
 prozess('W2', 'Durchführung der Montage', 'Wertschöpfungsprozess', 'Montage', [('Material kommissionieren', 'Monteur', 'Materialliste'), ('Montage nach Herstellervorgabe', 'Monteur', 'Montageanleitung'), ('Druckprüfung und Inbetriebnahme', 'Monteur', 'Prüfprotokoll'), ('Abnahme mit dem Kunden', 'Monteur', 'Abnahmeprotokoll'), ('Rechnung stellen', 'Büro', 'Rechnung')], 'Normbezug: ISO 9001 Kapitel 8.5. Ohne unterschriebenes Abnahmeprotokoll keine Rechnung.'),
 prozess('U1', 'Einkauf', 'Unterstützungsprozess', 'Geschäftsführung', [('Bedarf melden', 'Monteur', 'Bestellliste'), ('Bei freigegebenem Lieferanten bestellen', 'Büro', 'Lieferantenliste'), ('Wareneingang prüfen (Menge, Schäden)', 'Monteur', 'Lieferschein')], 'Normbezug: ISO 9001 Kapitel 8.4. Bestellt wird nur bei Lieferanten aus der Lieferantenliste.'),
 prozess('U2', 'Lieferantenbewertung', 'Unterstützungsprozess', 'Geschäftsführung', [('Hauptlieferanten festlegen', 'Geschäftsführung', 'Lieferantenliste'), ('Lieferanten jährlich nach Qualität, Termintreue und Preis bewerten', 'Geschäftsführung', 'Reiter Lieferantenbewertung'), ('Bei schlechter Bewertung Gespräch oder Wechsel', 'Geschäftsführung', 'Maßnahmenplan')], 'Normbezug: ISO 9001 Kapitel 8.4.1. Die Bewertung erfolgt jedes Jahr im Januar.'),
 prozess('U3', 'Kundenreklamationen', 'Unterstützungsprozess', 'Kundendienst', [('Reklamation aufnehmen und bestätigen', 'Kundendienst', 'Reklamationsliste'), ('Ursache klären, Termin für Nachbesserung', 'Monteur', 'Reklamationsliste'), ('Maßnahme festlegen, damit es nicht wieder passiert', 'Geschäftsführung', 'Maßnahmenplan')], 'Normbezug: ISO 9001 Kapitel 10.2. Jede Reklamation wird innerhalb von 2 Werktagen beantwortet.'),
 prozess('U4', 'Wartung der Werkzeuge und Prüfmittel', 'Unterstützungsprozess', 'QMB', [('Prüftermine planen', 'QMB', 'Reiter Prüfmittel'), ('Prüfung durchführen lassen (Kalibrierung, DGUV V3)', 'Dienstleister', 'Prüfprotokoll'), ('Defekte Geräte sperren', 'Monteur', 'Sperrschild')], 'Normbezug: ISO 9001 Kapitel 7.1.5. Das Abgasmessgerät wird jährlich kalibriert.'),
 [Paragraph('Verbesserung', H1), Paragraph('Fehler, Reklamationen und Ideen der Mitarbeiter sammeln wir im Maßnahmenplan der QM-Übersicht. Die Geschäftsführung prüft den Stand monatlich in der Teambesprechung.', P)],
]
pdf('UPH.pdf', 'Unternehmenshandbuch', uph)
# ---------------------------------------------------------------- weitere Dokumente
pdf('MB.pdf', 'Managementbewertung 2026', [
 [Paragraph('Managementbewertung 2026', H1), Paragraph('Bewertungszeitraum 01.09.2025–31.08.2026. Teilnehmer: Erika Beispiel (GF), Max Probe (QMB).', P), Paragraph('Zertifizierung: Zertifizierer in Auswahl (TÜV oder DEKRA).', P), Paragraph('Personalstand: [bitte ergänzen] Mitarbeiter.', P)],
 [Paragraph('Ergebnisse', H2), Paragraph('Reklamationsquote 1,4 % (Ziel unter 2 % erreicht). Termintreue 93 % (Ziel 95 % nicht erreicht – Ursache Lieferzeiten bei Wärmepumpen). Lieferantenbewertung Januar 2026 durchgeführt, ein Lieferant mit Maßnahme.', P)],
 [Paragraph('Beschlüsse', H2), Paragraph('Neues Ziel: Termintreue 95 % durch Lagerbestand wichtiger Bauteile. Schulung Wärmepumpen für zwei Monteure bis März 2027. Internes Audit 2027 für W1 und U3.', P)]])
pdf('Auditprogramm.pdf', 'Auditprogramm 2026–2028', [[Paragraph('Auditprogramm 2026–2028', H1),
 tab([['Prozess', '2026', '2027', '2028'], ['F1 Managementbewertung', 'X', '', 'X'], ['F2 Internes Audit', 'X', '', ''], ['W1 Angebots- und Auftragsbearbeitung', 'X', 'X', ''], ['W2 Durchführung der Montage', 'X', '', 'X'], ['U1 Einkauf', '', 'X', ''], ['U2 Lieferantenbewertung', '', '', 'X'], ['U3 Kundenreklamationen', 'X', 'X', ''], ['U4 Wartung', '', 'X', '']]),
 Paragraph('Das interne Audit 2026 fand am 10.09.2026 statt (Auditbericht).', P)]])
pdf('Auditbericht.pdf', 'Auditbericht internes Audit', [
 [Paragraph('Auditbericht internes Audit 2026', H1), Paragraph('Datum 10.09.2026, Auditor: externer Berater. Geprüft: F1, F2, W1, W2, U3. Ergebnis: System wirksam, zwei Verbesserungspotenziale.', P)],
 [Paragraph('Feststellungen', H2), Paragraph('VP1: Angebote werden nicht immer nach einer Woche nachgefasst. VP2: Schulungsnachweise für einen Monteur fehlen. Beide Punkte stehen im Maßnahmenplan.', P)]])
pdf('Notfallplan.pdf', 'Notfallplan', [[Paragraph('Notfallplan – ENTWURF', H1), Paragraph('Bei Brand: 112, Sammelplatz Hof. Ersthelfer: Max Probe. Feuerlöscher im Lager und in jedem Fahrzeug. Eine Notfallübung ist noch nicht durchgeführt.', P)]])
# ---------------------------------------------------------------- QM-Übersicht (Excel + PDF-Kopie, ein Reiter je Seite)
blaetter = {
 'Übersicht': [['QM-Übersicht', FIRMA], ['Inhalt', 'Ziele, Lieferanten, Risiken, Chancen, Schulung, Prüfmittel, Organigramm']],
 'Ziele & Kennzahlen': [['Ziel', 'Soll', 'Ist 2026'], ['Reklamationsquote', 'unter 2 %', '1,4 %'], ['Termintreue', '95 %', '93 %'], ['Schulungsstunden je Monteur', '16 h', '18 h']],
 'Lieferantenbewertung': [['Lieferant', 'Qualität', 'Termintreue', 'Preis', 'Ergebnis'], ['Großhandel Nord', '1', '2', '2', 'A'], ['Wärmepumpen Süd', '2', '3', '2', 'B – Maßnahme']],
 'Risiken': [['Risiko', 'Wahrscheinlichkeit', 'Auswirkung', 'Maßnahme'], ['Ausfall Monteur', '2', '3', 'Vertretungsplan'], ['Lieferverzug Wärmepumpen', '3', '2', 'Lagerbestand']],
 'Chancen': [['Chance', 'Nutzen', 'Maßnahme'], ['Förderprogramme Wärmepumpe', 'hoch', 'Schulung zwei Monteure']],
 'Schulungsplan': [['Mitarbeiter', 'Schulung', 'Termin'], ['Monteur A', 'Wärmepumpen', '03/2027'], ['Monteur B', 'Trinkwasserhygiene', '11/2026']],
 'Prüfmittel': [['Gerät', 'Prüfung', 'Nächste Prüfung'], ['Abgasmessgerät', 'Kalibrierung', '02/2027'], ['Druckprüfgerät', 'Kalibrierung', '06/2027'], ['Elektrowerkzeuge', 'DGUV V3', '04/2027']],
 'Organigramm': [['Rolle', 'Person'], ['Geschäftsführung', 'Erika Beispiel, Max Probe'], ['QMB', 'Max Probe']],
}
wb = openpyxl.Workbook(); wb.remove(wb.active)
for name, z in blaetter.items():
    ws = wb.create_sheet(name)
    for r in z: ws.append(r)
wb.save(os.path.join(Q, 'QM-Uebersicht.xlsx'))
pdf('QM-Uebersicht.pdf', 'QM-Übersicht', [[Paragraph(name, H1), tab(z)] for name, z in blaetter.items()], quer=True)
# ---------------------------------------------------------------- paket-quelle.json
heute = datetime.date(2026, 10, 9)
s1, s2 = (heute + datetime.timedelta(days=7)).isoformat(), (heute + datetime.timedelta(days=18)).isoformat()
UPH = 'Unternehmens- und Prozesshandbuch (UPH)'
pruef = [  # wie eine Pruefliste des Zertifizierers, mit Fundstellen (Bemerkung) – ersetzt hier die Word-Datei
 ('0', 'Systemdokumentation', 'Managementsystemdokumentation (Ausgabe bzw. Stand)', UPH + ' Seite 2'),
 ('4.1', 'Kontext', 'Wurden relevante externe und interne Themen bestimmt?', UPH + ' Seite 3'),
 ('4.2', 'Interessierte Parteien', 'Wurden die interessierten Parteien und ihre Anforderungen bestimmt?', UPH + ' Seite 4'),
 ('4.3', 'Anwendungsbereich', 'Ist der Anwendungsbereich festgelegt und dokumentiert?', UPH + ' Seite 3'),
 ('4.4', 'Prozesse', 'Sind die Prozesse festgelegt und dokumentiert?', UPH + ' Seite 4, Seite 9–16'),
 ('5.2', 'Qualitätspolitik', 'Ist die Qualitätspolitik festgelegt und bekannt gemacht?', UPH + ' Seite 5'),
 ('5.3', 'Rollen', 'Sind Verantwortlichkeiten und Befugnisse zugewiesen?', UPH + ' Seite 6; QM-Übersicht, Reiter „Organigramm“'),
 ('6.1', 'Risiken und Chancen', 'Wurden Risiken und Chancen bestimmt und Maßnahmen geplant?', UPH + ' Seite 7; QM-Übersicht, Reiter „Risiken“, „Chancen“'),
 ('6.2', 'Qualitätsziele', 'Sind Qualitätsziele festgelegt und wird ihre Erreichung geplant?', 'QM-Übersicht, Reiter „Ziele & Kennzahlen“'),
 ('7.1.5', 'Prüfmittel', 'Werden Messmittel überwacht und kalibriert?', UPH + ' Seite 16; QM-Übersicht, Reiter „Prüfmittel“'),
 ('7.2', 'Kompetenz', 'Wird die Kompetenz der Mitarbeiter sichergestellt und nachgewiesen?', UPH + ' Seite 8; QM-Übersicht, Reiter „Schulungsplan“'),
 ('8.2', 'Anforderungen an Produkte', 'Wie werden Kundenanforderungen ermittelt und Angebote geprüft?', UPH + ' Seite 11'),
 ('8.4', 'Externe Anbieter', 'Werden externe Anbieter ausgewählt und bewertet?', UPH + ' Seite 14; QM-Übersicht, Reiter „Lieferantenbewertung“'),
 ('8.5', 'Leistungserbringung', 'Wird die Dienstleistung unter beherrschten Bedingungen erbracht?', UPH + ' Seite 12'),
 ('9.2', 'Internes Audit', 'Werden interne Audits nach Programm durchgeführt?', 'Auditprogramm 2026–2028; Auditbericht internes Audit Seite 1'),
 ('9.3', 'Managementbewertung', 'Wird die Managementbewertung durchgeführt?', 'Managementbewertung 2026 Seite 1–3'),
 ('10.2', 'Nichtkonformität', 'Wie wird mit Reklamationen und Fehlern umgegangen?', UPH + ' Seite 15, Seite 17'),
]
quelle = {
 'kunde': {'name': FIRMA + ' (Testkunde)', 'ort': 'Musterstadt', 'berater_name': 'Holger Grosser', 'berater_email': 'test@example.com', 'firma_laut_zertifizierer': FIRMA},
 'audits': [
  {'id': 's1', 'stufe': 1, 'datum': s1, 'zertifizierer': 'TÜV NORD CERT', 'auditor': 'Test-Auditor', 'normen': 'ISO 9001', 'auditor_level': 'mittel', 'ruhemodus_tage': 1,
   'planpunkte': [{'zeit': '09:00–09:15', 'thema': 'Eröffnungsbesprechung', 'normkapitel': '', 'gespraechspartner': 'GF, QMB'},
                  {'zeit': '09:15–11:30', 'thema': 'Bewertung der Systemdokumentation', 'normkapitel': '4.1–8.7, 10', 'gespraechspartner': 'GF, QMB'},
                  {'zeit': '11:30–12:30', 'thema': 'Interne Audits und Managementbewertung', 'normkapitel': '9.1–9.3', 'gespraechspartner': 'GF, QMB'},
                  {'zeit': '12:30–13:00', 'thema': 'Abschlussbesprechung', 'normkapitel': '', 'gespraechspartner': 'GF, QMB'}],
   'pruefpunkte': [{'normpunkt': n, 'titel': t, 'frage': f, 'bemerkung': b, 'norm': 'ISO 9001'} for n, t, f, b in pruef]},
  {'id': 's2', 'stufe': 2, 'datum': s2, 'zertifizierer': 'TÜV NORD CERT', 'auditor': 'Test-Auditor', 'normen': 'ISO 9001', 'auditor_level': 'mittel', 'ruhemodus_tage': 1,
   'planpunkte': [{'zeit': '08:30–09:00', 'thema': 'Eröffnung, Führung und Politik', 'normkapitel': '5.1, 5.2', 'gespraechspartner': 'GF', 'bereich': 'Geschäftsführung'},
                  {'zeit': '09:00–10:30', 'thema': 'Angebot und Auftrag', 'normkapitel': '8.2', 'gespraechspartner': 'Kundendienst', 'bereich': 'Kundendienst'},
                  {'zeit': '10:30–12:00', 'thema': 'Montage beim Kunden', 'normkapitel': '8.5, 7.1.5', 'gespraechspartner': 'Montage', 'bereich': 'Montage'},
                  {'zeit': '13:00–14:00', 'thema': 'Einkauf und Lieferanten', 'normkapitel': '8.4', 'gespraechspartner': 'GF', 'bereich': 'Geschäftsführung'},
                  {'zeit': '14:00–15:00', 'thema': 'Reklamationen und Verbesserung', 'normkapitel': '10.2', 'gespraechspartner': 'Kundendienst', 'bereich': 'Kundendienst'}]}],
 'mitarbeiter': [{'id': 'm1', 'name': 'Erika Beispiel', 'bereich': 'Geschäftsführung', 'funktion': 'Geschäftsführerin'}, {'id': 'm2', 'name': 'Max Probe', 'bereich': 'Kundendienst', 'funktion': 'QMB, Kundendienst'}],
 'dokumente': [
  {'id': 'd1', 'd_nr': 'D-01', 'titel': 'Unternehmens- und Prozesshandbuch', 'kurzname': 'UPH', 'stand': STAND, 'wichtigkeit': 'kennen', 'datei': 'quellen/UPH.pdf', 'link': 'https://example.com/uph'},
  {'id': 'd2', 'd_nr': 'D-02', 'titel': 'QM-Übersicht', 'kurzname': 'QMÜ', 'stand': STAND, 'wichtigkeit': 'kennen', 'datei': 'quellen/QM-Uebersicht.xlsx', 'kopie_datei': 'quellen/QM-Uebersicht.pdf'},
  {'id': 'd3', 'd_nr': 'D-03', 'titel': 'Managementbewertung 2026', 'kurzname': 'MB', 'stand': '15.09.2026', 'wichtigkeit': 'kennen', 'datei': 'quellen/MB.pdf'},
  {'id': 'd4', 'd_nr': 'D-04', 'titel': 'Auditbericht internes Audit', 'stand': '10.09.2026', 'wichtigkeit': 'finden', 'datei': 'quellen/Auditbericht.pdf'},
  {'id': 'd5', 'd_nr': 'D-05', 'titel': 'Auditprogramm 2026–2028', 'stand': '01.09.2026', 'wichtigkeit': 'finden', 'datei': 'quellen/Auditprogramm.pdf'},
  {'id': 'd6', 'd_nr': 'D-06', 'titel': 'Notfallplan', 'stand': 'ENTWURF', 'wichtigkeit': 'finden', 'datei': 'quellen/Notfallplan.pdf'}],
 'faktencheck': [
  {'id': 'k1', 'thema': 'Geschäftsführung', 'angabe': 'Erika Beispiel und Max Probe (Organigramm)', 'fundstelle': 'QM-Übersicht, Reiter „Organigramm“; Handbuch Seite 6'},
  {'id': 'k2', 'thema': 'Mitarbeiterzahl', 'angabe': '„[bitte ergänzen] Mitarbeiter“', 'fundstelle': 'Managementbewertung Seite 1'},
  {'id': 'k3', 'thema': 'Zertifizierer', 'angabe': '„in Auswahl (TÜV oder DEKRA)“', 'fundstelle': 'Managementbewertung Seite 1'},
  {'id': 'k4', 'thema': 'Geltungsbereich', 'angabe': 'Planung, Installation und Wartung von Heizungs- und Sanitäranlagen', 'fundstelle': 'Handbuch Seite 3'}],
 'stolperfallen': [
  {'id': 'x1', 'stufe': 1, 'thema': 'Wer ist Geschäftsführer?', 'frage': 'Im Organigramm stehen zwei Geschäftsführer, im Handbuch nur einer. Wer führt die Firma?', 'warum': 'Organigramm und Handbuch Seite 6 widersprechen sich', 'antwortlinie': 'Erika Beispiel ist Geschäftsführerin, Max Probe QMB – das Organigramm korrigieren wir.'},
  {'id': 'x2', 'stufe': 1, 'thema': 'Zertifizierer in Auswahl', 'frage': 'In der Managementbewertung steht „Zertifizierer in Auswahl“. Warum?', 'warum': 'MB Seite 1 ist älter als die Auswahl', 'antwortlinie': 'Die MB war vor der Entscheidung für TÜV NORD; in der nächsten MB steht es richtig.'},
  {'id': 'x3', 'stufe': 2, 'thema': 'Notfallübung', 'frage': 'Wann haben Sie die letzte Notfallübung gemacht?', 'warum': 'Notfallplan: Übung noch nicht durchgeführt', 'antwortlinie': 'Ehrlich: noch keine – sie ist für November geplant.'}],
 'aufgaben': [{'id': 't1', 'todo': 'Organigramm korrigieren (nur eine Geschäftsführerin)', 'bis_stufe': 1, 'verantwortlich': 'Max Probe'},
              {'id': 't2', 'todo': 'Notfallplan freigeben und Übung planen', 'bis_stufe': 2, 'verantwortlich': 'Erika Beispiel'}],
}
json.dump(quelle, open(os.path.join(HIER, 'paket-quelle.json'), 'w'), ensure_ascii=False, indent=1)
print('Testkunde erzeugt:', Q)
