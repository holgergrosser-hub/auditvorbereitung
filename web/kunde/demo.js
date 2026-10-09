/**
 * Demo-Paket der Kundenseite: erfundene Firma, keine Kundendaten. Nichts wird gespeichert.
 * ?demo=lokal laedt stattdessen ./demo-lokal.json (lokal erzeugtes Paket, steht in .gitignore).
 * ?ruhe=1 legt das Audit in 1 Tag (Ruhemodus testen).
 */
import { lokaleApi } from './lokal.js';

export async function erstelleDemo(L, opt) {
  opt = opt || {};
  if (opt.lokal) {
    try { const r = await fetch('./demo-lokal.json'); if (r.ok) { const p = await r.json(); if (opt.ruhe) p.audits[0].datum = plus(1); return lokaleApi(L, p, { fluechtig: true, demo: true }); } } catch (e) { /* weiter mit Demo */ }
  }
  return lokaleApi(L, demoPaket(L, opt), { fluechtig: true, demo: true });
}
function plus(t) { return new Date(Date.now() + t * 86400000).toISOString().slice(0, 10); }

export function demoPaket(L, opt) {
  opt = opt || {};
  const reiter = ['Übersicht', 'Ziele & Kennzahlen', 'Kundenzufriedenheit', 'Lieferantenbewertung', 'Qualifikationsmatrix', 'Schulungsplan', 'Maßnahmenplan', 'Risiken', 'Chancen', 'Normen & Gesetze', 'Umweltaspekte', 'Wartungsplan'];
  const dokumente = [
    { id: 'd1', d_nr: 'D-01', titel: 'Unternehmens- und Prozesshandbuch', kurzname: 'UPH', stand: '02.10.2026', wichtigkeit: 'kennen' },
    { id: 'd2', d_nr: 'D-02', titel: 'QM-Übersicht', kurzname: 'QM-Übersicht', stand: '02.10.2026', wichtigkeit: 'kennen', inhalt_kurz: { reiter } },
    { id: 'd3', d_nr: 'D-03', titel: 'Managementbewertung 2026', kurzname: 'MB', stand: '03.08.2026', wichtigkeit: 'kennen' },
    { id: 'd4', d_nr: 'D-04', titel: 'Auditbericht internes Audit', stand: '03.08.2026', wichtigkeit: 'kennen' },
    { id: 'd5', d_nr: 'D-05', titel: 'Notfallplan', stand: '02.10.2026', wichtigkeit: 'finden' }
  ];
  const auszuege = [
    { id: 'd1-1', dokument_id: 'd1', ort: 'Seite 3', seite: 3, text: 'Anwendungsbereich und Kontext der Organisation\nDas Handbuch gilt für die Muster Gebäudeservice GmbH. Geltungsbereich: Gebäudereinigung und Glasreinigung.\nInterne und externe Themen: Fachkräftemangel, steigende Energiepreise, Klimawandel (Hitze bei Außenarbeiten), Anforderungen an umweltschonende Reinigungsmittel.' },
    { id: 'd1-2', dokument_id: 'd1', ort: 'Seite 3', seite: 3, text: 'Interessierte Parteien und deren Anforderungen\n• Kunden: zuverlässige Reinigung, Termintreue\n• Mitarbeiter: sichere Arbeitsbedingungen\n• Berufsgenossenschaft: Arbeitsschutz' },
    { id: 'd1-3', dokument_id: 'd1', ort: 'Seite 5', seite: 5, text: 'Unternehmenspolitik – Qualitäts- und Umweltpolitik\nWir verpflichten uns zur kontinuierlichen Verbesserung, zur Einhaltung der bindenden Verpflichtungen und zum Schutz der Umwelt. Freigabe: Geschäftsführung.' },
    { id: 'd1-4', dokument_id: 'd1', ort: 'Seite 15', seite: 15, text: 'Prozess F2 Risiken und Chancen\nEinmal jährlich bewertet die Geschäftsführung Risiken und Chancen (Wahrscheinlichkeit × Auswirkung) und legt Maßnahmen fest.' },
    { id: 'd1-5', dokument_id: 'd1', ort: 'Seite 34', seite: 34, text: 'Prozess U5 Lieferantenbewertung\nHauptlieferanten werden jährlich nach Qualität, Termintreue und Preis mit Schulnoten bewertet.' },
    { id: 'd2-1', dokument_id: 'd2', ort: 'Reiter „Risiken“', reiter: 'Risiken', text: 'Risiko: Sturzgefahr bei Arbeiten in der Höhe | Wahrscheinlichkeit: 2 | Auswirkung: 3 | Maßnahme: Leitern prüfen, Unterweisung | Verantwortlich: GF' },
    { id: 'd2-2', dokument_id: 'd2', ort: 'Reiter „Chancen“', reiter: 'Chancen', text: 'Chance: Umweltschonende Reinigungsmittel als Verkaufsargument bei Schulen | Nutzen: 3 | Maßnahme: Produkte testen' },
    { id: 'd2-3', dokument_id: 'd2', ort: 'Reiter „Ziele & Kennzahlen“', reiter: 'Ziele & Kennzahlen', text: 'Ziel 2026: zwei neue Großkunden | Ziel: Reklamationen unter 2 | Ziel: weniger aggressive Reinigungsmittel' },
    { id: 'd2-4', dokument_id: 'd2', ort: 'Reiter „Lieferantenbewertung“', reiter: 'Lieferantenbewertung', text: 'Lieferant: Reinigungsmittel-Hersteller | Qualität: 2 | Termintreue: 2 | Preis: 2 | Gesamt: 2' },
    { id: 'd2-5', dokument_id: 'd2', ort: 'Reiter „Wartungsplan“', reiter: 'Wartungsplan', text: 'Feuerlöscher | alle 2 Jahre | Fachfirma | Letzte Prüfung: 03/2025\nLeitern | jährlich | Eigenprüfung | Letzte Prüfung: [bitte ergänzen]' },
    { id: 'd3-1', dokument_id: 'd3', ort: 'Seite 2', seite: 2, text: 'Ressourcen: Fahrzeug, Hochdruckreiniger, IT. Personalstand: [bitte vom Kunden ergänzen]. Zertifizierer: in Auswahl.' },
    { id: 'd4-1', dokument_id: 'd4', ort: 'Seite 1', seite: 1, text: 'Internes System- und Prozessaudit am 03.08.2026. Ergebnis: 0 Abweichungen, 8 Empfehlungen (siehe Maßnahmenplan).' },
    { id: 'd5-1', dokument_id: 'd5', ort: 'Seite 2', seite: 2, text: 'Notfall Reinigungsmittel ausgelaufen: Bindemittel aufbringen, Gully abdecken, Betriebsanweisung beachten, Augenspülflasche im Fahrzeug.' }
  ];
  const pruefpunkte = [
    { id: 'p1', norm: 'ISO 9001', normpunkt: '4.1', frage: 'Wurden relevante externe und interne Themen bestimmt?', bemerkung: 'UPH S. 3 Kontext der Organisation inkl. Klimawandel; Tab 7/8' },
    { id: 'p2', norm: 'ISO 14001', normpunkt: '4.1', frage: 'Wurden relevante externe und interne Themen bestimmt?', bemerkung: 'UPH S. 3; Tab 10 Umweltaspekte' },
    { id: 'p3', norm: 'ISO 9001', normpunkt: '4.2', frage: 'Wurden die relevanten interessierten Parteien bestimmt?', bemerkung: 'UPH S. 3 interessierte Parteien' },
    { id: 'p4', norm: 'ISO 9001', normpunkt: '5.2', frage: 'Ist eine Qualitätspolitik festgelegt?', bemerkung: 'UPH S. 5 Unternehmenspolitik, Freigabe Geschäftsführung' },
    { id: 'p5', norm: 'ISO 14001', normpunkt: '5.2', frage: 'Ist eine Umweltpolitik festgelegt?', bemerkung: 'UPH S. 5 Unternehmenspolitik, Freigabe Geschäftsführung' },
    { id: 'p6', norm: 'ISO 9001', normpunkt: '6.1', frage: 'Sind Risiken und Chancen bestimmt und dokumentiert?', bemerkung: 'Tab 7 Risiken, Tab 8 Chancen; Prozess F2 UPH S. 15' },
    { id: 'p7', norm: 'ISO 9001', normpunkt: '6.2', frage: 'Liegen Qualitätsziele und eine Planung zu deren Erreichen vor?', bemerkung: 'Tab 1 Ziele & Kennzahlen' },
    { id: 'p8', norm: 'ISO 9001', normpunkt: '8.4', frage: 'Werden externe Anbieter bewertet und überwacht?', bemerkung: 'Tab 3 Lieferantenbewertung; UPH S. 34' },
    { id: 'p9', norm: 'ISO 14001', normpunkt: '8.2', frage: 'Sind Prozesse zur Reaktion auf Notfallsituationen festgelegt?', bemerkung: 'Notfallplan Seite 2' },
    { id: 'p10', norm: 'ISO 9001', normpunkt: '9.2', frage: 'Werden interne Audits durchgeführt?', bemerkung: 'Auditbericht internes Audit Seite 1' }
  ];
  const fragen1 = L.zeigMalFragen(L.fahrplanAusPrueflisten(pruefpunkte), dokumente).map((f, i) => Object.assign({ id: 'f' + (i + 1) }, f));
  const planpunkte2 = [
    { id: 'pp1', reihenfolge: 1, zeit: '09:00–09:30', thema: 'Eröffnungsgespräch', normkapitel: '', mitarbeiter_ids: ['m1', 'm2'] },
    { id: 'pp2', reihenfolge: 2, zeit: '09:30–10:30', thema: 'Auftragsabwicklung, Angebot bis Rechnung', normkapitel: '8.2, 8.5', mitarbeiter_ids: ['m1'] },
    { id: 'pp3', reihenfolge: 3, zeit: '10:30–11:15', thema: 'Einkauf und Lieferantenbewertung', normkapitel: '8.4', mitarbeiter_ids: ['m2'] },
    { id: 'pp4', reihenfolge: 4, zeit: '11:15–12:00', thema: 'Interne Audits, Managementbewertung', normkapitel: '9.2, 9.3', mitarbeiter_ids: ['m1', 'm2'] }
  ];
  const fragen2 = L.fragenOhneKi(planpunkte2, 2).map((f, i) => Object.assign({ id: 'g' + (i + 1), art: 'frage', normen: ['ISO 9001'] }, f));
  const planpunkte1 = [
    { id: 'q1', reihenfolge: 1, zeit: '09:30–09:45', thema: 'Eröffnungsbesprechung', mitarbeiter_ids: ['m1', 'm2'] },
    { id: 'q2', reihenfolge: 2, zeit: '09:45–11:30', thema: 'Bewertung der Systemdokumentation', mitarbeiter_ids: ['m1', 'm2'] },
    { id: 'q3', reihenfolge: 3, zeit: '11:30–12:30', thema: 'Interne Audits / Managementbewertung', mitarbeiter_ids: ['m1', 'm2'] },
    { id: 'q4', reihenfolge: 4, zeit: '12:30–12:45', thema: 'Planung Audit Stufe 2', mitarbeiter_ids: ['m1'] }
  ];
  return {
    version: 1, erstellt: 'demo',
    kunde: { name: 'Muster Gebäudeservice GmbH (Demo)', ort: 'Musterstadt', technik_check: {}, berater_email: '', berater_name: 'Ihr Berater' },
    audits: [
      { id: 'a1', stufe: 1, datum: plus(opt.ruhe ? 1 : 10), zertifizierer: 'Zertifizierer (Demo)', auditor: 'Herr Prüfer', normen: 'ISO 9001, ISO 14001', auditor_level: 'mittel', ruhemodus_tage: 2, status: 'fragen_bereit' },
      { id: 'a2', stufe: 2, datum: plus(30), zertifizierer: 'Zertifizierer (Demo)', auditor: 'Herr Prüfer', normen: 'ISO 9001, ISO 14001', auditor_level: 'streng', ruhemodus_tage: 3, status: 'fragen_bereit' }
    ],
    mitarbeiter: [{ id: 'm1', name: 'Erika Muster', bereich: 'Geschäftsführung', funktion: 'GF' }, { id: 'm2', name: 'Diana Beispiel', bereich: 'Qualitätsmanagement', funktion: 'QMB/UMB' }],
    dokumente, auszuege,
    faktencheck: [
      { id: 'k1', thema: 'Geschäftsführung', angabe: 'Geschäftsführerin: Diana Beispiel', fundstelle: 'Handbuch S. 6, Managementbewertung Kap. 1' },
      { id: 'k2', thema: 'Mitarbeiterzahl', angabe: '(bitte vom Kunden ergänzen)', fundstelle: 'Managementbewertung Seite 2' },
      { id: 'k3', thema: 'Zertifizierer', angabe: 'in Auswahl', fundstelle: 'Managementbewertung Seite 2' }
    ],
    stolperfallen: [
      { id: 'x1', stufe: 1, thema: 'Mitarbeiter', frage: 'Wie viele Mitarbeiter haben Sie?', warum: 'In der Managementbewertung steht noch „bitte vom Kunden ergänzen“.', antwortlinie: 'Die richtige Zahl nennen. Platzhalter vorher mit dem Berater klären.' },
      { id: 'x2', stufe: 1, thema: 'Zertifizierer', frage: 'In der Managementbewertung steht „Zertifizierer in Auswahl“ – warum?', warum: 'Die Managementbewertung ist älter als die Entscheidung für den Zertifizierer.', antwortlinie: 'Die Bewertung ist vom August, da war der Zertifizierer noch nicht entschieden. Inzwischen ist er beauftragt.' },
      { id: 'x3', stufe: 2, thema: 'Prüfungen', frage: 'Wann wurden die Leitern zuletzt geprüft?', warum: 'Im Wartungsplan fehlt das Datum.', antwortlinie: 'Eigenprüfung mit Prüfblatt – Datum zeigen oder ehrlich sagen, dass sie geplant ist.' }
    ],
    aufgaben: [{ id: 't1', todo: 'Einen abgeschlossenen Auftrag mit allen Belegen heraussuchen', bis_stufe: 2, verantwortlich: 'GF' }],
    rundgang: L.RUNDGANG_STANDARD,
    fragenJe: { a1: fragen1, a2: fragen2 }, punkteJe: { a1: planpunkte1, a2: planpunkte2 }
  };
}
