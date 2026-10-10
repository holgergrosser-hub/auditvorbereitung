// Beratungspraxis und Beispiele zu den Übungsfragen (E-A38, E-A39)
import test from 'node:test';
import assert from 'node:assert/strict';
import { beispielZu, praxisZu, nachfragenZu, nachfrageZu, PRAXIS } from '../web/kunde/wissen.js';

test('Beispiel passt zur Frage, Kühlwesten nur bei Arbeitsumgebung', () => {
  assert.match(beispielZu({ frage: 'Wie bewerten Sie Ihre Lieferanten?', normkapitel: '8.4' }), /Lieferanten/);
  assert.match(beispielZu({ frage: 'Sind Prozesse zur Reaktion auf Notfallsituationen festgelegt?', normkapitel: '8.2' }), /Notfallplan/);
  assert.doesNotMatch(beispielZu({ frage: 'Welche Qualitätsziele haben Sie?', normkapitel: '6.2' }), /Kühlwesten/);
});
test('Praxiswissen nach Kapitel, internes Audit ohne Zertifizierungsaudit-Fragen', () => {
  assert.equal(praxisZu({ frage: 'Wie bewerten Sie Ihre Lieferanten?', normkapitel: '8.4' })[0].q, 'Wie viele Lieferanten müssen wir bewerten?');
  assert.deepEqual(praxisZu({ frage: 'Werden interne Audits durchgeführt?', normkapitel: '9.2' }).map(x => x.q), ['Wie oft müssen interne Audits sein?']);
});
test('Echte Nachfragen nach Thema, sonst Standard-Nachfrage', () => {
  const L = [{ frage: 'Wann haben Sie den wichtigsten Lieferanten zuletzt bewertet?' }, { frage: 'Wie oft kalibrieren Sie den Messschieber?' }];
  const f = { id: 'x', frage: 'Wie bewerten Sie Ihre Lieferanten?', normkapitel: '8.4' };
  assert.deepEqual(nachfragenZu(f, 2, L).map(x => x.frage), ['Wann haben Sie den wichtigsten Lieferanten zuletzt bewertet?']);
  assert.ok(nachfrageZu(f).length > 10);
});
test('Keine Firmen- oder Personennamen im Praxiswissen und in den Nachfragen', async () => {
  const { NACHFRAGEN } = await import('../web/kunde/nachfragen.js');
  const r = [/\b(gmbh|ug|kg|ag|mbh)\b/i, /@|https?:\/\//i, /\b([Hh]err|[Ff]rau)\s+[A-ZÄÖÜ]/];
  PRAXIS.forEach(e => r.forEach(x => assert.doesNotMatch(e.q + ' ' + e.a, x, e.q)));
  assert.ok(NACHFRAGEN.length > 100);
  NACHFRAGEN.forEach(e => r.concat([/sparkasse|volksbank|\bDr\.\s+[A-Z]/]).forEach(x => assert.doesNotMatch(e.frage + ' ' + e.nachweis + ' ' + e.branche, x, e.frage)));
});
