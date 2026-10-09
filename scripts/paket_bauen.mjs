#!/usr/bin/env node
/**
 * Kundenpaket fuer die Testfassung ohne Server (Lektion A09).
 * Liest daten/<kunde>/paket-quelle.json, die Zertifizierer-Formulare (DOCX) und die Kundendokumente (PDF/XLSX)
 * und schreibt einen fertigen Ordner daten/<kunde>/netlify/ – zum Hochziehen auf https://app.netlify.com/drop.
 * Kundendaten bleiben in daten/ (nie in Git). Fortschritt speichert die Seite im Browser des Kunden.
 *
 * Aufruf: node scripts/paket_bauen.mjs daten/mesto
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import L from '../supabase/functions/_shared/logik.js';
import F from '../web/formulare.js';

const ordner = process.argv[2];
if (!ordner) { console.error('Aufruf: node scripts/paket_bauen.mjs daten/<kunde>'); process.exit(1); }
const Q = JSON.parse(fs.readFileSync(path.join(ordner, 'paket-quelle.json'), 'utf8'));
const pf = (p) => path.isAbsolute(p) ? p : path.join(ordner, p);
const docXml = (f) => execFileSync('unzip', ['-p', pf(f), 'word/document.xml'], { maxBuffer: 1e8 }).toString();

// 1) Auszuege und Reiter aus den Kundendokumenten
const tmp = path.join(ordner, '.dokumente-tmp.json');
fs.writeFileSync(tmp, JSON.stringify(Q.dokumente.filter(d => d.datei).map(d => ({ id: d.id, titel: d.titel, datei: pf(d.datei) }))));
const A = JSON.parse(execFileSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'auszuege.py'), tmp], { maxBuffer: 1e9 }).toString());
fs.unlinkSync(tmp);
const dokumente = Q.dokumente.map(d => { const x = Object.assign({}, d); delete x.datei; delete x.kopie_datei; if (A.reiter[d.id]) x.inhalt_kurz = Object.assign({}, x.inhalt_kurz, { reiter: A.reiter[d.id] }); return x; });

// PDF-Kopien fuer Kunden ohne Zugriff auf die Originale (Google-Freigabe klappt nicht): kunde/dok/<id>.pdf, bei Tabellen Reiter -> Seite
const kopien = [];
Q.dokumente.forEach((d, i) => {
  const quelle = d.kopie_datei || (/\.pdf$/i.test(d.datei || '') ? d.datei : '');
  if (!quelle) return;
  kopien.push({ id: d.id, quelle: pf(quelle) });
  dokumente[i].kopie = 'dok/' + d.id + '.pdf';
  if (A.reiter[d.id]) { // Reiter auf PDF-Seiten abbilden: erste Zeile des ersten Auszugs je Reiter auf der Seite suchen
    const n = Number((execFileSync('pdfinfo', [pf(quelle)]).toString().match(/Pages:\s+(\d+)/) || [])[1] || 0);
    const seiten = []; for (let s = 1; s <= n; s++) seiten.push(execFileSync('pdftotext', ['-f', String(s), '-l', String(s), pf(quelle), '-']).toString());
    const karte = {}; let ab = 1; // Reiter stehen im PDF in derselben Reihenfolge: ab der vorigen Fundseite suchen (Seite 1 = Inhaltsverzeichnis)
    A.reiter[d.id].forEach((r, j) => {
      const erst = (A.auszuege.find(a => a.dokument_id === d.id && a.reiter === r) || {}).text || '';
      const kopf = erst.split('\n')[0].split('·')[0].trim().slice(0, 25);
      if (j === 0) { karte[r] = 1; return; }
      const t = seiten.findIndex((x, i) => i >= ab && kopf && x.indexOf(kopf) >= 0);
      if (t >= 0) { karte[r] = t + 1; ab = t; }
    });
    dokumente[i].kopie_seiten = karte;
  }
});

// 2) Audits: Planpunkte aus dem Auditplan, Fahrplan aus den Pruefliste(n), Stufe 2 aus Vorlage
const seitenHinweise = [];
const fragenJe = {}, punkteJe = {}, alleMa = Q.mitarbeiter.map(m => m.id);
Q.audits.forEach(a => {
  let pp = [];
  if (a.auditplan) {
    const plan = F.lies(docXml(a.auditplan));
    if (plan.art !== 'auditplan') throw new Error('Kein Auditplan erkannt: ' + a.auditplan);
    pp = plan.daten.punkte.map((p, i) => ({ id: a.id + '-p' + (i + 1), reihenfolge: i + 1, zeit: p.zeit, thema: p.thema, normkapitel: p.normkapitel, gespraechspartner: p.gespraechspartner, mitarbeiter_ids: alleMa }));
  } else if (a.planpunkte) {
    pp = a.planpunkte.map((p, i) => Object.assign({ id: a.id + '-p' + (i + 1), reihenfolge: i + 1, mitarbeiter_ids: alleMa }, p));
  }
  if (Q.mitarbeiter.length && pp.some(p => p.bereich)) pp = L.mitarbeiterZuordnen(pp, Q.mitarbeiter);
  punkteJe[a.id] = pp;
  let fr = [];
  if (a.prueflisten && a.prueflisten.length) {
    const punkte = [];
    a.prueflisten.forEach(f => { const r = F.lies(docXml(f)); if (r.art !== 'pruefliste') throw new Error('Keine Pruefliste: ' + f); r.daten.punkte.forEach((p, i) => punkte.push(Object.assign({ id: path.basename(f) + '#' + i, norm: r.daten.norm }, p))); });
    fr = L.zeigMalFragen(L.fahrplanAusPrueflisten(punkte), dokumente);
    // Seitenzahlen gegen die aktuelle Fassung pruefen (Fundstellen stammen oft aus einer aelteren Fassung)
    fr.forEach(f => { const k = L.seitenKorrigieren(f.hilfe, f.frage, dokumente, A.auszuege); if (k.aenderungen.length) { seitenHinweise.push({ normkapitel: f.normkapitel, aenderungen: k.aenderungen }); f.hilfe = k.text; } });
  }
  if (a.stufe === 2 || !fr.length) fr = fr.concat(L.fragenOhneKi(pp, a.stufe).map(f => Object.assign({ art: 'frage', normen: (a.normen || 'ISO 9001').split(/,\s*/) }, f)));
  fragenJe[a.id] = fr.map((f, i) => Object.assign({ id: a.id + '-f' + (i + 1) }, f, { reihenfolge: i + 1 }));
  delete a.auditplan; delete a.prueflisten; delete a.planpunkte; a.status = 'fragen_bereit';
});

// 3) Widerspruchs-Check als Hinweis fuer Holger (nicht im Paket fuer den Kunden)
const texte = dokumente.map(d => ({ d_nr: d.d_nr, titel: d.titel, stand: d.stand, text: A.auszuege.filter(x => x.dokument_id === d.id).map(x => x.text).join('\n') }));
const befunde = L.widerspruchsCheck(texte, { zertifizierer: (Q.audits[0] || {}).zertifizierer, firma: Q.kunde.firma_laut_zertifizierer || Q.kunde.name });

const paket = {
  version: 1, erstellt: new Date().toISOString(), kunde: Object.assign({ technik_check: {} }, Q.kunde), audits: Q.audits, mitarbeiter: Q.mitarbeiter,
  dokumente, auszuege: A.auszuege, faktencheck: Q.faktencheck || [], stolperfallen: Q.stolperfallen || [], aufgaben: Q.aufgaben || [], rundgang: Q.rundgang || L.RUNDGANG_STANDARD,
  fragenJe, punkteJe
};

// 4) Ordner fuer Netlify Drop: Webseite + Paket, Konfiguration auf "paket"
const ziel = path.join(ordner, 'netlify');
fs.rmSync(ziel, { recursive: true, force: true });
const web = new URL('../web/', import.meta.url).pathname;
fs.cpSync(web, ziel, { recursive: true, filter: (s) => !/demo-lokal\.json$/.test(s) });
fs.writeFileSync(path.join(ziel, 'config.js'), '// Testfassung ohne Server: Daten aus paket.json, Fortschritt im Browser\nwindow.AV_CONFIG = { paket: "paket.json" };\n');
fs.writeFileSync(path.join(ziel, 'kunde', 'paket.json'), JSON.stringify(paket));
fs.mkdirSync(path.join(ziel, 'kunde', 'dok'), { recursive: true });
kopien.forEach(k => fs.copyFileSync(k.quelle, path.join(ziel, 'kunde', 'dok', k.id + '.pdf')));
// Netlify-Formular "ergebnis": Netlify erkennt es beim Hochladen (Formularerkennung muss in Netlify eingeschaltet sein)
fs.writeFileSync(path.join(ziel, 'formular.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Formular</title>'
  + '<form name="ergebnis" method="POST" data-netlify="true" hidden><input name="kunde"><input name="mitarbeiter"><input name="stufe"><input name="zusammenfassung"><textarea name="daten"></textarea></form>');
fs.writeFileSync(path.join(ziel, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n');
fs.writeFileSync(path.join(ziel, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=kunde/">');
fs.writeFileSync(path.join(ordner, 'befunde.json'), JSON.stringify({ widersprueche: befunde, seitenzahlen: seitenHinweise }, null, 1));

console.log('Paket:', Object.entries(fragenJe).map(([k, v]) => k + ' ' + v.length + ' Fragen').join(', '), '·', A.auszuege.length, 'Auszüge ·', befunde.length, 'Befunde ·', seitenHinweise.length, 'Fundstellen mit verschobener Seitenzahl');
console.log('Fertig:', ziel, '(Ordner auf https://app.netlify.com/drop ziehen)');
