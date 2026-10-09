// "Wo steht das?", Dokumentpruefung, Antwort-Feedback, Spurensuche, Rundgang, Pruefungsreife, Uebungsreihe (erfundene Daten)
import test from 'node:test';
import assert from 'node:assert/strict';
import L from '../supabase/functions/_shared/logik.js';

const dok = [{ id: 'd1', titel: 'Unternehmens- und Prozesshandbuch', kurzname: 'UPH' }, { id: 'd2', titel: 'QM-Übersicht', inhalt_kurz: { reiter: ['Übersicht', 'Ziele', 'Risiken', 'Lieferantenbewertung'] } }];
const az = [
  { id: 'a1', dokument_id: 'd1', seite: 3, ort: 'Seite 3', text: 'Anwendungsbereich und Kontext der Organisation. Geltungsbereich: Gebäudereinigung.' },
  { id: 'a2', dokument_id: 'd1', seite: 4, ort: 'Seite 4', text: 'Interne und externe Themen: Fachkräftemangel, Klimawandel, Energiepreise.' },
  { id: 'a3', dokument_id: 'd1', seite: 5, ort: 'Seite 5', text: 'Qualitäts- und Umweltpolitik. Freigabe Geschäftsführung.' },
  { id: 'a4', dokument_id: 'd1', seite: 33, ort: 'Seite 33', text: 'Lieferantenbewertung Unterstützungsprozess U5: jährliche Bewertung der Lieferanten mit Noten.' },
  { id: 'a5', dokument_id: 'd2', reiter: 'Lieferantenbewertung', ort: 'Reiter „Lieferantenbewertung“', text: 'Lieferant: Chemie GmbH | Qualität 2 | Termin 2' },
  { id: 'a6', dokument_id: 'd2', reiter: 'Risiken', ort: 'Reiter „Risiken“', text: 'Risiko Sturz bei Arbeiten in der Höhe | Maßnahme Leiterprüfung' }];

test('Freie Suche findet Prozess und Reiter', () => {
  const r = L.auszuegeSuchen('Wo steht die Lieferantenbewertung?', az, 3).map(x => x.auszug.id);
  assert.ok(r.includes('a4') && r.includes('a5'));
  assert.deepEqual(L.auszuegeSuchen('', az), []);
});

test('Auszug zur Fundstelle: Seite und Reiter, Nachbarseite bei Verschiebung', () => {
  assert.equal(L.auszuegeZurFundstelle('Unternehmens- und Prozesshandbuch (UPH) Seite 5 Politik', 'Ist eine Qualitätspolitik festgelegt?', dok, az)[0].auszug.id, 'a3');
  assert.ok(L.auszuegeZurFundstelle('QM-Übersicht, Reiter „Risiken“', 'Risiken bestimmt?', dok, az).some(x => x.auszug.id === 'a6'));
  // Fundstelle sagt Seite 3, Themen stehen inzwischen auf Seite 4
  assert.ok(L.auszuegeZurFundstelle('UPH Seite 3', 'Wurden interne und externe Themen bestimmt? Klimawandel', dok, az).some(x => x.auszug.id === 'a2'));
});

test('Seitenzahlen werden nachgeführt, wenn die Nachbarseite deutlich besser passt', () => {
  const k = L.seitenKorrigieren('UPH Seite 34 Lieferantenbewertung U5', 'Werden Lieferanten bewertet?', dok, az);
  assert.equal(k.text, 'UPH Seite 33 Lieferantenbewertung U5'); assert.equal(k.aenderungen.length, 1);
  assert.equal(L.seitenKorrigieren('UPH Seite 5 Politik', 'Qualitätspolitik?', dok, az).aenderungen.length, 0);
});

test('Dokumentprüfung aus dem Fototext', () => {
  const erw = L.auszuegeZurFundstelle('UPH Seite 5', 'Qualitätspolitik', dok, az);
  assert.equal(L.fotoPruefen('Unternehmenshandbuch Stand 02.10.2026 Qualitäts- und Umweltpolitik Freigabe Geschäftsführung unsere Politik lautet wir verpflichten uns zur ständigen Verbesserung Qualität Umweltschutz Arbeitssicherheit Gesundheitsschutz Mitarbeiterentwicklung Lieferantenzufriedenheit Nachhaltigkeit', erw, az, dok).passt, 'ja');
  assert.equal(L.fotoPruefen('Lieferant Chemie GmbH Qualität Termin Lieferantenbewertung Noten jährlich Bewertung Lieferanten Tabelle Übersicht Preis Gesamtnote Sicherheitsdatenblatt Nachweis Ansprechpartner Leistung Produkt', erw, az, dok).passt, 'nein');
  assert.equal(L.fotoPruefen('kaum text', erw, az, dok).passt, 'unklar');
});

test('Antwort-Feedback nach Holgers Formel', () => {
  assert.equal(L.antwortFeedback('Wir bewerten die Lieferanten einmal im Jahr mit Noten, hier die Liste in der QM-Übersicht – zuletzt im März 2026 den Reinigungsmittel-Hersteller.').note, 'gut');
  const f = L.antwortFeedback('Wir machen immer alles perfekt.'); assert.equal(f.note, 'ueben'); assert.ok(f.superlativ);
});

test('Spurensuche erkennt Lücken, falsche Reihenfolge und fremde Nummern', () => {
  const r = L.spurPruefen([{ k: 'anfrage', datum: '2026-05-02', nummer: 'K-1' }, { k: 'angebot', datum: '2026-05-04', nummer: 'K-1' }, { k: 'auftrag', datum: '2026-05-03', nummer: 'K-2' }]);
  assert.equal(r.fertig, 3); assert.ok(!r.ok);
  assert.ok(r.hinweise.some(h => /Datum passt nicht/.test(h))); assert.ok(r.hinweise.some(h => /Unterschiedliche/.test(h)));
});

test('Rundgang: überfällig, bald, aus letzter Prüfung berechnet', () => {
  assert.equal(L.rundgangStatus({ naechste: '2026-03' }, '2026-10-09').status, 'faellig');
  assert.equal(L.rundgangStatus({ naechste: '2026-10' }, '2026-10-09').status, 'bald');
  assert.equal(L.rundgangStatus({ letzte: '2025-11', intervall_monate: 12 }, '2026-10-09').naechste, '2026-11');
});

test('Prüfungsreife, Tageslektion und Übungsreihe', () => {
  const fr = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
  const an = [{ frage_id: 'f1', sicherheit: 'sicher', beantwortet_am: '2026-10-08' }, { frage_id: 'f2', sicherheit: 'weiss_nicht', beantwortet_am: '2026-10-08' }];
  const r = L.pruefungsreife({ fragen: fr, antworten: an, technik_check: { laptop: 1, chrome: 1, dokument_offen: 1, bildschirm: 1 }, faktencheck: [], fallen: 0, stufe: 1 });
  assert.ok(r.prozent > 30 && r.prozent < 70);
  assert.equal(L.tageslektion(fr, an, 2, '2026-10-09')[0].id, 'f2'); // rot zuerst
  const reihe = L.uebungsreihe(fr, [{ id: 'x1' }, { id: 'x2' }], 'paragraphen', 5);
  assert.equal(reihe.length, 5); assert.ok(reihe.some(x => x.art === 'falle'));
});

test('Azubi: Prozesse aus dem Handbuch, Nachplappern erkannt, eigene Worte mit Beispiel gut', () => {
  const az2 = [
    { id: 'p1', dokument_id: 'd1', seite: 32, ort: 'Seite 32', text: 'Kundenreklamationen\nUnterstützungsprozess\n1. Stammdaten\nProzess-Nr.\nU4\nDie Reklamation wird erfasst, die Ursache analysiert und eine Nachbesserung veranlasst. Der Kunde wird informiert.' },
    { id: 'p2', dokument_id: 'd1', seite: 33, ort: 'Seite 33', text: 'Lieferantenbewertung\nUnterstützungsprozess\nProzess-Nr.\nU5\nJährliche Bewertung.' }];
  const P = L.prozesseAusAuszuegen(az2);
  assert.deepEqual(P.map(p => p.nr), ['U4', 'U5']); assert.equal(P[0].bis, 32);
  assert.ok(L.azubiNachfragen(P[0])[0].includes('schimpft'));
  assert.ok(L.nachplappern('Die Reklamation wird erfasst, die Ursache analysiert und eine Nachbesserung veranlasst.', P[0].text) > 0.8);
  assert.equal(L.erklaerungAuswerten('Wenn ein Kunde anruft, schreibe ich das auf und fahre hin. Zum Beispiel im März war ein Fenster streifig, da haben wir am nächsten Tag kostenlos nachgereinigt und das in der Liste notiert.', P[0]).note, 'gut');
});

test('Fehlerbuch: Ursache, Vorschlag, Baustelle schließt nach zweimal sicher', () => {
  const fr = [{ id: 'f1', hilfe: 'Handbuch Seite 33' }, { id: 'f2', hilfe: 'QM-Übersicht, Reiter „Risiken“' }];
  const an = [
    { frage_id: 'f1', sicherheit: 'unsicher', hilfe_genutzt: true, dauer_sekunden: 80, beantwortet_am: '1' },
    { frage_id: 'f2', sicherheit: 'weiss_nicht', dauer_sekunden: 5, beantwortet_am: '1' },
    { frage_id: 'f2', sicherheit: 'sicher', beantwortet_am: '2' }, { frage_id: 'f2', sicherheit: 'sicher', beantwortet_am: '3' }];
  const b = L.fehlerbuch(fr, an, {});
  assert.equal(b.length, 1); assert.equal(b[0].frage.id, 'f1'); assert.equal(b[0].vorschlag, 'finden');
  assert.equal(L.ursacheVorschlag({ sicherheit: 'weiss_nicht', dauer_sekunden: 4 }), 'wissen');
  assert.equal(L.fundstellenHotspots(b)[0].ort, 'Handbuch Seite 33');
  assert.equal(L.fehlerbuch(fr, an, { f1: 'nervoes' })[0].ursache, 'nervoes');
});
