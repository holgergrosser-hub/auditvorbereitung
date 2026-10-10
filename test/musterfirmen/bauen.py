#!/usr/bin/env python3
"""Baut die komplette, erfundene Dokumentation einer Musterfirma (E-A41): Handbuch mit Prozessen, QM-Übersicht,
Nachweise, Managementbewertung, internes Audit, Musterauftrag mit Belegen, Wartungsplan, Auditplan Stufe 2 und
paket-quelle.json (Prüfliste Stufe 1, Auditorfragen Stufe 2, Stolperfallen, Aufgaben, Mitarbeiter mit Rollen).
Keine echten Kundendaten – darf ins öffentliche Repository. Inhalte angelehnt an typische Kleinbetriebe aus der
Beratungspraxis (anonymisiert). Seitenzahlen in Fundstellen werden aus dem Aufbau berechnet, nie von Hand.

Aufruf: python3 test/musterfirmen/alle.py   (alle sechs)   ·   bauen(firma, zielordner) aus Python
"""
import json, os, datetime
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak
import openpyxl

st = getSampleStyleSheet()
H1 = ParagraphStyle('h1', parent=st['Heading1'], fontSize=16, textColor=colors.HexColor('#1F4E79'))
H2 = ParagraphStyle('h2', parent=st['Heading2'], fontSize=12.5, textColor=colors.HexColor('#1F4E79'))
P = ParagraphStyle('p', parent=st['BodyText'], fontSize=10.5, leading=14)
STAND = '01.10.2026'
UPH = 'Unternehmens- und Prozesshandbuch (UPH)'


def tab(zeilen, breiten=None, kopf=True):
    t = Table([[Paragraph(str(c), P) for c in z] for z in zeilen], colWidths=breiten)
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#9AAAB8')), ('VALIGN', (0, 0), (-1, -1), 'TOP')]
                          + ([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DCE6F0'))] if kopf else [])))
    return t


def beleg(titel, zeilen, text=''):
    return [Paragraph(titel, H1), tab(zeilen, [5 * cm, 12 * cm], kopf=False)] + ([Spacer(1, 8), Paragraph(text, P)] if text else [])


def prozess(nr, name, art, verantw, schritte, hinweis, eingang='', ausgang='', kennzahl=''):
    stamm = [['Prozess-Nr.', nr], ['Prozessname', name], ['Kategorie', art], ['Verantwortlich', verantw]]
    if eingang: stamm.append(['Eingaben', eingang])
    if ausgang: stamm.append(['Ergebnisse', ausgang])
    if kennzahl: stamm.append(['Kennzahl', kennzahl])
    return [Paragraph(name, H1), Paragraph(art, P), Paragraph('1. Stammdaten', H2), tab(stamm, [4 * cm, 13 * cm], kopf=False),
            Paragraph('2. Prozessablauf', H2), tab([['Nr.', 'Tätigkeit', 'Verantwortlich', 'Hilfsmittel / Dokument']] + [[str(i + 1)] + list(s) for i, s in enumerate(schritte)], [1.2 * cm, 8 * cm, 3.8 * cm, 4 * cm]),
            Paragraph('3. Hinweise', H2), Paragraph(hinweis, P)]


def mit_schluessel(liste):
    """[(schluessel, flowables)] -> (seiten, {schluessel: seitennummer})"""
    return [x[1] for x in liste], {k: i + 1 for i, (k, _) in enumerate(liste)}


# ---------------------------------------------------------------- Führungs- und Unterstützungsprozesse (für alle Firmen gleich aufgebaut)
def standard_prozesse(F):
    OP, BU, TEAM = F['rolle_op'], 'Büro', F['bereich_op']
    p = {
     'F1': ('F1', 'Managementbewertung', 'Führungsprozess', 'Geschäftsführung', [('Daten sammeln (Ziele, Reklamationen, Audits, Lieferanten, Kundenzufriedenheit)', 'QMB', 'QM-Übersicht'), ('Interne und externe Themen prüfen', 'Geschäftsführung', 'Handbuch Kontext'), ('Bewertung einmal jährlich durchführen', 'Geschäftsführung', 'Managementbewertung'), ('Maßnahmen, Ressourcen und neue Ziele festlegen', 'Geschäftsführung', 'Maßnahmenplan, Reiter Ziele'), ('Ergebnis im Team vorstellen', 'Geschäftsführung', 'Protokoll Teambesprechung')],
            'Normbezug: ISO 9001 Kapitel 9.3. Die Managementbewertung findet jedes Jahr im September statt.', 'Ziele, Audits, Reklamationen, Lieferantenbewertung, Kundenzufriedenheit, Risiken', 'Managementbewertung, Maßnahmen, neue Ziele'),
     'F2': ('F2', 'Internes Audit', 'Führungsprozess', 'QMB', [('Auditprogramm für drei Jahre planen', 'QMB', 'Auditprogramm 2026–2028'), ('Auditor beauftragen (unabhängig vom geprüften Bereich)', 'QMB', 'Auftrag'), ('Audit durchführen, Stichproben ansehen', 'Auditor', 'Auditbericht'), ('Abschlussgespräch mit den Verantwortlichen', 'Auditor', 'Auditbericht'), ('Feststellungen in den Maßnahmenplan übernehmen', 'QMB', 'Reiter Maßnahmenplan')],
            'Normbezug: ISO 9001 Kapitel 9.2. Jeder Prozess wird mindestens einmal in drei Jahren auditiert.', 'Auditprogramm, frühere Auditberichte', 'Auditbericht, Maßnahmen'),
     'F3': ('F3', 'Risiken und Chancen', 'Führungsprozess', 'Geschäftsführung', [('Themen und interessierte Parteien prüfen', 'Geschäftsführung', 'Handbuch Kontext'), ('Risiken und Chancen sammeln (was ist schiefgegangen, was wäre teuer, wovon sind wir abhängig)', 'Geschäftsführung', 'Reiter Risiken, Chancen'), ('Bewerten: Wahrscheinlichkeit × Auswirkung', 'Geschäftsführung', 'Reiter Risiken'), ('Maßnahmen festlegen', 'Geschäftsführung', 'Maßnahmenplan'), ('Nach einem Jahr prüfen, ob die Maßnahme gewirkt hat', 'Geschäftsführung', 'Reiter Risiken, Spalte Wirksamkeit')],
            'Normbezug: ISO 9001 Kapitel 6.1. Ergebnis fließt in die Managementbewertung.', 'Kontext, Reklamationen, Investitionen', 'Risiken- und Chancenbewertung, Maßnahmen'),
     'F4': ('F4', 'Maßnahmenabwicklung', 'Führungsprozess', 'QMB', [('Anlass erfassen (Audit, Reklamation, Risiko, Idee)', 'QMB', 'Reiter Maßnahmenplan'), ('Ursache klären (5-mal Warum)', 'Verantwortlicher', 'Maßnahmenplan'), ('Maßnahme, Verantwortlichen und Termin festlegen', 'Geschäftsführung', 'Maßnahmenplan'), ('Umsetzung in der Teambesprechung verfolgen', 'QMB', 'Protokoll Teambesprechung'), ('Wirksamkeit prüfen und Maßnahme abschließen', 'QMB', 'Maßnahmenplan')],
            'Normbezug: ISO 9001 Kapitel 10.2. Eine Maßnahme ist erst erledigt, wenn die Wirksamkeit geprüft ist.', 'Auditberichte, Reklamationen, Risiken, Managementbewertung', 'umgesetzte und bewertete Maßnahmen'),
     'F5': ('F5', 'Schulung und Kompetenz', 'Führungsprozess', 'Geschäftsführung', [('Schulungsbedarf jährlich im Januar ermitteln (Gesetz, neue Technik, Mitarbeitergespräch)', 'Geschäftsführung', 'Reiter Schulungsplan'), ('Schulungen planen und anmelden', BU, 'Schulungsplan'), ('Pflichtunterweisungen durchführen (Arbeitsschutz, Qualitätspolitik)', 'Geschäftsführung', 'Teilnehmerliste'), ('Nachweis ablegen', BU, 'Personalakte, Nachweise 2026'), ('Wirksamkeit beurteilen (nach drei Monaten im Einsatz)', 'Geschäftsführung', 'Schulungsplan'), ('Neue Mitarbeiter mit Pate einarbeiten', TEAM, 'Einarbeitungscheckliste')],
            'Normbezug: ISO 9001 Kapitel 7.2 und 7.3.', 'Anforderungen je Rolle, neue Technik, Gesetze', 'Schulungsnachweise, bewertete Wirksamkeit'),
     'U1': ('U1', 'Einkauf', 'Unterstützungsprozess', 'Geschäftsführung', [('Bedarf melden', OP, 'Bestellliste'), ('Lieferant aus der Lieferantenliste wählen', BU, 'Lieferantenliste'), ('Bestellen', BU, 'Bestellung'), ('Auftragsbestätigung des Lieferanten prüfen', BU, 'AB des Lieferanten'), ('Wareneingang prüfen (Menge, Schäden, Lieferschein)', F.get('wareneingang', OP), 'Lieferschein'), ('Abweichung reklamieren', BU, 'Reklamation an Lieferant')],
            'Normbezug: ISO 9001 Kapitel 8.4. Bestellt wird nur bei Lieferanten aus der Lieferantenliste.', 'Bedarf aus Aufträgen', 'Bestellung, geprüfte Ware oder Leistung'),
     'U2': ('U2', 'Lieferantenbewertung', 'Unterstützungsprozess', 'Geschäftsführung', [('Hauptlieferanten und Dienstleister festlegen', 'Geschäftsführung', 'Lieferantenliste'), ('Rückmeldungen sammeln (Reklamationen, Termintreue)', BU, 'Reklamationsliste'), ('Lieferanten jährlich nach Qualität, Termintreue und Preis bewerten', 'Geschäftsführung', 'Reiter Lieferantenbewertung'), ('Lieferantenliste aktualisieren', BU, 'Lieferantenliste'), ('Bei Note C Gespräch oder Wechsel', 'Geschäftsführung', 'Maßnahmenplan')],
            'Normbezug: ISO 9001 Kapitel 8.4.1. Die Bewertung erfolgt jedes Jahr im Januar; ausgelagerte Leistungen gehören dazu.', 'Reklamationen, Termintreue', 'Lieferantenbewertung, freigegebene Lieferanten'),
     'U3': ('U3', 'Kundenreklamationen', 'Unterstützungsprozess', F['rolle_kd'], [('Reklamation aufnehmen und bestätigen', F['rolle_kd'], 'Reklamationsliste'), ('Sofortmaßnahme planen', F['rolle_kd'], 'Auftrag / Ticket'), ('Ursache klären', OP, 'Reklamationsbericht'), ('Maßnahme festlegen, damit es nicht wieder passiert', 'Geschäftsführung', 'Maßnahmenplan'), ('Kunden informieren und Abschluss bestätigen', F['rolle_kd'], 'Reklamationsbericht')],
            'Normbezug: ISO 9001 Kapitel 8.7 und 10.2. Jede Reklamation wird innerhalb von 2 Werktagen beantwortet.', 'Kundenreklamation', 'erledigte Reklamation, Maßnahme', 'Reklamationsquote'),
     'U4': F['U4'],
     'U5': ('U5', 'Kundenzufriedenheit', 'Unterstützungsprozess', 'Geschäftsführung', [('Rückmeldungen sammeln (Bewertungen, Dankes-Mails, Reklamationen)', BU, 'Ordner Kundenrückmeldungen'), ('Hauptkunden einmal im Jahr aus deren Sicht bewerten', 'Geschäftsführung', 'Kundenzufriedenheit 2026'), ('Ergebnis in die Managementbewertung geben', 'Geschäftsführung', 'Managementbewertung'), ('Bei Bedarf Maßnahme festlegen', 'Geschäftsführung', 'Maßnahmenplan')],
            'Normbezug: ISO 9001 Kapitel 9.1.2. Wir verschicken keine Fragebögen; wir bewerten anhand von Folgeaufträgen, Rückmeldungen und Bewertungen.', 'Rückmeldungen, Reklamationen, Folgeaufträge', 'Bewertung der Kundenzufriedenheit'),
    }
    return p


def bauen(F, ziel):
    Q = os.path.join(ziel, 'quellen'); os.makedirs(Q, exist_ok=True)
    FIRMA = F['firma']

    def pdf(datei, kopf, seiten, quer=False):
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

    pers = F['personen']
    std = standard_prozesse(F)
    alle = [std['F1'], std['F2'], std['F3'], std['F4'], std['F5']] + F['w_prozesse'] + [std['U1'], std['U2'], std['U3'], std['U4'], std['U5']]
    landkarte = lambda typ: ', '.join(p[0] + ' ' + p[1] for p in alle if p[0][0] == typ)

    # ------------------------------------------------ Handbuch
    uph_liste = [
     ('titel', [Paragraph('Unternehmens- und Prozesshandbuch', H1), Paragraph(FIRMA + ', ' + F['adresse'], P), Spacer(1, 12),
       Paragraph('Inhalt: 1 Dokumentenübersicht und Lenkung · 2 Anwendungsbereich · 3 Kontext · 4 Interessierte Parteien und Prozesse · 5 Qualitätspolitik · 6 Rollen · 7 Risiken, Chancen, Ziele · 8 Ressourcen · 9 Kompetenz, Bewusstsein, Kommunikation · 10 Prozessbeschreibungen · 11 Verbesserung', P)]),
     ('doku', [Paragraph('Dokumentenübersicht und Lenkung', H1), Paragraph(F['ablage'] + ' Jedes Dokument hat in der Kopfzeile den Stand; freigegeben wird von der Geschäftsführung. Alte Fassungen verschiebt der QMB in den Ordner „QM/Archiv“. Aufzeichnungen (Protokolle, Teilnehmerlisten, Reklamationen) liegen im Ordner „Nachweise 2026“ und werden zehn Jahre aufbewahrt.', P),
       tab([['Dokument', 'Kürzel', 'Stand'], ['Unternehmens- und Prozesshandbuch', 'UPH', STAND], ['QM-Übersicht (Excel mit Reitern)', 'QMÜ', STAND], ['Managementbewertung 2026', 'MB', '15.09.2026'], ['Auditprogramm 2026–2028', 'AP', '01.09.2026'], ['Wartungs- und Prüfplan', 'WP', '09/2026'], ['Nachweise 2026 (Aufzeichnungen)', 'NW', 'laufend'], ['Notfallplan', 'NFP', 'ENTWURF']])]),
     ('anwendung', [Paragraph('Anwendungsbereich', H1), Paragraph('Geltungsbereich: ' + F['geltungsbereich'] + ' Ausschluss: ' + F['ausschluss'], P),
       Paragraph('Unternehmen', H2), Paragraph(F['unternehmen'], P)]),
     ('kontext', [Paragraph('Kontext der Organisation', H1), Paragraph('Die internen und externen Themen bewerten wir einmal im Jahr in der Managementbewertung. Daraus leiten wir Risiken, Chancen und Ziele ab.', P),
       tab([['Thema', 'intern / extern', 'Auswirkung auf uns', 'Was wir tun']] + F['kontext'], [4.2 * cm, 2.3 * cm, 4.8 * cm, 5.7 * cm])]),
     ('parteien', [Paragraph('Interessierte Parteien und Prozesse', H1), tab([['Interessierte Partei', 'Anforderung', 'Wie wir sie erfüllen']] + F['parteien'], [4.5 * cm, 6 * cm, 6.5 * cm]),
       Paragraph('Prozesslandkarte', H2), Paragraph('Führungsprozesse: ' + landkarte('F') + '. Wertschöpfung: ' + landkarte('W') + '. Unterstützung: ' + landkarte('U') + '. Ausgelagert: ' + F['ausgelagert'] + ' – steht in der Lieferantenbewertung.', P)]),
     ('politik', [Paragraph('Unternehmen und Qualitätspolitik', H1), Paragraph(F['qualitaet_heisst'], P), Paragraph('Qualitätspolitik', H2), Paragraph(F['politik'] + ' Freigabe: Geschäftsführung, 01.10.2026.', P),
       Paragraph('Bekanntmachung', H2), Paragraph(F['politik_bekannt'] + ' Thema bei der jährlichen Unterweisung im Januar (Teilnehmerliste in den Nachweisen 2026).', P)]),
     ('rollen', [Paragraph('Rollen, Verantwortlichkeiten und Befugnisse', H1), tab([['Rolle', 'Person', 'Aufgaben und Befugnisse']] + F['rollen'], [5 * cm, 4 * cm, 8 * cm]),
       Paragraph('Hinweis: Im Organigramm der QM-Übersicht ist ' + pers['qmb'] + ' zusätzlich als „Geschäftsführung“ eingetragen.', P)]),
     ('risiken', [Paragraph('Risiken, Chancen und Qualitätsziele', H1), Paragraph('Risiken und Chancen leiten wir aus dem Alltag ab: Was ist schon schiefgegangen, was wäre teuer, wovon sind wir abhängig? Bewertung in der QM-Übersicht, Reiter „Risiken“ und „Chancen“ (Wahrscheinlichkeit × Auswirkung), einmal im Jahr mit Blick darauf, ob die Maßnahmen gewirkt haben (Prozess F3).', P),
       Paragraph('Qualitätsziele 2026', H2), tab([['Ziel', 'Soll', 'Verantwortlich', 'Messung']] + [[z[0], z[1], z[3], z[4]] for z in F['ziele']], [5 * cm, 4 * cm, 3.5 * cm, 4.5 * cm]),
       Paragraph('Änderungen planen', H2), Paragraph('Größere Änderungen plant die Geschäftsführung vorher: Zweck, Risiken, wer zuständig ist, wer informiert wird, woran wir merken, dass es klappt. Beispiel: ' + F['aenderung'], P)]),
     ('ressourcen', [Paragraph('Ressourcen', H1), Paragraph('Infrastruktur', H2), Paragraph(F['infrastruktur'], P), Paragraph('Arbeitsumgebung', H2), Paragraph(F['arbeitsumgebung'], P),
       Paragraph('Überwachungs- und Messmittel', H2), Paragraph(F['messmittel'], P), Paragraph('Wissen der Organisation', H2), Paragraph(F['wissen'] + ' Datensicherung: täglich auf NAS, wöchentlich in die Cloud; Rücksicherungstest einmal im Jahr (Nachweise 2026).', P)]),
     ('kompetenz', [Paragraph('Kompetenz, Bewusstsein und Kommunikation', H1), Paragraph('Kompetenz', H2), Paragraph(F['kompetenz'] + ' Schulungen plant die Geschäftsführung im Reiter „Schulungsplan“ (Prozess F5); Nachweise liegen in der Personalakte und in den Nachweisen 2026.', P),
       Paragraph('Bewusstsein', H2), Paragraph('Qualitätspolitik und Qualitätsziele hängen ' + F['aushang'] + ' aus. Jeder Mitarbeiter kennt seinen Beitrag: ' + F['beitrag'] + ' Neue Mitarbeiter lernen Politik und Ziele bei der Einarbeitung (Checkliste in der Personalakte).', P),
       Paragraph('Interne Kommunikation', H2), Paragraph(F['kommunikation'] + ' Einmal im Monat Teambesprechung mit allen: Stand der Ziele, Reklamationen, Maßnahmenplan – Protokoll im Ordner „QM/Besprechungen“.', P)]),
    ] + [(p[0], prozess(*p)) for p in alle] + [
     ('verbesserung', [Paragraph('Verbesserung', H1), Paragraph('Fehler, Reklamationen und Ideen der Mitarbeiter sammeln wir im Maßnahmenplan der QM-Übersicht. Die Geschäftsführung prüft den Stand monatlich in der Teambesprechung. ' + F['nichtkonform'], P)])]
    uph, SU = mit_schluessel(uph_liste)
    pdf('UPH.pdf', 'Unternehmenshandbuch', uph)

    # ------------------------------------------------ Nachweise, Auftrag (Seiten über Schlüssel)
    nw, SN = mit_schluessel([(k, beleg(*v)) for k, v in F['nachweise']])
    pdf('Nachweise_2026.pdf', 'Nachweise 2026', nw)
    au, SA = mit_schluessel([(k, beleg(*v)) for k, v in F['auftrag']])
    AUFTRAG = 'Musterauftrag ' + F['auftrag_nr']
    pdf('Musterauftrag.pdf', AUFTRAG, au)

    def ref(*teile):
        """Fundstelle aus Bausteinen: ('U', schluessel…), ('Q', reiter…), ('N', schluessel), ('A', von[, bis]), ('MB', s), ('AB', s), ('AP',), ('WP',), ('NF',)"""
        out = []
        for t in teile:
            a, rest = t[0], t[1:]
            if a == 'U': out.append(UPH + ' ' + ', '.join('Seite %d' % SU[k] for k in rest))
            elif a == 'Q': out.append('QM-Übersicht, Reiter ' + ', '.join('„%s“' % r for r in rest))
            elif a == 'N': out.append('Nachweise 2026 ' + ', '.join('Seite %d' % SN[k] for k in rest))
            elif a == 'A': out.append(AUFTRAG + ' Seite %d' % SA[rest[0]] + ('–%d' % SA[rest[1]] if len(rest) > 1 else ''))
            elif a == 'MB': out.append('Managementbewertung 2026 Seite ' + rest[0])
            elif a == 'AB': out.append('Auditbericht internes Audit Seite ' + rest[0])
            elif a == 'AP': out.append('Auditprogramm 2026–2028')
            elif a == 'WP': out.append('Wartungs- und Prüfplan Seite 1')
            elif a == 'NF': out.append('Notfallplan Seite 1')
        return '; '.join(out)

    # ------------------------------------------------ weitere Dokumente
    mb = F['mb']
    pdf('MB.pdf', 'Managementbewertung 2026', [
     [Paragraph('Managementbewertung 2026', H1), Paragraph('Bewertungszeitraum 01.09.2025–31.08.2026. Teilnehmer: %s (GF), %s (QMB).' % (pers['gf'], pers['qmb']), P), Paragraph('Zertifizierung: Zertifizierer in Auswahl.', P), Paragraph('Personalstand: [bitte ergänzen] Mitarbeiter.', P), Paragraph('Kontext: ' + mb['kontext'], P)],
     [Paragraph('Ergebnisse', H2), Paragraph(mb['ergebnisse'], P)],
     [Paragraph('Beschlüsse', H2), Paragraph(mb['beschluesse'], P)]])
    pdf('Auditprogramm.pdf', 'Auditprogramm 2026–2028', [[Paragraph('Auditprogramm 2026–2028', H1),
     tab([['Prozess', '2026', '2027', '2028']] + [[p[0] + ' ' + p[1]] + (['X', '', 'X'] if i % 3 == 0 else ['', 'X', ''] if i % 3 == 1 else ['X', '', '']) for i, p in enumerate(alle)]),
     Paragraph('Das interne Audit 2026 fand am 10.09.2026 statt (Auditbericht). Auditor: externer Berater, unabhängig von den geprüften Bereichen.', P)]])
    pdf('Auditbericht.pdf', 'Auditbericht internes Audit', [
     [Paragraph('Auditbericht internes Audit 2026', H1), Paragraph('Datum 10.09.2026, Auditor: externer Berater. Geprüft: F1, F2, W1, W2, U3. Stichproben: ' + AUFTRAG + ', ' + F['reklamation_nr'] + '. Ergebnis: System wirksam, zwei Verbesserungspotenziale.', P)],
     [Paragraph('Feststellungen', H2), Paragraph(F['audit_feststellungen'] + ' Beide Punkte stehen im Maßnahmenplan.', P)]])
    pdf('Notfallplan.pdf', 'Notfallplan', [[Paragraph('Notfallplan – ENTWURF', H1), Paragraph(F['notfall'] + ' Eine Notfallübung ist noch nicht durchgeführt.', P)]])
    pdf('Wartungsplan.pdf', 'Wartungs- und Prüfplan', [[Paragraph('Wartungs- und Prüfplan 2026/2027', H1), Paragraph('Prüffristen für Arbeitsmittel und Sicherheitseinrichtungen. Zuständig: %s (QMB). Prüfnachweise im Ordner „Prüfungen“.' % pers['qmb'], P),
     tab([['Prüfgegenstand', 'Prüfart / Intervall', 'Letzte Prüfung', 'Nächste Prüfung', 'Prüfer']] + F['wartungsplan'], [5 * cm, 4 * cm, 3.5 * cm, 3.5 * cm, 4.5 * cm]),
     Spacer(1, 8), Paragraph(F['wartung_hinweis'], P)]], quer=True)

    # ------------------------------------------------ QM-Übersicht (Excel + PDF-Kopie)
    blaetter = {'Übersicht': [['QM-Übersicht', FIRMA], ['Inhalt', 'Ziele, Lieferanten, Risiken, Chancen, Schulung, Prüfmittel, Maßnahmen, Reklamationen, Organigramm']]}
    blaetter['Ziele & Kennzahlen'] = [['Ziel', 'Soll', 'Ist 2026', 'Verantwortlich', 'Termin']] + [[z[0], z[1], z[2], z[3], '31.12.2026'] for z in F['ziele']]
    for name in ['Lieferantenbewertung', 'Risiken', 'Chancen', 'Schulungsplan', 'Prüfmittel', 'Maßnahmenplan', 'Reklamationen', 'Organigramm']:
        blaetter[name] = F['qmue'][name]
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    for name, z in blaetter.items():
        ws = wb.create_sheet(name)
        for r in z: ws.append(r)
    wb.save(os.path.join(Q, 'QM-Uebersicht.xlsx'))
    pdf('QM-Uebersicht.pdf', 'QM-Übersicht', [[Paragraph(name, H1), tab(z)] for name, z in blaetter.items()], quer=True)

    # ------------------------------------------------ Auditplan Stufe 2
    PLAN2 = [
     ('08:30–09:00', 'Eröffnungsgespräch: Vorstellung, Ablauf, Geltungsbereich, offene Punkte aus Stufe 1', '', 'GF, QMB', 'Alle'),
     ('09:00–09:45', 'Kontext, Führung, Politik, Rollen, Risiken und Chancen, Qualitätsziele', '4.1–4.4, 5.1–5.3, 6.1–6.3', 'GF', 'Geschäftsführung'),
     ('09:45–10:30', 'Managementbewertung, internes Audit, Leistungsbewertung', '9.1.1, 9.1.3, 9.2, 9.3', 'GF, QMB', 'Geschäftsführung'),
     ('10:30–11:30', F['plan_vertrieb'], '8.1, 8.2', F['rolle_kd'], F['bereich_kd']),
     ('11:30–12:15', 'Einkauf, Lieferantenbewertung, Wareneingang', '8.4, 8.6', 'Büro, GF', 'Büro'),
     ('12:15–13:00', 'Mittagspause', '', '', ''),
     ('13:00–14:30', F['plan_leistung'], F['plan_leistung_kap'], F['bereich_op'], F['bereich_op']),
     ('14:30–15:00', 'Personal: Kompetenz, Schulung, Bewusstsein, Kommunikation', '7.1.2, 7.2–7.4', 'GF', 'Geschäftsführung'),
     ('15:00–15:30', 'Kundenzufriedenheit, Reklamationen, Korrekturmaßnahmen, Verbesserung', '9.1.2, 10.1–10.3', F['rolle_kd'] + ', QMB', F['bereich_kd']),
     ('15:30–16:00', 'Dokumentierte Information, Lenkung von Dokumenten und Aufzeichnungen', '7.5', 'QMB', F['bereich_kd']),
     ('16:00–16:30', 'Auditorinterne Abstimmung und Abschlussgespräch mit Empfehlung', '', 'GF, QMB', 'Alle')]
    pdf('Auditplan_Stufe2.pdf', 'Auditplan Stufe 2 – %s (Beispiel)' % F['zertifizierer'], [[Paragraph('Auditplan Zertifizierungsaudit Stufe 2', H1),
     Paragraph('Organisation: %s, %s · Norm: ISO 9001:2015 · Auditart: Erstzertifizierung Stufe 2 vor Ort · Auditteamleiter: Test-Auditor (%s) · Auditdauer: 1 Tag' % (FIRMA, F['ort'], F['zertifizierer']), P), Spacer(1, 6),
     tab([['Zeit', 'Auditthema / Prozess', 'Normkapitel', 'Gesprächspartner']] + [[z, t, n, g] for z, t, n, g, b in PLAN2], [2.6 * cm, 12.5 * cm, 4.5 * cm, 4 * cm]), Spacer(1, 6),
     Paragraph('Bitte stellen Sie sicher, dass die genannten Gesprächspartner zur angegebenen Zeit verfügbar sind und ein abgeschlossener Auftrag mit allen Belegen vorliegt. Änderungen am Plan stimmen wir im Eröffnungsgespräch ab.', P)]], quer=True)

    # ------------------------------------------------ Prüfliste Stufe 1 und Auditorfragen Stufe 2 (Fundstellen berechnet)
    u4kap, u4titel = F['u4_kap'], F['u4_titel']
    pruef = [
     ('0', 'Systemdokumentation', 'Managementsystemdokumentation (Ausgabe bzw. Stand)', ref(('U', 'doku'))),
     ('4.1', 'Kontext', 'Wurden relevante externe und interne Themen bestimmt?', ref(('U', 'kontext'))),
     ('4.2', 'Interessierte Parteien', 'Wurden die interessierten Parteien und ihre Anforderungen bestimmt?', ref(('U', 'parteien'))),
     ('4.3', 'Anwendungsbereich', 'Ist der Anwendungsbereich festgelegt und dokumentiert?', ref(('U', 'anwendung'))),
     ('4.4', 'Prozesse', 'Sind die Prozesse festgelegt und dokumentiert?', UPH + ' Seite %d, Seite %d–%d' % (SU['parteien'], SU['F1'], SU['U5'])),
     ('5.2', 'Qualitätspolitik', 'Ist die Qualitätspolitik festgelegt und bekannt gemacht?', ref(('U', 'politik'))),
     ('5.3', 'Rollen', 'Sind Verantwortlichkeiten und Befugnisse zugewiesen?', ref(('U', 'rollen'), ('Q', 'Organigramm'))),
     ('6.1', 'Risiken und Chancen', 'Wurden Risiken und Chancen bestimmt und Maßnahmen geplant?', ref(('U', 'risiken', 'F3'), ('Q', 'Risiken', 'Chancen'))),
     ('6.2', 'Qualitätsziele', 'Sind Qualitätsziele festgelegt und wird ihre Erreichung geplant?', ref(('Q', 'Ziele & Kennzahlen'), ('U', 'risiken'))),
     ('7.1.3', 'Infrastruktur', 'Wird die Infrastruktur bereitgestellt und instand gehalten?', ref(('U', 'ressourcen'), ('WP',))),
     (u4kap, u4titel, F['u4_frage'], ref(('U', 'U4'), ('Q', 'Prüfmittel'))),
     ('7.1.6', 'Wissen', 'Wie wird das Wissen der Organisation gesichert?', ref(('U', 'ressourcen'), ('N', 'datensicherung'))),
     ('7.2', 'Kompetenz', 'Wird die Kompetenz der Mitarbeiter sichergestellt und nachgewiesen?', ref(('U', 'F5', 'kompetenz'), ('Q', 'Schulungsplan'), ('N', 'schulung'))),
     ('7.3', 'Bewusstsein', 'Kennen die Mitarbeiter die Qualitätspolitik, die Qualitätsziele und ihren eigenen Beitrag?', ref(('U', 'kompetenz'), ('N', 'unterweisung'), ('Q', 'Ziele & Kennzahlen'))),
     ('7.4', 'Kommunikation', 'Ist festgelegt, wie intern kommuniziert wird – was, wann und mit wem?', ref(('U', 'kompetenz'), ('N', 'team'))),
     ('7.5', 'Dokumentierte Information', 'Wie werden Dokumente gelenkt und Aufzeichnungen aufbewahrt?', ref(('U', 'doku'))),
     ('8.2', 'Anforderungen an Produkte und Dienstleistungen', 'Wie werden Kundenanforderungen ermittelt und Angebote geprüft?', ref(('U', 'W1'))),
     ('8.4', 'Externe Anbieter', 'Werden externe Anbieter ausgewählt und bewertet?', ref(('U', 'U1', 'U2'), ('Q', 'Lieferantenbewertung'))),
     ('8.5', 'Leistungserbringung', 'Wird die Leistung unter beherrschten Bedingungen erbracht?', ref(('U', 'W2'))),
     ('9.1.2', 'Kundenzufriedenheit', 'Wie wird die Kundenzufriedenheit überwacht?', ref(('U', 'U5'), ('N', 'kundenzufriedenheit'))),
     ('9.2', 'Internes Audit', 'Werden interne Audits nach Programm durchgeführt?', ref(('AP',), ('AB', '1'), ('U', 'F2'))),
     ('9.3', 'Managementbewertung', 'Wird die Managementbewertung durchgeführt?', ref(('MB', '1–3'), ('U', 'F1'))),
     ('10.2', 'Nichtkonformität', 'Wie wird mit Reklamationen und Fehlern umgegangen?', ref(('U', 'U3', 'verbesserung'), ('N', 'reklamation'), ('Q', 'Maßnahmenplan'))),
    ]
    pruef += [(k, t, f, ref(*teile)) for k, t, f, teile in F.get('pruef_extra', [])]
    A = F['auftrag_schluessel']  # anfrage, angebot, ab, planung, beschaffung, durchfuehrung, abnahme, rechnung
    FRAGEN2 = {
     '09:00–09:45': [{'frage': 'Wie haben Sie Ihre internen und externen Themen bestimmt, und wann haben Sie sie zuletzt bewertet?', 'hilfe': ref(('U', 'kontext'), ('MB', '1')), 'normkapitel': '4.1'},
                     {'frage': 'Welche Qualitätsziele gelten dieses Jahr, und wie stehen Sie aktuell?', 'hilfe': ref(('Q', 'Ziele & Kennzahlen'), ('MB', '2')), 'normkapitel': '6.2'},
                     {'frage': 'Zeigen Sie mir Ihre Risikobewertung: Welches Risiko ist das größte, und hat Ihre Maßnahme gewirkt?', 'hilfe': ref(('Q', 'Risiken'), ('U', 'risiken')), 'normkapitel': '6.1'}],
     '09:45–10:30': [{'frage': 'Welche Beschlüsse hat die letzte Managementbewertung gebracht, und wie ist der Stand?', 'hilfe': ref(('MB', '3'), ('Q', 'Maßnahmenplan')), 'normkapitel': '9.3'},
                     {'frage': 'Was kam beim internen Audit heraus, und was haben Sie mit den Feststellungen gemacht?', 'hilfe': ref(('AB', '2'), ('Q', 'Maßnahmenplan')), 'normkapitel': '9.2'}],
     '10:30–11:30': [{'frage': 'Nehmen wir einen abgeschlossenen Auftrag: Zeigen Sie mir Anfrage, Angebot und Auftragsbestätigung.', 'hilfe': ref(('A', A['anfrage'], A['ab']), ('U', 'W1')), 'normkapitel': '8.2'},
                     {'frage': F['frage_aenderung'], 'hilfe': ref(('A', A['ab'])), 'normkapitel': '8.2.4'},
                     {'frage': 'Wie stellen Sie vor dem Angebot sicher, dass Sie den Auftrag leisten können?', 'hilfe': ref(('A', A['angebot']), ('U', 'W1')), 'normkapitel': '8.2.3'}],
     '11:30–12:15': [{'frage': 'Bei welchen Lieferanten bestellen Sie, und wie haben Sie sie zuletzt bewertet?', 'hilfe': ref(('Q', 'Lieferantenbewertung'), ('U', 'U2')), 'normkapitel': '8.4'},
                     {'frage': F['frage_wareneingang'], 'hilfe': ref(('A', A['beschaffung']), ('U', 'U1')), 'normkapitel': '8.4.3'}],
     '13:00–14:30': [{'frage': F['frage_leistung'], 'hilfe': ref(('A', A['durchfuehrung']), ('U', 'W2')), 'normkapitel': '8.5.1'},
                     {'frage': F['frage_pruefmittel'], 'hilfe': ref(('WP',), ('Q', 'Prüfmittel')), 'normkapitel': u4kap},
                     {'frage': F['frage_freigabe'], 'hilfe': ref(('A', A['abnahme'], A['rechnung']), ('U', 'W2')), 'normkapitel': '8.6'}],
     '14:30–15:00': [{'frage': 'Wie planen Sie Schulungen, und wo sind die Nachweise? Wie prüfen Sie, ob eine Schulung gewirkt hat?', 'hilfe': ref(('Q', 'Schulungsplan'), ('N', 'schulung'), ('U', 'F5')), 'normkapitel': '7.2'},
                     {'frage': 'Woher kennen Ihre Mitarbeiter die Qualitätspolitik und die Ziele?', 'hilfe': ref(('U', 'politik', 'kompetenz'), ('N', 'unterweisung')), 'normkapitel': '7.3'},
                     {'frage': 'Wie haben Sie Ihren letzten neuen Mitarbeiter eingearbeitet?', 'hilfe': ref(('N', 'einarbeitung'), ('U', 'F5')), 'normkapitel': '7.2'}],
     '15:00–15:30': [{'frage': 'Wie messen Sie die Kundenzufriedenheit, und was war das letzte Ergebnis?', 'hilfe': ref(('N', 'kundenzufriedenheit'), ('U', 'U5')), 'normkapitel': '9.1.2'},
                     {'frage': 'Zeigen Sie mir die letzte Reklamation: Ursache, Maßnahme und Wirksamkeit.', 'hilfe': ref(('N', 'reklamation'), ('Q', 'Reklamationen', 'Maßnahmenplan'), ('U', 'U3')), 'normkapitel': '10.2'}],
     '15:30–16:00': [{'frage': 'Wo finde ich die aktuelle Version Ihres Handbuchs, und wer gibt Änderungen frei?', 'hilfe': ref(('U', 'doku')), 'normkapitel': '7.5'}],
    }
    for z, liste in F.get('fragen2_extra', {}).items():
        FRAGEN2.setdefault(z, []).extend({'frage': f, 'hilfe': ref(*teile), 'normkapitel': k} for f, teile, k in liste)
    heute = datetime.date(2026, 10, 9)
    s1, s2 = (heute + datetime.timedelta(days=7)).isoformat(), (heute + datetime.timedelta(days=18)).isoformat()
    D = lambda i, nr, titel, datei, stand, w, **x: dict({'id': i, 'd_nr': nr, 'titel': titel, 'stand': stand, 'wichtigkeit': w, 'datei': 'quellen/' + datei}, **x)
    sf = F['stolperfallen'](ref)
    quelle = {
     'kunde': {'name': FIRMA + ' (Musterfirma)', 'ort': F['ort'], 'berater_name': 'Holger Grosser', 'berater_email': 'test@example.com', 'firma_laut_zertifizierer': FIRMA,
               'beschreibung': F['beschreibung'], 'branche': F['branche']},
     'audits': [
      {'id': 's1', 'stufe': 1, 'datum': s1, 'zertifizierer': F['zertifizierer'], 'auditor': 'Test-Auditor', 'normen': 'ISO 9001', 'auditor_level': 'mittel', 'ruhemodus_tage': 1,
       'planpunkte': [{'zeit': '09:00–09:15', 'thema': 'Eröffnungsbesprechung', 'normkapitel': '', 'gespraechspartner': 'GF, QMB'},
                      {'zeit': '09:15–10:30', 'thema': 'Bewertung der Systemdokumentation: Kontext, Führung, Planung, Unterstützung', 'normkapitel': '4.1–7.5', 'gespraechspartner': 'GF, QMB'},
                      {'zeit': '10:30–11:30', 'thema': 'Bewertung der Systemdokumentation: Betrieb und Verbesserung', 'normkapitel': '8.1–8.7, 10', 'gespraechspartner': 'GF, QMB'},
                      {'zeit': '11:30–12:15', 'thema': 'Interne Audits und Managementbewertung', 'normkapitel': '9.1–9.3', 'gespraechspartner': 'GF, QMB'},
                      {'zeit': '12:15–12:45', 'thema': 'Bereitschaft für Stufe 2: Standorte, Einsatzorte, Auditplan Stufe 2', 'normkapitel': '', 'gespraechspartner': 'GF'},
                      {'zeit': '12:45–13:00', 'thema': 'Abschlussbesprechung', 'normkapitel': '', 'gespraechspartner': 'GF, QMB'}],
       'pruefpunkte': [{'normpunkt': n, 'titel': t, 'frage': f, 'bemerkung': b, 'norm': 'ISO 9001'} for n, t, f, b in pruef]},
      {'id': 's2', 'stufe': 2, 'datum': s2, 'zertifizierer': F['zertifizierer'], 'auditor': 'Test-Auditor', 'normen': 'ISO 9001', 'auditor_level': 'mittel', 'ruhemodus_tage': 1,
       'planpunkte': [{'zeit': z, 'thema': t, 'normkapitel': n, 'gespraechspartner': g, 'bereich': b, 'fragen': FRAGEN2.get(z, [])} for z, t, n, g, b in PLAN2]}],
     'mitarbeiter': F['mitarbeiter'],
     'dokumente': [
      D('d1', 'D-01', 'Unternehmens- und Prozesshandbuch', 'UPH.pdf', STAND, 'kennen', kurzname='UPH'),
      D('d2', 'D-02', 'QM-Übersicht', 'QM-Uebersicht.xlsx', STAND, 'kennen', kurzname='QMÜ', kopie_datei='quellen/QM-Uebersicht.pdf'),
      D('d3', 'D-03', 'Managementbewertung 2026', 'MB.pdf', '15.09.2026', 'kennen', kurzname='MB'),
      D('d4', 'D-04', 'Auditbericht internes Audit', 'Auditbericht.pdf', '10.09.2026', 'finden'),
      D('d5', 'D-05', 'Auditprogramm 2026–2028', 'Auditprogramm.pdf', '01.09.2026', 'finden'),
      D('d6', 'D-06', 'Notfallplan', 'Notfallplan.pdf', 'ENTWURF', 'finden'),
      D('d7', 'D-07', 'Wartungs- und Prüfplan', 'Wartungsplan.pdf', '09/2026', 'finden', kurzname='Wartungsplan'),
      D('d8', 'N-01', AUFTRAG, 'Musterauftrag.pdf', F['auftrag_stand'], 'finden'),
      D('d10', 'N-02', 'Nachweise 2026', 'Nachweise_2026.pdf', 'laufend', 'finden'),
      D('d9', 'Z-01', 'Auditplan Stufe 2 (%s)' % F['zertifizierer'], 'Auditplan_Stufe2.pdf', 'Plan', 'kennen')],
     'faktencheck': [
      {'id': 'k1', 'thema': 'Geschäftsführung', 'angabe': '%s und %s (Organigramm)' % (pers['gf'], pers['qmb']), 'fundstelle': 'QM-Übersicht, Reiter „Organigramm“; Handbuch Seite %d' % SU['rollen']},
      {'id': 'k2', 'thema': 'Mitarbeiterzahl', 'angabe': '„[bitte ergänzen] Mitarbeiter“', 'fundstelle': 'Managementbewertung Seite 1'},
      {'id': 'k3', 'thema': 'Zertifizierer', 'angabe': '„in Auswahl“', 'fundstelle': 'Managementbewertung Seite 1'},
      {'id': 'k4', 'thema': 'Geltungsbereich', 'angabe': F['geltungsbereich'].rstrip('.'), 'fundstelle': 'Handbuch Seite %d' % SU['anwendung']}],
     'stolperfallen': [
      {'id': 'x1', 'stufe': 1, 'thema': 'Wer ist Geschäftsführer?', 'frage': 'Im Organigramm stehen zwei Geschäftsführer, im Handbuch nur einer. Wer führt die Firma?', 'warum': 'Organigramm und Handbuch Seite %d widersprechen sich' % SU['rollen'], 'antwortlinie': '%s führt die Firma, %s ist QMB – das Organigramm korrigieren wir.' % (pers['gf'], pers['qmb'])},
      {'id': 'x2', 'stufe': 1, 'thema': 'Zertifizierer in Auswahl', 'frage': 'In der Managementbewertung steht „Zertifizierer in Auswahl“. Warum?', 'warum': 'MB Seite 1 ist älter als die Auswahl', 'antwortlinie': 'Die MB war vor der Entscheidung für %s; in der nächsten MB steht es richtig.' % F['zertifizierer']},
      {'id': 'x3', 'stufe': 2, 'thema': 'Notfallübung', 'frage': 'Wann haben Sie die letzte Notfallübung gemacht?', 'warum': 'Notfallplan: Übung noch nicht durchgeführt', 'antwortlinie': 'Ehrlich: noch keine – sie ist für November geplant.'}] + sf,
     'aufgaben': [{'id': 't1', 'todo': 'Organigramm korrigieren (nur eine Geschäftsführung)', 'bis_stufe': 1, 'verantwortlich': pers['qmb']},
                  {'id': 't2', 'todo': 'Notfallplan freigeben und Übung planen', 'bis_stufe': 2, 'verantwortlich': pers['gf']},
                  {'id': 't4', 'todo': 'Abgeschlossenen Auftrag mit allen Belegen bereitlegen (%s)' % AUFTRAG, 'bis_stufe': 2, 'verantwortlich': pers['qmb']}] + F['aufgaben'],
    }
    json.dump(quelle, open(os.path.join(ziel, 'paket-quelle.json'), 'w'), ensure_ascii=False, indent=1)
    return {'uph': SU, 'nachweise': SN, 'auftrag': SA}
