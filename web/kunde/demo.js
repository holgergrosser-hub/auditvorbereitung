/**
 * Demo-Modus der Kundenseite: gleiche Schnittstelle wie die Edge Function "kunde", aber alles im Speicher.
 * Erfundene Firma, keine Kundendaten. Mit ?demo=lokal wird zusaetzlich ./demo-lokal.json geladen
 * (lokal erzeugt aus daten/beispiel, steht in .gitignore).
 * ?ruhe=1 legt das Audit in 2 Tagen (Ruhemodus testen).
 */
export async function erstelleDemo(L, opt) {
  opt = opt || {};
  const heute = new Date();
  const plus = (t) => new Date(heute.getTime() + t * 86400000).toISOString().slice(0, 10);
  const reiter = ['Übersicht', 'Ziele & Kennzahlen', 'Kundenzufriedenheit', 'Lieferantenbewertung', 'Qualifikationsmatrix', 'Schulungsplan', 'Maßnahmenplan', 'Risiken', 'Chancen', 'Normen & Gesetze', 'Umweltaspekte'];
  let dokumente = [
    { id: 'd1', d_nr: 'D-01', titel: 'Unternehmens- und Prozesshandbuch', kurzname: 'UPH', stand: '02.10.2026', wichtigkeit: 'kennen', link: '' },
    { id: 'd2', d_nr: 'D-02', titel: 'QM-Übersicht', kurzname: 'QM-Übersicht', stand: '02.10.2026', wichtigkeit: 'kennen', inhalt_kurz: { reiter } },
    { id: 'd3', d_nr: 'D-03', titel: 'Managementbewertung 2026', kurzname: 'MB', stand: '03.08.2026', wichtigkeit: 'kennen' },
    { id: 'd4', d_nr: 'D-04', titel: 'Auditbericht internes Audit', stand: '03.08.2026', wichtigkeit: 'kennen' },
    { id: 'd5', d_nr: 'D-05', titel: 'Notfallplan', stand: '02.10.2026', wichtigkeit: 'finden' },
    { id: 'd6', d_nr: 'D-06', titel: 'Betriebsanweisungen Reinigungsmittel', stand: '02.10.2026', wichtigkeit: 'finden' }
  ];
  let pruefpunkte = [
    { id: 'p1', norm: 'ISO 9001', normpunkt: '4.1', frage: 'Wurden relevante externe und interne Themen bestimmt?', bemerkung: 'UPH S. 3 Kontext der Organisation inkl. Klimawandel; Tab 7/8' },
    { id: 'p2', norm: 'ISO 14001', normpunkt: '4.1', frage: 'Wurden relevante externe und interne Themen bestimmt?', bemerkung: 'UPH S. 3; Tab 10 Umweltaspekte' },
    { id: 'p3', norm: 'ISO 9001', normpunkt: '4.3', frage: 'Ist der Anwendungsbereich festgelegt und dokumentiert?', bemerkung: 'UPH S. 3 Geltungsbereich, Ausschlüsse 8.3' },
    { id: 'p4', norm: 'ISO 9001', normpunkt: '5.2', frage: 'Ist eine Qualitätspolitik festgelegt?', bemerkung: 'UPH S. 5 Unternehmenspolitik, Freigabe Geschäftsführung' },
    { id: 'p5', norm: 'ISO 14001', normpunkt: '5.2', frage: 'Ist eine Umweltpolitik festgelegt?', bemerkung: 'UPH S. 5 Unternehmenspolitik, Freigabe Geschäftsführung' },
    { id: 'p6', norm: 'ISO 9001', normpunkt: '6.1', frage: 'Sind Risiken und Chancen bestimmt und dokumentiert?', bemerkung: 'Tab 7 Risiken, Tab 8 Chancen; Prozess F2 UPH S. 15' },
    { id: 'p7', norm: 'ISO 9001', normpunkt: '6.2', frage: 'Liegen Qualitätsziele und eine Planung zu deren Erreichen vor?', bemerkung: 'Tab 1 Ziele; MB Kap. 2' },
    { id: 'p8', norm: 'ISO 9001', normpunkt: '8.4', frage: 'Werden externe Anbieter bewertet und überwacht?', bemerkung: 'Tab 3 Lieferantenbewertung; UPH S. 34' },
    { id: 'p9', norm: 'ISO 14001', normpunkt: '8.2', frage: 'Sind Prozesse zur Reaktion auf Notfallsituationen festgelegt?', bemerkung: 'Notfallplan; Betriebsanweisungen Reinigungsmittel' },
    { id: 'p10', norm: 'ISO 9001', normpunkt: '9.2', frage: 'Werden interne Audits durchgeführt?', bemerkung: 'Auditbericht internes Audit 03.08.2026' },
    { id: 'p11', norm: 'ISO 9001', normpunkt: '9.3', frage: 'Liegen Ergebnisse der Managementbewertung vor?', bemerkung: 'MB Stand 03.08.2026, Kap. 1–10' }
  ];
  let fragen1 = null;
  if (opt.lokal) { // echte Beispieldaten nur lokal
    try { const r = await fetch('./demo-lokal.json'); if (r.ok) { const j = await r.json(); dokumente = j.dokumente; pruefpunkte = j.pruefpunkte; fragen1 = j.fragen; } } catch (e) { /* bleibt Demo */ }
  }
  if (!fragen1) fragen1 = L.zeigMalFragen(L.fahrplanAusPrueflisten(pruefpunkte), dokumente).map((f, i) => Object.assign({ id: 'f' + (i + 1) }, f));
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
  const st = {
    kunde: { name: 'Muster Gebäudeservice GmbH (Demo)', ort: 'Musterstadt', technik_check: {} },
    audits: [
      { id: 'a1', stufe: 1, datum: plus(opt.ruhe ? 2 : 10), zertifizierer: 'Zertifizierer (Demo)', auditor: 'Herr Prüfer', normen: 'ISO 9001, ISO 14001', auditor_level: 'mittel', ruhemodus_tage: 3, status: 'fragen_bereit' },
      { id: 'a2', stufe: 2, datum: plus(30), zertifizierer: 'Zertifizierer (Demo)', auditor: 'Herr Prüfer', normen: 'ISO 9001, ISO 14001', auditor_level: 'streng', ruhemodus_tage: 3, status: 'fragen_bereit' }
    ],
    mitarbeiter: [{ id: 'm1', name: 'Erika Muster', bereich: 'Geschäftsführung', funktion: 'GF' }, { id: 'm2', name: 'Diana Beispiel', bereich: 'Qualitätsmanagement', funktion: 'QMB/UMB' }],
    faktencheck: [
      { id: 'k1', thema: 'Geschäftsführung', angabe: 'Geschäftsführerin: Diana Beispiel', fundstelle: 'Handbuch S. 6, Managementbewertung Kap. 1' },
      { id: 'k2', thema: 'Mitarbeiterzahl', angabe: '(bitte vom Kunden ergänzen)', fundstelle: 'Managementbewertung Kap. 4' },
      { id: 'k3', thema: 'Zertifizierer', angabe: 'DEKRA oder TÜV (in Auswahl)', fundstelle: 'Managementbewertung Kap. 2' },
      { id: 'k4', thema: 'Leistungen im Geltungsbereich', angabe: 'Gebäudereinigung, Industriereinigung, Wartung von Maschinen und Anlagen', fundstelle: 'Handbuch S. 3' },
      { id: 'k5', thema: 'Geräte, Fahrzeuge, Leitern', angabe: 'Gabelstapler, Arbeitsbühne, Leitern, Feuerlöscher', fundstelle: 'QM-Übersicht, Reiter Wartungsplan' }
    ],
    antworten: [], nachweise: 0
  };
  const fragenJe = { a1: fragen1, a2: fragen2 }, punkteJe = { a1: planpunkte1, a2: planpunkte2 };
  const pause = () => new Promise(r => setTimeout(r, 120));
  async function api(aktion, d) {
    await pause(); d = d || {};
    if (aktion === 'start') return JSON.parse(JSON.stringify({ kunde: st.kunde, audits: st.audits, mitarbeiter: st.mitarbeiter, dokumente, faktencheck: st.faktencheck, level: L.AUDITOR_LEVEL }));
    if (aktion === 'technik') { Object.keys(d.check || {}).forEach(k => { st.kunde.technik_check[k] = d.check[k] ? new Date().toISOString() : null; }); return { ok: true, technik_check: st.kunde.technik_check }; }
    if (aktion === 'fakt') { const f = st.faktencheck.find(x => x.id === d.fakt_id); Object.assign(f, { antwort: d.antwort, korrektur: d.korrektur || '' }); return { ok: true }; }
    if (aktion === 'dokument') { const x = dokumente.find(y => y.id === d.dokument_id); return { url: 'about:blank', titel: x ? x.titel : '', demo: true }; }
    if (aktion === 'fragen') {
      const pp = punkteJe[d.audit_id] || [];
      const fr = L.fragenFuerBereich(fragenJe[d.audit_id] || [], pp, d.bereich || 'alle', d.mitarbeiter_id || '');
      return { fragen: fr.map(f => Object.assign({}, f, { dokumente: L.dokumenteFuerFrage(f, dokumente).map(x => ({ id: x.id, d_nr: x.d_nr, titel: x.titel, stand: x.stand, wichtigkeit: x.wichtigkeit })) })),
        planpunkte: pp, antworten: st.antworten.filter(a => a.mitarbeiter_id === d.mitarbeiter_id) };
    }
    if (aktion === 'antwort') { st.antworten.push({ frage_id: d.frage_id, mitarbeiter_id: d.mitarbeiter_id, text: d.text || '', sicherheit: d.sicherheit, hilfe_genutzt: !!d.hilfe_genutzt, dauer_sekunden: d.dauer_sekunden, ist_beispiel: !!d.ist_beispiel, beantwortet_am: new Date().toISOString() }); return { ok: true }; }
    if (aktion === 'nachweis') { if (!/^data:image\//.test(d.bild || '')) return { fehler: 'Kein Bild' }; st.nachweise++; return { ok: true }; }
    return { fehler: 'Unbekannte Aktion' };
  }
  api.zaehler = () => ({ antworten: st.antworten.length, nachweise: st.nachweise });
  return api;
}
