/**
 * Fachlogik ohne Datenbank und ohne Netz: von den Edge Functions (Deno) und den Tests (Node) gemeinsam genutzt.
 * - Bereiche vergleichen und Mitarbeiter den Planpunkten zuordnen
 * - passende Kundendokumente zu einer Frage finden
 * - Fragen ohne KI (Vorlage je Normkapitel), wenn kein KI-Schluessel gesetzt ist
 * - Anweisungen an die KI und das Lesen ihrer JSON-Antwort
 */

/* ---------------------------------------------------------------- Bereiche */
// Gleiche Bereiche heissen in Auditplaenen und Firmen oft verschieden
const BEREICH_GRUPPEN = [
  ['geschaeftsfuehrung', 'gf', 'geschaftsfuhrung', 'leitung', 'management', 'oberste leitung', 'inhaber', 'unternehmensleitung', 'fuhrung'],
  ['qm', 'qualitat', 'qualitatsmanagement', 'qmb', 'qualitatssicherung', 'qs', 'managementsystem'],
  ['einkauf', 'beschaffung', 'lieferanten', 'disposition'],
  ['vertrieb', 'verkauf', 'kundenbetreuung', 'angebot', 'auftragsabwicklung', 'innendienst', 'akquise'],
  ['produktion', 'fertigung', 'herstellung', 'werkstatt', 'montage', 'leistungserbringung', 'dienstleistung', 'baustelle', 'service'],
  ['lager', 'logistik', 'versand', 'wareneingang', 'warenausgang'],
  ['personal', 'hr', 'schulung', 'kompetenz', 'mitarbeiter'],
  ['entwicklung', 'konstruktion', 'planung', 'technik', 'engineering'],
  ['it', 'edv', 'informationstechnik', 'datenschutz'],
  ['instandhaltung', 'wartung', 'infrastruktur', 'prufmittel', 'messmittel']
];
const ALLE = /^(alle|eroffnung|eroffnungsgesprach|abschluss|abschlussgesprach|einfuhrung|kick ?off|auditteam)/;

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function bereichGruppe(s) {
  const n = norm(s); if (!n) return -1;
  // laengster Treffer gewinnt: "Qualitaetsmanagement" ist QM, nicht "Management"; kurze Woerter (gf, qm, it) nur als ganzes Wort
  let best = -1, len = 0;
  BEREICH_GRUPPEN.forEach((g, i) => g.forEach(w => {
    const hit = w.length <= 3 ? (' ' + n + ' ').includes(' ' + w + ' ') : n.includes(w);
    if (hit && w.length > len) { best = i; len = w.length; }
  }));
  return best;
}
function bereichPasst(a, b) {
  const na = norm(a), nb = norm(b); if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ga = bereichGruppe(a); return ga >= 0 && ga === bereichGruppe(b);
}

/**
 * Ergaenzung des Auditplans: je Planpunkt die Mitarbeiter, deren Bereich passt.
 * Eroeffnung/Abschluss/"alle": Geschaeftsfuehrung und QM. Ohne Treffer: Geschaeftsfuehrung (Auditor fragt dann dort).
 * Liefert neue Objekte, aendert nichts am Eingang.
 */
function mitarbeiterZuordnen(planpunkte, mitarbeiter) {
  const gf = mitarbeiter.filter(m => bereichGruppe(m.bereich) === 0), qm = mitarbeiter.filter(m => bereichGruppe(m.bereich) === 1);
  return planpunkte.map(p => {
    const text = [p.bereich, p.thema].filter(Boolean).join(' ');
    let treffer;
    if (ALLE.test(norm(p.thema)) || ALLE.test(norm(p.bereich))) treffer = gf.concat(qm);
    else {
      treffer = mitarbeiter.filter(m => (p.bereich && bereichPasst(p.bereich, m.bereich)));
      if (!treffer.length) treffer = mitarbeiter.filter(m => bereichPasst(text, m.bereich));
      if (!treffer.length) treffer = gf.length ? gf : qm;
    }
    const ids = [...new Set(treffer.map(m => m.id))];
    return Object.assign({}, p, { mitarbeiter_ids: ids, zuordnung: ids.length ? (treffer === gf || treffer === qm ? 'vorschlag' : 'bereich') : 'offen' });
  });
}

/* ---------------------------------------------------------------- Normkapitel */
function kapitelListe(s) { // "4.1, 4.2; 7.5.3" -> ['4.1','4.2','7.5.3'] (Komma als Trenner, nie als Dezimalzeichen)
  return String(s || '').split(/[;,/\s]+/).map(x => x.trim().replace(/^kap(itel)?\.?/i, '')).filter(x => /^\d+(\.\d+)*$/.test(x));
}
function kapitelPasst(a, b) { // 7.5 passt zu 7.5.3 und umgekehrt
  return kapitelListe(a).some(x => kapitelListe(b).some(y => x === y || x.startsWith(y + '.') || y.startsWith(x + '.')));
}

/** Dokumente, die bei einer Frage helfen: zuerst die von der KI genannten, sonst gleiche Kapitel, sonst gleicher Bereich. Hoechstens 4. */
function dokumenteFuerFrage(frage, dokumente) {
  const byId = new Map(dokumente.map(d => [d.id, d]));
  const genannt = (frage.dokument_ids || []).map(id => byId.get(id)).filter(Boolean);
  if (genannt.length) return genannt.slice(0, 4);
  const kap = dokumente.filter(d => frage.normkapitel && kapitelPasst(frage.normkapitel, d.normkapitel));
  if (kap.length) return kap.slice(0, 4);
  return dokumente.filter(d => frage.bereich && d.bereich && bereichPasst(frage.bereich, d.bereich)).slice(0, 4);
}

/* ---------------------------------------------------------------- Fragen ohne KI */
// Typische Auditorfragen je Hauptkapitel ISO 9001:2015 (Stufe 1 = Dokumente, Stufe 2 = gelebte Praxis)
const VORLAGE = {
  '4': ['Welche internen und externen Themen beeinflussen Ihr Unternehmen, und wo haben Sie das festgehalten?', 'Wer sind Ihre interessierten Parteien und was erwarten sie?', 'Wie lautet Ihr Geltungsbereich, und gibt es Ausschlüsse?'],
  '5': ['Wie zeigt die Geschäftsführung, dass sie hinter dem Managementsystem steht?', 'Wo ist Ihre Qualitätspolitik veröffentlicht und wie kennen die Mitarbeiter sie?', 'Wer ist wofür verantwortlich, und wo steht das?'],
  '6': ['Welche Risiken und Chancen haben Sie bewertet, und welche Maßnahmen folgen daraus?', 'Welche Qualitätsziele gelten dieses Jahr, und wie messen Sie sie?', 'Wie planen Sie Änderungen am Managementsystem?'],
  '7': ['Wie stellen Sie sicher, dass Ihre Mitarbeiter die nötige Kompetenz haben? Zeigen Sie einen Schulungsnachweis.', 'Wie werden Prüf- und Messmittel überwacht?', 'Wie lenken Sie Dokumente: Wo finde ich die aktuelle Version, wer gibt frei?'],
  '8': ['Wie läuft ein Auftrag von der Anfrage bis zur Auslieferung? Zeigen Sie ein aktuelles Beispiel.', 'Wie bewerten und überwachen Sie Ihre Lieferanten?', 'Was passiert mit einem fehlerhaften Produkt oder einer Reklamation?'],
  '9': ['Wie messen Sie die Kundenzufriedenheit, und was war das letzte Ergebnis?', 'Wann war das letzte interne Audit, und was kam heraus?', 'Wo ist die letzte Managementbewertung, und welche Beschlüsse enthält sie?'],
  '10': ['Wie gehen Sie mit Fehlern und Abweichungen um? Zeigen Sie eine Korrekturmaßnahme.', 'Welche Verbesserungen haben Sie im letzten Jahr umgesetzt?']
};
const HILFE = {
  '4': 'Steht meist im Handbuch (Kontext, interessierte Parteien, Geltungsbereich) oder in einer eigenen Kontextanalyse.',
  '5': 'Qualitätspolitik, Organigramm und Verantwortungsmatrix; oft im Handbuch, Kapitel 5.',
  '6': 'Risiken-und-Chancen-Liste und Zielübersicht des laufenden Jahres.',
  '7': 'Schulungsplan/-nachweise, Prüfmittelliste, Dokumentenübersicht.',
  '8': 'Prozessbeschreibungen (Vertrieb, Einkauf, Produktion), ein aktueller Auftrag, Lieferantenbewertung, Reklamationsliste.',
  '9': 'Auswertung Kundenzufriedenheit, Auditbericht des internen Audits, Managementbewertung.',
  '10': 'Maßnahmenplan bzw. Liste der Korrekturmaßnahmen und Verbesserungen.'
};
function fragenOhneKi(planpunkte, stufe) {
  const out = [];
  planpunkte.forEach(p => {
    const haupt = [...new Set(kapitelListe(p.normkapitel).map(k => k.split('.')[0]))];
    const quelle = haupt.length ? haupt : ['8'];
    let n = 0;
    quelle.forEach(h => (VORLAGE[h] || []).forEach(f => {
      if (n >= 3) return; n++;
      out.push({ planpunkt_id: p.id, bereich: p.bereich || '', normkapitel: p.normkapitel || h, frage: stufe === 1 ? f.replace(/ Zeigen Sie[^?.]*[.?]?$/, '') : f, hilfe: HILFE[h] || '', dokument_ids: [] });
    }));
  });
  return out.map((f, i) => Object.assign(f, { reihenfolge: i + 1 }));
}

/* ---------------------------------------------------------------- KI */
const KI_PLAN = 'Du liest Auditpläne von Zertifizierungsstellen (ISO 9001, 14001, 45001). Antworte ausschließlich mit JSON, ohne Kommentar.';
function kiAnweisungPlan(stufe) {
  return 'Das angehängte Dokument ist der Auditplan für ein Audit der Stufe ' + stufe + '. Gib jede Zeile des Ablaufs als Objekt zurück: '
    + '{"punkte":[{"zeit":"09:00-09:30","thema":"Eröffnungsgespräch","normkapitel":"4.1, 4.2","bereich":"Geschäftsführung"}]}. '
    + 'Normkapitel als Text mit Komma getrennt, leer wenn keins angegeben. "bereich" = Abteilung oder Funktion der Firma, die bei diesem Punkt dabei sein muss, sonst leer. '
    + 'Pausen und Auditorbesprechungen ohne Firma weglassen. Datum, Auditor und Firma ebenfalls zurückgeben: {"datum":"JJJJ-MM-TT","auditor":"","firma":"","punkte":[...]}.';
}
const KI_FRAGEN = 'Du bist ein erfahrener ISO-9001-Zertifizierungsauditor und bereitest Mitarbeiter einer kleinen Firma auf ihr Audit vor. '
  + 'Du stellst Fragen, wie sie im echten Audit kommen, kurz und konkret, in der Sie-Form. Antworte ausschließlich mit JSON.';
/** Schwierigkeitsstufen des Uebungsauditors (Holger, 09.10.): bestimmt Ton, Nachfragen und was als Antwort durchgeht */
const AUDITOR_LEVEL = {
  einfach: { name: 'Freundlicher Auditor', text: 'Du bist freundlich und erklärend. Offene Fragen, keine Fangfragen. Eine allgemeine Antwort mit Hinweis auf das Dokument genügt.' },
  mittel: { name: 'Sachlicher Auditor', text: 'Du bist sachlich wie ein typischer Zertifizierungsauditor. Du fragst nach einem konkreten Beispiel und nach dem Nachweis (Dokument, Datum, Unterschrift).' },
  streng: { name: 'Strenger Auditor', text: 'Du bist streng und bohrst nach: Stichprobe statt Beispiel nach Wahl, Widersprüche zwischen Dokumenten ansprechen (Stand, Firmenname, Geltungsbereich), Wirksamkeit und Kennzahlen hinterfragen. Ausweichende Antworten nicht akzeptieren.' }
};
function kiAnweisungFragen(stufe, punkte, dokumente, level) {
  const lv = AUDITOR_LEVEL[level] || AUDITOR_LEVEL.mittel;
  const docs = dokumente.map((d, i) => ({ nr: i + 1, titel: d.titel, normkapitel: d.normkapitel || '', bereich: d.bereich || '' }));
  return lv.text + '\nAudit Stufe ' + stufe + (stufe === 1 ? ' (Dokumentenprüfung: Ist alles beschrieben?)' : ' (vor Ort: Wird es gelebt? Nach Beispielen und Nachweisen fragen)') + '.\n'
    + 'Planpunkte:\n' + JSON.stringify(punkte.map((p, i) => ({ nr: i + 1, zeit: p.zeit, thema: p.thema, normkapitel: p.normkapitel, bereich: p.bereich })))
    + '\nVorhandene Dokumente des Kunden:\n' + JSON.stringify(docs)
    + '\nErzeuge je Planpunkt 2 bis 4 Fragen. Zu jeder Frage: "hilfe" = ein Satz, wo die Antwort typischerweise steht oder was man zeigen kann (ohne die Antwort vorzusagen), '
    + '"dokumente" = Nummern der passenden vorhandenen Dokumente (leer, wenn keins passt). '
    + 'Format: {"fragen":[{"punkt":1,"frage":"…","hilfe":"…","dokumente":[2,5]}]}';
}
/** JSON aus einer KI-Antwort holen (auch wenn sie in ```json … ``` steht). Wirft bei Unsinn. */
function kiJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('KI-Antwort ohne JSON');
  return JSON.parse(t.slice(a, b + 1));
}
/** KI-Fragen auf Datenbankzeilen abbilden: Punkt-Nummer -> planpunkt_id, Dokument-Nummern -> dokument_ids */
function fragenAusKi(json, punkte, dokumente) {
  return (json.fragen || []).filter(f => f && f.frage).map((f, i) => {
    const p = punkte[(Number(f.punkt) || 1) - 1] || punkte[0] || {};
    const ids = (f.dokumente || []).map(n => (dokumente[Number(n) - 1] || {}).id).filter(Boolean);
    return { planpunkt_id: p.id || null, bereich: p.bereich || '', normkapitel: p.normkapitel || '', frage: String(f.frage).slice(0, 600), hilfe: String(f.hilfe || '').slice(0, 600), dokument_ids: [...new Set(ids)], reihenfolge: i + 1 };
  });
}

/** Fragen fuer einen Mitarbeiter: die seines Bereichs plus Punkte, denen er zugeordnet ist; "alle" = alles */
function fragenFuerBereich(fragen, planpunkte, bereich, mitarbeiterId) {
  if (!bereich || norm(bereich) === 'alle') return fragen.slice();
  const meine = new Set(planpunkte.filter(p => (p.mitarbeiter_ids || []).indexOf(mitarbeiterId) >= 0).map(p => p.id));
  // Fahrplan-Punkte ohne Planpunkt und ohne Bereich (Stufe 1, Pruefliste) gehoeren allen
  return fragen.filter(f => meine.has(f.planpunkt_id) || (f.bereich && bereichPasst(f.bereich, bereich)) || (!f.planpunkt_id && !f.bereich));
}

/* ================================================================ Stufe 1: Fahrplan aus der Pruefliste (Praxis P01–P16) */

/**
 * Pruefliste(n) des Zertifizierers -> ein Fahrplan. Gleiche Frage in ISO 9001 und 14001 erscheint nur einmal ("gilt fuer beide", P09).
 * Eingang: pruefpunkte [{id, norm, normpunkt, titel, frage, bemerkung|fundstelle, status}], sortiert wie im Formular.
 * Ausgang: [{schluessel, normpunkt, titel, frage, fundstelle, normen:[], pruefpunkt_ids:[], status}]
 */
function fahrplanAusPrueflisten(pruefpunkte) {
  const out = []; const index = new Map();
  const schl = (p) => norm(p.normpunkt).split(' ')[0].split('.').slice(0, 2).join('.') + '|' + norm(p.frage).replace(/\b(qms|ums|qualitats|umwelt|managementsystems?)\w*/g, '').replace(/\s+/g, ' ').slice(0, 60);
  pruefpunkte.forEach(p => {
    if (!p || !p.frage || p.status === 'NZ' || /^NZ$/i.test(p.bewertung || '')) return;
    const k = p.normpunkt === '0' ? '0|system' : schl(p);
    const fund = String(p.fundstelle || p.bemerkung || '').trim();
    const da = index.get(k) || out.find(x => x.normpunkt.split('.')[0] === String(p.normpunkt).split('.')[0] && fund && x.fundstelle === fund);
    if (da) {
      if (p.norm && da.normen.indexOf(p.norm) < 0) da.normen.push(p.norm);
      da.pruefpunkt_ids.push(p.id);
      // zweite Norm: Fundstelle nur anhaengen, wenn sie wirklich Neues nennt (weniger als die Haelfte gleiche Woerter)
      const alt = new Set(norm(da.fundstelle).split(' ')), w = norm(fund).split(' ').filter(x => x.length > 3);
      if (w.length && w.filter(x => alt.has(x)).length / w.length < 0.5) da.fundstelle += ' · ' + fund;
      return;
    }
    const neu = { schluessel: k, normpunkt: String(p.normpunkt), titel: p.titel || '', frage: String(p.frage).replace(/\s+/g, ' ').trim(), fundstelle: fund, normen: p.norm ? [p.norm] : [], pruefpunkt_ids: [p.id], status: p.status || '' };
    index.set(k, neu); out.push(neu);
  });
  return out;
}

/**
 * Fundstellen in Klarnamen (P02): "UPH S. 3" -> "Handbuch (UPH), Seite 3"; "Tab 7/8" -> "QM-Übersicht, Reiter „Risiken“ und „Chancen“".
 * dokumente: [{titel, kurzname, inhalt_kurz:{reiter:[…], tab_versatz}}]. tab_versatz: Reiter vor "Tab 1" (z. B. 1 fuer ein Uebersichtsblatt).
 * Ohne Reiterliste bleibt "Tab n" stehen, wird aber als "Reiter n" geschrieben.
 */
function reiterName(dok, n) {
  const ik = (dok && dok.inhalt_kurz) || {}; const r = ik.reiter || [];
  const versatz = ik.tab_versatz != null ? Number(ik.tab_versatz) : (r.length && /^(übersicht|uebersicht|inhalt|start|index|deckblatt)/i.test(r[0]) ? 1 : 0);
  const name = r[n - 1 + versatz];
  return name ? '„' + name + '“' : String(n);
}
function klarnamen(text, dokumente) {
  let t = String(text || '');
  const docs = dokumente || [];
  const tabDok = docs.find(d => d.inhalt_kurz && (d.inhalt_kurz.reiter || []).length) || null;
  const tabTitel = tabDok ? String(tabDok.titel).replace(/\s*\(.*$/, '').replace(/,.*$/, '') : '';
  const tabWort = norm(tabTitel).split(' ')[0] || '#';
  // Tab 7/8, Tab 4/5, Tab 11/12, Tab 18/19, Tab 1 -> Reiternamen; Dokumentname davor, wenn er nicht direkt davor steht
  t = t.replace(/(D-?\d+\s+)?\b(?:Tabs?|Reiter)\s+(\d{1,2})(?:\s*(?:\/|und|–)\s*(\d{1,2}))?/g, (m, dnr, a, b, pos, ganz) => {
    const teile = [reiterName(tabDok, Number(a))].concat(b ? [reiterName(tabDok, Number(b))] : []);
    const wort = 'Reiter ' + teile.join(' und ');
    const davor = norm(ganz.slice(Math.max(0, pos - 40), pos));
    return tabDok && !davor.includes(tabWort) ? tabTitel + ', ' + wort : (dnr || '') + wort;
  });
  // Abkuerzungen der Kundendokumente ausschreiben (einmal je Text): "UPH S. 3" -> "Handbuch (UPH), Seite 3"
  docs.filter(d => d.kurzname && !/^D-?\d/i.test(d.kurzname)).forEach(d => {
    const re = new RegExp('\\b' + d.kurzname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b(?!\\))');
    if (re.test(t) && t.indexOf(d.titel) < 0) t = t.replace(re, d.titel + ' (' + d.kurzname + ')');
  });
  return t.replace(/\bS\.\s*(\d)/g, 'Seite $1').replace(/\bKap\.\s*(\d)/g, 'Kapitel $1').replace(/\bMB\b/g, 'Managementbewertung');
}

/** Welche Kundendokumente nennt eine Fundstelle? (Kurzname, D-Nr. oder markante Titelwoerter) */
function dokumenteAusFundstelle(text, dokumente) {
  const n = ' ' + norm(text) + ' ';
  return (dokumente || []).filter(d => {
    if (d.kurzname && n.includes(' ' + norm(d.kurzname) + ' ')) return true;
    if (d.d_nr && n.includes(' ' + norm(d.d_nr) + ' ')) return true;
    if (d.inhalt_kurz && (d.inhalt_kurz.reiter || []).length && /\b(tabs?|reiter) \d/.test(n)) return true;
    const w = norm(d.titel).split(' ').filter(x => x.length >= 7 && !/^(unternehmens|dokument|uebersicht|ubersicht)$/.test(x));
    return w.length > 0 && w.some(x => n.includes(x));
  }).map(d => d.id);
}

/** Fahrplan -> Zeilen fuer die Tabelle "fragen" (art 'zeig_mal'): Der Kunde soll das Dokument finden und zeigen. */
function zeigMalFragen(fahrplan, dokumente) {
  return fahrplan.map((f, i) => ({
    art: 'zeig_mal', planpunkt_id: null, pruefpunkt_id: f.pruefpunkt_ids[0] || null, bereich: '', normen: f.normen,
    frage: f.normpunkt === '0' ? 'Zeigen Sie mir Ihre Managementsystem-Dokumentation: Welche Dokumente gibt es und welchen Stand haben sie?' : f.frage,
    hilfe: klarnamen(f.fundstelle, dokumente), dokument_ids: dokumenteAusFundstelle(f.fundstelle, dokumente), normkapitel: f.normpunkt === '0' ? '' : f.normpunkt, reihenfolge: i + 1
  }));
}

/** Ampel aus den Antworten zu einer Frage (letzte zaehlt): gruen sicher ohne Hilfe, gelb mit Hilfe/unsicher/zu langsam, rot weiss nicht */
function ampel(antworten) {
  const a = (antworten || []).filter(x => !x.ist_beispiel).slice().sort((x, y) => String(x.beantwortet_am || '').localeCompare(String(y.beantwortet_am || ''))).pop();
  if (!a) return 'offen';
  if (a.sicherheit === 'weiss_nicht') return 'rot';
  if (a.sicherheit === 'unsicher' || a.hilfe_genutzt) return 'gelb';
  return 'gruen';
}
/** Zeig-mal: Ergebnis aus Zeit und Hilfe. Unter 60 s ohne Hilfe = sicher. */
const ZEIG_MAL_SEKUNDEN = 60;
function zeigMalErgebnis(sekunden, hilfe, gefunden) {
  if (!gefunden) return 'weiss_nicht';
  return !hilfe && sekunden <= ZEIG_MAL_SEKUNDEN ? 'sicher' : 'unsicher';
}
/** Matrix fuer Holger (Idee 1): je Frage und Mitarbeiter die Ampel, plus Summe je Mitarbeiter */
function ampelMatrix(fragen, antworten, mitarbeiter) {
  const zeilen = fragen.map(f => {
    const je = {}; (mitarbeiter || []).forEach(m => { je[m.id] = ampel(antworten.filter(a => a.frage_id === f.id && a.mitarbeiter_id === m.id)); });
    return { frage_id: f.id, normkapitel: f.normkapitel || '', frage: f.frage, je };
  });
  const summe = {}; (mitarbeiter || []).forEach(m => { const z = { gruen: 0, gelb: 0, rot: 0, offen: 0 }; zeilen.forEach(r => z[r.je[m.id]]++); summe[m.id] = z; });
  return { zeilen, summe };
}

/** Tage bis zum Audit und Ruhemodus (P14): ab x Tagen vorher nur noch Spickzettel und Ablauf */
function tageBis(datum, heute) {
  if (!datum) return null;
  const d = new Date(String(datum).slice(0, 10) + 'T00:00:00Z'), h = new Date(String(heute || new Date().toISOString()).slice(0, 10) + 'T00:00:00Z');
  return Math.round((d - h) / 86400000);
}
function imRuhemodus(datum, tage, heute) { const t = tageBis(datum, heute); return t !== null && t >= 0 && t <= (tage == null ? 3 : tage); }

/** Faktencheck (P05): Standardthemen, die in Praxisgespraechen falsch in den Dokumenten standen */
const FAKTEN_STANDARD = [
  { thema: 'Geschäftsführung', frage: 'Wer ist im Handelsregister als Geschäftsführer eingetragen?' },
  { thema: 'Gesellschafter / weitere Rollen', frage: 'Wer ist Gesellschafter, wer ist QM- bzw. Umweltbeauftragter?' },
  { thema: 'Firmenname', frage: 'Stimmt die Schreibweise des Firmennamens genau mit dem Handelsregister überein?' },
  { thema: 'Mitarbeiterzahl', frage: 'Wie viele Personen arbeiten aktuell im Unternehmen (inkl. Geschäftsführung)?' },
  { thema: 'Zertifizierer', frage: 'Welcher Zertifizierer macht das Audit?' },
  { thema: 'Leistungen im Geltungsbereich', frage: 'Erbringen Sie alle genannten Leistungen auch aktuell? Was haben Sie zuletzt wann gemacht?' },
  { thema: 'Standorte und Lager', frage: 'Welche Standorte, Lager, Garagen gibt es?' },
  { thema: 'Geräte, Fahrzeuge, Leitern', frage: 'Welche prüfpflichtigen Geräte gibt es wirklich (Fahrzeuge, Leitern, Feuerlöscher, elektrische Geräte)? Was ist geliehen?' },
  { thema: 'Arbeitssicherheit / Betriebsarzt', frage: 'Wer betreut Sie sicherheitstechnisch und betriebsärztlich (z. B. Berufsgenossenschaft)?' },
  { thema: 'Gefahrstoffe / Reinigungsmittel', frage: 'Welche Gefahrstoffe bzw. Reinigungsmittel verwenden Sie aktuell?' }
];
/** Platzhalter und Widersprueche in Dokumenttexten finden (Idee 5, ohne KI): liefert To-do-Vorschlaege mit HA/OP */
const PLATZHALTER = /(bitte vom kunden ergänzen|bitte ergänzen|noch zu klären|zu klären|platzhalter|\bentwurf\b|\bxx+\b|\?\?\?|\[[^\]]{0,30}\]|tbd|in auswahl)/i;
function widerspruchsCheck(texte, stamm) {
  // texte: [{d_nr, titel, text, stand}], stamm: {firma, zertifizierer, geltungsbereich}
  const todo = []; const s = stamm || {};
  (texte || []).forEach(d => {
    String(d.text || '').split(/\n+/).forEach(z => {
      const m = z.match(PLATZHALTER);
      if (m) todo.push({ prio: /entwurf/i.test(m[0]) ? 'OP' : 'HA', todo: d.titel + ': „' + z.trim().slice(0, 140) + '“ klären bzw. ausfüllen', normbezug: '7.5', dokument: d.d_nr || '' });
    });
    if (s.zertifizierer) {
      const andere = ['TÜV SÜD', 'TÜV NORD', 'TÜV Rheinland', 'DEKRA', 'DQS', 'SGS', 'DNV', 'Bureau Veritas', 'OnlineCert'].filter(z => norm(z) !== norm(s.zertifizierer) && new RegExp(z.replace(/ /g, '\\s*'), 'i').test(d.text || ''));
      andere.forEach(z => todo.push({ prio: 'HA', todo: d.titel + ': nennt „' + z + '“, Zertifizierer ist ' + s.zertifizierer, normbezug: '7.5', dokument: d.d_nr || '' }));
    }
    if (s.firma) {
      const kern = norm(s.firma).replace(/\b(gmbh|ug|kg|ag|e k|co)\b/g, '').trim();
      const fremd = String(d.text || '').match(new RegExp(kern.split(' ')[0] + '[^\\n,;]{0,60}(GmbH|UG|KG|AG)', 'i'));
      if (fremd && norm(fremd[0]).replace(/\s+/g, '') !== norm(s.firma).replace(/\s+/g, '')) todo.push({ prio: 'OP', todo: d.titel + ': Firmenname „' + fremd[0].trim() + '“ weicht ab von „' + s.firma + '“', normbezug: '4.3', dokument: d.d_nr || '' });
    }
  });
  const staende = [...new Set((texte || []).map(d => d.stand).filter(Boolean))];
  if (staende.length > 1) todo.push({ prio: 'OP', todo: 'Unterschiedliche Stände: ' + staende.join(', ') + ' – vor dem Audit vereinheitlichen oder bewusst so lassen', normbezug: '7.5', dokument: '' });
  // doppelte entfernen
  const seen = new Set(); return todo.filter(x => !seen.has(x.todo) && seen.add(x.todo));
}

/** "So laeuft Ihr Audit" (P08) – Holgers Regeln aus den Vorbereitungsgespraechen */
const ABLAUF = {
  1: {
    titel: 'So läuft Stufe 1',
    kurz: 'Der Auditor prüft, ob die Dokumente da sind. Er blättert, fragt nach und hakt seine Liste ab. Ins Detail geht es erst in Stufe 2.',
    regeln: [
      'Sie müssen nichts auswendig lernen. Sie müssen nur das richtige Dokument finden und zeigen.',
      'Zeigen statt erzählen: Der Auditor fragt, Sie öffnen das Dokument. Sie müssen nicht von sich aus Vorträge halten.',
      'Der Auditor hilft beim Finden. Niemand stoppt die Zeit.',
      'Die Auditoren halten sich an die Uhrzeiten im Plan und nutzen die Zeit voll aus.',
      'Kommen zwei Auditoren (z. B. ISO 9001 und 14001), fragt meist einer und der andere hakt ab. Gleiche Frage = gleiches Dokument.',
      'Erfinden Sie nichts. Sagen Sie offen, was es nicht gibt (z. B. „Wir haben keine Mitarbeiter“).',
      'Sagen Sie nicht, dass alles perfekt ist. Besser: „Wir haben das System aufgebaut und arbeiten uns ein.“',
      'Diese Dokumente brauchen Sie den ganzen Tag: Handbuch, QM-Übersicht, Managementbewertung, Auditbericht. Alles andere öffnen Sie, wenn das Thema kommt.',
      'Achten Sie darauf, wie der Auditor „tickt“ – davon hängt die Vorbereitung auf Stufe 2 ab.'
    ]
  },
  2: {
    titel: 'So läuft Stufe 2',
    kurz: 'Der Auditor will sehen, dass das Beschriebene gelebt wird – an echten, abgeschlossenen Beispielen.',
    regeln: [
      'Legen Sie je ein abgeschlossenes Beispiel bereit: Angebot, Auftrag, Rechnung, Reklamation, Lieferantenbewertung, Schulungsnachweis.',
      'Erzählen Sie Ihre eigenen Beispiele (z. B. wie Sie auf Hitze oder neue Reinigungsmittel reagiert haben). Das überzeugt mehr als Normtext.',
      'Prüfnachweise (Leitern, Feuerlöscher, elektrische Geräte) werden jetzt angeschaut.',
      'Erfinden Sie nichts. Wenn Sie etwas nicht wissen: „Das schaue ich nach“ und im Dokument nachsehen.',
      'Der Auditor erklärt Feststellungen am Ende. Schreiben Sie mit, wir besprechen sie danach gemeinsam.'
    ]
  },
  ruhe: 'Jetzt nichts mehr ändern, nichts mehr ausdrucken und nicht im Internet lesen – das bringt nur Fragezeichen. Sie haben die Antworten gefunden. Ruhen Sie sich aus und gehen Sie entspannt ins Audit.'
};

const Logik = { norm, bereichGruppe, bereichPasst, mitarbeiterZuordnen, kapitelListe, kapitelPasst, dokumenteFuerFrage, fragenOhneKi,
  KI_PLAN, kiAnweisungPlan, KI_FRAGEN, AUDITOR_LEVEL, kiAnweisungFragen, kiJson, fragenAusKi, fragenFuerBereich,
  fahrplanAusPrueflisten, reiterName, klarnamen, dokumenteAusFundstelle, zeigMalFragen, ampel, ZEIG_MAL_SEKUNDEN, zeigMalErgebnis, ampelMatrix,
  tageBis, imRuhemodus, FAKTEN_STANDARD, PLATZHALTER, widerspruchsCheck, ABLAUF };
export default Logik;
export { norm, bereichGruppe, bereichPasst, mitarbeiterZuordnen, kapitelListe, kapitelPasst, dokumenteFuerFrage, fragenOhneKi,
  KI_PLAN, kiAnweisungPlan, KI_FRAGEN, AUDITOR_LEVEL, kiAnweisungFragen, kiJson, fragenAusKi, fragenFuerBereich,
  fahrplanAusPrueflisten, reiterName, klarnamen, dokumenteAusFundstelle, zeigMalFragen, ampel, ZEIG_MAL_SEKUNDEN, zeigMalErgebnis, ampelMatrix,
  tageBis, imRuhemodus, FAKTEN_STANDARD, PLATZHALTER, widerspruchsCheck, ABLAUF };
