// Aufruf: node --test test/   (keine Abhaengigkeiten)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import L from '../supabase/functions/_shared/logik.js';

const ma = [
  { id: 'm1', name: 'Erika Klein', bereich: 'Geschäftsführung' },
  { id: 'm2', name: 'Tom QM', bereich: 'Qualitätsmanagement' },
  { id: 'm3', name: 'Eva Einkauf', bereich: 'Beschaffung' },
  { id: 'm4', name: 'Paul Werk', bereich: 'Fertigung' }
];

test('Bereiche mit verschiedenen Namen passen zusammen', () => {
  assert.ok(L.bereichPasst('Einkauf', 'Beschaffung'));
  assert.ok(L.bereichPasst('GF', 'Geschäftsführung'));
  assert.ok(L.bereichPasst('Produktion', 'Fertigung'));
  assert.ok(!L.bereichPasst('Einkauf', 'Vertrieb'));
});

test('Mitarbeiter werden dem Auditplan zugeordnet', () => {
  const p = L.mitarbeiterZuordnen([
    { id: 'p1', thema: 'Eröffnungsgespräch', bereich: '' },
    { id: 'p2', thema: 'Beschaffung, Lieferantenbewertung', normkapitel: '8.4', bereich: 'Einkauf' },
    { id: 'p3', thema: 'Produktion und Lenkung', normkapitel: '8.5', bereich: '' },
    { id: 'p4', thema: 'Unbekanntes Thema', bereich: 'Labor' }
  ], ma);
  assert.deepEqual(p[0].mitarbeiter_ids, ['m1', 'm2']);
  assert.deepEqual(p[1].mitarbeiter_ids, ['m3']);
  assert.deepEqual(p[2].mitarbeiter_ids, ['m4']);   // ueber das Thema "Produktion"
  assert.deepEqual(p[3].mitarbeiter_ids, ['m1']);   // kein Treffer: Geschaeftsfuehrung
  assert.equal(p[3].zuordnung, 'vorschlag');
});

test('Normkapitel bleiben Text, 7.5 passt zu 7.5.3', () => {
  assert.deepEqual(L.kapitelListe('4.1, 4.2; Kap. 7.5.3'), ['4.1', '4.2', '7.5.3']);
  assert.ok(L.kapitelPasst('7.5', '7.5.3'));
  assert.ok(!L.kapitelPasst('7.1', '7.5'));
});

test('Dokumente zur Frage: KI-Auswahl vor Kapitel vor Bereich', () => {
  const d = [{ id: 'd1', titel: 'Handbuch', normkapitel: '4, 5, 6' }, { id: 'd2', titel: 'Lieferantenbewertung', normkapitel: '8.4', bereich: 'Einkauf' }, { id: 'd3', titel: 'Bestellprozess', bereich: 'Beschaffung' }];
  assert.deepEqual(L.dokumenteFuerFrage({ dokument_ids: ['d3'] }, d).map(x => x.id), ['d3']);
  assert.deepEqual(L.dokumenteFuerFrage({ normkapitel: '8.4.1' }, d).map(x => x.id), ['d2']);
  assert.deepEqual(L.dokumenteFuerFrage({ bereich: 'Einkauf' }, d).map(x => x.id), ['d2', 'd3']);
});

test('Fragen ohne KI: je Planpunkt bis zu 3, Stufe 1 ohne "Zeigen Sie"', () => {
  const f1 = L.fragenOhneKi([{ id: 'p1', thema: 'Kompetenz', normkapitel: '7.2' }], 1);
  const f2 = L.fragenOhneKi([{ id: 'p1', thema: 'Kompetenz', normkapitel: '7.2' }], 2);
  assert.equal(f1.length, 3); assert.ok(f1.every(f => f.planpunkt_id === 'p1' && f.hilfe));
  assert.ok(!/Zeigen Sie/.test(f1[0].frage)); assert.ok(/Zeigen Sie/.test(f2[0].frage));
});

test('KI-Antwort lesen und abbilden', () => {
  const j = L.kiJson('```json\n{"fragen":[{"punkt":2,"frage":"Wie bewerten Sie Lieferanten?","hilfe":"Lieferantenliste","dokumente":[1,9]}]}\n```');
  const f = L.fragenAusKi(j, [{ id: 'p1' }, { id: 'p2', bereich: 'Einkauf' }], [{ id: 'd1' }]);
  assert.equal(f[0].planpunkt_id, 'p2'); assert.deepEqual(f[0].dokument_ids, ['d1']); assert.equal(f[0].bereich, 'Einkauf');
  assert.throws(() => L.kiJson('keine Ahnung'));
});

test('Fragen fuer einen Bereich', () => {
  const pp = [{ id: 'p1', mitarbeiter_ids: ['m3'] }, { id: 'p2', mitarbeiter_ids: ['m1'] }];
  const fr = [{ id: 'f1', planpunkt_id: 'p1', bereich: 'Einkauf' }, { id: 'f2', planpunkt_id: 'p2', bereich: 'Geschäftsführung' }];
  assert.deepEqual(L.fragenFuerBereich(fr, pp, 'Beschaffung', 'm3').map(f => f.id), ['f1']);
  assert.equal(L.fragenFuerBereich(fr, pp, 'alle').length, 2);
});

test('Browser-Kopie der Logik ist identisch', () => {
  assert.equal(fs.readFileSync(new URL('../web/logik.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../supabase/functions/_shared/logik.js', import.meta.url), 'utf8'));
});
