// Stufe-1-Logik: Fahrplan, Klarnamen, Ampel, Ruhemodus, Widerspruchs-Check (keine Kundendaten)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import L from '../supabase/functions/_shared/logik.js';
import F from '../web/formulare.js';

const reiter = ['Übersicht', 'Ziele & Kennzahlen', 'Kundenzufriedenheit', 'Lieferantenbewertung', 'Qualifikationsmatrix', 'Schulungsplan', 'Maßnahmenplan', 'Risiken', 'Chancen'];
const dok = [
  { id: 'd1', d_nr: 'D-01', titel: 'Unternehmens- und Prozesshandbuch', kurzname: 'UPH' },
  { id: 'd2', d_nr: 'D-02', titel: 'QM-Übersicht', kurzname: 'QM-Übersicht', inhalt_kurz: { reiter } },
  { id: 'd3', d_nr: 'D-03', titel: 'Managementbewertung 2026' }];

test('Klarnamen: Tab-Nummern werden Reiternamen (Übersichtsblatt zählt nicht mit), Abkürzungen ausgeschrieben', () => {
  const t = L.klarnamen('UPH S. 3; Tab 7/8 R&C; Lieferantenbewertung Tab 3, 5 Lieferanten', dok);
  assert.match(t, /Unternehmens- und Prozesshandbuch \(UPH\), ?Seite 3|Unternehmens- und Prozesshandbuch \(UPH\) Seite 3/);
  assert.match(t, /Reiter „Risiken“ und „Chancen“/);
  assert.match(t, /Reiter „Lieferantenbewertung“, 5 Lieferanten/);  // "3, 5" ist kein Bereich
  assert.ok(!/Tab \d/.test(t));
});

test('Fahrplan: gleiche Frage aus 9001 und 14001 nur einmal, NZ entfällt', () => {
  const fp = L.fahrplanAusPrueflisten([
    { id: 'a', norm: 'ISO 9001', normpunkt: '5.2', frage: 'Ist eine Qualitätspolitik festgelegt?', bemerkung: 'UPH S. 5' },
    { id: 'b', norm: 'ISO 14001', normpunkt: '5.2', frage: 'Ist eine Umweltpolitik festgelegt?', bemerkung: 'UPH S. 5' },
    { id: 'c', norm: 'ISO 9001', normpunkt: '8.3', frage: 'Wird Entwicklung betrieben?', bewertung: 'NZ', bemerkung: 'keine' }]);
  assert.equal(fp.length, 1); assert.deepEqual(fp[0].normen, ['ISO 9001', 'ISO 14001']); assert.deepEqual(fp[0].pruefpunkt_ids, ['a', 'b']);
  const z = L.zeigMalFragen(fp, dok);
  assert.equal(z[0].art, 'zeig_mal'); assert.deepEqual(z[0].dokument_ids, ['d1']); assert.match(z[0].hilfe, /Seite 5/);
});

test('Ampel und Zeig-mal-Ergebnis', () => {
  assert.equal(L.ampel([]), 'offen');
  assert.equal(L.ampel([{ sicherheit: 'sicher', beantwortet_am: '1' }]), 'gruen');
  assert.equal(L.ampel([{ sicherheit: 'weiss_nicht', beantwortet_am: '1' }, { sicherheit: 'sicher', hilfe_genutzt: true, beantwortet_am: '2' }]), 'gelb');
  assert.equal(L.zeigMalErgebnis(42, false, true), 'sicher');
  assert.equal(L.zeigMalErgebnis(75, false, true), 'unsicher');
  assert.equal(L.zeigMalErgebnis(10, false, false), 'weiss_nicht');
  const m = L.ampelMatrix([{ id: 'f1' }], [{ frage_id: 'f1', mitarbeiter_id: 'm1', sicherheit: 'sicher' }], [{ id: 'm1' }, { id: 'm2' }]);
  assert.equal(m.zeilen[0].je.m1, 'gruen'); assert.equal(m.summe.m2.offen, 1);
});

test('Ruhemodus 3 Tage vorher, nicht danach', () => {
  assert.equal(L.tageBis('2026-10-12', '2026-10-09'), 3);
  assert.ok(L.imRuhemodus('2026-10-12', 3, '2026-10-09'));
  assert.ok(!L.imRuhemodus('2026-10-12', 3, '2026-10-08'));
  assert.ok(!L.imRuhemodus('2026-10-12', 3, '2026-10-13'));
});

test('Widerspruchs-Check findet Platzhalter, falschen Zertifizierer, abweichende Stände', () => {
  const t = L.widerspruchsCheck([
    { d_nr: 'D-03', titel: 'Managementbewertung', stand: '03.08.2026', text: 'Personalstand (bitte vom Kunden ergänzen)\nZertifizierer: DEKRA oder TÜV NORD' },
    { d_nr: 'D-01', titel: 'Handbuch', stand: '02.08.2026', text: 'Zertifizierung durch TÜV SÜD' }], { zertifizierer: 'TÜV NORD CERT' });
  assert.ok(t.some(x => x.prio === 'HA' && /bitte vom Kunden/.test(x.todo)));
  assert.ok(t.some(x => /DEKRA/.test(x.todo))); assert.ok(t.some(x => /TÜV SÜD/.test(x.todo)));
  assert.ok(t.some(x => /Unterschiedliche Stände/.test(x.todo)));
});

// Praxisprobe mit echten Formularen, nur wenn lokal vorhanden (daten/ ist nicht in Git)
const D = new URL('../daten/beispiel/', import.meta.url).pathname;
test('Praxisprobe: ausgefüllte TÜV-Prüflisten 9001 + 14001 ergeben einen Fahrplan', { skip: !fs.existsSync(D + 'Vorschlag_9001.docx') }, () => {
  const pp = [];
  ['Vorschlag_9001.docx', 'Vorschlag_14001.docx'].forEach(f => {
    const r = F.lies(execFileSync('unzip', ['-p', D + f, 'word/document.xml'], { maxBuffer: 1e8 }).toString());
    assert.equal(r.art, 'pruefliste'); r.daten.punkte.forEach((p, i) => pp.push(Object.assign({ id: f + i, norm: r.daten.norm }, p)));
  });
  const fp = L.fahrplanAusPrueflisten(pp);
  assert.ok(fp.length < pp.length && fp.length > 30);
  assert.ok(fp.filter(f => f.normen.length === 2).length >= 10);
});
