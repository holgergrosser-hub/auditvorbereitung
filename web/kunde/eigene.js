/**
 * Testmonat mit EIGENEN Dokumenten (E-A33): Alles bleibt im Browser des Teilnehmers.
 * - PDFs werden hier gelesen (PDF.js, lokal mitgeliefert) und in IndexedDB abgelegt – nichts wird hochgeladen.
 * - Aus den Seiten entstehen Auszüge ("Wo steht das?"), aus den Standardfragen ISO 9001 ein Fahrplan mit Fundstellen-Vorschlägen.
 * - Der Server sieht nur Schlüssel, Grenzen und freiwillige Verbesserungsvorschläge. Holger sieht keine Dokumente und keine Antworten.
 * - Nur wenn der Teilnehmer die KI fragt, gehen die passenden Textstellen kurz an die KI (nicht gespeichert).
 */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KAP = { '4': 'Kontext der Organisation', '5': 'Führung', '6': 'Planung', '7': 'Unterstützung', '8': 'Betrieb', '9': 'Bewertung der Leistung', '10': 'Verbesserung' };
const MAX_DATEIEN = 40, MAX_MB = 30;

export const ablage = (token) => String(token || '').slice(0, 16);

/* ---------------------------------------------------------------- Merken: Modus (localStorage) und Daten (IndexedDB) */
export function modus(token) { try { return localStorage.getItem('av_modus_' + ablage(token)) || ''; } catch (e) { return ''; } }
export function modusSetzen(token, m) { try { if (m) localStorage.setItem('av_modus_' + ablage(token), m); else localStorage.removeItem('av_modus_' + ablage(token)); } catch (e) { /* ohne Speicher */ } }

export function dbOeffnen(w) {
  return new Promise((ok, nein) => {
    const r = indexedDB.open('av_eigen_' + w, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error);
  });
}
async function tx(w, art, fn) {
  const db = await dbOeffnen(w);
  return new Promise((ok, nein) => {
    const t = db.transaction('kv', art), s = t.objectStore('kv'); let erg;
    Promise.resolve(fn(s)).then(r => { erg = r; });
    t.oncomplete = () => { db.close(); ok(erg instanceof IDBRequest ? erg.result : erg); }; t.onerror = () => { db.close(); nein(t.error); };
  });
}
export const holen = (w, k) => tx(w, 'readonly', s => s.get(k));
const ablegen = (w, k, v) => tx(w, 'readwrite', s => { s.put(v, k); });
export const allesLoeschen = (w) => tx(w, 'readwrite', s => { s.clear(); });
export async function paketLaden(token) { try { return await holen(ablage(token), 'paket') || null; } catch (e) { return null; } }

/* ---------------------------------------------------------------- PDF lesen */
async function pdfjsLaden() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((ok, nein) => { const s = document.createElement('script'); s.src = 'pdfjs/pdf.min.js'; s.onload = ok; s.onerror = () => nein(new Error('Seitenleser nicht geladen')); document.head.appendChild(s); });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.min.js';
  return window.pdfjsLib;
}
export async function pdfSeiten(datei) {
  const pdfjs = await pdfjsLaden();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await datei.arrayBuffer()) }).promise;
  const seiten = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    seiten.push(tc.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim());
  }
  pdf.destroy();
  return seiten;
}
export const titelAusDatei = (n) => String(n).replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Dokument';

/* ---------------------------------------------------------------- Paket bauen (gleiche Form wie paket.json der Testfassung) */
export function paketBauen(L, angaben, doks) {
  const dokumente = doks.map((d, i) => ({ id: d.id, d_nr: 'D-' + String(i + 1).padStart(2, '0'), titel: d.titel, kurzname: '', stand: '', normkapitel: '', bereich: '',
    wichtigkeit: 'finden', link: '', kopie: 'eigen:' + d.id, kopie_seiten: null, seiten: d.seiten.length, ohne_text: d.seiten.filter(t => t.length < 30).length }));
  const auszuege = [];
  doks.forEach(d => d.seiten.forEach((t, i) => { if (t.length >= 30) auszuege.push({ id: d.id + '-' + (i + 1), dokument_id: d.id, ort: 'Seite ' + (i + 1), seite: i + 1, reiter: null, text: t }); }));
  const titel = Object.fromEntries(dokumente.map(d => [d.id, d.titel]));
  const namen = String(angaben.mitarbeiter || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 30);
  const mitarbeiter = (namen.length ? namen : ['Ich']).map((n, i) => ({ id: 'm' + (i + 1), name: n, bereich: 'Alle', funktion: '' }));
  const audits = [1, 2].map(s => ({ id: 's' + s, stufe: s, datum: angaben['datum' + s] || null, zertifizierer: angaben.zertifizierer || '', auditor: '', normen: 'ISO 9001',
    auditor_level: 'mittel', ruhemodus_tage: 3, status: 'fragen_bereit' }));
  const punkteJe = {}, fragenJe = {};
  audits.forEach(a => {
    const pp = Object.keys(KAP).map((k, i) => ({ id: 'p' + a.stufe + '-' + k, audit_id: a.id, reihenfolge: i + 1, zeit: '', thema: k + ' ' + KAP[k], normkapitel: k, bereich: 'Alle',
      mitarbeiter_ids: mitarbeiter.map(m => m.id), gespraechspartner: '', nachweise: '' }));
    punkteJe[a.id] = pp;
    fragenJe[a.id] = L.fragenOhneKi(pp, a.stufe).map((f, i) => {
      // Fundstellen-Vorschlag ohne KI: die zwei besten Seiten mit mindestens zwei passenden Wörtern
      const t = L.auszuegeSuchen(f.frage, auszuege, 3).filter(x => x.treffer.length >= 2).slice(0, 2);
      const orte = t.map(x => titel[x.auszug.dokument_id] + ' ' + x.auszug.ort);
      return Object.assign(f, { id: 'f' + a.stufe + '-' + (i + 1), audit_id: a.id, titel: f.normkapitel + ' ' + KAP[f.normkapitel], art: 'frage', normen: ['ISO 9001'],
        hilfe: (orte.length ? 'Vorschlag aus Ihren Dokumenten (bitte prüfen): ' + orte.join('; ') + '. Sonst typisch: ' : '') + f.hilfe,
        dokument_ids: [...new Set(t.map(x => x.auszug.dokument_id))] });
    });
  });
  return { art: 'eigene-dokumente', erstellt: new Date().toISOString(), kunde: { name: angaben.firma || 'Meine Firma', ort: '', berater_name: 'Holger Grosser', technik_check: {} },
    audits, mitarbeiter, dokumente, auszuege, punkteJe, fragenJe, faktencheck: [], stolperfallen: [], aufgaben: [] };
}

/* ---------------------------------------------------------------- Oberfläche: Auswahl und Einrichten */
/**
 * Auswahl im Testmonat: eine der Musterfirmen (Server, E-A41) oder die eigenen Dokumente (nur im Browser, E-A33).
 * firmen: [{id, name, branche, beschreibung}], aktuell: id der jetzigen Musterfirma, waehlen(id): Wechsel am Server
 */
export function auswahlZeigen(main, token, weiter, firmen, aktuell, waehlen) {
  const liste = (firmen || []).length ? firmen : [{ id: '', name: 'Beispielfirma', branche: 'Sofort loslegen', beschreibung: 'Eine erfundene Firma mit Handbuch, Prozessen, Auditplan und Fragen.' }];
  main.innerHTML = '<h2>Womit möchten Sie üben?</h2>'
    + '<p>Wählen Sie eine <b>Musterfirma</b> aus Ihrer Branche – jede hat eine vollständige Dokumentation (Handbuch mit Prozessen, Nachweise, ein abgeschlossener Auftrag, Auditplan des Zertifizierers). Oder üben Sie mit Ihren eigenen Dokumenten.</p>'
    + '<div class="eigen-wahl">'
    + liste.map(f => '<button class="eigen-karte" data-firma="' + esc(f.id) + '" style="--f:#0B7285"><span class="eyebrow">' + esc(f.branche || 'Musterfirma') + (f.id && f.id === aktuell ? ' · gewählt' : '') + '</span><b>' + esc(f.name) + '</b><span>' + esc(f.beschreibung || '') + '</span></button>').join('')
    + '<button class="eigen-karte" data-m="eigen" style="--f:#6741D9"><span class="eyebrow">Ihr echtes Audit</span><b>Mit Ihren eigenen Dokumenten</b><span>Sie wählen Ihre PDFs aus. Sie werden <b>nur in diesem Browser</b> gelesen und gespeichert – es wird nichts hochgeladen, auch Holger Grosser sieht sie nie.</span></button>'
    + '</div><p class="grau">Sie können später wechseln. Beim Wechsel der Musterfirma beginnen die Übungen neu. Ihre eigenen Dokumente gibt es nur auf diesem Gerät und in diesem Browser.</p><p id="wahl-hinweis" class="hinweis" hidden></p>';
  const hinweis = (t) => { const h = main.querySelector('#wahl-hinweis'); h.textContent = t; h.hidden = !t; };
  main.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { modusSetzen(token, b.dataset.m); weiter(); });
  main.querySelectorAll('[data-firma]').forEach(b => b.onclick = async () => {
    const id = b.dataset.firma;
    if (id && id !== aktuell && waehlen) {
      main.querySelectorAll('button').forEach(x => { x.disabled = true; }); hinweis('Die Musterfirma wird eingerichtet …');
      try { await waehlen(id); } catch (e) { main.querySelectorAll('button').forEach(x => { x.disabled = false; }); return hinweis(e.message || 'Das hat nicht geklappt.'); }
    }
    modusSetzen(token, 'beispiel'); weiter();
  });
}

export function einrichtenZeigen(main, L, token, weiter, alt) {
  const a = (alt && alt.angaben) || {};
  main.innerHTML = '<h2>Ihre Dokumente einrichten</h2>'
    + '<div class="karte eigen-schutz"><b>🔒 Ihre Dokumente bleiben bei Ihnen.</b> Die Dateien werden in diesem Browser gelesen und hier gespeichert. Es wird nichts hochgeladen. '
    + 'Nur wenn Sie „KI fragen“ nutzen, gehen die passenden Textstellen kurz an die KI und werden dort nicht gespeichert.</div>'
    + '<div class="karte"><label for="e-firma">Firmenname</label><input id="e-firma" maxlength="120" value="' + esc(a.firma || '') + '" placeholder="z. B. Muster GmbH">'
    + '<label for="e-ma">Wer übt? <span class="grau">(Namen mit Komma, freiwillig)</span></label><input id="e-ma" maxlength="600" value="' + esc(a.mitarbeiter || '') + '" placeholder="z. B. Anna, Ben">'
    + '<div class="zeile"><label style="margin:0">Stufe 1 am <input id="e-d1" type="date" value="' + esc(a.datum1 || '') + '"></label><label style="margin:0">Stufe 2 am <input id="e-d2" type="date" value="' + esc(a.datum2 || '') + '"></label>'
    + '<label style="margin:0">Zertifizierer <input id="e-zert" maxlength="60" value="' + esc(a.zertifizierer || '') + '" placeholder="z. B. TÜV"></label></div>'
    + '<label for="e-dateien">Ihre Dokumente als PDF <span class="grau">(Handbuch, Prozesse, Listen; Word/Excel vorher „Speichern als PDF“; höchstens ' + MAX_DATEIEN + ' Dateien)</span></label>'
    + '<input id="e-dateien" type="file" accept="application/pdf,.pdf" multiple>'
    + (alt && alt.dokumente && alt.dokumente.length ? '<p class="grau">Bisher eingerichtet: ' + alt.dokumente.map(d => esc(d.titel)).join(', ') + '. Neu gewählte Dateien ersetzen diese Auswahl.</p>' : '')
    + '<p><button class="knopf" id="e-los">Einrichten</button> ' + (alt ? '<button class="knopf zweit" id="e-abbruch">Abbrechen</button>' : '<button class="link" id="e-beispiel">doch lieber mit der Beispielfirma</button>') + '</p>'
    + '<div id="e-protokoll" class="grau"></div></div>';
  const prot = main.querySelector('#e-protokoll'), log = (t) => { prot.insertAdjacentHTML('beforeend', '<div>' + esc(t) + '</div>'); };
  const ab = main.querySelector('#e-abbruch'); if (ab) ab.onclick = () => weiter();
  const bs = main.querySelector('#e-beispiel'); if (bs) bs.onclick = () => { modusSetzen(token, 'beispiel'); weiter(); };
  main.querySelector('#e-los').onclick = async () => {
    const angaben = { firma: main.querySelector('#e-firma').value.trim(), mitarbeiter: main.querySelector('#e-ma').value.trim(), datum1: main.querySelector('#e-d1').value,
      datum2: main.querySelector('#e-d2').value, zertifizierer: main.querySelector('#e-zert').value.trim() };
    const dateien = [...main.querySelector('#e-dateien').files].filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    prot.innerHTML = '';
    if (!angaben.firma) return log('Bitte den Firmennamen eintragen.');
    if (!dateien.length && !(alt && alt.dokumente && alt.dokumente.length)) return log('Bitte mindestens ein PDF auswählen.');
    if (dateien.length > MAX_DATEIEN) return log('Bitte höchstens ' + MAX_DATEIEN + ' Dateien auswählen.');
    const zuGross = dateien.filter(f => f.size > MAX_MB * 1048576); if (zuGross.length) return log('Zu groß (über ' + MAX_MB + ' MB): ' + zuGross.map(f => f.name).join(', '));
    const knopf = main.querySelector('#e-los'); knopf.disabled = true; knopf.textContent = 'Lese Dokumente …';
    const w = ablage(token);
    try {
      let doks;
      if (dateien.length) {
        doks = [];
        for (let i = 0; i < dateien.length; i++) {
          const f = dateien[i]; log('Lese ' + f.name + ' …');
          let seiten; try { seiten = await pdfSeiten(f); } catch (e) { log('  ✗ ' + f.name + ' ließ sich nicht lesen und wird übersprungen.'); continue; }
          const ohne = seiten.filter(t => t.length < 30).length;
          log('  ✓ ' + seiten.length + (seiten.length === 1 ? ' Seite' : ' Seiten') + (ohne ? ' · ' + ohne + ' ohne Text (Scan/Bild – die Suche findet sie nicht)' : ''));
          doks.push({ id: 'e' + (i + 1), titel: titelAusDatei(f.name), datei: f, seiten });
        }
        if (!doks.length) throw new Error('Keines der PDFs ließ sich lesen.');
        await allesLoeschen(w);
        for (const d of doks) await ablegen(w, 'datei:' + d.id, new Blob([await d.datei.arrayBuffer()], { type: 'application/pdf' }));
        await ablegen(w, 'seiten', doks.map(d => ({ id: d.id, titel: d.titel, seiten: d.seiten })));
      } else doks = await holen(w, 'seiten');
      const paket = paketBauen(L, angaben, doks);
      paket.angaben = angaben;
      await ablegen(w, 'paket', paket);
      const gefunden = Object.values(paket.fragenJe).flat().filter(f => f.dokument_ids.length).length, alle = Object.values(paket.fragenJe).flat().length;
      log('Fertig: ' + paket.dokumente.length + ' Dokumente, ' + paket.auszuege.length + ' durchsuchbare Seiten. Zu ' + gefunden + ' von ' + alle + ' Standardfragen gibt es einen Fundstellen-Vorschlag.');
      modusSetzen(token, 'eigen');
      knopf.textContent = 'Los geht’s →'; knopf.disabled = false; knopf.onclick = () => weiter();
    } catch (e) { log('✗ ' + (e.message || e)); knopf.disabled = false; knopf.textContent = 'Einrichten'; }
  };
}
