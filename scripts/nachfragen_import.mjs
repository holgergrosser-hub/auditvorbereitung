// Übernimmt echte Audit-Nachfragen aus Holgers QM-Wissensbasis in die App (E-A39).
// Aufruf: node scripts/nachfragen_import.mjs <datei>
//   a) Blatt „Branchenmuster“ als TSV (Datei → Herunterladen → .tsv), lokal unter daten/ ablegen – NIE in Git
//   b) Export des Apps-Scripts (apps-script/nachfragen_export.gs) als CSV mit Spalten Branche,Nachfrage
// Eine Nachfrage lautet „Frage → erwarteter Nachweis“. Übernommen werden nur Frage, Nachweis und eine grobe Branche.
// Prüfung, bevor etwas ins öffentliche Repo kommt: Firmenformen, Mail, Webseite, Telefon, „Herr/Frau Name“, Bankennamen
// und – falls vorhanden – Namen aus daten/sperrliste.txt (eine Zeile je Name, liegt nur lokal).
// Abgeschnittene Zellen: die letzte Nachfrage einer Zelle wird nur übernommen, wenn sie vollständig endet.
import fs from 'node:fs';

const datei = process.argv[2];
if (!datei) { console.error('Aufruf: node scripts/nachfragen_import.mjs <datei.tsv|datei.csv>'); process.exit(1); }

function tabelle(text, trenner) { // CSV/TSV-Leser mit Anführungszeichen und Zeilenumbrüchen in Zellen
  const zeilen = []; let z = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"' && f === '') q = true; else if (c === trenner) { z.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; z.push(f); zeilen.push(z); z = []; f = ''; }
    else f += c;
  }
  if (f || z.length) { z.push(f); zeilen.push(z); }
  return zeilen;
}
const VERDAECHTIG = [/\b(gmbh|ug|kg|ag|e\.\s?k\.|ohg|gbr|mbh|co\.)\b/i, /@|https?:\/\/|www\./i, /\+?\d[\d /-]{6,}\d/,
  /\b([Hh]err|[Ff]rau|[Hh]r\.|[Ff]r\.|Dr\.)\s+[A-ZÄÖÜ]/, /sparkasse|volksbank|raiffeisen/i];
const sperrWoerter = fs.existsSync('daten/sperrliste.txt') ? fs.readFileSync('daten/sperrliste.txt', 'utf8').split('\n').map(s => s.trim().toLowerCase()).filter(s => s.length >= 3) : [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sperr = sperrWoerter.map(w => ({ w, rx: new RegExp('(^|[^a-zäöüß])' + esc(w) + '([^a-zäöüß]|$)') })); // nur ganze Wörter
const grob = (b) => { const t = String(b || '').split('(')[0].replace(/\s*\/\s*/g, ' / ').trim(); return t.length <= 45 ? t : t.slice(0, 45).replace(/\s+\S*$/, ''); };

const text = fs.readFileSync(datei, 'utf8');
const tsv = /\t/.test(text.split('\n')[0]);
const z = tabelle(text, tsv ? '\t' : ',');
const kopf = z[0].map(x => x.toLowerCase());
const spN = Math.max(0, kopf.findIndex(k => /nachfrage/.test(k)));
const spB = Math.max(0, kopf.findIndex(k => /branche/.test(k)));
const roh = [];
for (const zeile of z.slice(1)) {
  const zelle = String(zeile[spN] || '').trim(); if (!zelle) continue;
  const teile = zelle.split(/\n/).map(t => t.replace(/^\s*[-–*•\d.)]+\s*/, '').trim()).filter(Boolean);
  teile.forEach((t, i) => {
    const letzte = i === teile.length - 1 && teile.length > 1;
    if (letzte && !/[.)!?]$/.test(t)) return; // abgeschnitten
    const [frage, nachweis = ''] = t.split(/\s*→\s*/);
    roh.push({ branche: grob(zeile[spB]), frage: frage.trim(), nachweis: nachweis.trim() });
  });
}
const raus = [], gut = [], gesehen = new Set(), treffer = {};
for (const n of roh) {
  if (n.frage.length < 20 || n.frage.length > 400) continue;
  const alles = n.frage + ' ' + n.nachweis, k = alles.toLowerCase();
  const sp = (sperr.find(s => s.rx.test(k)) || {}).w, vd = VERDAECHTIG.find(r => r.test(alles));
  if (sp || vd) { raus.push(n.frage); const g = sp ? "Sperrliste: " + sp : "Muster: " + vd; treffer[g] = (treffer[g] || 0) + 1; continue; }
  if (gesehen.has(n.frage.toLowerCase())) continue; gesehen.add(n.frage.toLowerCase());
  gut.push({ branche: n.branche, frage: n.frage.slice(0, 400), nachweis: n.nachweis.slice(0, 400) });
}
// Je Thema der Übungsfragen höchstens 60 Nachfragen, die kürzesten zuerst (gesprochen gut verständlich); ohne Thema keine.
const { THEMEN } = await import('../web/kunde/wissen.js');
const auswahl = new Set();
THEMEN.forEach(t => gut.filter(n => t.rx.test(n.frage)).sort((a, b) => a.frage.length - b.frage.length).slice(0, 60).forEach(n => auswahl.add(n)));
const vorher = gut.length; gut.splice(0, gut.length, ...gut.filter(n => auswahl.has(n)));
console.log('Auswahl je Thema: ' + gut.length + ' von ' + vorher);
const kopfzeile = '// Echte Audit-Nachfragen aus Holgers Beratungspraxis (anonymisiert, E-A39): Frage und was der Auditor als Nachweis erwartet.\n// Erzeugt mit scripts/nachfragen_import.mjs – nicht von Hand ändern.\n';
fs.writeFileSync('web/kunde/nachfragen.js', kopfzeile + 'export const NACHFRAGEN = [\n  ' + gut.map(x => JSON.stringify(x)).join(',\n  ') + '\n];\n');
console.log(gut.length + ' Nachfragen übernommen, ' + raus.length + ' aussortiert (bitte ansehen):');
Object.entries(treffer).sort((a, b) => b[1] - a[1]).forEach(([g, n]) => console.log("  " + n + "× " + g));
