/**
 * Absender der Kundenseite (E-A34). Später je Berater/Mandant aus der Datenbank – bis dahin hier an einer Stelle.
 * Leitplanke: Werbliches nur am Anfang (ruhige Fußzeile) und am Ende (nach dem Audit). Beim Üben bleibt die Seite werbefrei.
 */
const PLACE = 'ChIJvdpj_MZVn0cRrayly-qGsqo'; // Google-Unternehmensprofil QM-Dienstleistungen Holger Grosser, Fürth
export const MARKE = {
  name: 'Holger Grosser',
  firma: 'QM-Dienstleistungen Grosser',
  seit: 1994,
  audits: 'über 1.000 Audits',
  website: 'https://qm-guru.de/', websiteText: 'qm-guru.de',
  impressum: 'https://qm-guru.de/impressum/',
  datenschutz: 'https://qm-guru.de/sonstiges/datenschutz/',
  googleProfil: 'https://www.google.com/maps/place/?q=place_id:' + PLACE,
  bewerten: 'https://search.google.com/local/writereview?placeid=' + PLACE,
  angebot: 'https://vorbereitung-auf-audit.netlify.app/', // bestehende Angebotsseite „Audit-Vorbereitung“ (Angebot als PDF, Apps Script)
  angebotPreis: 'ca. 6–12 Stunden à 135 € zzgl. MwSt., nach Aufwand',
  sterne: '5,0', bewertungen: '100+'
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function fussHtml() {
  const m = MARKE;
  return 'Betreut von <b>' + esc(m.name) + '</b> · ISO-Berater seit ' + m.seit + ' · ' + esc(m.audits)
    + ' · <a href="' + esc(m.googleProfil) + '" target="_blank" rel="noopener">★ ' + esc(m.sterne) + ' bei Google (' + esc(m.bewertungen) + ' Bewertungen)</a>'
    + '<br><a href="' + esc(m.website) + '" target="_blank" rel="noopener">' + esc(m.websiteText) + '</a> · <a href="' + esc(m.impressum) + '" target="_blank" rel="noopener">Impressum</a> · <a href="' + esc(m.datenschutz) + '" target="_blank" rel="noopener">Datenschutz</a>';
}
