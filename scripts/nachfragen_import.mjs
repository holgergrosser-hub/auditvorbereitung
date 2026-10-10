// Übernimmt den anonymisierten Export der Audit-Nachfragen (apps-script/nachfragen_export.gs) in die App (E-A39).
// Aufruf: node scripts/nachfragen_import.mjs <export.csv>   (CSV mit Spalten Branche,Nachfrage – „Datei → Herunterladen → CSV“)
// Zweite Prüfung, bevor etwas ins öffentliche Repo kommt: Firmenformen, Mail, Webseite, Telefon, „Herr/Frau Name“
// und – falls vorhanden – Namen aus daten/sperrliste.txt (eine Zeile je Name, liegt nur lokal, nie in Git).
import fs from 'node:fs';

const datei = process.argv[2];
if (!datei) { console.error('Aufruf: node scripts/nachfragen_import.mjs <export.csv>'); process.exit(1); }

function csv(text) { // einfacher CSV-Leser mit Anführungszeichen
  const zeilen = []; let z = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ',') { z.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; z.push(f); zeilen.push(z); z = []; f = ''; }
    else f += c;
  }
  if (f || z.length) { z.push(f); zeilen.push(z); }
  return zeilen;
}
export const VERDAECHTIG = [/\b(gmbh|ug|kg|ag|e\.\s?k\.|ohg|gbr|mbh|co\.)\b/i, /@|https?:\/\/|www\./i, /\+?\d[\d /-]{6,}\d/, /\b([Hh]err|[Ff]rau|[Hh]r\.|[Ff]r\.)\s+[A-ZÄÖÜ]/];

const sperr = fs.existsSync('daten/sperrliste.txt') ? fs.readFileSync('daten/sperrliste.txt', 'utf8').split('\n').map(s => s.trim().toLowerCase()).filter(s => s.length >= 3) : [];
const zeilen = csv(fs.readFileSync(datei, 'utf8')).slice(1);
const raus = [], gut = [], gesehen = new Set();
for (const [branche = '', frage = ''] of zeilen) {
  const t = frage.trim(); if (t.length < 15) continue;
  const k = t.toLowerCase();
  if (VERDAECHTIG.some(r => r.test(t)) || sperr.some(n => k.includes(n))) { raus.push(t); continue; }
  if (gesehen.has(k)) continue; gesehen.add(k);
  gut.push({ branche: branche.trim().slice(0, 80), frage: t.slice(0, 300) });
}
const kopf = '// Echte Audit-Nachfragen aus Holgers Beratungspraxis (anonymisiert, E-A39). Erzeugt mit scripts/nachfragen_import.mjs – nicht von Hand ändern.\n';
fs.writeFileSync('web/kunde/nachfragen.js', kopf + 'export const NACHFRAGEN = ' + JSON.stringify(gut, null, 0).replace(/\},\{/g, '},\n  {') + ';\n');
console.log(gut.length + ' Nachfragen übernommen, ' + raus.length + ' zusätzlich aussortiert (bitte ansehen):');
raus.slice(0, 50).forEach(t => console.log('  – ' + t));
