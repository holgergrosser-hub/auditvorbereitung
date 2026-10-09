/**
 * Formulare der Zertifizierer lesen (ohne KI): Word-Dateien (.docx) sind ZIP-Archive mit word/document.xml.
 * Diese Datei bekommt den XML-Text und liefert Tabellen als Zeilen/Zellen und daraus die Fachdaten.
 * Erkannt werden (Stand Okt. 2026):
 *   - TUEV NORD A00F201 "Auditplan" (Stammdaten, Auditteamleiter, Termin, Ablauf je Audittag)
 *   - TUEV NORD A00F221 "Pruefung Systemdokumente" ISO 9001 / ISO 14001 (Normpunkt, Frage, Bewertung, Bemerkung)
 * Unbekannte Formulare: tabellen() liefert trotzdem alle Tabellen; die KI uebernimmt dann (Edge Function "ki").
 * Laeuft im Browser (Backoffice) und in Node (Tests), keine Abhaengigkeiten.
 */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function entities(s) { return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]); }

/** Text eines XML-Ausschnitts: Absaetze als Zeilenumbruch, Tabs als Leerzeichen, Kontrollkaestchen als [x]/[ ] */
function text(xml) {
  return entities(xml
    .replace(/<w:checkBox>[\s\S]*?<w:default w:val="1"\/>[\s\S]*?<\/w:checkBox>/g, '[x] ')
    .replace(/<w:checkBox>[\s\S]*?<\/w:checkBox>/g, '[ ] ')
    .replace(/<w14:checked w14:val="1"\/>/g, '[x] ')
    .replace(/<w:tab\/>/g, ' ').replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, '\u0000$1\u0001')
    .replace(/<[^>]+>/g, '')
    .replace(/[^\u0000\u0001\n]*?\u0000([^\u0001]*)\u0001/g, '$1'))
    .replace(/[\u0000\u0001]/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** Oberste Elemente <tag> … </tag> finden, auch wenn sie verschachtelt sind (Tabelle in Tabelle) */
function bloecke(xml, tag) {
  const out = []; const auf = new RegExp('<' + tag + '[ >]', 'g'); const zu = '</' + tag + '>';
  let i = 0;
  while (true) {
    auf.lastIndex = i; const m = auf.exec(xml); if (!m) break;
    let tiefe = 1, j = m.index + 1;
    while (tiefe > 0) {
      auf.lastIndex = j; const n = auf.exec(xml); const k = xml.indexOf(zu, j);
      if (k < 0) return out;
      if (n && n.index < k) { tiefe++; j = n.index + 1; } else { tiefe--; j = k + zu.length; }
    }
    out.push(xml.slice(m.index, j)); i = j;
  }
  return out;
}

/** Alle Tabellen: [[zelle, zelle, …], …] je Tabelle. Zusammengefasste Zellen (gridSpan) zaehlen einmal. */
function tabellen(documentXml) {
  const body = (documentXml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, documentXml])[1];
  return bloecke(body, 'w:tbl').map(t => bloecke(t, 'w:tr').map(tr => bloecke(tr, 'w:tc').map(tc => {
    const innen = bloecke(tc, 'w:tbl'); let x = tc; innen.forEach(b => { x = x.replace(b, ''); }); // verschachtelte Tabellen nicht doppelt
    return text(x);
  })));
}

const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const ohneFussnote = (s) => tidy(s).replace(/(\d)\)$/, '$1').replace(/\s*[12]\)$/, '');

/* ---------------------------------------------------------------- Auditplan A00F201 */
function istAuditplan(tabs) { return tabs.some(t => t.some(r => /^Nr\.?$/.test(tidy(r[0])) && r.some(c => /^Uhrzeit/.test(tidy(c))))); }

function auditplan(documentXml) {
  const tabs = tabellen(documentXml);
  const kv = {}; // Stammdaten: erste Zelle = Feld, naechste nicht leere = Wert
  tabs.forEach(t => t.forEach(r => { if (r.length >= 2) { const k = tidy(r[0]); const v = r.slice(1).map(tidy).find(Boolean) || ''; if (k && !(k in kv)) kv[k] = v; } }));
  const find = (re) => { const k = Object.keys(kv).find(x => re.test(x)); return k ? kv[k] : ''; };
  const punkte = []; let tag = '';
  tabs.forEach(t => {
    let kopf = -1; let spalten = null;
    t.forEach((r, i) => {
      const z = r.map(tidy);
      if (z.length === 1 && /Audittag/.test(z[0])) { tag = z[0]; return; }
      if (/^Nr\.?$/.test(z[0]) && z.some(c => /^Uhrzeit/.test(c))) {
        kopf = i; spalten = {
          nr: 0, zeit: z.findIndex(c => /^Uhrzeit/.test(c)), ort: z.findIndex(c => /Standort|Organisationseinheit/.test(c)),
          prozess: z.findIndex(c => /Prozesse|Schwerpunkte/.test(c)), auditor: z.findIndex(c => /^Auditor/.test(c)),
          partner: z.findIndex(c => /Gesprächspartner/.test(c)), norm: z.findIndex(c => /Normforderungen|Abschn/.test(c))
        };
        return;
      }
      if (kopf < 0 || !spalten || !/^\d+\.?$/.test(z[0])) return;
      const g = (k) => spalten[k] >= 0 ? (z[spalten[k]] || '') : '';
      // Spalte "Standort / Organisationseinheit" traegt bei TUEV NORD meist den Programmpunkt, "Prozesse" ist optional
      const thema = [g('ort'), g('prozess')].filter(Boolean).join(' – ');
      punkte.push({ nr: z[0].replace(/\.$/, ''), tag, zeit: g('zeit').replace(/\s*-\s*/, '–').replace(';', ':').replace(/\s+/g, ''), thema: ohneFussnote(thema), auditor: g('auditor'), gespraechspartner: ohneFussnote(g('partner')).replace(/-\s+/g, ''), normkapitel: g('norm') });
    });
  });
  const termin = (find(/^Termin Stufe 1/) || '').split(/\s+-\s+/)[0];
  const termin2 = (find(/^Termin Stufe 2/) || '').split(/\s+-\s+/)[0];
  return {
    formular: 'A00F201 Auditplan', zertifizierer: /T[ÜU]V NORD/i.test(documentXml) || /tuev-nord/i.test(documentXml) ? 'TÜV NORD CERT' : '',
    firma: find(/^Name der Organisation/), strasse: find(/^Straße/), ort: find(/^PLZ/), ansprechpartner: find(/^Ansprechpartner/), email: find(/^E-Mail$/), telefon: find(/^Telefon/),
    auditor: find(/^Auditteamleiter$/), auditor_email: find(/^E-Mail Auditteamleiter/), vertrag: find(/^Vertragsnummer/),
    stufe: termin2 && !termin ? 2 : (punkte.some(p => /Stufe 2/i.test(p.thema) && !/Planung/i.test(p.thema)) ? 2 : 1),
    datum: termin || termin2 || '', erstellt: find(/^Datum:?$/), punkte
  };
}

/* ---------------------------------------------------------------- Pruefung Systemdokumente A00F221 */
function istPruefliste(xml) { return /Prüfung der Systemdokumentation/.test(text(xml.slice(0, 200000))); }

function pruefliste(documentXml) {
  const tabs = tabellen(documentXml);
  const alles = tabs.flat();
  const titel = (alles.find(r => /Prüfung der Systemdokumentation/.test(r.join(' '))) || []).join(' ');
  const norm = (titel.match(/ISO\s*(\d{4,5})/) || [])[1] || '';
  const punkte = []; let akt = null;
  const kopfRe = /^(\d{1,2}(?:\.\d{1,2}){0,2})\s+(\S.*)$/;
  alles.forEach(r => {
    const z = r.map(c => String(c || '').trim()).filter((c, i, a) => i === 0 || c !== a[i - 1]); // doppelte (zusammengefasste) Zellen weg
    const erste = tidy(z[0]);
    if (!erste || /^(Kapitel\/Forderungen|B\*?|Prüfung der)/.test(erste)) return;
    const k = erste.match(kopfRe);
    if (k && z.slice(1).every(c => !tidy(c) || /^[\s]*$/.test(c)) && !/\?$/.test(erste)) { akt = { normpunkt: k[1], titel: tidy(k[2]) }; return; }
    if (/^Managementsystemdokumentation/.test(erste)) { punkte.push({ normpunkt: '0', titel: 'Systemdokumentation', frage: 'Managementsystemdokumentation (Ausgabe bzw. Stand)', bewertung: '', bemerkung: tidy(z[1] || '') }); return; }
    if (!akt || !/\?/.test(erste)) return;
    const b = tidy(z[1] || ''); const bem = tidy(z.slice(2).join(' '));
    punkte.push({ normpunkt: akt.normpunkt, titel: akt.titel, frage: erste.replace(/\n+/g, ' ').replace(/\s+/g, ' '), bewertung: /^(1|2|3|-|OK|VP|NK|NZ)$/i.test(b) ? b.toUpperCase() : '', bemerkung: /^(1|2|3|-|OK|VP|NK|NZ)$/i.test(b) ? bem : tidy(b + ' ' + bem) });
  });
  return { formular: 'A00F221 Prüfung Systemdokumente', norm: norm ? 'ISO ' + norm : '', punkte };
}

/** Datei erkennen und lesen. Rueckgabe { art: 'auditplan'|'pruefliste'|'unbekannt', daten } */
function lies(documentXml) {
  if (istPruefliste(documentXml)) return { art: 'pruefliste', daten: pruefliste(documentXml) };
  const tabs = tabellen(documentXml);
  if (istAuditplan(tabs)) return { art: 'auditplan', daten: auditplan(documentXml) };
  return { art: 'unbekannt', daten: { tabellen: tabs } };
}

const Formulare = { text, tabellen, auditplan, pruefliste, lies };
export default Formulare;
export { text, tabellen, auditplan, pruefliste, lies };
