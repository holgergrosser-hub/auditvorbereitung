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
  return fragen.filter(f => meine.has(f.planpunkt_id) || (f.bereich && bereichPasst(f.bereich, bereich)));
}

const Logik = { norm, bereichGruppe, bereichPasst, mitarbeiterZuordnen, kapitelListe, kapitelPasst, dokumenteFuerFrage, fragenOhneKi,
  KI_PLAN, kiAnweisungPlan, KI_FRAGEN, AUDITOR_LEVEL, kiAnweisungFragen, kiJson, fragenAusKi, fragenFuerBereich };
export default Logik;
export { norm, bereichGruppe, bereichPasst, mitarbeiterZuordnen, kapitelListe, kapitelPasst, dokumenteFuerFrage, fragenOhneKi,
  KI_PLAN, kiAnweisungPlan, KI_FRAGEN, AUDITOR_LEVEL, kiAnweisungFragen, kiJson, fragenAusKi, fragenFuerBereich };
