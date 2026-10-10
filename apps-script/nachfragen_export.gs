/**
 * Export der Audit-Nachfragen aus der „QM-Wissensbasis aus Fireflies“ für die Auditvorbereitung (E-A39).
 *
 * WO: im Google Sheet „QM-Wissensbasis aus Fireflies“ → Erweiterungen → Apps Script → neue Datei
 *     „nachfragen_export“ → diesen Code einfügen → Speichern → Funktion nachfragenExportieren ausführen.
 * WAS: liest im Blatt „Branchenmuster“ die Spalte „Audit-Nachfragen“, wirft alles raus, was einen Namen
 *     aus dem Blatt „Sperrliste“ enthält oder nach Firma/Person/Kontakt aussieht, und schreibt die übrigen
 *     Nachfragen in eine EIGENE, neue Tabelle „Audit-Nachfragen anonymisiert (Export)“.
 *     Die Wissensbasis selbst wird nicht verändert. Herausgefilterte Texte werden NICHT kopiert, nur gezählt.
 * DANACH: Holger prüft den Export kurz mit dem Auge; Claude liest nur diesen Export (nicht die Wissensbasis).
 */
var EXPORT_NAME = 'Audit-Nachfragen anonymisiert (Export)';

function nachfragenExportieren() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var blatt = ss.getSheetByName('Branchenmuster');
  if (!blatt) throw new Error('Blatt „Branchenmuster“ nicht gefunden.');
  var werte = blatt.getDataRange().getDisplayValues();
  var kopf = werte[0].map(function (x) { return String(x).toLowerCase(); });
  var spNachfrage = kopf.findIndex(function (k) { return /nachfrage/.test(k); });
  if (spNachfrage < 0) spNachfrage = 8; // Spalte I laut LIESMICH
  var spBranche = kopf.findIndex(function (k) { return /branche/.test(k); });
  if (spBranche < 0) spBranche = 0;

  var sperr = [];
  var sp = ss.getSheetByName('Sperrliste');
  if (sp) sp.getDataRange().getDisplayValues().forEach(function (z) {
    var n = String(z[0] || '').trim().toLowerCase(); if (n.length >= 3) sperr.push(n);
  });

  var verdaechtig = [
    /\b(gmbh|ug|kg|ag|e\.\s?k\.|ohg|gbr|mbh|co\.)\b/i,      // Firmenform
    /@|https?:\/\/|www\./i,                                  // Mail, Webseite
    /\+?\d[\d \/-]{6,}\d/,                                    // Telefonnummer
    /\b([Hh]err|[Ff]rau|[Hh]r\.|[Ff]r\.)\s+[A-ZÄÖÜ]/                      // Herr Müller
  ];
  var gesehen = {}, zeilen = [], raus = 0, roh = 0;
  for (var i = 1; i < werte.length; i++) {
    var branche = String(werte[i][spBranche] || '').trim();
    zerlegen(werte[i][spNachfrage]).forEach(function (t) {
      roh++;
      var klein = t.toLowerCase();
      if (sperr.some(function (n) { return klein.indexOf(n) >= 0; }) || verdaechtig.some(function (r) { return r.test(t); })) { raus++; return; }
      if (gesehen[klein]) return; gesehen[klein] = true;
      zeilen.push([branche, t]);
    });
  }

  var p = PropertiesService.getScriptProperties(), id = p.getProperty('NACHFRAGEN_EXPORT_ID'), ziel;
  try { ziel = id ? SpreadsheetApp.openById(id) : null; } catch (e) { ziel = null; }
  if (!ziel) { ziel = SpreadsheetApp.create(EXPORT_NAME); p.setProperty('NACHFRAGEN_EXPORT_ID', ziel.getId()); }
  var b = ziel.getSheets()[0]; b.setName('Nachfragen'); b.clear();
  b.getRange(1, 1, 1, 2).setValues([['Branche', 'Nachfrage']]).setFontWeight('bold');
  if (zeilen.length) b.getRange(2, 1, zeilen.length, 2).setValues(zeilen);
  b.setFrozenRows(1); b.setColumnWidth(1, 220); b.setColumnWidth(2, 700);
  var info = 'Stand ' + Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm') + ' · ' + zeilen.length + ' Nachfragen übernommen · '
    + raus + ' wegen Sperrliste/Namen/Kontakt weggelassen · ' + (roh - raus - zeilen.length) + ' doppelt';
  b.getRange(1, 4).setValue(info);
  Logger.log(info + '\nExport: ' + ziel.getUrl());
  return ziel.getUrl();
}

/** Zelle in einzelne Fragen zerlegen: JSON-Liste, Zeilen, Aufzählungszeichen oder Nummern */
function zerlegen(zelle) {
  var s = String(zelle || '').trim(); if (!s) return [];
  var teile;
  if (/^\[/.test(s)) { try { teile = JSON.parse(s).map(function (x) { return typeof x === 'string' ? x : (x.frage || x.nachfrage || ''); }); } catch (e) { teile = null; } }
  if (!teile) teile = s.split(/\n|•|;|\s(?=\d{1,2}[.)]\s)/);
  return teile.map(function (t) { return String(t).replace(/^\s*[-–*\d.)]+\s*/, '').trim(); })
    .filter(function (t) { return t.length >= 15 && t.length <= 300; });
}
