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
const PLATZHALTER = /([Bb]itte (vom Kunden )?ergänzen|[Zz]u klären|[Pp]latzhalter|\bENTWURF\b|\b[Xx]{2,}\b|\?\?\?|\[(?:[Bb]itte|offen|tbd|TBD|xx|XX|Datum|Name|\.\.\.|…)[^\]]{0,40}\]|\b(?:tbd|TBD)\b|in [Aa]uswahl)/;
function widerspruchsCheck(texte, stamm) {
  // texte: [{d_nr, titel, text, stand}], stamm: {firma, zertifizierer, geltungsbereich}
  const todo = []; const s = stamm || {};
  (texte || []).forEach(d => {
    String(d.text || '').split(/\n+/).forEach(z => {
      const m = z.match(PLATZHALTER);
      if (m) todo.push({ prio: /ENTWURF/.test(m[0]) ? 'OP' : 'HA', todo: d.titel + ': „' + z.trim().slice(0, 140) + '“ klären bzw. ausfüllen', normbezug: '7.5', dokument: d.d_nr || '' });
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

/* ================================================================ "Wo steht das?" – Auszuege aus den eigenen Dokumenten (ohne KI) */

// sehr einfache deutsche Stammform: Kleinbuchstaben, Umlaute, typische Endungen weg
const STOPP = new Set('der die das und oder ein eine einer eines einem einen ist sind wird werden wurde wurden zu zur zum im in am an auf fur von mit fuer bei aus als wie was wo wer welche welcher welches sich sie ihr ihre ihren wir unser unsere nicht auch nach uber oder bzw dass des den dem es so liegt liegen vor diese dieser dieses durch inkl usw steht stehen finde finden suche suchen zeige zeigen gibt haben habt hat welchem welchen dokument dokumente unsere unserem seite seiten reiter tab tabs kapitel'.split(' '));
function stamm(w) { return w.length > 5 ? w.replace(/(ungen|ung|en|er|es|e|n|s)$/, '') : w; }
function woerter(t) { return norm(t).split(' ').filter(w => w.length > 2 && !STOPP.has(w) && !/^\d+$/.test(w)).map(stamm); }

/** Volltextsuche ueber Auszuege (BM25-artig). Rueckgabe [{auszug, punkte, treffer:[woerter]}] */
function auszuegeSuchen(frage, auszuege, max) {
  const q = [...new Set(woerter(frage))]; if (!q.length) return [];
  const docs = (auszuege || []).map(a => ({ a, w: woerter(a.text + ' ' + (a.ort || '')), o: woerter((a.ort || '') + ' ' + String(a.text || '').split('\n')[0]) }));
  const N = docs.length || 1, avg = docs.reduce((s, d) => s + d.w.length, 0) / N || 1;
  const df = {}; q.forEach(t => { df[t] = docs.filter(d => d.w.includes(t)).length; });
  return docs.map(d => {
    let s = 0; const hit = [];
    q.forEach(t => { const tf = d.w.filter(x => x === t).length; if (!tf) return; hit.push(t);
      s += Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5)) * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * d.w.length / avg));
      if (d.o.includes(t)) s += 3; }); // Treffer im Reiternamen oder in der Ueberschrift zaehlt mehr
    return { auszug: d.a, punkte: s * (hit.length / q.length + 0.5), treffer: hit };
  }).filter(x => x.punkte > 0).sort((x, y) => y.punkte - x.punkte).slice(0, max || 5);
}

/**
 * Auszuege zu einer Fundstelle: "Handbuch (UPH) Seite 3–4; QM-Übersicht, Reiter „Risiken“" -> passende Textstellen.
 * Seiten gehoeren zum zuletzt davor genannten Dokument. Seitenverschiebung (neue Fassung) wird mit +-1 Seite abgefangen.
 */
function auszuegeZurFundstelle(hilfe, frage, dokumente, auszuege, max) {
  const text = String(hilfe || ''); const n = text.toLowerCase();
  const pos = (dokumente || []).map(d => {
    const namen = [d.titel, d.kurzname, d.d_nr].filter(Boolean).map(x => String(x).toLowerCase());
    const p = namen.map(x => { const i = n.indexOf(x.length > 3 ? x.slice(0, Math.min(x.length, 18)) : x); return i; }).filter(i => i >= 0);
    return { d, p: p.length ? Math.min(...p) : -1 };
  }).filter(x => x.p >= 0).sort((a, b) => a.p - b.p);
  const orte = []; // {dokument_id, seiten:[..]} oder {dokument_id, reiter}
  const re = /Seiten?\s+(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?/g; let m;
  while ((m = re.exec(text))) {
    const vor = pos.filter(x => x.p <= m.index && (auszuege || []).some(a => a.dokument_id === x.d.id && a.seite)).pop()
      || pos.find(x => (auszuege || []).some(a => a.dokument_id === x.d.id && a.seite));
    if (!vor) continue;
    const von = Number(m[1]), bis = Math.min(Number(m[2] || m[1]), von + 3); const s = [];
    for (let i = von; i <= bis; i++) s.push(i);
    orte.push({ dokument_id: vor.d.id, seiten: s });
  }
  (dokumente || []).forEach(d => ((d.inhalt_kurz || {}).reiter || []).forEach(r => { if (text.indexOf('„' + r + '“') >= 0 || new RegExp('Reiter\\s+' + r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) orte.push({ dokument_id: d.id, reiter: r }); }));
  const suche = [frage, text].join(' ');
  const out = [];
  orte.forEach(o => {
    let kand = (auszuege || []).filter(a => a.dokument_id === o.dokument_id && (o.reiter ? a.reiter === o.reiter : o.seiten.indexOf(a.seite) >= 0));
    let best = auszuegeSuchen(suche, kand, 2);
    if (o.seiten) { // Seitenverschiebung (neue Fassung): deutlich besser passende Nachbarseite zusaetzlich zeigen
      const nachbarn = (auszuege || []).filter(a => a.dokument_id === o.dokument_id && o.seiten.some(s => Math.abs(a.seite - s) === 1) && o.seiten.indexOf(a.seite) < 0);
      const b2 = auszuegeSuchen(suche, nachbarn, 1);
      if (b2.length && b2[0].punkte > 1 && (!best.length || b2[0].punkte > best[0].punkte * 1.5)) best = b2.concat(best).slice(0, 2);
    }
    if (!best.length && kand.length) best = [{ auszug: kand[0], punkte: 0, treffer: [] }];
    best.slice(0, o.reiter ? 1 : 2).forEach(b => { if (!out.some(x => x.auszug.id === b.auszug.id)) out.push(b); });
  });
  if (!out.length) auszuegeSuchen(suche, auszuege, 3).forEach(b => out.push(b)); // keine Fundstelle erkannt: freie Suche
  return out.slice(0, max || 4);
}

/**
 * Seitenzahlen nachfuehren: Fundstellen wurden oft gegen eine aeltere Fassung geschrieben (Handbuch hatte 40, jetzt 39 Seiten).
 * Prueft je "Seite N" die Nachbarseiten und korrigiert, wenn der Inhalt dort deutlich besser passt.
 * Rueckgabe {text, aenderungen:[{alt, neu}]}
 */
function seitenKorrigieren(hilfe, frage, dokumente, auszuege) {
  const text = String(hilfe || ''); const n = text.toLowerCase(); const aend = [];
  const pdfDocs = (dokumente || []).filter(d => (auszuege || []).some(a => a.dokument_id === d.id && a.seite));
  const pos = pdfDocs.map(d => ({ d, p: Math.min(...[d.titel, d.kurzname].filter(Boolean).map(x => { const i = n.indexOf(String(x).toLowerCase().slice(0, 18)); return i < 0 ? 1e9 : i; })) })).filter(x => x.p < 1e9).sort((a, b) => a.p - b.p);
  if (!pos.length) return { text, aenderungen: aend };
  const suche = frage + ' ' + text.replace(/Seiten?\s+\d+(\s*[–-]\s*\d+)?/g, '');
  const wert = (dok, s) => { const r = auszuegeSuchen(suche, (auszuege || []).filter(a => a.dokument_id === dok && a.seite === s), 1); return r.length ? r[0].punkte : 0; };
  const neu = text.replace(/(Seiten?\s+)(\d{1,3})(?:(\s*[–-]\s*)(\d{1,3}))?/g, (m, wort, a, strich, b, off) => {
    const dok = (pos.filter(x => x.p <= off).pop() || pos[0]).d.id;
    const s = Number(a), e = b ? Math.min(Number(b), s + 6) : s;
    const bereich = (v) => { let sum = 0; for (let i = s + v; i <= e + v; i++) sum += wert(dok, i); return sum; }; // ganzer Bereich zaehlt
    const basis = bereich(0);
    let best = 0, bestWert = basis;
    [-1, 1].forEach(v => { const w = bereich(v); if (w > bestWert * 1.4 && w > 2) { best = v; bestWert = w; } });
    if (!best) return m;
    const r = wort + (s + best) + (b ? strich + (Number(b) + best) : '');
    aend.push({ alt: m, neu: r }); return r;
  });
  return { text: neu, aenderungen: aend };
}

/**
 * Dokumentpruefung (Idee 9) ohne KI: Text aus dem Bildschirmfoto (Texterkennung im Browser) mit den Auszuegen vergleichen.
 * Welches Dokument ist zu sehen? Passt es zur Fundstelle der Frage? Rueckgabe {passt:'ja'|'teilweise'|'nein'|'unklar', gezeigt, hinweis}
 */
function fotoPruefen(ocrText, erwartet, auszuege, dokumente) {
  const w = woerter(ocrText);
  if (w.length < 12) return { passt: 'unklar', gezeigt: null, hinweis: 'Auf dem Foto ist kaum Text zu erkennen. Dokument größer anzeigen (Strg + Mausrad).' };
  const kurz = w.slice(0, 400).join(' ');
  const top = auszuegeSuchen(kurz, auszuege, 3);
  const gezeigt = top.length ? top[0].auszug : null;
  const docName = (id) => ((dokumente || []).find(d => d.id === id) || {}).titel || 'Dokument';
  const erwDocs = [...new Set((erwartet || []).map(e => (e.auszug || e).dokument_id))];
  const erwIds = new Set((erwartet || []).map(e => (e.auszug || e).id));
  if (!gezeigt) return { passt: 'unklar', gezeigt: null, hinweis: 'Das gezeigte Dokument ist nicht in Ihrer Dokumentation. Nur gültige Dokumente öffnen.' };
  const ort = gezeigt.ort ? ', ' + gezeigt.ort : '';
  const nahe = (a) => (erwartet || []).some(e => { const x = e.auszug || e; return x.dokument_id === a.dokument_id && ((a.seite && x.seite && Math.abs(a.seite - x.seite) <= 1) || (a.reiter && a.reiter === x.reiter)); });
  if (erwIds.has(gezeigt.id) || nahe(gezeigt) || top.some(t => erwIds.has(t.auszug.id) && t.punkte >= top[0].punkte * 0.8))
    return { passt: 'ja', gezeigt, hinweis: 'Richtig: ' + docName(gezeigt.dokument_id) + ort + '.' };
  if (erwDocs.indexOf(gezeigt.dokument_id) >= 0)
    return { passt: 'teilweise', gezeigt, hinweis: 'Richtiges Dokument (' + docName(gezeigt.dokument_id) + '), aber eine andere Stelle' + ort + '. Gesucht war: ' + (erwartet || []).map(e => (e.auszug || e).ort).filter(Boolean).slice(0, 2).join(', ') + '.' };
  if (!erwDocs.length) return { passt: 'unklar', gezeigt, hinweis: 'Sie zeigen: ' + docName(gezeigt.dokument_id) + ort + '.' };
  return { passt: 'nein', gezeigt, hinweis: 'Sie zeigen ' + docName(gezeigt.dokument_id) + ort + ' – gesucht war ' + erwDocs.map(docName).join(' bzw. ') + '.' };
}

/* ================================================================ Antwort-Feedback ohne KI (Idee 5): Holgers Formel */
// Gute Antwort = Was wir machen + wo es steht (zeigen) + ein Beispiel. Keine Superlative, nichts erfinden.
function antwortFeedback(text) {
  const t = String(text || '').trim(), n = norm(t), w = n ? n.split(' ').length : 0;
  const hinweise = [];
  if (!w) return { note: 'leer', hinweise: ['Sagen Sie einen Satz, was Sie machen – und zeigen Sie das Dokument.'] };
  const zeigt = /(handbuch|liste|ubersicht|seite|reiter|plan|bericht|protokoll|nachweis|dokument|ordner|zeige|zeigen|hier steht|siehe|tabelle|formular|vorlage|datei)/.test(n);
  const beispiel = /(zum beispiel|z b|beispiel|letzte|letzten|zuletzt|im (januar|februar|marz|april|mai|juni|juli|august|september|oktober|november|dezember)|20\d\d|auftrag|kunde [a-z]|gestern|letzte woche|neulich)/.test(n);
  const superlativ = /(immer|nie |niemals|perfekt|100 ?%|alles (ist )?(gut|super)|keine fehler|kein problem|ausnahmslos)/.test(n);
  const unsicher = /(glaube|vielleicht|eigentlich|weiss nicht|keine ahnung|muss ich nachschauen)/.test(n);
  if (!zeigt) hinweise.push('Zeigen Sie das Dokument: „Das steht in … – hier.“');
  if (!beispiel) hinweise.push('Nennen Sie ein echtes Beispiel (letzter Fall, Datum, Auftrag).');
  if (superlativ) hinweise.push('Vorsicht mit „immer/nie/perfekt“ – das fordert Nachfragen heraus. Besser: „In der Regel …, zuletzt …“.');
  if (unsicher) hinweise.push('Statt zu raten: „Das schaue ich nach“ und im Dokument nachsehen.');
  if (w > 90) hinweise.push('Kürzer antworten – der Auditor fragt nach, wenn er mehr wissen will.');
  const note = !hinweise.length ? 'gut' : (zeigt || beispiel) && !superlativ ? 'ok' : 'ueben';
  return { note, zeigt, beispiel, superlativ, woerter: w, hinweise };
}

/* ================================================================ Pruefungsreife (Idee 7) */
function pruefungsreife(o) {
  // o: {fragen, antworten, technik_check, faktencheck, fallen, fallen_geuebt, spur_stationen, spur_fertig, stufe}
  const z = { gruen: 0, gelb: 0, rot: 0, offen: 0 }; (o.fragen || []).forEach(f => z[ampel((o.antworten || []).filter(a => a.frage_id === f.id))]++);
  const n = (o.fragen || []).length || 1;
  const teile = [
    ['Fragen/Fahrplan', 0.55, (z.gruen + 0.5 * z.gelb) / n],
    ['Technik-Check', 0.15, ['laptop', 'chrome', 'dokument_offen', 'bildschirm'].filter(k => (o.technik_check || {})[k]).length / 4],
    ['Faktencheck', 0.1, (o.faktencheck || []).length ? (o.faktencheck.filter(f => f.antwort).length / o.faktencheck.length) : 1],
    ['Stolperfallen', 0.2, (o.fallen || 0) ? Math.min(1, (o.fallen_geuebt || 0) / o.fallen) : 1]
  ];
  if (o.stufe === 2) teile.push(['Beispielvorgang', 0.2, (o.spur_stationen || 0) ? Math.min(1, (o.spur_fertig || 0) / o.spur_stationen) : 0]);
  const summe = teile.reduce((s, t) => s + t[1], 0);
  const prozent = Math.round(teile.reduce((s, t) => s + t[1] * t[2], 0) / summe * 100);
  return { prozent, teile: teile.map(t => ({ name: t[0], prozent: Math.round(t[2] * 100) })), stufe: prozent >= 85 ? 'bereit' : prozent >= 60 ? 'fast' : 'ueben' };
}

/* ================================================================ Tageslektion (Idee 3): 5 Minuten, Wiederholung wie Vokabeln */
function tageslektion(fragen, antworten, anzahl, heute) {
  const tag = String(heute || new Date().toISOString()).slice(0, 10);
  const info = (fragen || []).map(f => {
    const a = (antworten || []).filter(x => x.frage_id === f.id && !x.ist_beispiel);
    const zuletzt = a.map(x => String(x.beantwortet_am || '').slice(0, 10)).sort().pop() || '';
    const farbe = ampel(a);
    const faellig = farbe === 'offen' ? 0 : farbe === 'rot' ? 1 : farbe === 'gelb' ? 2 : 4; // Tage bis Wiederholung
    const tage = zuletzt ? Math.round((new Date(tag) - new Date(zuletzt)) / 86400000) : 99;
    const prio = (farbe === 'rot' ? 0 : farbe === 'gelb' ? 1 : farbe === 'offen' ? 2 : 3) - (tage >= faellig ? 0 : 10);
    return { f, prio, tage };
  }).filter(x => x.prio >= 0 || x.tage >= 4);
  return info.sort((a, b) => a.prio - b.prio || b.tage - a.tage).slice(0, anzahl || 3).map(x => x.f);
}

/* ================================================================ Audit-Deutsch (Idee 4) */
const AUDIT_DEUTSCH = [
  ['Kontext der Organisation', 'Was um uns herum und bei uns passiert und uns beeinflusst (Markt, Kunden, Personal, Wetter/Klima, Gesetze).'],
  ['Interessierte Parteien', 'Wer will was von uns? Kunden, Mitarbeiter, Lieferanten, Behörden, Berufsgenossenschaft, Nachbarn.'],
  ['Geltungsbereich', 'Was genau zertifiziert wird – die Leistungen, die wir wirklich anbieten. Steht später auf dem Zertifikat.'],
  ['Nicht anwendbare Anforderungen', 'Normteile, die bei uns nicht passen (z. B. keine Entwicklung) – mit Begründung.'],
  ['Politik', 'Unsere Grundsätze in einem Absatz – von der Geschäftsführung freigegeben.'],
  ['Risiken und Chancen', 'Was kann schiefgehen, was können wir besser machen – und was tun wir dagegen bzw. dafür?'],
  ['Ziele', 'Was wir dieses Jahr erreichen wollen, mit Zahl und Termin.'],
  ['Kompetenz / Qualifikation', 'Wer kann was, wer braucht welche Schulung – und der Nachweis dazu.'],
  ['Dokumentierte Information', 'Alles Aufgeschriebene: Vorgaben (Handbuch, Pläne) und Nachweise (Protokolle, Listen).'],
  ['Lenkung', 'Wer erstellt, gibt frei, wo liegt die gültige Fassung, was ist alt?'],
  ['Externe Anbieter', 'Lieferanten und Dienstleister, die wir beauftragen.'],
  ['Lieferantenbewertung', 'Noten für unsere Lieferanten (Qualität, Termin, Preis) – einmal im Jahr.'],
  ['Nichtkonformität / Abweichung', 'Etwas ist nicht so, wie es sein soll (Reklamation, Fehler, Unfall).'],
  ['Korrekturmaßnahme', 'Was wir tun, damit der Fehler nicht wieder passiert – nicht nur reparieren.'],
  ['Wirksamkeit', 'Hat die Maßnahme wirklich geholfen? Woran sehen wir das?'],
  ['Kennzahl / KPI', 'Eine Zahl, an der wir sehen, wie gut es läuft (Reklamationen, Termintreue, Diesel pro Monat).'],
  ['Internes Audit', 'Unsere eigene Prüfung vorab – mit Bericht.'],
  ['Managementbewertung', 'Unser Jahresrückblick der Geschäftsführung: Ziele, Audit, Kunden, Ressourcen, Entscheidungen.'],
  ['Umweltaspekt', 'Wo wir die Umwelt beeinflussen (Diesel, Reinigungsmittel, Abfall, Wasser).'],
  ['Bindende Verpflichtungen', 'Gesetze und Vorschriften, die wir einhalten müssen (z. B. Gefahrstoffverordnung) – Liste der Normen und Gesetze.'],
  ['Notfallvorsorge', 'Was tun wir, wenn etwas passiert (Chemie ausgelaufen, Brand, Unfall)? Notfallplan.'],
  ['Feststellung / Hinweis / Abweichung', 'Was der Auditor am Ende aufschreibt: Hinweis = Tipp, Abweichung = muss behoben werden.']
];

/* ================================================================ Rollentausch (Idee 12): Kunde ist Auditor und findet den Fehler */
const ROLLENTAUSCH = [
  { frage: 'Wie bewerten Sie Ihre Lieferanten?', antwort: 'Wir arbeiten nur mit den besten Lieferanten, da gibt es nie Probleme. Das brauchen wir nicht aufzuschreiben.', richtig: 'b',
    optionen: { a: 'Die Antwort ist gut – kurz und klar.', b: '„Nie Probleme“ und kein Nachweis – besser: Lieferantenbewertung zeigen (Noten, Datum).', c: 'Er hätte mehr Lieferanten nennen müssen.' },
    erklaerung: 'Superlative („nie“) fordern Nachfragen heraus, und ohne Dokument fehlt der Nachweis. Besser: „Einmal im Jahr bewerten wir die Lieferanten mit Noten – hier die Liste.“' },
  { frage: 'Zeigen Sie mir Ihre Qualitätspolitik.', antwort: '(öffnet einen Ordner „Archiv“) … Moment, hier ist eine Politik von 2023.', richtig: 'a',
    optionen: { a: 'Falsche, alte Fassung – immer nur gültige Dokumente öffnen.', b: 'Alles in Ordnung, Politik ist Politik.', c: 'Er hätte sie auswendig aufsagen sollen.' },
    erklaerung: 'Alte Fassungen erzeugen Widersprüche. Nur Dokumente aus der aktuellen Ablage (Stand prüfen) zeigen.' },
  { frage: 'Wann haben Sie zuletzt Maschinen gewartet? Das steht in Ihrem Geltungsbereich.', antwort: 'Ja, das machen wir ständig, sehr viel.', richtig: 'c',
    optionen: { a: 'Gute Antwort, selbstbewusst.', b: 'Er hätte gar nichts sagen sollen.', c: 'Ehrlich wäre besser: „Zuletzt vor längerer Zeit, Schwerpunkt ist Reinigung“ – und den Geltungsbereich besprechen.' },
    erklaerung: 'Was im Geltungsbereich steht, kommt aufs Zertifikat. Wenn es nicht gemacht wird: offen sagen, der Auditor hilft bei der Formulierung.' },
  { frage: 'Wie viele Mitarbeiter haben Sie?', antwort: 'In der Managementbewertung steht „bitte vom Kunden ergänzen“ – das füllen wir noch aus.', richtig: 'b',
    optionen: { a: 'Ehrlich, also gut.', b: 'Ehrlich ist gut, aber Platzhalter gehören vor dem Audit ausgefüllt – Faktencheck machen.', c: 'Er hätte eine Zahl schätzen sollen.' },
    erklaerung: 'Platzhalter fallen sofort auf. Deshalb vorher den Faktencheck – im Audit selbst einfach die richtige Zahl nennen.' },
  { frage: 'Haben Sie interne Audits durchgeführt?', antwort: 'Ja, am 03.08. durch unseren Berater. Hier ist der Auditbericht – 0 Abweichungen, 8 Empfehlungen, die stehen im Maßnahmenplan.', richtig: 'a',
    optionen: { a: 'Sehr gut: Was, wann, wer, Nachweis, Folgemaßnahmen.', b: 'Zu kurz.', c: 'Der Berater darf kein internes Audit machen.' },
    erklaerung: 'Genau so: kurze Aussage, Dokument zeigen, Verbindung zu den Maßnahmen.' },
  { frage: 'Welche Umweltaspekte sind für Sie wichtig?', antwort: 'Umwelt ist uns sehr wichtig, wir achten auf alles und sind sehr nachhaltig.', richtig: 'c',
    optionen: { a: 'Gute Antwort, zeigt Haltung.', b: 'Er hätte die Norm zitieren sollen.', c: 'Zu allgemein – konkret wäre: Diesel, Reinigungsmittel, Abfall; hier die Umweltaspekte-Liste und ein Beispiel.' },
    erklaerung: 'Allgemeine Bekenntnisse überzeugen nicht. Konkret werden und das eigene Beispiel erzählen.' },
  { frage: 'Gibt es Reklamationen?', antwort: 'Dieses Jahr keine. Wir erfassen sie trotzdem – hier die Liste, Nullmeldung, und so würden wir vorgehen (Prozess U4).', richtig: 'a',
    optionen: { a: 'Richtig gut: Auch „keine“ wird nachgewiesen.', b: 'Er hätte eine Reklamation erfinden sollen.', c: 'Unnötig, die Liste zu zeigen.' },
    erklaerung: 'Auch „nichts passiert“ ist ein Nachweis, wenn es aufgeschrieben ist.' },
  { frage: 'Wer ist bei Ihnen Geschäftsführer?', antwort: 'Ich bin Geschäftsführerin … also eigentlich mein Mann, ich bin Gesellschafterin.', richtig: 'b',
    optionen: { a: 'Ist doch egal.', b: 'Rollen müssen in Dokumenten und Antwort übereinstimmen – vorher klären und richtigstellen.', c: 'Sie hätte „Chefin“ sagen sollen.' },
    erklaerung: 'Widersprüche zwischen Handelsregister, Organigramm und Antwort führen zu Nachfragen. Faktencheck vorher.' }
];

/* ================================================================ Spurensuche an einem Beispielauftrag (Idee 8) */
const SPUR_STATIONEN = [
  { k: 'anfrage', name: 'Anfrage', hilfe: 'E-Mail oder Notiz der Kundenanfrage' },
  { k: 'angebot', name: 'Angebot', hilfe: 'Angebot mit Nummer und Datum' },
  { k: 'auftrag', name: 'Auftrag / Auftragsbestätigung', hilfe: 'Bestellung des Kunden oder Ihre Auftragsbestätigung' },
  { k: 'planung', name: 'Einsatzplanung', hilfe: 'Disposition, Termin, eingesetzte Personen' },
  { k: 'einkauf', name: 'Material / Einkauf', hilfe: 'Bestellung von Material oder Reinigungsmitteln (falls nötig)' },
  { k: 'durchfuehrung', name: 'Durchführung', hilfe: 'Stundenzettel, Fotos, Checkliste' },
  { k: 'abnahme', name: 'Abnahme / Fertigmeldung', hilfe: 'Abnahmeprotokoll, E-Mail des Kunden, Unterschrift' },
  { k: 'rechnung', name: 'Rechnung', hilfe: 'Rechnung mit Bezug auf Auftrag/Angebot' },
  { k: 'reklamation', name: 'Reklamation (falls vorhanden)', hilfe: 'Reklamation und was Sie getan haben', optional: true }
];
/** Roter Faden pruefen: Datum aufsteigend, gleiche Kunden-/Auftragsnummer, Pflichtstationen vorhanden */
function spurPruefen(stationen) {
  const s = (stationen || []).filter(x => x && (x.datum || x.nummer || x.foto || x.notiz));
  const hinweise = [];
  const pflicht = SPUR_STATIONEN.filter(x => !x.optional).map(x => x.k);
  const fehlt = pflicht.filter(k => !s.some(x => x.k === k));
  if (fehlt.length) hinweise.push('Es fehlen noch: ' + fehlt.map(k => SPUR_STATIONEN.find(x => x.k === k).name).join(', '));
  const reihe = SPUR_STATIONEN.map(x => x.k);
  const mitDatum = s.filter(x => x.datum).sort((a, b) => reihe.indexOf(a.k) - reihe.indexOf(b.k));
  for (let i = 1; i < mitDatum.length; i++) if (mitDatum[i].datum < mitDatum[i - 1].datum && mitDatum[i].k !== 'reklamation')
    hinweise.push('Datum passt nicht: ' + SPUR_STATIONEN.find(x => x.k === mitDatum[i].k).name + ' (' + mitDatum[i].datum + ') liegt vor ' + SPUR_STATIONEN.find(x => x.k === mitDatum[i - 1].k).name + ' (' + mitDatum[i - 1].datum + ')');
  const nummern = [...new Set(s.map(x => norm(x.nummer)).filter(Boolean))];
  if (nummern.length > 1) hinweise.push('Unterschiedliche Kunden-/Auftragsnummern: ' + nummern.join(', ') + ' – gehört alles zum selben Auftrag?');
  const ohneNachweis = s.filter(x => !x.foto && pflicht.indexOf(x.k) >= 0).map(x => SPUR_STATIONEN.find(y => y.k === x.k).name);
  if (ohneNachweis.length) hinweise.push('Noch ohne Foto/Bildschirmfoto: ' + ohneNachweis.join(', '));
  return { fertig: pflicht.length - fehlt.length, von: pflicht.length, ok: !hinweise.length, hinweise };
}

/* ================================================================ Foto-Rundgang (Idee 10) */
const RUNDGANG_STANDARD = [
  { k: 'feuerloescher', name: 'Feuerlöscher', intervall_monate: 24, hilfe: 'Prüfplakette fotografieren (Monat/Jahr der nächsten Prüfung)' },
  { k: 'leitern', name: 'Leitern und Tritte', intervall_monate: 12, hilfe: 'Prüfaufkleber oder Prüfblatt der Sichtprüfung' },
  { k: 'elektro', name: 'Elektrische Geräte (DGUV V3)', intervall_monate: 12, hilfe: 'Prüfaufkleber an Geräten/Kabeln' },
  { k: 'fahrzeug', name: 'Fahrzeuge (UVV/HU)', intervall_monate: 12, hilfe: 'HU-Plakette, UVV-Prüfnachweis' },
  { k: 'erstehilfe', name: 'Erste-Hilfe-Kasten', intervall_monate: 12, hilfe: 'Inhalt vollständig, Ablaufdaten' },
  { k: 'chemie', name: 'Reinigungsmittel / Chemikalien', intervall_monate: 0, hilfe: 'Lagerung, Kennzeichnung, Betriebsanweisung in der Nähe' },
  { k: 'psa', name: 'Schutzausrüstung (PSA)', intervall_monate: 12, hilfe: 'Handschuhe, Brille, Absturzsicherung – Prüfdatum bei PSA gegen Absturz' }
];
/** Faellig? naechste: "2026-03" (Monat der naechsten Pruefung) oder letzte Pruefung + Intervall */
function rundgangStatus(eintrag, heute) {
  const h = String(heute || new Date().toISOString()).slice(0, 7);
  let naechste = eintrag.naechste || '';
  if (!naechste && eintrag.letzte && eintrag.intervall_monate) {
    const [j, m] = String(eintrag.letzte).slice(0, 7).split('-').map(Number); const t = new Date(Date.UTC(j, m - 1 + eintrag.intervall_monate, 1));
    naechste = t.toISOString().slice(0, 7);
  }
  if (!naechste) return { status: eintrag.foto ? 'ok' : 'offen', naechste: '' };
  return { status: naechste < h ? 'faellig' : (naechste === h ? 'bald' : 'ok'), naechste };
}

/* ================================================================ Auditor nach Mass (Idee 1, ohne KI: steuert Reihenfolge und Fallen) */
const AUDITOR_TYPEN = {
  plauderer: { name: 'Der Plauderer', text: 'Erzählt viel, fragt offen, will die Firma verstehen.', level: 'einfach', fallen_anteil: 0.1 },
  sachlich: { name: 'Der Sachliche', text: 'Geht seine Liste durch, will zu jedem Punkt das Dokument sehen.', level: 'mittel', fallen_anteil: 0.25 },
  paragraphen: { name: 'Der Paragraphenreiter', text: 'Fragt mit Normbegriffen, achtet auf Formalien (Stand, Freigabe, Unterschrift).', level: 'streng', fallen_anteil: 0.4 },
  stichprobe: { name: 'Der Stichprobenjäger', text: 'Will echte Beispiele sehen: „Zeigen Sie mir den letzten Auftrag.“', level: 'streng', fallen_anteil: 0.35 },
  schweiger: { name: 'Der Schweiger', text: 'Sagt wenig, wartet ab. Man muss nicht füllen – kurz antworten, zeigen, warten.', level: 'mittel', fallen_anteil: 0.25 }
};
/** Uebungsreihe fuer einen Auditor-Typ: Fragen plus eingestreute Stolperfallen */
function uebungsreihe(fragen, fallen, typ, laenge) {
  const t = AUDITOR_TYPEN[typ] || AUDITOR_TYPEN.sachlich; const n = laenge || 10;
  const nf = Math.min((fallen || []).length, Math.round(n * t.fallen_anteil));
  const fr = (fragen || []).slice(0, n - nf), fa = (fallen || []).slice(0, nf);
  const out = []; let i = 0, j = 0;
  while (i < fr.length || j < fa.length) { if (i < fr.length) out.push({ art: 'frage', item: fr[i++] }); if (j < fa.length && (out.length % 3 === 2 || i >= fr.length)) out.push({ art: 'falle', item: fa[j++] }); }
  return out.slice(0, n);
}

const Logik = { norm, bereichGruppe, bereichPasst, mitarbeiterZuordnen, kapitelListe, kapitelPasst, dokumenteFuerFrage, fragenOhneKi,
  KI_PLAN, kiAnweisungPlan, KI_FRAGEN, AUDITOR_LEVEL, kiAnweisungFragen, kiJson, fragenAusKi, fragenFuerBereich,
  fahrplanAusPrueflisten, reiterName, klarnamen, dokumenteAusFundstelle, zeigMalFragen, ampel, ZEIG_MAL_SEKUNDEN, zeigMalErgebnis, ampelMatrix,
  tageBis, imRuhemodus, FAKTEN_STANDARD, PLATZHALTER, widerspruchsCheck, ABLAUF,
  stamm, woerter, auszuegeSuchen, auszuegeZurFundstelle, seitenKorrigieren, fotoPruefen, antwortFeedback, pruefungsreife, tageslektion, AUDIT_DEUTSCH, ROLLENTAUSCH, SPUR_STATIONEN, spurPruefen, RUNDGANG_STANDARD, rundgangStatus, AUDITOR_TYPEN, uebungsreihe };
export default Logik;
export { norm, bereichGruppe, bereichPasst, mitarbeiterZuordnen, kapitelListe, kapitelPasst, dokumenteFuerFrage, fragenOhneKi,
  KI_PLAN, kiAnweisungPlan, KI_FRAGEN, AUDITOR_LEVEL, kiAnweisungFragen, kiJson, fragenAusKi, fragenFuerBereich,
  fahrplanAusPrueflisten, reiterName, klarnamen, dokumenteAusFundstelle, zeigMalFragen, ampel, ZEIG_MAL_SEKUNDEN, zeigMalErgebnis, ampelMatrix,
  tageBis, imRuhemodus, FAKTEN_STANDARD, PLATZHALTER, widerspruchsCheck, ABLAUF,
  stamm, woerter, auszuegeSuchen, auszuegeZurFundstelle, seitenKorrigieren, fotoPruefen, antwortFeedback, pruefungsreife, tageslektion, AUDIT_DEUTSCH, ROLLENTAUSCH, SPUR_STATIONEN, spurPruefen, RUNDGANG_STANDARD, rundgangStatus, AUDITOR_TYPEN, uebungsreihe };
