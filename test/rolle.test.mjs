// Rollen: wer wird wozu befragt (E-A40) – Themen aus Bereich/Funktion und aus den Prozessbeschreibungen
import test from 'node:test';
import assert from 'node:assert/strict';
import L from '../supabase/functions/_shared/logik.js';

const PROZESSE = [
  { dokument_id: 'd1', ort: 'Seite 12', text: 'Durchführung der Montage\nProzess-Nr.\nW2\nProzessname\nDurchführung der Montage\nKategorie\nWertschöpfungsprozess\nVerantwortlich\nMontage\nMaterial kommissionieren\nMonteur\nRechnung stellen\nBüro\nNormbezug: ISO 9001 Kapitel 8.5.' },
  { dokument_id: 'd1', ort: 'Seite 13', text: 'Einkauf\nProzess-Nr.\nU1\nProzessname\nEinkauf\nVerantwortlich\nGeschäftsführung\nBedarf melden\nMonteur\nBei freigegebenem Lieferanten bestellen\nBüro\nWareneingang prüfen\nMonteur\nNormbezug: ISO 9001 Kapitel 8.4.' }
];
const FRAGEN = ['4.1', '5.2', '6.1', '8.4', '8.5', '9.3'].map((k, i) => ({ id: 'f' + i, normkapitel: k, frage: 'Frage ' + k }));

test('Büro und Einkauf: nur Einkauf/Lieferanten und Qualitätspolitik, nicht Kontext oder Managementbewertung', () => {
  const r = L.rolleThemen({ bereich: 'Büro', funktion: 'Büro und Einkauf' }, PROZESSE);
  assert.deepEqual(r.prozesse.map(p => p.name), ['Einkauf']);
  assert.deepEqual(L.fragenFuerBereich(FRAGEN, [], 'Büro', 'm4', r).map(f => f.normkapitel), ['5.2', '8.4']);
});
test('Monteur: Montage und Wareneingang laut Prozessen', () => {
  const r = L.rolleThemen({ bereich: 'Montage', funktion: 'Monteur' }, PROZESSE);
  assert.deepEqual(L.fragenFuerBereich(FRAGEN, [], 'Montage', 'm3', r).map(f => f.normkapitel), ['5.2', '8.4', '8.5']);
});
test('Geschäftsführung, QMB und unbekannte Rollen bekommen alle Fragen', () => {
  assert.equal(L.rolleThemen({ bereich: 'Geschäftsführung', funktion: 'Geschäftsführerin' }, PROZESSE), null);
  assert.equal(L.rolleThemen({ bereich: 'Kundendienst', funktion: 'QMB, Kundendienst' }, PROZESSE), null);
  assert.equal(L.rolleThemen({ bereich: 'Sonstiges', funktion: '' }, PROZESSE), null);
  assert.equal(L.fragenFuerBereich(FRAGEN, [], 'Geschäftsführung', 'm1', null).length, FRAGEN.length);
});
