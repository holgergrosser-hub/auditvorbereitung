/**
 * Lokale Schnittstelle (Testfassung ohne Server und Demo): gleiche Aktionen wie die Edge Function "kunde",
 * Daten aus einem Paket (paket.json bzw. Demo), Fortschritt im Browser (localStorage, mit try/catch).
 * Mit export() bekommt der Berater alles als Datei – der Kunde schickt sie selbst, nichts geht automatisch raus.
 */
export function lokaleApi(L, paket, opt) {
  opt = opt || {};
  // Schluessel nur aus dem Firmennamen: ein neu gebautes Paket (neues Datum) darf den Fortschritt nicht verlieren
  const sauber = (t) => String(t).replace(/[^A-Za-z0-9_-]+/g, '_');
  const schluessel = 'av_paket_' + sauber(opt.schluessel || paket.kunde.name).slice(0, 80);
  const leer = () => ({ technik: {}, fakten: {}, antworten: [], nachweise: [], eintraege: [] });
  let st = leer();
  if (!opt.fluechtig) { try {
    let r = localStorage.getItem(schluessel);
    if (!r && !opt.schluessel) { // Stand aus einer aelteren Fassung (Schluessel mit Paketdatum) uebernehmen – den umfangreichsten
      const alt = Object.keys(localStorage).filter(k => k.indexOf(sauber('av_paket_' + paket.kunde.name + '_').slice(0, 60)) === 0 || k.indexOf(('av_paket_' + sauber(paket.kunde.name + '_')).slice(0, 60)) === 0);
      alt.forEach(k => { const v = localStorage.getItem(k) || ''; if (v.length > (r || '').length) r = v; });
      if (r) localStorage.setItem(schluessel, r);
    }
    if (r) st = Object.assign(leer(), JSON.parse(r));
  } catch (e) { /* ohne Speicher */ } }
  let speicherWarnung = false;
  function sichern() {
    if (opt.fluechtig) return;
    try { localStorage.setItem(schluessel, JSON.stringify(st)); }
    catch (e) { // voll: alte Fotos verkleinert weglassen
      st.nachweise = st.nachweise.slice(-8);
      try { localStorage.setItem(schluessel, JSON.stringify(st)); } catch (e2) { speicherWarnung = true; }
    }
  }
  const pause = () => new Promise(r => setTimeout(r, 60));
  const kopie = (x) => JSON.parse(JSON.stringify(x));

  async function api(aktion, d) {
    await pause(); d = d || {};
    if (aktion === 'start') {
      const kunde = Object.assign({}, paket.kunde, { technik_check: Object.assign({}, paket.kunde.technik_check, st.technik) });
      const fakten = (paket.faktencheck || []).map(f => Object.assign({}, f, st.fakten[f.id] || {}));
      return kopie({ kunde, audits: paket.audits, mitarbeiter: paket.mitarbeiter, dokumente: paket.dokumente, faktencheck: fakten,
        pdf_zip: paket.pdf_zip || '', stolperfallen: paket.stolperfallen || [], aufgaben: paket.aufgaben || [], rundgang: paket.rundgang || L.RUNDGANG_STANDARD, level: L.AUDITOR_LEVEL, lokal: true, demo: !!opt.demo });
    }
    if (aktion === 'technik') { Object.keys(d.check || {}).forEach(k => { st.technik[k] = d.check[k] ? new Date().toISOString() : null; }); sichern(); return { ok: true, technik_check: Object.assign({}, paket.kunde.technik_check, st.technik) }; }
    if (aktion === 'fakt') { st.fakten[d.fakt_id] = { antwort: d.antwort, korrektur: d.korrektur || '', beantwortet_am: new Date().toISOString() }; sichern(); return { ok: true }; }
    if (aktion === 'dokument') { const x = (paket.dokumente || []).find(y => y.id === d.dokument_id) || {}; return { url: x.link || 'about:blank', titel: x.titel || '', demo: !x.link }; }
    if (aktion === 'auszuege') return { auszuege: paket.auszuege || [] };
    if (aktion === 'fragen') {
      const pp = (paket.punkteJe || {})[d.audit_id] || [];
      const ma = (paket.mitarbeiter || []).find(m => m.id === d.mitarbeiter_id);
      const rolle = ma ? L.rolleThemen(ma, (paket.auszuege || []).filter(a => /Normbezug/i.test(a.text || ''))) : null;
      const fr = L.fragenFuerBereich((paket.fragenJe || {})[d.audit_id] || [], pp, d.bereich || 'alle', d.mitarbeiter_id || '', rolle);
      return kopie({ rolle, fragen: fr.map(f => Object.assign({}, f, { dokumente: L.dokumenteFuerFrage(f, paket.dokumente || []).map(x => ({ id: x.id, d_nr: x.d_nr, titel: x.titel, stand: x.stand, wichtigkeit: x.wichtigkeit })) })),
        planpunkte: pp, antworten: st.antworten.filter(a => a.mitarbeiter_id === (d.mitarbeiter_id || null) || (!d.mitarbeiter_id && !a.mitarbeiter_id)) });
    }
    if (aktion === 'antwort') {
      st.antworten.push({ audit_id: d.audit_id, frage_id: d.frage_id, mitarbeiter_id: d.mitarbeiter_id || null, text: String(d.text || '').slice(0, 4000), sicherheit: d.sicherheit, hilfe_genutzt: !!d.hilfe_genutzt,
        dauer_sekunden: d.dauer_sekunden == null ? null : Number(d.dauer_sekunden), ist_beispiel: !!d.ist_beispiel, pruefung: d.pruefung || null, beantwortet_am: new Date().toISOString() });
      sichern(); return { ok: true };
    }
    if (aktion === 'nachweis') {
      if (!/^data:image\//.test(d.bild || '')) return { fehler: 'Kein Bild' };
      st.nachweise.push({ audit_id: d.audit_id, frage_id: d.frage_id, mitarbeiter_id: d.mitarbeiter_id || null, bild: d.vorschau || '', notiz: d.notiz || '', am: new Date().toISOString() });
      st.nachweise = st.nachweise.slice(-30); sichern(); return { ok: true };
    }
    if (aktion === 'eintrag') {
      const k = [d.audit_id || '', d.mitarbeiter_id || '', d.art, d.schluessel || ''].join('|');
      st.eintraege = st.eintraege.filter(e => e.k !== k).concat([{ k, audit_id: d.audit_id || null, mitarbeiter_id: d.mitarbeiter_id || null, art: d.art, schluessel: d.schluessel || '', daten: d.daten || {}, geaendert_am: new Date().toISOString() }]);
      sichern(); return { ok: true };
    }
    if (aktion === 'eintraege') return kopie({ eintraege: st.eintraege.filter(e => !d.audit_id || !e.audit_id || e.audit_id === d.audit_id) });
    return { fehler: 'Unbekannte Aktion' };
  }
  api.lokal = true;
  api.speicherWarnung = () => speicherWarnung;
  api.export = () => ({ art: 'auditvorbereitung-ergebnis', version: 1, kunde: paket.kunde.name, paket_erstellt: paket.erstellt, exportiert: new Date().toISOString(),
    technik: st.technik, faktencheck: (paket.faktencheck || []).map(f => Object.assign({ id: f.id, thema: f.thema, angabe: f.angabe }, st.fakten[f.id] || {})),
    antworten: st.antworten, eintraege: st.eintraege, nachweise: st.nachweise.map(n => ({ frage_id: n.frage_id, mitarbeiter_id: n.mitarbeiter_id, notiz: n.notiz, am: n.am, bild: n.bild })) });
  api.zuruecksetzen = () => { st = leer(); try { localStorage.removeItem(schluessel); } catch (e) { /* */ } };
  return api;
}
