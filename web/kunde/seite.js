/**
 * Kundenseite Auditvorbereitung – gesamte Oberflaeche.
 * Datenquelle: Edge Function "kunde" (persoenlicher Link ?t=…), Paket (Testfassung ohne Server) oder Demo.
 * Bausteine: Heute · Technik · Fakten · Fahrplan/Fragen (Zeig mal, Generalprobe, Auditor-Typ) · Stolperfallen ·
 * Finden (Wo steht das?) · Lernen (Audit-Deutsch, Rollentausch) · Beispielauftrag · Rundgang · Audit-Tag · Danach
 */
import L from '../logik.js';
import { erstelleDemo } from './demo.js';
import { lokaleApi } from './lokal.js';

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const p = new URLSearchParams(location.search);
const cfg = window.AV_CONFIG || {};
const token = p.get('t') || '';
let api;

/* ------------------------------------------------ Datenquelle */
async function verbinden() {
  if (p.has('demo') || (!cfg.supabaseUrl && !cfg.paket)) return erstelleDemo(L, { lokal: p.get('demo') === 'lokal', ruhe: p.has('ruhe') });
  if (cfg.paket) {
    const r = await fetch(cfg.paket, { cache: 'no-store' }); if (!r.ok) throw new Error('Paket nicht gefunden');
    const paket = await r.json(); if (p.has('ruhe')) paket.audits[0].datum = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return lokaleApi(L, paket, {});
  }
  const f = async (aktion, daten) => {
    const r = await fetch(cfg.supabaseUrl + '/functions/v1/kunde', { method: 'POST',
      headers: { 'content-type': 'application/json', apikey: cfg.anonKey, authorization: 'Bearer ' + cfg.anonKey },
      body: JSON.stringify(Object.assign({}, daten, { t: token, aktion })) });
    const j = await r.json().catch(() => ({ fehler: 'Keine Verbindung' }));
    if (!r.ok || j.fehler) throw new Error(j.fehler || ('Fehler ' + r.status));
    return j;
  };
  return f;
}

/* KI nur im Servermodus und wenn eingeschaltet (config.js: ki: true); sonst laufen die Regeln ohne KI */
async function ki(aktion, daten) {
  if (!cfg.supabaseUrl || !cfg.ki || !token) return null;
  try {
    const r = await fetch(cfg.supabaseUrl + '/functions/v1/ki', { method: 'POST', headers: { 'content-type': 'application/json', apikey: cfg.anonKey, authorization: 'Bearer ' + cfg.anonKey },
      body: JSON.stringify(Object.assign({}, daten, { t: token, aktion })) });
    const j = await r.json(); return r.ok && !j.fehler ? j : null;
  } catch (e) { return null; }
}

const S = { start: null, audit: null, ma: null, fragen: [], planpunkte: [], antworten: [], eintraege: [], auszuege: null, ansicht: 'heute', stream: null, filter: 'alle', trotzRuhe: false, queue: null };
const KAPITEL = { '0': 'Zum Einstieg: Überblick über Ihre Dokumentation', '4': '4 Kontext der Organisation', '5': '5 Führung', '6': '6 Planung', '7': '7 Unterstützung', '8': '8 Betrieb', '9': '9 Bewertung der Leistung', '10': '10 Verbesserung' };
const datumDe = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Termin noch offen';
const kurzDatum = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE') : 'offen';

function fehler(e) { $('#main').innerHTML = '<div class="karte"><h2>Das hat nicht geklappt</h2><p>' + esc(e.message || e) + '</p><p class="grau">Bitte melden Sie sich bei Ihrem Berater.</p></div>'; }
function hinweisBox(t, art) { const d = document.createElement('div'); d.className = art === 'ok' ? 'ok-box' : 'hinweis'; d.textContent = t; $('#main').prepend(d); setTimeout(() => d.remove(), 9000); }

async function start() {
  try { api = await verbinden(); } catch (e) { return fehler(e); }
  if (!api.lokal && !token) return fehler(new Error('Bitte öffnen Sie den persönlichen Link aus Ihrer E-Mail.'));
  try { S.start = await api('start'); } catch (e) { return fehler(e); }
  const st = S.start;
  $('#firma').textContent = st.kunde.name; document.title = 'Auditvorbereitung · ' + st.kunde.name;
  if (!st.audits.length) return fehler(new Error('Ihre Vorbereitung wird gerade eingerichtet. Sie bekommen Bescheid, sobald es losgeht.'));
  $('#sel-audit').innerHTML = st.audits.map(a => '<option value="' + a.id + '">Stufe ' + a.stufe + ' · ' + kurzDatum(a.datum) + '</option>').join('');
  const gem = (() => { try { return JSON.parse(localStorage.getItem('av_wahl') || '{}'); } catch (e) { return {}; } })();
  const naechstes = st.audits.find(a => (L.tageBis(a.datum) ?? 99) >= 0) || st.audits[0];
  $('#sel-audit').value = st.audits.some(a => a.id === gem.audit) ? gem.audit : naechstes.id;
  $('#sel-ma').innerHTML = '<option value="">– bitte wählen –</option>' + st.mitarbeiter.map(m => '<option value="' + m.id + '">' + esc(m.name) + (m.funktion ? ' (' + esc(m.funktion) + ')' : '') + '</option>').join('');
  if (st.mitarbeiter.some(m => m.id === gem.ma)) $('#sel-ma').value = gem.ma; else if (st.mitarbeiter.length === 1) $('#sel-ma').value = st.mitarbeiter[0].id;
  $('#wahl').hidden = false;
  $('#sel-audit').onchange = $('#sel-ma').onchange = () => { merken(); laden(); };
  if (st.demo) $('#modus').textContent = 'Demo – nichts wird gespeichert.';
  else if (api.lokal) $('#modus').textContent = 'Testfassung – Ihr Fortschritt wird nur in diesem Browser gespeichert.';
  laden();
}
function merken() { try { localStorage.setItem('av_wahl', JSON.stringify({ audit: $('#sel-audit').value, ma: $('#sel-ma').value })); } catch (e) { /* egal */ } }

async function laden() {
  S.audit = S.start.audits.find(a => a.id === $('#sel-audit').value);
  S.ma = S.start.mitarbeiter.find(m => m.id === $('#sel-ma').value) || null;
  const a = S.audit, t = L.tageBis(a.datum);
  $('#audit-info').textContent = 'Zertifizierungsaudit Stufe ' + a.stufe + ' · ' + datumDe(a.datum) + (t != null && t >= 0 ? ' · ' + (t === 0 ? 'heute' : 'in ' + (t === 1 ? '1 Tag' : t + ' Tagen')) : '') + (a.zertifizierer ? ' · ' + a.zertifizierer : '');
  try {
    const [j, e] = await Promise.all([
      api('fragen', { audit_id: a.id, bereich: S.ma ? S.ma.bereich : 'alle', mitarbeiter_id: S.ma ? S.ma.id : '' }),
      api('eintraege', { audit_id: a.id })
    ]);
    S.fragen = j.fragen; S.planpunkte = j.planpunkte || []; S.antworten = j.antworten || []; S.eintraege = e.eintraege || [];
  } catch (e) { return fehler(e); }
  S.ruhe = L.imRuhemodus(a.datum, a.ruhemodus_tage) && !S.trotzRuhe;
  const erlaubt = tabs().map(x => x[0]);
  if (erlaubt.indexOf(S.ansicht) < 0) S.ansicht = erlaubt[0];
  zeichneKopf(); zeige(S.ansicht);
}
function eintrag(art, schluessel) { return S.eintraege.filter(e => e.art === art && (schluessel == null || e.schluessel === schluessel) && (!e.mitarbeiter_id || !S.ma || e.mitarbeiter_id === S.ma.id)).pop(); }
async function speichereEintrag(art, schluessel, daten, ohneMa) {
  const d = { audit_id: S.audit.id, mitarbeiter_id: ohneMa || !S.ma ? null : S.ma.id, art, schluessel, daten };
  await api('eintrag', d);
  S.eintraege = S.eintraege.filter(e => !(e.art === art && e.schluessel === schluessel && (e.mitarbeiter_id || null) === d.mitarbeiter_id)).concat([Object.assign({ geaendert_am: new Date().toISOString() }, d)]);
}
function fallenFuerStufe() { return (S.start.stolperfallen || []).filter(f => !f.stufe || f.stufe <= S.audit.stufe); }

/* ------------------------------------------------ Kopf, Reife, Navigation */
function reife() {
  const spur = L.spurPruefen(L.SPUR_STATIONEN.map(s => Object.assign({ k: s.k }, (eintrag('spur', s.k) || {}).daten || {})).filter(x => Object.keys(x).length > 1));
  return L.pruefungsreife({ fragen: S.fragen, antworten: S.antworten, technik_check: S.start.kunde.technik_check, faktencheck: S.start.faktencheck,
    fallen: fallenFuerStufe().length, fallen_geuebt: fallenFuerStufe().filter(f => eintrag('falle', f.id)).length, spur_stationen: spur.von, spur_fertig: spur.fertig, stufe: S.audit.stufe });
}
function zeichneKopf() {
  const r = reife();
  $('#reife').innerHTML = '<span class="reife ' + r.stufe + '" title="' + esc(r.teile.map(t => t.name + ' ' + t.prozent + ' %').join(' · ')) + '">Prüfungsreife ' + r.prozent + ' %</span>'
    + (api.lokal && !S.start.demo ? '<button class="kopf-senden kein-druck" id="kopf-senden" title="Übungsstand und Nachricht an Ihren Berater schicken">✉ An Berater senden</button>' : '');
  const ks = $('#kopf-senden'); if (ks) ks.onclick = sendenPanel;
  zeichneNav();
}
function technikFertig() { const c = S.start.kunde.technik_check || {}; return ['laptop', 'chrome', 'dokument_offen', 'bildschirm'].every(k => c[k]); }
function faktenFertig() { const f = S.start.faktencheck; return !f.length || f.every(x => x.antwort); }
function antwortenZu(fid) { return S.antworten.filter(a => a.frage_id === fid); }
function stand() { const z = { gruen: 0, gelb: 0, rot: 0, offen: 0 }; S.fragen.forEach(f => z[L.ampel(antwortenZu(f.id))]++); return z; }
function tabs() {
  const zwei = S.audit.stufe === 2, z = stand(), ok = ' <span class="ok">✓</span>';
  if (S.ruhe) return [['tag', 'Audit-Tag'], ['finden', 'Wo steht das?']];
  const t = [['heute', 'Heute'], ['technik', 'Technik' + (technikFertig() ? ok : '')], ['fakten', 'Faktencheck' + (faktenFertig() ? ok : '')],
    ['fahrplan', (zwei ? 'Fragen üben' : 'Fahrplan') + ' <span class="zahl">' + (S.fragen.length - z.offen) + '/' + S.fragen.length + '</span>']];
  if (fallenFuerStufe().length) t.push(['fallen', 'Stolperfallen']);
  t.push(['finden', 'Wo steht das?'], ['lernen', 'Lernen']);
  if (zwei) t.push(['spur', 'Beispielauftrag'], ['rundgang', 'Rundgang']);
  t.push(['tag', 'Audit-Tag'], ['danach', 'Nach dem Audit']);
  return t;
}
function zeichneNav() {
  $('#nav').innerHTML = tabs().map(([k, t]) => '<button data-k="' + k + '" class="' + (S.ansicht === k ? 'an' : '') + '">' + t + '</button>').join('');
  $('#nav').hidden = false;
  $$('#nav button').forEach(b => b.onclick = () => zeige(b.dataset.k));
}
const ANSICHT = {};
function zeige(k) { S.ansicht = k; zeichneNav(); (ANSICHT[k] || ANSICHT.heute)(); window.scrollTo(0, 0); }
function brauchtMa(titel) { if (S.ma) return false; $('#main').innerHTML = '<h2>' + titel + '</h2><div class="hinweis">Bitte oben bei „Wer übt?“ Ihren Namen wählen.</div>'; return true; }

/* ------------------------------------------------ Heute (Tageslektion, Aufgaben, Reife) */
ANSICHT.heute = () => {
  const r = reife(), z = stand();
  const lektion = S.ma ? L.tageslektion(S.fragen, S.antworten, 3) : [];
  const aufgaben = (S.start.aufgaben || []).filter(a => !a.bis_stufe || a.bis_stufe >= S.audit.stufe);
  const schritte = [];
  if (!technikFertig()) schritte.push(['technik', 'Technik-Check erledigen (5 Minuten, am Laptop)']);
  if (!faktenFertig()) schritte.push(['fakten', 'Faktencheck: ' + S.start.faktencheck.filter(f => !f.antwort).length + ' Angaben bestätigen']);
  if (z.offen) schritte.push(['fahrplan', z.offen + (S.audit.stufe === 1 ? ' Punkte im Fahrplan noch nicht geübt' : ' Fragen noch nicht geübt')]);
  const fo = fallenFuerStufe().filter(f => !eintrag('falle', f.id)).length; if (fo) schritte.push(['fallen', fo + ' Stolperfallen noch nicht durchgespielt']);
  const audits = S.start.audits.slice().sort((a, b) => a.stufe - b.stufe);
  $('#main').innerHTML = '<h2>Heute</h2>'
    + (S.ma ? '' : '<div class="hinweis">Bitte oben bei „Wer übt?“ Ihren Namen wählen.</div>')
    + '<div class="stufen">' + [1, 2].map(n => { const a = audits.find(x => x.stufe === n), st = L.STUFEN[n], t = a ? L.tageBis(a.datum) : null;
      return '<div class="stufe ' + (S.audit.stufe === n ? 'jetzt' : '') + '"><div class="zeile" style="justify-content:space-between"><b>' + esc(st.titel) + '</b><span class="chip">' + (a && a.datum ? kurzDatum(a.datum) + (t != null && t >= 0 ? ' · in ' + t + ' T.' : '') : 'Termin offen') + '</span></div>'
        + '<div>' + esc(st.was) + '</div><div class="grau">' + esc(st.ueben) + '</div>' + (S.audit.stufe === n ? '<div class="jetzt-marke">← darauf bereiten Sie sich gerade vor</div>' : (a ? '<button class="link" data-stufe="' + a.id + '">zu Stufe ' + n + ' wechseln</button>' : '')) + '</div>'; }).join('') + '</div>'
    + '<div class="karte"><div class="zeile" style="justify-content:space-between"><b>Ihre Prüfungsreife: ' + r.prozent + ' %</b><span class="grau">' + (r.stufe === 'bereit' ? 'Sie sind gut vorbereitet.' : r.stufe === 'fast' ? 'Fast geschafft.' : 'Jeden Tag ein bisschen – das reicht.') + '</span></div>'
    + r.teile.map(t => '<div class="teil"><span>' + esc(t.name) + '</span><div class="balken"><span style="width:' + t.prozent + '%;background:var(--blau2)"></span></div><span class="grau">' + t.prozent + ' %</span></div>').join('') + '</div>'
    + (lektion.length ? '<h3>Ihre 5 Minuten für heute</h3><div class="karte"><p>Drei Punkte – zuerst die, die beim letzten Mal schwer waren.</p>' + lektion.map(f => '<div class="lek"><span class="dot ' + L.ampel(antwortenZu(f.id)) + '"></span><span class="np">' + esc(f.normkapitel || '–') + '</span><span>' + esc(String(f.frage).slice(0, 120)) + (String(f.frage).length > 120 ? ' …' : '') + '</span></div>').join('') + '<p><button class="knopf" id="lektion">▶ Los geht’s</button></p></div>' : '')
    + (schritte.length ? '<h3>Als Nächstes</h3><div class="karte">' + schritte.map(s => '<div class="zeile weiter" data-k="' + s[0] + '">→ ' + esc(s[1]) + '</div>').join('') + '</div>' : '')
    + baustellenHtml()
    + wegweiserHtml()
    + sendenHtml()
    + (aufgaben.length ? '<h3>Ihre Aufgaben</h3><div class="karte">' + aufgaben.map(a => { const e = eintrag('aufgabe', a.id); return '<label class="check"><input type="checkbox" data-a="' + esc(a.id) + '" ' + (e && e.daten.erledigt ? 'checked' : '') + '><span><b>' + esc(a.todo) + '</b><br><span class="grau">' + (a.bis_stufe ? 'bis Stufe ' + a.bis_stufe : '') + (a.verantwortlich ? ' · ' + esc(a.verantwortlich) : '') + (a.termin ? ' · bis ' + esc(a.termin) : '') + '</span></span></label>'; }).join('') + '</div>' : '');
  const l = $('#lektion'); if (l) l.onclick = () => reihe(lektion.map(f => ({ art: 'frage', item: f, modus: ursachen()[f.id] })), 'Tageslektion');
  $$('[data-bau]').forEach(b => b.onclick = () => { const f = S.fragen.find(x => x.id === b.dataset.bau); reihe([{ art: 'frage', item: f, modus: b.dataset.modus || null }], null, false); });
  $$('[data-bu]').forEach(b => b.onclick = async () => { await speichereEintrag('lernen', 'ursache:' + b.dataset.bu, { ursache: b.dataset.u }); ANSICHT.heute(); });
  $$('.weiter').forEach(x => x.onclick = () => zeige(x.dataset.k));
  $$('[data-stufe]').forEach(b => b.onclick = () => { $('#sel-audit').value = b.dataset.stufe; merken(); laden(); });
  sendenKnopf();
  $$('[data-a]').forEach(c => c.onchange = async () => { await speichereEintrag('aufgabe', c.dataset.a, { erledigt: c.checked }, true); zeichneKopf(); });
};

function baustellenHtml() {
  if (!S.ma) return '';
  const buch = L.fehlerbuch(S.fragen, S.antworten, ursachen());
  if (!buch.length) return S.antworten.length ? '<h3>Ihre Baustellen</h3><div class="karte gut">Keine offenen Baustellen. Was einmal schwer war, haben Sie inzwischen zweimal sicher geschafft.</div>' : '';
  const gruppen = {}; buch.forEach(e => { const k = e.ursache || 'offen'; (gruppen[k] = gruppen[k] || []).push(e); });
  const haupt = Object.entries(gruppen).filter(([k]) => k !== 'offen').sort((a, b) => b[1].length - a[1].length)[0];
  return '<h3>Ihre Baustellen (' + buch.length + ')</h3><div class="karte"><p class="grau">Hier sammelt sich, was noch hakt. Eine Baustelle ist geschlossen, wenn Sie die Frage zweimal hintereinander sicher geschafft haben.'
    + (haupt ? ' Ihre häufigste Baustelle: <b>' + esc(L.URSACHEN[haupt[0]].name) + '</b>.' : '') + '</p>'
    + Object.entries(gruppen).map(([k, liste]) => '<div class="bau-gruppe"><b>' + (k === 'offen' ? '❓ Noch ohne Ursache' : L.URSACHEN[k].symbol + ' ' + esc(L.URSACHEN[k].name)) + '</b>' + (k !== 'offen' ? ' <span class="grau">– ' + esc(L.URSACHEN[k].uebung) + '</span>' : '')
      + liste.map(e => '<div class="bau"><span class="np">' + esc(e.frage.normkapitel || '–') + '</span><span class="bau-text">' + esc(String(e.frage.frage).slice(0, 100)) + (e.serie ? ' <span class="chip">1× sicher – noch 1×</span>' : '') + '</span>'
        + (k === 'offen' ? '<span class="zeile">' + Object.entries(L.URSACHEN).map(([u, x]) => '<button class="knopf klein zweit ' + (e.vorschlag === u ? 'an' : '') + '" title="' + esc(x.name) + '" data-bu="' + e.frage.id + '" data-u="' + u + '">' + x.symbol + '</button>').join('') + '</span>'
          : '<button class="knopf klein" data-bau="' + e.frage.id + '" data-modus="' + k + '">Jetzt passend üben</button>') + '</div>').join('') + '</div>').join('') + '</div>';
}

const WEGWEISER = [
  ['technik', 'Technik', 'Laptop, Chrome, Dokumente öffnen und Bildschirm teilen – einmal testen, damit am Audittag nichts hakt.'],
  ['fakten', 'Faktencheck', 'Stimmen Namen, Rollen, Mitarbeiterzahl, Zertifizierer in Ihren Dokumenten? Kurz bestätigen oder korrigieren.'],
  ['fahrplan', 'Fahrplan / Fragen', 'Stufe 1: den Auditplan durchgehen und zu jeder Frage das Dokument finden. Stufe 2: Fragen in eigenen Worten beantworten.'],
  ['fallen', 'Stolperfallen', 'Nachfragen, die aus Ihren eigenen Dokumenten kommen (Widersprüche, offene Punkte) – mit einer ehrlichen Antwort.'],
  ['finden', 'Wo steht das?', 'Suche in Ihren eigenen Dokumenten. Dürfen Sie auch im Audit offen nutzen.'],
  ['lernen', 'Lernen', 'Erklär es dem Azubi (Abläufe in eigenen Worten), Audit-Deutsch (Fachwörter übersetzt), Rollentausch (Sie bewerten Antworten wie ein Auditor).'],
  ['spur', 'Beispielauftrag', 'Stufe 2: einen echten Auftrag von der Anfrage bis zur Rechnung mit Belegen bereitlegen.'],
  ['rundgang', 'Rundgang', 'Stufe 2: Prüfplaketten (Feuerlöscher, Leitern …) fotografieren – was ist fällig?'],
  ['tag', 'Audit-Tag', 'So läuft Ihr Audit und Ihr Spickzettel zum Ausdrucken.'],
  ['danach', 'Nach dem Audit', 'Kurz festhalten, welche Fragen kamen – und Ihr Ergebnis an den Berater schicken.']
];
function wegweiserHtml() {
  const da = tabs().map(t => t[0]);
  return '<h3>Was finden Sie wo?</h3><div class="karte wegweiser">' + WEGWEISER.filter(w => da.indexOf(w[0]) >= 0).map(w => '<div class="weiter" data-k="' + w[0] + '"><b>' + esc(w[1]) + '</b> – <span>' + esc(w[2]) + '</span></div>').join('') + '</div>';
}
/* Ergebnis an den Berater: in der Testfassung per Netlify-Formular (Berater sieht es in Netlify), sonst liegt alles in der Datenbank */
function sendenHtml() {
  if (!api.lokal || S.start.demo) return '';
  const zuletzt = (() => { try { return localStorage.getItem('av_gesendet') || ''; } catch (e) { return ''; } })();
  return '<h3>Ihr Stand an den Berater</h3><div class="karte"><p>Ihr Berater sieht Ihren Übungsstand erst, wenn Sie ihn senden. Den Knopf <b>✉ An Berater senden</b> finden Sie jederzeit oben in der Kopfzeile – auch für Änderungswünsche an Ihren Dokumenten vor dem Audit.</p><div class="zeile"><button class="knopf" id="senden">Jetzt senden</button><span class="grau" id="senden-info">' + (zuletzt ? 'Zuletzt gesendet: ' + esc(zuletzt) : 'Noch nicht gesendet') + '</span></div></div>';
}
function sendenKnopf() { const b = $('#senden'); if (b) b.onclick = sendenPanel; }
/* Fenster zum Senden: Nachricht (z. B. Änderungswunsch vor dem Audit) + Übungsstand. Geht nur an den Berater, nie an Dritte. */
function sendenPanel() {
  const alt = $('#senden-panel'); if (alt) { alt.remove(); return; }
  const d = document.createElement('div'); d.id = 'senden-panel'; d.className = 'karte senden-panel kein-druck';
  d.innerHTML = '<div class="zeile" style="justify-content:space-between"><b>An Ihren Berater senden</b><button class="link" id="sp-zu">schließen</button></div>'
    + '<label for="sp-text">Nachricht (freiwillig) – z. B. „Bitte im Handbuch Kapitel 5 die Geschäftsführung korrigieren“ oder eine Frage vor dem Audit:</label>'
    + '<textarea id="sp-text" rows="4" placeholder="Ihre Nachricht an den Berater"></textarea>'
    + '<p class="grau">Mitgeschickt wird Ihr Übungsstand (ohne Fotos). Ihr Berater liest alles selbst, es geht keine Mail automatisch an andere.</p>'
    + '<div class="zeile"><button class="knopf" id="sp-los">Senden</button><button class="knopf zweit" id="sp-datei">Stattdessen als Datei herunterladen</button></div>';
  $('#main').prepend(d); window.scrollTo(0, 0); $('#sp-text').focus();
  $('#sp-zu').onclick = () => d.remove();
  $('#sp-datei').onclick = () => herunterladen();
  $('#sp-los').onclick = async () => { const ok = await senden($('#sp-los'), $('#sp-text').value.trim()); if (ok) d.remove(); };
}
async function senden(knopf, nachricht) {
  const daten = api.export(); daten.nachweise = (daten.nachweise || []).map(n => Object.assign({}, n, { bild: '' }));
  if (nachricht) daten.nachricht = nachricht;
  const r = reife(), z = stand();
  const felder = { 'form-name': 'ergebnis', kunde: S.start.kunde.name, mitarbeiter: S.ma ? S.ma.name : '', stufe: String(S.audit.stufe), nachricht: nachricht || '',
    zusammenfassung: (nachricht ? 'MIT NACHRICHT · ' : '') + 'Prüfungsreife ' + r.prozent + ' % · ' + z.gruen + ' sicher, ' + z.gelb + ' mit Hilfe, ' + z.rot + ' weiß nicht, ' + z.offen + ' offen', daten: JSON.stringify(daten) };
  const vorher = knopf ? knopf.textContent : '';
  if (knopf) { knopf.disabled = true; knopf.textContent = 'Sende …'; }
  try {
    const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
    if (!res.ok) throw new Error('Status ' + res.status);
    const jetzt = new Date().toLocaleString('de-DE'); try { localStorage.setItem('av_gesendet', jetzt); } catch (e) { /* */ }
    if ($('#senden-info')) $('#senden-info').textContent = '✓ Gesendet am ' + jetzt;
    hinweisBox('Ist bei Ihrem Berater angekommen' + (nachricht ? ' – mit Ihrer Nachricht' : '') + '. Danke!', 'ok');
    return true;
  } catch (e) {
    hinweisBox('Senden hat nicht geklappt. Bitte „Stattdessen als Datei herunterladen“ wählen und die Datei per E-Mail an Ihren Berater schicken.');
    return false;
  } finally { if (knopf) { knopf.disabled = false; knopf.textContent = vorher; } }
}

/* ------------------------------------------------ Technik-Check (P07) */
ANSICHT.technik = () => {
  const c = S.start.kunde.technik_check || {};
  const handy = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 700;
  const chrome = !!(navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some(b => /Chrome|Chromium|Edge/.test(b.brand))) || /Chrome\//.test(navigator.userAgent);
  const zeile = (k, titel, text, knopf) => '<div class="check"><div class="haken ' + (c[k] ? 'ja' : '') + '">' + (c[k] ? '✓' : '') + '</div><div style="flex:1"><b>' + titel + '</b><div class="grau">' + text + '</div>' + (knopf || '') + '</div></div>';
  $('#main').innerHTML = '<h2>Technik-Check</h2><p>Bitte spätestens eine Woche vor dem Audit erledigen. Wer am Tag vorher noch installiert, wird im Audit nervös.</p>'
    + (handy ? '<div class="hinweis">Sie sind gerade am Handy. Im Audit brauchen Sie einen Laptop oder PC – am Handy ist alles zu klein, und Bildschirm teilen klappt schlecht.</div>' : '')
    + '<div class="karte">'
    + zeile('laptop', 'Ich mache das Audit am Laptop oder PC', 'Nicht am Handy oder Tablet.', '<button class="knopf klein" data-c="laptop" ' + (handy ? 'disabled' : '') + '>' + (c.laptop ? 'Bestätigt' : 'Ja, bestätigen') + '</button>')
    + zeile('chrome', 'Browser Google Chrome', chrome ? 'Sie nutzen Chrome bzw. Edge. Gut.' : 'Bitte Google Chrome installieren und diese Seite darin öffnen.', '<button class="knopf klein" data-c="chrome" ' + (chrome ? '' : 'disabled') + '>' + (c.chrome ? 'Bestätigt' : 'Ja, bestätigen') + '</button>')
    + zeile('dokument_offen', 'Ihre Dokumente öffnen sich am Laptop', 'Öffnen Sie testweise Ihr Handbuch. Kommt eine Anmeldung, melden Sie sich mit dem Konto an, über das Sie die Dokumente bekommen haben. Bearbeiten Sie Dokumente nur dort, nicht in Word/Excel auf dem eigenen Rechner – sonst entstehen zwei Versionen.', '<button class="knopf klein" id="dok-test">Handbuch öffnen</button> <button class="knopf klein zweit" data-c="dokument_offen">Hat geklappt</button>')
    + zeile('bildschirm', 'Bildschirm teilen klappt', 'Klicken Sie auf „Testen“, wählen Sie <b>Gesamter Bildschirm</b> und dann „Teilen“. So zeigen Sie dem Auditor im Online-Audit Ihre Dokumente – und im Fahrplan macht das Programm damit Ihr Übungsfoto.', '<button class="knopf klein" id="teilen-test">Bildschirm teilen testen</button><div id="teilen-erg"></div>')
    + '</div>';
  $$('[data-c]').forEach(b => b.onclick = () => technik(b.dataset.c));
  $('#dok-test').onclick = () => { const d = S.start.dokumente.find(x => /handbuch/i.test(x.titel)) || S.start.dokumente[0]; if (d) oeffne(d.id); };
  $('#teilen-test').onclick = async () => {
    const s = await teilen(); if (!s) return;
    const surf = s.getVideoTracks()[0].getSettings().displaySurface;
    $('#teilen-erg').innerHTML = '<p>' + (surf && surf !== 'monitor' ? '⚠️ Sie haben nur ein Fenster oder einen Tab geteilt. Für das Audit besser „Gesamter Bildschirm“ – dann sieht der Auditor jedes Dokument, das Sie öffnen.' : '✓ Bildschirm wird geteilt.') + '</p><video class="vorschau" autoplay muted playsinline></video>';
    $('#teilen-erg video').srcObject = s; technik('bildschirm', true);
  };
};
async function technik(k, still) {
  try { const j = await api('technik', { check: { [k]: true } }); S.start.kunde.technik_check = j.technik_check; } catch (e) { hinweisBox(e.message); return; }
  if (!still && S.ansicht === 'technik') ANSICHT.technik(); zeichneKopf();
}
async function teilen() {
  if (S.stream && S.stream.active) return S.stream;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { hinweisBox('Ihr Browser kann den Bildschirm nicht teilen. Bitte Google Chrome am Laptop verwenden.'); return null; }
  try {
    S.stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' }, audio: false });
    S.stream.getVideoTracks()[0].addEventListener('ended', () => { S.stream = null; });
    return S.stream;
  } catch (e) { hinweisBox('Bildschirm teilen wurde abgebrochen. Kein Problem – einfach noch einmal versuchen und „Gesamter Bildschirm“ wählen.'); return null; }
}
function kopieUrl(d, ort) {
  if (!d || !d.kopie) return '';
  let seite = 0; const m = String(ort || '').match(/Seite\s+(\d+)/); if (m) seite = Number(m[1]);
  const r = String(ort || '').match(/„([^“]+)“/); if (r && d.kopie_seiten && d.kopie_seiten[r[1]]) seite = d.kopie_seiten[r[1]];
  return d.kopie + (seite ? '#page=' + seite : '');
}
function kopieKnopf(dokId, ort) { const d = S.start.dokumente.find(x => x.id === dokId); const u = kopieUrl(d, ort); return u ? '<a class="knopf klein zweit" target="_blank" rel="noopener" href="' + esc(u) + '" title="Falls Sie keinen Zugriff auf die Originaldatei haben">PDF-Kopie</a>' : ''; }
async function oeffne(id) {
  const fenster = window.open('', '_blank');
  try {
    const j = await api('dokument', { dokument_id: id });
    if (j.demo || j.url === 'about:blank') { if (fenster) fenster.document.write('<p style="font-family:sans-serif">Demo: Hier öffnet sich „' + esc(j.titel) + '“.</p>'); }
    else if (fenster) fenster.location = j.url; else location.href = j.url;
  } catch (e) { if (fenster) fenster.close(); hinweisBox(e.message); }
}

/* ------------------------------------------------ Faktencheck (P05) */
ANSICHT.fakten = () => {
  const f = S.start.faktencheck;
  $('#main').innerHTML = '<h2>Faktencheck: Stimmt das in Ihren Dokumenten?</h2><p>In der Vorbereitung fallen immer wieder Kleinigkeiten auf, die der Auditor sofort sieht: falsche Rollen, alter Zertifizierer, Platzhalter, Geräte, die es nicht gibt. Bitte jeden Punkt kurz bestätigen oder korrigieren. Ihre Korrektur geht an Ihren Berater, er passt die Dokumente an. <b>Bitte die Dokumente nicht selbst ändern.</b></p>'
    + (f.length ? f.map(x => '<div class="karte" data-id="' + esc(x.id) + '"><div class="zeile" style="justify-content:space-between"><b>' + esc(x.thema) + '</b>' + (x.antwort ? '<span class="chip">' + (x.antwort === 'stimmt' ? '✓ stimmt' : '✎ korrigiert') + '</span>' : '') + '</div>'
      + '<div>In den Dokumenten steht: <i>' + esc(x.angabe || '–') + '</i></div>' + (x.fundstelle ? '<div class="grau">Fundstelle: ' + esc(x.fundstelle) + '</div>' : '')
      + '<div class="zeile" style="margin-top:8px"><button class="knopf klein gruen" data-a="stimmt">Stimmt</button><button class="knopf klein zweit" data-a="stimmt_nicht">Stimmt nicht</button></div>'
      + '<div class="korr" ' + (x.antwort === 'stimmt_nicht' ? '' : 'hidden') + '><textarea placeholder="Wie ist es richtig?">' + esc(x.korrektur || '') + '</textarea><button class="knopf klein" data-a="speichern">Korrektur speichern</button></div></div>').join('')
      : '<div class="karte grau">Für Sie ist noch kein Faktencheck angelegt.</div>');
  $$('.karte[data-id]').forEach(k => $$('[data-a]', k).forEach(b => b.onclick = async () => {
    const x = f.find(y => y.id === k.dataset.id);
    if (b.dataset.a === 'stimmt_nicht') { $('.korr', k).hidden = false; $('textarea', k).focus(); return; }
    const antwort = b.dataset.a === 'stimmt' ? 'stimmt' : 'stimmt_nicht', korrektur = antwort === 'stimmt' ? '' : $('textarea', k).value.trim();
    if (antwort === 'stimmt_nicht' && !korrektur) { $('textarea', k).focus(); return; }
    try { await api('fakt', { fakt_id: x.id, antwort, korrektur }); Object.assign(x, { antwort, korrektur }); ANSICHT.fakten(); zeichneKopf(); } catch (e) { hinweisBox(e.message); }
  }));
};

/* ------------------------------------------------ "Wo steht das?" (Auszuege) */
async function auszuege() { if (!S.auszuege) { try { S.auszuege = (await api('auszuege')).auszuege || []; } catch (e) { S.auszuege = []; } } return S.auszuege; }
function dokTitel(id) { const d = S.start.dokumente.find(x => x.id === id); return d ? d.titel : 'Dokument'; }
function markiere(text, treffer) {
  let t = esc(text);
  (treffer || []).filter(w => w.length > 3).forEach(w => { t = t.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-zäöüß]*)', 'gi'), '<mark>$1</mark>'); });
  return t.replace(/\n/g, '<br>');
}
function auszugHtml(x, treffer) {
  return '<div class="auszug"><div class="zeile" style="justify-content:space-between"><b>' + esc(dokTitel(x.auszug.dokument_id)) + ' · ' + esc(x.auszug.ort || '') + '</b><span class="zeile"><button class="knopf klein zweit" data-d="' + esc(x.auszug.dokument_id) + '">Dokument öffnen</button>' + kopieKnopf(x.auszug.dokument_id, x.auszug.ort) + '</span></div><div class="auszug-text">' + markiere(x.auszug.text, treffer || x.treffer) + '</div></div>';
}
async function hilfeHtml(f) {
  const a = await auszuege();
  const treffer = a.length ? L.auszuegeZurFundstelle(f.hilfe, f.frage, S.start.dokumente, a, 3) : [];
  return '<div><b>Wo steht das?</b> ' + esc(f.hilfe || 'Keine Fundstelle hinterlegt.') + '</div>'
    + (treffer.length ? '<div class="grau" style="margin-top:6px">Auszug aus Ihrer Dokumentation:</div>' + treffer.map(x => auszugHtml(x, L.woerter(f.frage))).join('') : '')
    + '<div class="doks">' + (f.dokumente || []).map(d => '<button class="knopf klein zweit" data-d="' + d.id + '">' + esc((d.d_nr ? d.d_nr + ' ' : '') + d.titel) + (d.stand ? ' · ' + esc(d.stand) : '') + '</button>').join('') + '</div>';
}
function dokKnoepfe(el) { $$('[data-d]', el).forEach(b => b.onclick = () => oeffne(b.dataset.d)); }
ANSICHT.finden = async () => {
  const a = await auszuege();
  const kennen = S.start.dokumente.filter(d => d.wichtigkeit === 'kennen'), finden = S.start.dokumente.filter(d => d.wichtigkeit !== 'kennen');
  $('#main').innerHTML = '<h2>Wo steht das?</h2><p>Geben Sie ein Stichwort ein – Sie sehen die Stelle in Ihrer eigenen Dokumentation. Diese Suche dürfen Sie auch im Audit offen nutzen, wie eine ausgedruckte Liste.</p>'
    + '<p class="grau">Kein Zugriff auf die Originaldateien (z. B. Google-Anmeldung klappt nicht)? Nutzen Sie die <b>PDF-Kopie</b> – und sagen Sie Ihrem Berater Bescheid, damit es bis zum Audit klappt.</p>'
    + '<div class="karte"><div class="zeile"><input id="suche" type="search" placeholder="z. B. Lieferantenbewertung, Feuerlöscher, Politik, Notfall" style="flex:1"><button class="knopf" id="suchen">Suchen</button><button class="knopf zweit klein" id="sprich" title="Frage sprechen">🎤</button></div></div>'
    + '<div id="ergebnis"></div>'
    + pdfSicherungHtml()
    + '<h3>Ihre Dokumente</h3><div class="karte">' + kennen.map(d => '<div class="zeile"><span class="chip">kennen</span><button class="link" data-d="' + d.id + '">' + esc(d.titel) + '</button><span class="grau">' + (d.stand ? 'Stand ' + esc(d.stand) : '') + '</span>' + kopieKnopf(d.id, '') + '</div>').join('')
    + finden.map(d => '<div class="zeile"><span class="chip grau">finden</span><button class="link" data-d="' + d.id + '">' + esc(d.titel) + '</button><span class="grau">' + (d.stand ? 'Stand ' + esc(d.stand) : '') + '</span>' + kopieKnopf(d.id, '') + '</div>').join('') + '</div>';
  dokKnoepfe($('#main'));
  const los = () => {
    const q = $('#suche').value.trim(); if (!q) return;
    const r = L.auszuegeSuchen(q, a, 5);
    $('#ergebnis').innerHTML = r.length ? r.map(x => auszugHtml(x)).join('') : '<div class="karte grau">Nichts gefunden. Probieren Sie ein anderes Wort (z. B. „Lieferant“ statt „Zulieferer“).</div>';
    dokKnoepfe($('#ergebnis'));
  };
  $('#suchen').onclick = los; $('#suche').onkeydown = (e) => { if (e.key === 'Enter') los(); };
  diktat($('#sprich'), (t) => { $('#suche').value = t; los(); });
};
function diktat(knopf, fertig) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !knopf) { if (knopf) knopf.hidden = true; return; }
  knopf.onclick = () => { const r = new SR(); r.lang = 'de-DE'; r.interimResults = false; knopf.textContent = '…'; r.onresult = (e) => fertig(e.results[0][0].transcript); r.onend = () => { knopf.textContent = '🎤'; }; r.start(); };
}

/* Auditplan durchgehen: je Programmpunkt, was der Auditor sehen will – Dokument oeffnen und abhaken */
function bloecke() { return L.auditplanBloecke(S.planpunkte, S.fragen, S.start.dokumente).filter(b => b.fragen.length || /eröffnung|abschluss|planung/i.test(b.punkt.thema || '')); }
function kurzName(id) { const d = S.start.dokumente.find(x => x.id === id); return d ? (d.kurzname && d.kurzname.length <= 14 ? (d.kurzname === 'UPH' ? 'Handbuch (UPH)' : d.kurzname) : d.titel) : id; }
function orteLinks(f) { // gleiche Angabe wie orteKurz, aber Seiten/Reiter als Link auf die PDF-Kopie
  const o = L.orteJeDokument(f.hilfe, S.start.dokumente);
  return Object.keys(o).map(k => { const d = S.start.dokumente.find(x => x.id === k);
    const teile = o[k].slice(0, 3).map(ort => { const u = kopieUrl(d, ort.replace(/^S\. /, 'Seite ')); return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(ort) + '</a>' : esc(ort); });
    const u0 = kopieUrl(d, ''); return (u0 ? '<a href="' + esc(u0) + '" target="_blank" rel="noopener">' + esc(kurzName(k)) + '</a>' : esc(kurzName(k))) + (teile.length ? ' ' + teile.join(', ') : ''); }).join(' · ');
}
function pdfSicherungHtml() {
  const doks = S.start.dokumente.filter(d => d.kopie || d.link); if (!doks.length) return '';
  return '<h3>Alle Unterlagen – live und als PDF</h3><div class="karte"><p><b>Zur Sicherheit:</b> Klappt am Audittag der Zugang zu Ihren Dateien nicht (Internet, Anmeldung, EDV), öffnen Sie die <b>PDF-Kopie</b>. Am besten laden Sie heute schon alle PDFs auf Ihren Laptop herunter.</p>'
    + (S.start.pdf_zip ? '<p><a class="knopf" href="' + esc(S.start.pdf_zip) + '" download>Alle PDFs als Zip herunterladen</a></p>' : '')
    + '<table class="spick">' + doks.map(d => '<tr><td class="np">' + esc(d.d_nr || '') + '</td><td>' + esc(d.titel) + (d.stand ? ' <span class="grau">(' + esc(d.stand) + ')</span>' : '') + '</td><td class="zeile">' + (d.link ? '<button class="knopf klein zweit" data-d="' + esc(d.id) + '">live öffnen</button>' : '') + kopieKnopf(d.id, '') + '</td></tr>').join('') + '</table>'
    + '<p class="grau">Die PDF-Kopie zeigt den Stand vom ' + esc(new Date().toLocaleDateString('de-DE')) + ' der Vorbereitung. Wenn Ihr Berater Dokumente ändert, bekommen Sie eine neue Fassung.</p></div>';
}
function orteKurz(f) { const o = L.orteJeDokument(f.hilfe, S.start.dokumente); return Object.keys(o).map(k => kurzName(k) + (o[k].length ? ' ' + o[k].slice(0, 3).join(', ') : '')).join(' · '); }
function planDurchgangHtml() {
  const B = bloecke(); if (!B.length) return '';
  const fertig = (pp, d) => { const e = eintrag('lernen', 'plan:' + pp + ':' + d); return e && e.daten.ok; };
  return '<h3 class="schritt">Schritt 1: Gehen Sie den Auditplan durch und suchen Sie die passenden Dokumente</h3>'
    + '<p class="grau">Für jeden Programmpunkt steht hier, was der Auditor sehen will. Öffnen Sie jedes Dokument einmal und haken Sie ab, wenn Sie es gefunden haben.</p>'
    + B.map(b => { const doks = Object.keys(b.zeigen);
      return '<div class="karte block"><div class="zeile"><span class="zeit">' + esc(b.punkt.zeit || '') + '</span><b>' + esc(b.punkt.thema) + '</b></div>'
        + (doks.length ? doks.map(d => { const zeilen = b.fragen.map(f => ({ f, o: L.orteJeDokument(f.hilfe, S.start.dokumente)[d] })).filter(x => x.o);
          return '<div class="fund-zeile"><label class="check fund"><input type="checkbox" data-plan="' + esc(b.punkt.id + ':' + d) + '" ' + (fertig(b.punkt.id, d) ? 'checked' : '') + '><span><b>' + esc(kurzName(d)) + '</b> <span class="grau">– für ' + zeilen.length + (zeilen.length === 1 ? ' Punkt' : ' Punkte') + '</span></span><span class="zeile"><button class="knopf klein zweit" data-d="' + esc(d) + '">öffnen</button>' + kopieKnopf(d, '') + '</span></label>'
            + '<details><summary>Welche Stellen?</summary><table class="spick">' + zeilen.map(x => '<tr><td class="np">' + esc(x.f.normkapitel || '–') + '</td><td>' + esc(x.f.titel || String(x.f.frage).slice(0, 60)) + '</td><td>' + esc(x.o.slice(0, 3).join(', ')) + '</td></tr>').join('') + '</table></details></div>'; }).join('')
          + '<div class="grau">' + b.fragen.length + ' Fragen der Prüfliste gehören zu diesem Punkt.</div>'
        : '<div class="grau">' + (/eröffnung/i.test(b.punkt.thema) ? 'Vorstellung: Wer sind Sie, was macht die Firma, wie ist sie entstanden? Firmenname und Geltungsbereich (Handbuch Seite 3) parat haben.' : /abschluss/i.test(b.punkt.thema) ? 'Der Auditor sagt, was ihm aufgefallen ist. Zuhören, mitschreiben, nachfragen – nicht diskutieren.' : /planung/i.test(b.punkt.thema) ? 'Termin und Teilnehmer für Stufe 2 abstimmen.' : '') + '</div>') + '</div>'; }).join('');
}
function planDurchgangBinden() {
  $$('[data-plan]').forEach(c => c.onchange = async () => { await speichereEintrag('lernen', 'plan:' + c.dataset.plan, { ok: c.checked }); });
  dokKnoepfe($('#main'));
}

/* ------------------------------------------------ Fahrplan / Fragen (P01, P04, P09, Ideen 1–4) */
function kapitelVon(f) { const k = String(f.normkapitel || '').split('.')[0]; return KAPITEL[k] ? k : (f.art === 'zeig_mal' ? '0' : '8'); }
ANSICHT.fahrplan = () => {
  const zeig = S.audit.stufe === 1, z = stand(), n = S.fragen.length || 1;
  if (brauchtMa(zeig ? 'Fahrplan' : 'Fragen üben')) return;
  const lv = (S.start.level || {})[S.audit.auditor_level] || {};
  const typ = (eintrag('auditor', 'typ') || {}).daten || {};
  let html = '<h2>' + (zeig ? 'Fahrplan: Finden Sie die Dokumente' : 'Fragen üben') + '</h2>'
    + (zeig ? '<p>So üben Sie in zwei Schritten. Sie müssen nichts auswendig lernen.</p>' + planDurchgangHtml()
      + '<h3 class="schritt">Schritt 2: Einzelne Fragen der Prüfliste üben</h3><p>Das ist die Prüfliste des Auditors. Er fragt diese Punkte ab – nicht unbedingt in dieser Reihenfolge. Üben Sie: <b>Frage lesen → Dokument öffnen → zeigen.</b></p>'
      : '<p>So fragt der Auditor in Stufe 2. Antworten Sie, wie Sie es im Audit sagen würden: <b>Was wir machen – wo es steht – ein Beispiel.</b></p>')
    + '<div class="karte"><div class="balken"><span style="width:' + (z.gruen / n * 100) + '%;background:var(--gruen)"></span><span style="width:' + (z.gelb / n * 100) + '%;background:var(--gelb)"></span><span style="width:' + (z.rot / n * 100) + '%;background:var(--rot)"></span></div>'
    + '<div class="legende"><span><span class="dot gruen"></span> sicher (' + z.gruen + ')</span><span><span class="dot gelb"></span> mit Hilfe / langsam (' + z.gelb + ')</span><span><span class="dot rot"></span> weiß nicht (' + z.rot + ')</span><span><span class="dot"></span> offen (' + z.offen + ')</span></div>'
    + '<div class="zeile"><label>Zeigen: <select id="filter"><option value="alle">alle</option><option value="offen">nur offene</option><option value="ueben">gelb und rot</option></select></label>'
    + '<button class="knopf" id="naechste">▶ ' + (zeig ? 'Nächste offene üben' : 'Nächste Frage') + '</button>'
    + (zeig ? '<button class="knopf zweit" id="probe">Generalprobe: alles am Stück</button>' : '') + '</div></div>'
    + (!zeig ? '<div class="karte"><b>Auditor nach Maß</b> – wie soll Ihr Übungsauditor sein? <span class="grau">Nach Stufe 1 wissen Sie, wie Ihr echter Auditor „tickt“.</span><div class="typen">'
      + Object.entries(L.AUDITOR_TYPEN).map(([k, t]) => '<label class="typ ' + (typ.typ === k ? 'an' : '') + '"><input type="radio" name="typ" value="' + k + '" ' + (typ.typ === k || (!typ.typ && k === 'sachlich') ? 'checked' : '') + '><b>' + esc(t.name) + '</b><span class="grau">' + esc(t.text) + '</span></label>').join('')
      + '</div><button class="knopf" id="runde">▶ Übungsrunde mit diesem Auditor (10 Fragen inkl. Stolperfallen)</button> <span class="grau">Standard laut Berater: ' + esc(lv.name || '') + '</span></div>' : '');
  const sicht = S.fragen.filter(f => { const a = L.ampel(antwortenZu(f.id)); return S.filter === 'alle' || (S.filter === 'offen' ? a === 'offen' : (a === 'gelb' || a === 'rot')); });
  let kap = null;
  sicht.forEach(f => {
    const k = kapitelVon(f); if (k !== kap) { kap = k; html += '<h3>' + esc(KAPITEL[k]) + '</h3>'; }
    const a = L.ampel(antwortenZu(f.id)), bsp = antwortenZu(f.id).filter(x => x.ist_beispiel).pop();
    html += '<div class="karte" data-f="' + f.id + '"><div class="frage"><span class="dot ' + a + '" title="' + a + '"></span><div class="text">'
      + '<div><span class="np">' + esc(f.normkapitel || '') + '</span>' + (f.normen || []).map(x => '<span class="chip">' + esc(String(x).replace('ISO ', '')) + '</span>').join('') + (f.normen && f.normen.length > 1 ? '<span class="grau">gleiches Dokument für beide Normen</span>' : '') + '</div>'
      + '<div style="margin:4px 0">' + esc(f.frage) + '</div>'
      + '<div class="zeile kein-druck"><button class="knopf klein" data-t="ueben">' + (zeig ? 'Zeig mal (60 s)' : 'Antworten') + '</button><button class="knopf klein zweit" data-t="hilfe">Wo steht das?</button><button class="knopf klein zweit" data-t="bsp">Mein Beispiel</button><button class="knopf klein zweit" data-t="vorlesen" title="Frage vorlesen">🔊</button></div>'
      + '<div class="hilfe" hidden></div>'
      + '<div class="bsp" ' + (bsp ? '' : 'hidden') + '><textarea placeholder="Ihr eigenes Beispiel dazu – das erzählen Sie im Audit (z. B. „Im heißen Sommer haben wir Kühlwesten angeschafft“)">' + esc(bsp ? bsp.text : '') + '</textarea><button class="knopf klein" data-t="bsp-speichern">Beispiel speichern</button></div>'
      + '</div></div></div>';
  });
  if (!sicht.length) html += '<div class="karte grau">' + (S.fragen.length ? 'Keine Fragen in dieser Auswahl. 🎉' : 'Für Sie sind noch keine Fragen hinterlegt.') + '</div>';
  $('#main').innerHTML = html;
  planDurchgangBinden();
  $('#filter').value = S.filter; $('#filter').onchange = (e) => { S.filter = e.target.value; ANSICHT.fahrplan(); };
  $('#naechste').onclick = () => { const f = S.fragen.find(x => L.ampel(antwortenZu(x.id)) === 'offen') || S.fragen.find(x => /gelb|rot/.test(L.ampel(antwortenZu(x.id)))); if (f) reihe([{ art: 'frage', item: f }], null, true); else hinweisBox('Alles geübt. Super!', 'ok'); };
  const pr = $('#probe'); if (pr) pr.onclick = () => reihe(S.fragen.map(f => ({ art: 'frage', item: f })), 'Generalprobe');
  $$('input[name=typ]').forEach(r => r.onchange = async () => { await speichereEintrag('auditor', 'typ', { typ: r.value }); $$('.typ').forEach(x => x.classList.toggle('an', $('input', x).checked)); });
  const ru = $('#runde'); if (ru) ru.onclick = () => {
    const t = ($('input[name=typ]:checked') || {}).value || 'sachlich';
    const sortiert = L.tageslektion(S.fragen, S.antworten, S.fragen.length).concat(S.fragen).filter((f, i, arr) => arr.indexOf(f) === i);
    reihe(L.uebungsreihe(sortiert, fallenFuerStufe(), t, 10), L.AUDITOR_TYPEN[t].name);
  };
  $$('.karte[data-f]').forEach(k => {
    const f = S.fragen.find(x => x.id === k.dataset.f);
    $$('[data-t]', k).forEach(b => b.onclick = async () => {
      const t = b.dataset.t;
      if (t === 'ueben') reihe([{ art: 'frage', item: f }], null, true);
      if (t === 'hilfe') { const h = $('.hilfe', k); if (h.hidden) { h.innerHTML = '<span class="grau">Suche …</span>'; h.hidden = false; h.innerHTML = await hilfeHtml(f); dokKnoepfe(h); } else h.hidden = true; }
      if (t === 'bsp') { $('.bsp', k).hidden = false; $('.bsp textarea', k).focus(); }
      if (t === 'vorlesen') vorlesen(f.frage);
      if (t === 'bsp-speichern') { const text = $('.bsp textarea', k).value.trim(); if (!text) return; await speichereAntwort(f, { text, sicherheit: 'sicher', ist_beispiel: true }); b.textContent = 'Gespeichert ✓'; }
    });
  });
};
async function speichereAntwort(f, d) {
  const daten = Object.assign({ audit_id: S.audit.id, frage_id: f.id, mitarbeiter_id: S.ma ? S.ma.id : null }, d);
  await api('antwort', daten);
  S.antworten.push(Object.assign({ beantwortet_am: new Date().toISOString() }, daten));
}
function vorlesen(t) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'de-DE'; u.rate = 0.95; speechSynthesis.speak(u); } catch (e) { /* ohne Ton */ } }

/* ------------------------------------------------ Uebungsreihe: Frage (Zeig mal / Antwort) oder Stolperfalle */
let uhr = null;
function reihe(items, titel, einzel) {
  if (!S.ma && S.audit.stufe) { if (brauchtMa('Üben')) return; }
  S.queue = { items: items.slice(), pos: 0, titel, einzel, start: Date.now(), ergebnis: [] };
  naechstesItem();
}
function naechstesItem() {
  const q = S.queue; if (!q) return;
  if (q.pos >= q.items.length) return reiheEnde();
  const it = q.items[q.pos++];
  if (it.art === 'falle') falleTrainer(it.item); else trainer(it.item, it.modus);
}
function reiheEnde() {
  const q = S.queue; clearInterval(uhr);
  if (!q || q.einzel || !q.titel || !q.ergebnis.length) return schliessen();
  const z = { gruen: 0, gelb: 0, rot: 0 }; q.ergebnis.forEach(e => z[e] = (z[e] || 0) + 1);
  const min = Math.round((Date.now() - q.start) / 60000);
  $('#trainer-box').innerHTML = '<h2>' + esc(q.titel) + ': geschafft</h2><p>' + q.ergebnis.length + (q.ergebnis.length === 1 ? ' Punkt' : ' Punkte') + ' in ' + (min < 1 ? 'unter einer Minute' : min + (min === 1 ? ' Minute' : ' Minuten')) + '.</p>'
    + '<div class="legende"><span><span class="dot gruen"></span> ' + z.gruen + ' sicher</span><span><span class="dot gelb"></span> ' + z.gelb + ' mit Hilfe</span><span><span class="dot rot"></span> ' + z.rot + ' weiß nicht</span></div>'
    + '<p>' + (z.rot + z.gelb ? 'Die gelben und roten Punkte kommen in den nächsten Tageslektionen wieder.' : 'Hervorragend – Sie finden alles.') + '</p><button class="knopf" id="t-zu2">Schließen</button>';
  $('#t-zu2').onclick = schliessen;
}
function schliessen() { clearInterval(uhr); S.queue = null; $('#trainer').style.display = 'none'; try { speechSynthesis.cancel(); } catch (e) { /* */ } zeichneKopf(); (ANSICHT[S.ansicht] || ANSICHT.heute)(); }
function kopfTrainer(info) {
  const q = S.queue;
  return '<div class="zeile" style="justify-content:space-between"><span class="grau">' + esc(info) + (q && q.items.length > 1 ? ' · ' + q.pos + ' von ' + q.items.length : '') + '</span><button class="knopf klein zweit" id="t-zu">' + (q && q.items.length > 1 ? 'Beenden' : 'Schließen') + '</button></div>';
}

/* Fehlerbuch: Ursache mit einem Klick (Vorschlag aus dem Verhalten ist vorausgewaehlt) */
function ursachen() { const o = {}; S.eintraege.filter(e => e.art === 'lernen' && /^ursache:/.test(e.schluessel) && (!e.mitarbeiter_id || !S.ma || e.mitarbeiter_id === S.ma.id)).forEach(e => { o[e.schluessel.slice(8)] = e.daten.ursache; }); return o; }
function ursacheFragen(el, f, antwort) {
  if (!el) return;
  const vor = L.ursacheVorschlag(antwort), akt = ursachen()[f.id];
  el.insertAdjacentHTML('beforeend', '<div class="ursache"><span class="grau">Woran lag es? (ein Klick – dann übt das Programm passend)</span><div class="zeile">'
    + Object.entries(L.URSACHEN).map(([k, u]) => '<button class="knopf klein zweit ' + ((akt || vor) === k ? 'an' : '') + '" data-u="' + k + '">' + u.symbol + ' ' + esc(u.name) + '</button>').join('') + '</div></div>');
  $$('[data-u]', el).forEach(b => b.onclick = async () => { await speichereEintrag('lernen', 'ursache:' + f.id, { ursache: b.dataset.u }); $$('[data-u]', el).forEach(x => x.classList.toggle('an', x === b)); });
}
function glossarZurFrage(f) {
  const n = ' ' + L.norm(f.frage) + ' ';
  const treffer = L.AUDIT_DEUTSCH.filter(([b]) => L.norm(b).split(' ').some(w => w.length > 5 && n.indexOf(L.stamm(w)) >= 0));
  return '<div class="hinweis"><b>Die Frage in Alltagssprache:</b>' + (treffer.length ? treffer.slice(0, 3).map(([b, e]) => '<div><b>' + esc(b) + '</b> = ' + esc(e) + '</div>').join('') : '<div>Lesen Sie die Frage langsam und fragen Sie sich: Was will der Auditor <i>sehen</i>?</div>') + '</div>';
}
function beispielKiste() { return S.eintraege.filter(e => e.art === 'lernen' && /^beispiel:/.test(e.schluessel) && e.daten.text && (!e.mitarbeiter_id || !S.ma || e.mitarbeiter_id === S.ma.id)); }
function beispielVorschlag(f) {
  const fw = new Set(L.woerter(f.frage + ' ' + (f.hilfe || '')));
  const b = beispielKiste().find(e => L.woerter((e.daten.prozess || '') + ' ' + e.daten.text).filter(w => w.length > 5 && fw.has(w)).length >= 2);
  return b ? '<div class="ok-box">💡 Ihr eigenes Beispiel dazu: „' + esc(b.daten.text.slice(0, 220)) + '“</div>' : '';
}

async function trainer(f, modus) {
  const zeig = f.art === 'zeig_mal' || S.audit.stufe === 1, box = $('#trainer-box');
  let start = Date.now(), hilfe = false, foto = null;
  const typ = ((eintrag('auditor', 'typ') || {}).daten || {}).typ;
  const wer = zeig ? 'Zeig mal' : (typ ? L.AUDITOR_TYPEN[typ].name : ((S.start.level || {})[S.audit.auditor_level] || {}).name || 'Übungsauditor');
  box.innerHTML = kopfTrainer((f.normkapitel || '') + ' · ' + wer)
    + '<h2 style="margin-top:8px">Der Auditor fragt:</h2><p style="font-size:1.15rem"><b>' + esc(f.frage) + '</b> <button class="knopf klein zweit" id="t-vor">🔊</button></p>'
    + (f.normen && f.normen.length > 1 ? '<p class="grau">Zwei Auditoren (9001 und 14001)? Einer fragt, der andere hakt ab – einmal zeigen genügt.</p>' : '')
    + (modus === 'nervoes' ? '<div class="ok-box">Erst ein Atemzug: 4 Sekunden ein, kurz halten, langsam aus. Sie wissen das – jetzt in Ruhe.</div>' : '')
    + (modus === 'verstanden' ? glossarZurFrage(f) : '')
    + (modus === 'wissen' ? '<div class="hinweis" id="t-lesen">Erst lesen: <div id="t-lesen-inhalt" class="grau">Suche …</div><button class="knopf klein" id="t-gelesen">Gelesen – jetzt ohne Hilfe</button></div>' : '')
    + beispielVorschlag(f)
    + (zeig ? '<p>Öffnen Sie jetzt das passende Dokument auf Ihrem Bildschirm, so wie Sie es dem Auditor zeigen würden.</p><div class="uhr" id="t-uhr">60</div><div id="t-teilen"></div>'
      : '<textarea id="t-text" placeholder="Ihre Antwort, wie Sie sie im Audit sagen würden"></textarea><div class="zeile"><button class="knopf klein zweit" id="t-diktat">🎤 Diktieren</button><span class="grau" id="t-dstat"></span><span class="uhr klein" id="t-uhr">0:00</span></div>')
    + '<div class="hilfe" id="t-hilfe" hidden></div><div id="t-foto"></div>'
    + '<div class="zeile" style="margin-top:12px" id="t-knoepfe">'
    + (zeig ? '<button class="knopf gruen" id="t-gefunden">Gefunden – Foto machen</button>' : '<button class="knopf gruen" id="t-fertig">Fertig – Rückmeldung</button>')
    + '<button class="knopf zweit" id="t-hilfe-k">Hilfe: Wo steht das?</button><button class="knopf rot" data-s="weiss_nicht">Weiß ich nicht</button></div>'
    + '<div id="t-erg"></div>';
  $('#trainer').style.display = 'flex';
  $('#t-zu').onclick = () => reiheEnde();
  $('#t-vor').onclick = () => vorlesen(f.frage);
  const zeigeHilfe = async () => { const h = $('#t-hilfe'); if (!h.dataset.da) { h.innerHTML = '<span class="grau">Suche in Ihren Dokumenten …</span>'; h.hidden = false; h.innerHTML = await hilfeHtml(f); h.dataset.da = '1'; dokKnoepfe(h); } h.hidden = false; };
  $('#t-hilfe-k').onclick = () => { hilfe = true; zeigeHilfe(); };
  if (modus === 'wissen') { $('#t-lesen-inhalt').innerHTML = await hilfeHtml(f); dokKnoepfe($('#t-lesen')); $('#t-gelesen').onclick = () => { $('#t-lesen').remove(); start = Date.now(); }; }
  clearInterval(uhr);
  uhr = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000), el = $('#t-uhr'); if (!el) return;
    if (zeig) { const rest = L.ZEIG_MAL_SEKUNDEN - s; el.textContent = rest >= 0 ? rest : '+' + (-rest); el.classList.toggle('vorbei', rest < 0); }
    else el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 250);
  if (zeig) {
    const t = $('#t-teilen');
    if (!(S.stream && S.stream.active)) {
      t.innerHTML = '<div class="hinweis">Für das Übungsfoto bitte einmal den Bildschirm teilen („Gesamter Bildschirm“). <button class="knopf klein" id="t-share">Bildschirm teilen</button> <span class="grau">Ohne Teilen üben Sie nur mit der Stoppuhr.</span></div>';
      $('#t-share').onclick = async () => { if (await teilen()) { t.innerHTML = '<p class="grau">✓ Bildschirm wird geteilt.</p>'; start = Date.now(); } };
    } else t.innerHTML = '<p class="grau">✓ Bildschirm wird geteilt.</p>';
  } else diktat($('#t-diktat'), (txt) => { $('#t-text').value += ($('#t-text').value ? ' ' : '') + txt; });

  const fertig = async (sicherheit, gefunden, pruefung) => {
    clearInterval(uhr);
    const sek = Math.round((Date.now() - start) / 1000);
    let s = zeig ? L.zeigMalErgebnis(sek, hilfe, gefunden) : sicherheit;
    if (pruefung && pruefung.passt === 'nein' && s === 'sicher') s = 'unsicher';
    $('#t-knoepfe').innerHTML = '';
    try {
      await speichereAntwort(f, { text: zeig ? '' : (($('#t-text') || {}).value || '').trim(), sicherheit: s, hilfe_genutzt: hilfe, dauer_sekunden: sek, pruefung: pruefung ? { passt: pruefung.passt, hinweis: pruefung.hinweis } : null });
      if (foto) await api('nachweis', { audit_id: S.audit.id, frage_id: f.id, mitarbeiter_id: S.ma ? S.ma.id : null, bild: foto, vorschau: await verkleinern(foto, 480), notiz: 'Zeig mal, ' + sek + ' s' + (pruefung ? ' · ' + pruefung.passt : '') });
    } catch (e) { $('#t-erg').innerHTML = '<div class="hinweis">Speichern hat nicht geklappt: ' + esc(e.message) + '</div>'; return; }
    const farbe = s === 'sicher' && !hilfe ? 'gruen' : s === 'weiss_nicht' ? 'rot' : 'gelb';
    if (S.queue) S.queue.ergebnis.push(farbe);
    await zeigeHilfe();
    $('#t-erg').innerHTML = '<div class="karte"><span class="dot ' + farbe + '"></span> <b>' + (farbe === 'gruen' ? 'Sehr gut – ' + (zeig ? 'gefunden in ' + sek + ' Sekunden.' : 'sicher beantwortet.') : farbe === 'gelb' ? (zeig ? 'Gefunden' + (hilfe ? ' mit Hilfe' : '') + ' in ' + sek + ' Sekunden. Merken Sie sich die Fundstelle oben.' : 'Gespeichert. Schauen Sie sich die Fundstelle oben noch einmal an.') : 'Kein Problem – genau dafür üben wir. Die Fundstelle steht oben.') + '</b></div>'
      + '<div class="zeile"><button class="knopf" id="t-weiter">' + (S.queue && S.queue.pos < S.queue.items.length ? 'Weiter' : (S.queue && S.queue.einzel ? 'Nächste Frage' : 'Abschließen')) + '</button><button class="knopf zweit" id="t-ende">Pause</button></div>';
    $('#t-weiter').onclick = () => {
      if (S.queue && S.queue.einzel) { const i = S.fragen.indexOf(f); const n = S.fragen.slice(i + 1).concat(S.fragen.slice(0, i)).find(x => L.ampel(antwortenZu(x.id)) !== 'gruen'); if (n) { S.queue.items.push({ art: 'frage', item: n }); } }
      naechstesItem();
    };
    $('#t-ende').onclick = () => reiheEnde();
    if (farbe !== 'gruen') ursacheFragen($('#t-erg .karte'), f, S.antworten[S.antworten.length - 1]);
  };
  $$('[data-s]', box).forEach(b => b.onclick = () => fertig(b.dataset.s, b.dataset.s !== 'weiss_nicht'));
  const tf = $('#t-fertig');
  if (tf) tf.onclick = () => { // Stufe 2: Rueckmeldung nach Holgers Formel, dann selbst einschaetzen
    const fb = L.antwortFeedback($('#t-text').value);
    $('#t-knoepfe').innerHTML = '';
    $('#t-erg').innerHTML = '<div class="karte ' + (fb.note === 'gut' ? 'gut' : '') + '"><b>' + ({ gut: 'Starke Antwort: Sie sagen, was Sie machen, zeigen das Dokument und nennen ein Beispiel.', ok: 'Guter Anfang.', ueben: 'Daran können Sie noch feilen:', leer: 'Noch keine Antwort.' }[fb.note]) + '</b>'
      + (fb.hinweise.length ? '<ul>' + fb.hinweise.map(h => '<li>' + esc(h) + '</li>').join('') + '</ul>' : '') + '</div>'
      + '<div class="zeile">Wie sicher waren Sie? <button class="knopf gruen" data-s2="sicher">Sicher</button><button class="knopf" style="background:var(--gelb)" data-s2="unsicher">Unsicher</button><button class="knopf zweit" id="t-hilfe-k2">Wo steht das?</button></div>';
    $('#t-hilfe-k2').onclick = () => { hilfe = true; zeigeHilfe(); };
    ki('antwort_feedback', { frage: f.frage, antwort: $('#t-text').value, hilfe: f.hilfe }).then(k => { if (k && k.verbesserung) $('#t-erg .karte').insertAdjacentHTML('beforeend', '<div class="grau" style="margin-top:6px"><b>KI-Coach:</b> ' + esc(k.lob || '') + ' ' + esc(k.verbesserung) + (k.bessere_antwort ? '<br><i>So ginge es: ' + esc(k.bessere_antwort) + '</i>' : '') + '</div>'); });
    $$('[data-s2]', box).forEach(b => b.onclick = () => fertig(b.dataset.s2, true));
  };
  const g = $('#t-gefunden');
  if (g) g.onclick = async () => {
    const sekBeimKlick = Date.now(); let pruefung = null;
    if (S.stream && S.stream.active) {
      foto = await bildschirmfoto(S.stream);
      if (foto) {
        $('#t-foto').innerHTML = '<p class="grau">Ihr Übungsfoto:</p><img class="foto" src="' + foto + '" alt="Bildschirmfoto"><div id="t-pruef" class="grau">Ich prüfe, ob das die richtige Stelle ist … <button class="link" id="t-ohne">ohne Prüfung weiter</button></div>';
        clearInterval(uhr); start = start + (Date.now() - sekBeimKlick); // Pruefzeit zaehlt nicht
        let abbruch = false; $('#t-ohne').onclick = () => { abbruch = true; };
        try {
          const text = await Promise.race([ocr(foto), new Promise(r => setTimeout(() => r(null), 45000)), new Promise(r => { const iv = setInterval(() => { if (abbruch) { clearInterval(iv); r(null); } }, 200); })]);
          if (text) {
            const erw = L.auszuegeZurFundstelle(f.hilfe, f.frage, S.start.dokumente, await auszuege(), 4);
            pruefung = L.fotoPruefen(text, erw, await auszuege(), S.start.dokumente);
            $('#t-pruef').innerHTML = '<span class="pruef ' + pruefung.passt + '">' + ({ ja: '✓ ', teilweise: '≈ ', nein: '✗ ', unklar: '? ' }[pruefung.passt]) + esc(pruefung.hinweis) + '</span>';
          } else $('#t-pruef').textContent = 'Foto gespeichert (ohne Prüfung).';
          const k = await ki('foto_pruefen', { bild: await verkleinern(foto, 1400), frage: f.frage, hilfe: f.hilfe });
          if (k && k.hinweis) { pruefung = { passt: k.passt, hinweis: k.hinweis }; $('#t-pruef').innerHTML = '<span class="pruef ' + esc(k.passt) + '">KI: ' + esc(k.hinweis) + '</span>'; }
        } catch (e) { $('#t-pruef').textContent = 'Foto gespeichert (Prüfung nicht möglich).'; }
      }
    }
    fertig('sicher', true, pruefung);
  };
}
async function verkleinern(dataUrl, breite) {
  const img = new Image(); img.src = dataUrl; await img.decode().catch(() => {});
  const f = Math.min(1, breite / (img.width || breite)), c = document.createElement('canvas'); c.width = Math.round((img.width || breite) * f); c.height = Math.round((img.height || breite * 0.6) * f);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.55);
}
async function bildschirmfoto(stream) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream;
  await v.play().catch(() => {}); await new Promise(r => setTimeout(r, 250));
  const w = v.videoWidth, h = v.videoHeight; if (!w || !h) return null;
  const f = Math.min(1, 1600 / w), c = document.createElement('canvas'); c.width = Math.round(w * f); c.height = Math.round(h * f);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); v.srcObject = null;
  return c.toDataURL('image/jpeg', 0.85);
}
/* Texterkennung im Browser (Tesseract, wird erst beim ersten Foto geladen, ~6 MB) */
let ocrWorker = null;
async function ocr(dataUrl) {
  const o = Object.assign({ script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1', langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/deu@1.0.0/4.0.0_best_int' }, cfg.ocr || {});
  if (o.aus) return null;
  if (!window.Tesseract) await new Promise((ok, nein) => { const s = document.createElement('script'); s.src = o.script; s.onload = ok; s.onerror = nein; document.head.appendChild(s); });
  if (!ocrWorker) ocrWorker = await window.Tesseract.createWorker('deu', 1, { workerPath: o.workerPath, corePath: o.corePath, langPath: o.langPath });
  const r = await ocrWorker.recognize(dataUrl);
  return r && r.data ? r.data.text : '';
}

/* Stolperfalle im Trainer: Frage, eigene Antwort, dann ehrliche Antwortlinie */
function falleTrainer(x) {
  const box = $('#trainer-box');
  box.innerHTML = kopfTrainer('Stolperfalle · ' + x.thema)
    + '<h2 style="margin-top:8px">Der Auditor hakt nach:</h2><p style="font-size:1.15rem"><b>' + esc(x.frage) + '</b> <button class="knopf klein zweit" id="t-vor">🔊</button></p>'
    + '<textarea id="t-text" placeholder="Was würden Sie antworten? (Stichworte reichen)"></textarea><div class="zeile"><button class="knopf klein zweit" id="t-diktat">🎤 Diktieren</button></div>'
    + '<div class="zeile" style="margin-top:10px" id="t-knoepfe"><button class="knopf" id="t-zeigen">Empfohlene Antwort zeigen</button></div><div id="t-erg"></div>';
  $('#trainer').style.display = 'flex';
  $('#t-zu').onclick = () => reiheEnde(); $('#t-vor').onclick = () => vorlesen(x.frage);
  diktat($('#t-diktat'), (t) => { $('#t-text').value += ($('#t-text').value ? ' ' : '') + t; });
  $('#t-zeigen').onclick = () => {
    const fb = L.antwortFeedback($('#t-text').value);
    $('#t-knoepfe').innerHTML = '';
    $('#t-erg').innerHTML = (x.warum ? '<p class="grau">Warum der Auditor fragt: ' + esc(x.warum) + '</p>' : '')
      + '<div class="karte gut"><b>So können Sie ehrlich antworten:</b><br>' + esc(x.antwortlinie || '') + '</div>'
      + ($('#t-text').value.trim() && fb.hinweise.length ? '<div class="grau">Zu Ihrer Antwort: ' + fb.hinweise.map(esc).join(' ') + '</div>' : '')
      + '<div class="zeile"><button class="knopf gruen" data-s="sicher">Das kann ich so sagen</button><button class="knopf" style="background:var(--gelb)" data-s="unsicher">Noch unsicher</button></div>';
    $$('[data-s]', box).forEach(b => b.onclick = async () => {
      await speichereEintrag('falle', x.id, { sicherheit: b.dataset.s, text: $('#t-text').value.trim().slice(0, 1000) });
      if (S.queue) S.queue.ergebnis.push(b.dataset.s === 'sicher' ? 'gruen' : 'gelb');
      naechstesItem();
    });
  };
}
ANSICHT.fallen = () => {
  const fallen = fallenFuerStufe();
  $('#main').innerHTML = '<h2>Stolperfallen</h2><p>Diese Nachfragen kommen aus Ihren eigenen Dokumenten – dort, wo etwas nicht zusammenpasst oder noch offen ist. Üben Sie die <b>ehrliche</b> Antwort. Nichts erfinden, nichts schönreden.</p>'
    + '<div class="karte"><button class="knopf" id="alle">▶ Alle Stolperfallen nacheinander üben</button></div>'
    + fallen.map(x => { const e = eintrag('falle', x.id); return '<div class="karte"><div class="zeile" style="justify-content:space-between"><b>' + esc(x.thema) + '</b>' + (e ? '<span class="chip">' + (e.daten.sicherheit === 'sicher' ? '✓ geübt' : '… noch unsicher') + '</span>' : '') + '</div><div>' + esc(x.frage) + '</div><div class="zeile"><button class="knopf klein" data-x="' + esc(x.id) + '">Üben</button>' + (x.stufe === 2 ? '<span class="grau">eher Thema für Stufe 2</span>' : '') + '</div></div>'; }).join('');
  $('#alle').onclick = () => reihe(fallen.map(x => ({ art: 'falle', item: x })), 'Stolperfallen');
  $$('[data-x]').forEach(b => b.onclick = () => reihe([{ art: 'falle', item: fallen.find(x => x.id === b.dataset.x) }], null, false));
};

/* ------------------------------------------------ Lernen: Audit-Deutsch und Rollentausch (Ideen 4, 12) */
ANSICHT.lernen = () => {
  const abk = S.start.dokumente.filter(d => d.kurzname && d.kurzname !== d.titel).map(d => [d.kurzname, d.titel + ' (Ihre Abkürzung)']);
  const karten = abk.concat(L.AUDIT_DEUTSCH);
  const gekonnt = (i) => { const e = eintrag('lernen', 'deutsch:' + i); return e && e.daten.kann; };
  $('#main').innerHTML = '<h2>Lernen</h2>'
    + '<p class="grau">Drei Übungen, jede dauert ein paar Minuten. Sie helfen vor allem für <b>Stufe 2</b>, wenn der Auditor fragt „Wie machen Sie das?“.</p>'
    + '<h3>Erklär es dem Azubi</h3><p class="erkl-kurz"><b>Was ist das?</b> Sie erklären einen Ablauf aus Ihrem Handbuch so, als käme morgen ein neuer Mitarbeiter. Wer es einem Azubi in eigenen Worten erklären kann, kann es auch dem Auditor erklären. Wenn Sie nicht weiterwissen: <b>Musterlösung</b> ansehen.</p><div class="karte" id="azubi"></div>'
    + '<h3>Audit-Deutsch: Was heißt das eigentlich?</h3><p class="erkl-kurz"><b>Was ist das?</b> Lernkarten für Fachwörter, die Auditoren benutzen. Vorne das Fachwort, hinten die Bedeutung in Alltagssprache. Begriff anklicken, dann „Kann ich“ oder „Nochmal“.</p><div class="karten">'
    + karten.map((k, i) => '<div class="lernkarte ' + (gekonnt(i) ? 'kann' : '') + '" data-i="' + i + '"><div class="vorne">' + esc(k[0]) + '</div><div class="hinten" hidden>' + esc(k[1]) + '<div class="zeile"><button class="knopf klein gruen" data-k="1">Kann ich</button><button class="knopf klein zweit" data-k="0">Nochmal</button></div></div></div>').join('') + '</div>'
    + '<h3>Rollentausch: Sie sind der Auditor</h3><p class="erkl-kurz"><b>Was ist das?</b> Hier tauschen Sie die Rollen: Sie lesen eine Antwort, wie sie ein Kunde im Audit geben könnte, und entscheiden wie ein Auditor, ob sie gut ist. Wer den Fehler beim anderen sieht, macht ihn selbst nicht mehr.</p>'
    + L.ROLLENTAUSCH.map((r, i) => { const e = eintrag('lernen', 'rolle:' + i); return '<div class="karte" data-r="' + i + '"><div><b>Auditor:</b> ' + esc(r.frage) + '</div><div><b>Kunde:</b> <i>' + esc(r.antwort) + '</i></div>'
      + Object.entries(r.optionen).map(([k, t]) => '<label class="option"><input type="radio" name="r' + i + '" value="' + k + '" ' + (e && e.daten.wahl === k ? 'checked' : '') + '> ' + esc(t) + '</label>').join('')
      + '<div class="erkl" ' + (e ? '' : 'hidden') + '>' + (e ? (e.daten.wahl === r.richtig ? '✓ Richtig. ' : '✗ Nicht ganz. ') : '') + esc(r.erklaerung) + '</div></div>'; }).join('');
  azubi();
  $$('.lernkarte').forEach(k => { $('.vorne', k).onclick = () => { $('.hinten', k).hidden = !$('.hinten', k).hidden; };
    $$('[data-k]', k).forEach(b => b.onclick = async () => { await speichereEintrag('lernen', 'deutsch:' + k.dataset.i, { kann: b.dataset.k === '1' }); k.classList.toggle('kann', b.dataset.k === '1'); $('.hinten', k).hidden = true; }); });
  $$('.karte[data-r]').forEach(k => $$('input', k).forEach(inp => inp.onchange = async () => {
    const r = L.ROLLENTAUSCH[k.dataset.r]; await speichereEintrag('lernen', 'rolle:' + k.dataset.r, { wahl: inp.value, richtig: inp.value === r.richtig });
    const e = $('.erkl', k); e.hidden = false; e.textContent = (inp.value === r.richtig ? '✓ Richtig. ' : '✗ Nicht ganz. ') + r.erklaerung;
  }));
};

/* Erklaer es dem Azubi: Teach-back ohne KI – eigene Worte statt Handbuch, Beispiele sammeln */
async function azubi(prozessId) {
  const box = $('#azubi'); if (!box) return;
  const prozesse = L.prozesseAusAuszuegen(await auszuege());
  if (!prozesse.length) { box.innerHTML = '<span class="grau">Für Ihre Dokumente sind noch keine Prozesse hinterlegt.</span>'; return; }
  const status = (p) => (eintrag('lernen', 'azubi:' + p.id) || {}).daten || null;
  const p = prozesse.find(x => x.id === prozessId);
  if (!p) {
    box.innerHTML = '<p>Ein neuer Mitarbeiter fängt heute an und kennt sich nicht aus. Erklären Sie ihm einen Ablauf – <b>in Ihren eigenen Worten</b>, mit einem Beispiel vom letzten Mal. Wer es einem Azubi erklären kann, kann es auch dem Auditor erklären. Ihre Unterlagen dürfen Sie daneben offen haben.</p>'
      + '<div class="prozesse">' + prozesse.map(x => { const st = status(x); return '<button class="prozess ' + (st ? (st.note === 'gut' ? 'gut' : 'teil') : '') + '" data-p="' + esc(x.id) + '"><b>' + esc(x.nr) + '</b> ' + esc(x.name) + (st ? '<span class="grau"> · ' + (st.note === 'gut' ? '✓ erklärt' : 'nochmal') + '</span>' : '') + '</button>'; }).join('') + '</div>';
    $$('[data-p]', box).forEach(b => b.onclick = () => azubi(b.dataset.p));
    return;
  }
  const fragen = L.azubiNachfragen(p); const teile = []; let schritt = 0;
  const zeichne = () => {
    const frage = schritt === 0 ? 'Hallo, ich bin Alex, heute ist mein erster Tag. Kannst du mir erklären, wie bei uns „' + p.name + '“ läuft?' : fragen[schritt - 1];
    box.innerHTML = '<div class="zeile" style="justify-content:space-between"><b>' + esc(p.nr + ' ' + p.name) + '</b><button class="link" id="az-zurueck">andere Abläufe</button></div>'
      + teile.map((t, i) => '<div class="az-azubi">🧑‍🔧 ' + esc(i === 0 ? 'Kannst du mir erklären, wie „' + p.name + '“ läuft?' : fragen[i - 1]) + '</div><div class="az-chef">' + esc(t) + '</div>').join('')
      + '<div class="az-azubi">🧑‍🔧 ' + esc(frage) + ' <button class="knopf klein zweit" id="az-vor">🔊</button></div>'
      + '<textarea id="az-text" placeholder="Erklären Sie es so, wie Sie es an der Kaffeemaschine sagen würden"></textarea>'
      + '<div class="zeile"><button class="knopf klein zweit" id="az-diktat">🎤 Diktieren</button><button class="knopf" id="az-weiter">' + (schritt < 2 ? 'Antworten' : 'Fertig') + '</button><span class="grau">Nachfrage ' + Math.min(schritt, 2) + ' von 2</span>'
      + '<button class="link" id="az-quelle">Im Handbuch nachsehen (Seite ' + p.von + (p.bis > p.von ? '–' + p.bis : '') + ')</button><button class="knopf klein zweit" id="az-muster">💡 Musterlösung</button></div><div id="az-quelltext"></div>';
    $('#az-zurueck').onclick = () => azubi();
    $('#az-vor').onclick = () => vorlesen(frage);
    diktat($('#az-diktat'), (t) => { $('#az-text').value += ($('#az-text').value ? ' ' : '') + t; });
    $('#az-muster').onclick = () => { const m = L.musterErklaerung(p, dokTitel(p.dokument_id));
      $('#az-quelltext').innerHTML = '<div class="karte gut"><b>So könnten Sie es erklären</b> <span class="grau">(aus Ihrem Handbuch in gesprochene Sprache übertragen – nicht auswendig lernen, sondern mit eigenen Worten und Ihrem Beispiel)</span><p>' + esc(m.text) + '</p>'
        + (m.schritte.length ? '<div class="grau">Die Schritte im Handbuch: ' + m.schritte.map((x, i) => (i + 1) + '. ' + esc(x.tat)).join(' · ') + '</div>' : '') + '</div>'; };
    $('#az-quelle').onclick = () => { $('#az-quelltext').innerHTML = '<div class="auszug"><div class="auszug-text">' + esc(p.text.slice(0, 1800)).replace(/\n/g, '<br>') + '</div><button class="knopf klein zweit" data-d="' + esc(p.dokument_id) + '">Dokument öffnen</button></div>'; dokKnoepfe($('#az-quelltext')); };
    $('#az-weiter').onclick = async () => {
      const t = $('#az-text').value.trim(); if (!t) { $('#az-text').focus(); return; }
      teile.push(t); schritt++;
      if (schritt <= 2) return zeichne();
      const ges = teile.join(' '), a = L.erklaerungAuswerten(ges, p);
      await speichereEintrag('lernen', 'azubi:' + p.id, { note: a.note, nachplappern: a.nachplappern, beispiel: a.beispiel, woerter: a.woerter, text: ges.slice(0, 3000) });
      box.innerHTML = '<div class="zeile" style="justify-content:space-between"><b>' + esc(p.nr + ' ' + p.name) + '</b><button class="link" id="az-zurueck">andere Abläufe</button></div>'
        + '<div class="az-azubi">🧑‍🔧 Danke, jetzt hab ich’s verstanden!</div>'
        + '<div class="karte ' + (a.note === 'gut' ? 'gut' : '') + '"><b>' + (a.note === 'gut' ? 'Klasse erklärt: eigene Worte und ein echtes Beispiel.' : a.note === 'ok' ? 'Gut erklärt.' : 'Daran können Sie noch feilen:') + '</b>'
        + (a.hinweise.length ? '<ul>' + a.hinweise.map(h => '<li>' + esc(h) + '</li>').join('') + '</ul>' : '')
        + '<div class="grau">Eigene Worte: ' + Math.round((1 - a.nachplappern) * 100) + ' % · Beispiel: ' + (a.beispiel ? 'ja' : 'nein') + '</div></div>'
        + (a.beispiel ? '<div class="karte"><b>Ihr Beispiel für das Audit merken?</b><textarea id="az-bsp">' + esc(beispielSatz(ges)) + '</textarea><button class="knopf klein" id="az-merken">In die Beispielkiste</button></div>' : '')
        + '<div class="zeile"><button class="knopf zweit" id="az-nochmal">Nochmal erklären</button></div>';
      $('#az-zurueck').onclick = () => azubi(); $('#az-nochmal').onclick = () => azubi(p.id);
      const m = $('#az-merken'); if (m) m.onclick = async () => { await speichereEintrag('lernen', 'beispiel:' + p.id, { prozess: p.name, text: $('#az-bsp').value.trim().slice(0, 600) }); m.textContent = 'Gemerkt ✓ – steht jetzt auf dem Spickzettel'; };
    };
  };
  zeichne();
}
function beispielSatz(t) { const s = String(t).split(/(?<=[.!?])\s+/); const i = s.findIndex(x => /(zum Beispiel|z\. ?B\.|letzte|zuletzt|im (Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)|20\d\d|neulich)/i.test(x)); return (i >= 0 ? s.slice(i, i + 2) : s.slice(0, 2)).join(' '); }

/* ------------------------------------------------ Beispielauftrag: Spurensuche (Idee 8) */
ANSICHT.spur = () => {
  const st = L.SPUR_STATIONEN.map(s => Object.assign({ k: s.k }, (eintrag('spur', s.k) || {}).daten || {}));
  const pr = L.spurPruefen(st.filter(x => Object.keys(x).length > 1));
  $('#main').innerHTML = '<h2>Beispielauftrag: der rote Faden</h2><p>In Stufe 2 nimmt der Auditor oft <b>einen</b> abgeschlossenen Auftrag und verfolgt ihn durch die Firma. Suchen Sie jetzt einen aus und legen Sie zu jeder Station den Beleg bereit. Datum und Nummer genügen – das Programm prüft, ob der Faden hält.</p>'
    + '<div class="karte ' + (pr.ok ? 'gut' : '') + '"><b>' + pr.fertig + ' von ' + pr.von + ' Stationen</b>' + (pr.hinweise.length ? '<ul>' + pr.hinweise.map(h => '<li>' + esc(h) + '</li>').join('') + '</ul>' : ' – der rote Faden hält. Diese Belege zeigen Sie im Audit.') + '</div>'
    + L.SPUR_STATIONEN.map((s, i) => { const d = st[i]; return '<div class="karte station" data-k="' + s.k + '"><div class="zeile" style="justify-content:space-between"><b>' + (i + 1) + '. ' + esc(s.name) + '</b>' + (d.foto ? '<span class="chip">Beleg ✓</span>' : '') + '</div><div class="grau">' + esc(s.hilfe) + '</div>'
      + '<div class="zeile"><label>Datum <input type="date" data-f="datum" value="' + esc(d.datum || '') + '"></label><label>Kunden-/Auftragsnr. <input data-f="nummer" value="' + esc(d.nummer || '') + '" size="12"></label></div>'
      + '<input data-f="notiz" placeholder="Was ist das für ein Beleg? (z. B. Angebot Nr. 2026-041)" value="' + esc(d.notiz || '') + '" style="width:100%">'
      + '<div class="zeile"><label class="knopf klein zweit">📷 Foto/Scan<input type="file" accept="image/*" capture="environment" hidden data-f="foto"></label><button class="knopf klein zweit" data-b="1">🖥 Bildschirmfoto</button><button class="knopf klein" data-s="1">Speichern</button></div>'
      + (d.foto ? '<img class="mini" src="' + d.foto + '" alt="Beleg">' : '') + '</div>'; }).join('');
  $$('.station').forEach(k => {
    const s = L.SPUR_STATIONEN.find(x => x.k === k.dataset.k);
    let foto = ((eintrag('spur', s.k) || {}).daten || {}).foto || '';
    const sichern = async () => { await speichereEintrag('spur', s.k, { datum: $('[data-f=datum]', k).value, nummer: $('[data-f=nummer]', k).value.trim(), notiz: $('[data-f=notiz]', k).value.trim(), foto }, true); zeichneKopf(); ANSICHT.spur(); };
    $('[data-f=foto]', k).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; foto = await verkleinern(await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }), 480); sichern(); };
    $('[data-b]', k).onclick = async () => { const st2 = await teilen(); if (!st2) return; const b = await bildschirmfoto(st2); if (b) { foto = await verkleinern(b, 480); sichern(); } };
    $('[data-s]', k).onclick = sichern;
  });
};

/* ------------------------------------------------ Foto-Rundgang (Idee 10) */
ANSICHT.rundgang = () => {
  const items = S.start.rundgang || L.RUNDGANG_STANDARD;
  $('#main').innerHTML = '<h2>Foto-Rundgang</h2><p>Gehen Sie mit dem Handy durch Lager und Fahrzeug und fotografieren Sie die Prüfplaketten. Tragen Sie den Monat der <b>nächsten</b> Prüfung ein (steht auf der Plakette) – das Programm zeigt, was fällig ist. Das fragt der Auditor in Stufe 2.</p>'
    + items.map(it => { const d = (eintrag('rundgang', it.k) || {}).daten || {}; const s = L.rundgangStatus(Object.assign({ intervall_monate: it.intervall_monate }, d));
      return '<div class="karte rg" data-k="' + esc(it.k) + '"><div class="zeile" style="justify-content:space-between"><b>' + esc(it.name) + '</b><span class="chip ' + s.status + '">' + ({ ok: '✓ in Ordnung', bald: 'diesen Monat fällig', faellig: '⚠ überfällig', offen: 'offen' }[s.status]) + (s.naechste ? ' · ' + s.naechste.split('-').reverse().join('/') : '') + '</span></div><div class="grau">' + esc(it.hilfe) + '</div>'
        + '<div class="zeile"><label>Nächste Prüfung <input type="month" data-f="naechste" value="' + esc(d.naechste || '') + '"></label><span class="grau">oder</span><label>letzte Prüfung <input type="month" data-f="letzte" value="' + esc(d.letzte || '') + '"></label></div>'
        + '<div class="zeile"><label class="knopf klein zweit">📷 Foto<input type="file" accept="image/*" capture="environment" hidden data-f="foto"></label><button class="knopf klein" data-s="1">Speichern</button></div>'
        + (d.foto ? '<img class="mini" src="' + d.foto + '" alt="Foto">' : '') + '</div>'; }).join('');
  $$('.rg').forEach(k => {
    let foto = ((eintrag('rundgang', k.dataset.k) || {}).daten || {}).foto || '';
    const sichern = async () => { await speichereEintrag('rundgang', k.dataset.k, { naechste: $('[data-f=naechste]', k).value, letzte: $('[data-f=letzte]', k).value, foto }, true); ANSICHT.rundgang(); };
    $('[data-f=foto]', k).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; foto = await verkleinern(await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }), 480); sichern(); };
    $('[data-s]', k).onclick = sichern;
  });
};

/* ------------------------------------------------ Audit-Tag: Ablauf + Spickzettel (P08, Idee 2) */
ANSICHT.tag = () => {
  const a = S.audit, ab = L.ABLAUF[a.stufe] || L.ABLAUF[1], st = L.STUFEN[a.stufe] || L.STUFEN[1];
  const kennen = S.start.dokumente.filter(d => d.wichtigkeit === 'kennen'), abk = S.start.dokumente.filter(d => d.kurzname && d.kurzname !== d.titel);
  const bsp = S.antworten.filter(x => x.ist_beispiel && x.text).concat(beispielKiste().map(e => ({ text: e.daten.text, prozess: e.daten.prozess })));
  const B = a.stufe === 1 ? bloecke() : [];
  const ma = S.ma, meine = S.planpunkte.filter(p => !ma || !(p.mitarbeiter_ids || []).length || p.mitarbeiter_ids.indexOf(ma.id) >= 0);
  $('#main').innerHTML = (S.ruhe ? '<div class="ruhe"><b>Ruhemodus.</b> ' + esc(L.ABLAUF.ruhe) + ' <button class="link" id="trotz">Trotzdem weiter üben</button></div>' : '')
    + '<div class="kein-druck"><h2>' + esc(ab.titel) + '</h2><div class="karte"><p><b>' + esc(st.titel) + '</b> ' + esc(ab.kurz) + '</p><ul>' + ab.regeln.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></div></div>'
    + '<div class="kein-druck">' + pdfSicherungHtml() + '</div>'
    + '<div class="kein-druck"><h2>Spickzettel</h2><p><b>Wozu?</b> Den Zettel legen Sie im Audit neben den Laptop. <b>Lernen müssen Sie ihn nicht.</b> Er zeigt je Programmpunkt des Auditplans, welche Dokumente Sie aufmachen – so finden Sie alles schnell, auch wenn Sie nervös sind. Die Seitenangaben sind anklickbar und öffnen die PDF-Kopie direkt an der Stelle.</p><button class="knopf" id="drucken">Drucken / als PDF speichern</button></div>'
    + '<div class="karte spickzettel"><div class="spick-kopf"><b>' + esc(S.start.kunde.name) + '</b> · Stufe ' + a.stufe + ' · ' + esc(datumDe(a.datum)) + (a.auditor ? ' · Auditor ' + esc(a.auditor) : '') + (ma ? ' · für ' + esc(ma.name) : '') + '</div>'
    + '<div class="spick-box"><b>Diese Dokumente den ganzen Tag offen haben:</b> ' + kennen.map(d => esc(d.titel) + (d.stand ? ' <span class="grau">(' + esc(d.stand) + ')</span>' : '')).join(' · ')
    + (abk.length ? '<br><span class="grau">Abkürzungen: ' + abk.map(d => esc(d.kurzname) + ' = ' + esc(d.titel)).join(' · ') + '</span>' : '') + '</div>'
    + (B.length ? B.map(b => '<div class="spick-block"><div class="spick-zeit"><b>' + esc(b.punkt.zeit || '') + '</b> ' + esc(b.punkt.thema) + '</div>'
        + (b.fragen.length ? '<table class="spick">' + b.fragen.map(f => '<tr><td class="np">' + esc(f.normkapitel || '') + '</td><td>' + esc(f.titel || String(f.frage).slice(0, 60)) + '</td><td>' + orteLinks(f) + '</td></tr>').join('') + '</table>'
          : '<div class="grau">' + (/eröffnung/i.test(b.punkt.thema) ? 'Sich vorstellen: Firma, Entwicklung, Mitarbeiter. Geltungsbereich: Handbuch Seite 3.' : /abschluss/i.test(b.punkt.thema) ? 'Zuhören, mitschreiben, Fragen stellen.' : '') + '</div>') + '</div>').join('')
      : '<div class="spick-block"><div class="spick-zeit"><b>Ablauf</b></div>' + meine.map(p => '<div>' + esc(p.zeit || '') + ' · ' + esc(p.thema) + '</div>').join('') + '</div>')
    + (bsp.length ? '<div class="spick-box"><b>Meine Beispiele:</b>' + bsp.map(x => { const f = S.fragen.find(y => y.id === x.frage_id) || {}; return '<div>• <b>' + esc(x.prozess || f.titel || f.normkapitel || '') + ':</b> ' + esc(x.text) + '</div>'; }).join('') + '</div>' : '')
    + '<div class="spick-box"><b>Merksätze:</b> Zeigen statt erzählen · Nichts erfinden · Der Auditor hilft beim Finden · Nur gültige Dokumente öffnen · „Das schaue ich nach“ ist erlaubt</div></div>';
  $('#drucken').onclick = () => window.print();
  dokKnoepfe($('#main'));
  const t = $('#trotz'); if (t) t.onclick = () => { S.trotzRuhe = true; laden(); };
};

/* ------------------------------------------------ Nach dem Audit: Rueckmeldung + Ergebnis an den Berater (Ideen 1, 8, 11) */
ANSICHT.danach = () => {
  const r = (eintrag('rueckmeldung', 'audit') || {}).daten || {};
  const k = S.start.kunde;
  $('#main').innerHTML = '<h2>Nach dem Audit</h2><p>Direkt danach kurz festhalten – das hilft bei der Vorbereitung auf die nächste Stufe und für das nächste Jahr.</p>'
    + '<div class="karte"><label><b>Wie war der Auditor?</b><select id="r-typ"><option value="">– bitte wählen –</option>' + Object.entries(L.AUDITOR_TYPEN).map(([k2, t]) => '<option value="' + k2 + '" ' + (r.typ === k2 ? 'selected' : '') + '>' + esc(t.name) + ' – ' + esc(t.text) + '</option>').join('') + '</select></label>'
    + '<label><b>Welche Fragen kamen?</b> <span class="grau">(eine pro Zeile, so wörtlich wie möglich)</span><textarea id="r-fragen" rows="6">' + esc(r.fragen || '') + '</textarea></label>'
    + '<label><b>Was lief gut?</b><textarea id="r-gut">' + esc(r.gut || '') + '</textarea></label>'
    + '<label><b>Wo war es schwer?</b><textarea id="r-schwer">' + esc(r.schwer || '') + '</textarea></label>'
    + '<label><b>Was hat der Auditor festgestellt?</b> <span class="grau">(Hinweise, Abweichungen)</span><textarea id="r-fest">' + esc(r.fest || '') + '</textarea></label>'
    + '<button class="knopf" id="r-speichern">Speichern</button></div>'
    + '<h3>Ergebnis an Ihren Berater</h3><div class="karte">'
    + (api.lokal && !S.start.demo ? '<p>Ihr Fortschritt liegt nur in diesem Browser. Schicken Sie ihn Ihrem Berater: Datei herunterladen und an die E-Mail anhängen.</p><div class="zeile"><button class="knopf" id="r-export">Datei herunterladen</button>'
      + (k.berater_email ? '<a class="knopf zweit" id="r-mail" href="#">E-Mail vorbereiten</a>' : '') + '</div><p class="grau">Es wird nichts automatisch verschickt.</p>'
      : S.start.demo ? '<p class="grau">Demo – hier würde der Kunde sein Ergebnis an den Berater schicken.</p>' : '<p>Ihre Angaben sind gespeichert – Ihr Berater sieht sie.</p>') + '</div>';
  $('#r-speichern').onclick = async () => {
    await speichereEintrag('rueckmeldung', 'audit', { typ: $('#r-typ').value, fragen: $('#r-fragen').value, gut: $('#r-gut').value, schwer: $('#r-schwer').value, fest: $('#r-fest').value });
    if ($('#r-typ').value) await speichereEintrag('auditor', 'typ', { typ: $('#r-typ').value, quelle: 'rueckmeldung' });
    hinweisBox('Gespeichert. Danke!', 'ok');
  };
  const ex = $('#r-export'); if (ex) ex.onclick = () => herunterladen();
  const ml = $('#r-mail'); if (ml) ml.onclick = (e) => {
    e.preventDefault(); herunterladen();
    const re = reife(), z = stand();
    const text = 'Hallo ' + (k.berater_name || '') + ',\n\nanbei mein Stand der Auditvorbereitung (Datei im Anhang).\n\nPrüfungsreife: ' + re.prozent + ' %\nFahrplan/Fragen: ' + z.gruen + ' sicher, ' + z.gelb + ' mit Hilfe, ' + z.rot + ' weiß nicht, ' + z.offen + ' offen\n\nViele Grüße\n' + (S.ma ? S.ma.name : '');
    location.href = 'mailto:' + encodeURIComponent(k.berater_email) + '?subject=' + encodeURIComponent('Auditvorbereitung ' + k.name) + '&body=' + encodeURIComponent(text);
  };
};
function herunterladen() {
  const daten = api.export(); const blob = new Blob([JSON.stringify(daten, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Auditvorbereitung_' + S.start.kunde.name.replace(/[^A-Za-z0-9ÄÖÜäöüß]+/g, '_').slice(0, 40) + '_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

window.__av = S; // fuer Tests
start();
