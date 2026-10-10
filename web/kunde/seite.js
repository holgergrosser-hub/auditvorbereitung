/**
 * Kundenseite Auditvorbereitung – gesamte Oberflaeche.
 * Datenquelle: Edge Function "kunde" (persoenlicher Link ?t=…), Paket (Testfassung ohne Server) oder Demo.
 * Bausteine: Heute · Technik · Fakten · Fahrplan/Fragen (Zeig mal, Generalprobe, Auditor-Typ) · Stolperfallen ·
 * Finden (Wo steht das?) · Lernen (Audit-Deutsch, Rollentausch) · Beispielauftrag · Rundgang · Audit-Tag · Danach
 */
import L from '../logik.js';
import { erstelleDemo } from './demo.js';
import { lokaleApi } from './lokal.js';
import * as E from './eigene.js';
import { MARKE, fussHtml } from './marke.js';
import { probeaudit } from './probeaudit.js';

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
      headers: kopfzeilen(),
      body: JSON.stringify(Object.assign({}, daten, { t: token, aktion })) });
    const j = await r.json().catch(() => ({ fehler: 'Keine Verbindung' }));
    if (!r.ok || j.fehler) throw new Error(j.fehler || ('Fehler ' + r.status));
    return j;
  };
  return f;
}

// Neue Supabase-Schlüssel (sb_publishable_…) sind kein JWT: dann nur "apikey" senden, sonst zusätzlich "authorization"
function kopfzeilen() { const h = { 'content-type': 'application/json', apikey: cfg.anonKey }; if (/^eyJ/.test(cfg.anonKey || '')) h.authorization = 'Bearer ' + cfg.anonKey; return h; }
const kiAn = () => !!(cfg.supabaseUrl && cfg.ki && token);
/* KI nur im Servermodus und wenn eingeschaltet (config.js: ki: true); sonst laufen die Regeln ohne KI */
async function ki(aktion, daten) {
  if (!cfg.supabaseUrl || !cfg.ki || !token) return null;
  try {
    const r = await fetch(cfg.supabaseUrl + '/functions/v1/ki', { method: 'POST', headers: kopfzeilen(),
      body: JSON.stringify(Object.assign({}, daten, { t: token, aktion })) });
    const j = await r.json(); return r.ok && !j.fehler ? j : null;
  } catch (e) { return null; }
}

const S = { start: null, audit: null, ma: null, fragen: [], planpunkte: [], antworten: [], eintraege: [], auszuege: null, ansicht: 'heute', stream: null, filter: 'alle', trotzRuhe: false, queue: null };
const KAPITEL = { '0': 'Zum Einstieg: Überblick über Ihre Dokumentation', '4': '4 Kontext der Organisation', '5': '5 Führung', '6': '6 Planung', '7': '7 Unterstützung', '8': '8 Betrieb', '9': '9 Bewertung der Leistung', '10': '10 Verbesserung' };
const datumDe = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Termin noch offen';
const kurzDatum = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE') : 'offen';

/* Eigene Dokumente: Übungen laufen über die lokale Schnittstelle (Browser), an den Server gehen nur Verbesserungsvorschläge */
function eigeneApi(server, paket, test) {
  const lokal = lokaleApi(L, paket, { schluessel: 'eigen_' + E.ablage(token) });
  const f = async (aktion, d) => {
    if (aktion === 'start') return Object.assign(await lokal('start'), { test, eigen: true });
    if (aktion === 'nachricht') {
      if (!d || d.art !== 'feedback') throw new Error('Mit eigenen Dokumenten geht nichts an den Berater – nur Ihre Verbesserungsvorschläge.');
      return server('nachricht', Object.assign({}, d, { mitarbeiter_id: null })); // Namen/IDs vom Gerät gehen nicht mit
    }
    const j = await lokal(aktion, d); if (j && j.fehler) throw new Error(j.fehler); return j;
  };
  f.lokal = true; f.eigen = true; f.export = lokal.export; f.speicherWarnung = lokal.speicherWarnung;
  return f;
}
/* KI mit eigenen Dokumenten: die passenden Textstellen von diesem Gerät mitgeben (der Server speichert sie nicht) */
async function eigeneAuszuege(text, max) {
  if (!S.start || !S.start.eigen) return null;
  return L.auszuegeSuchen(text, await auszuege(), max || 8).map(x => ({ dokument_id: x.auszug.dokument_id, ort: x.auszug.ort, titel: dokTitel(x.auszug.dokument_id), text: String(x.auszug.text).slice(0, 1400) }));
}

/* Name des Beraters statt "Ihr Berater" (aus dem Paket: kunde.berater_name) */
function bn(fall) { const n = S.start && S.start.kunde && S.start.kunde.berater_name; return n || { nom: 'Ihr Berater', dat: 'Ihrem Berater', akk: 'Ihren Berater', kurz: 'Berater' }[fall]; }
function fehler(e) { $('#main').innerHTML = '<div class="karte"><h2>Das hat nicht geklappt</h2><p>' + esc(e.message || e) + '</p><p class="grau">Bitte melden Sie sich bei ' + esc(bn('dat')) + '.</p></div>'; }
function hinweisBox(t, art) { const d = document.createElement('div'); d.className = art === 'ok' ? 'ok-box' : 'hinweis'; d.textContent = t; $('#main').prepend(d); setTimeout(() => d.remove(), 9000); }

async function start() {
  const fu = $('#fuss'); if (fu) fu.innerHTML = fussHtml();
  try { api = await verbinden(); } catch (e) { return fehler(e); }
  if (!api.lokal && !token) return fehler(new Error('Bitte öffnen Sie den persönlichen Link aus Ihrer E-Mail.'));
  try { S.start = await api('start'); } catch (e) { return fehler(e); }
  // Testmonat: Beispielfirma (Server) oder eigene Dokumente (nur in diesem Browser, E-A33)
  if (S.start.test && !api.eigen) {
    const m = E.modus(token);
    $('#modus').textContent = 'Kostenloser Testmonat';
    if (!m) { $('#wahl').hidden = true; return E.auswahlZeigen($('#main'), token, start); }
    if (m === 'eigen') {
      const paket = await E.paketLaden(token);
      if (!paket) { $('#wahl').hidden = true; return E.einrichtenZeigen($('#main'), L, token, start); }
      api = eigeneApi(api, paket, S.start.test);
      try { S.start = await api('start'); } catch (e) { return fehler(e); }
    }
  }
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
  else if (st.test) $('#modus').textContent = testZeile();
  else if (!api.lokal) $('#modus').textContent = 'Ihre Eingaben werden gespeichert – Sie können mit diesem Link auf jedem Gerät weiterüben. ' + bn('nom') + ' sieht Ihren Stand.';
  else if (api.lokal) $('#modus').textContent = 'Ihre Eingaben bleiben auf diesem Gerät (immer denselben Laptop und Browser nutzen). ' + bn('nom') + ' sieht sie, wenn Sie oben rechts senden.';
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
    + (!S.start.demo && !S.start.eigen ? '<button class="kopf-senden kein-druck" id="kopf-senden" title="Übungsstand und Nachricht an ' + esc(bn('akk')) + ' schicken">✉ An ' + esc(bn('kurz')) + ' senden</button>' : '');
  const ks = $('#kopf-senden'); if (ks) ks.onclick = sendenPanel;
  if (S.start.test) { $('#reife').insertAdjacentHTML('beforeend', '<button class="kopf-senden kein-druck" id="kopf-feedback" title="Was sollen wir verbessern?">💡 Verbesserung</button>'); $('#kopf-feedback').onclick = feedbackPanel; }
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
    ['fahrplan', (zwei ? 'Fragen üben' : 'Fahrplan') + ' <span class="zahl">' + (S.fragen.length - z.offen) + '/' + S.fragen.length + '</span>'], ['probeaudit', 'Probeaudit']];
  if (fallenFuerStufe().length) t.push(['fallen', 'Stolperfallen']);
  t.push(['finden', 'Wo steht das?'], ['lernen', 'Lernen']);
  if (zwei) t.push(['spur', 'Beispielauftrag'], ['rundgang', 'Rundgang']);
  t.push(['tag', 'Audit-Tag'], ['danach', 'Nach dem Audit']);
  return t;
}
/* Bereiche mit eigener Farbe: Übersicht zuerst, dann ins Detail. Ampel-Farben (grün/gelb/rot) bleiben für den Stand reserviert. */
const GRUPPEN = [
  { id: 'einrichten', name: 'Einrichten', nr: '1', farbe: '#6741D9', hell: '#F3F0FF', keys: ['technik', 'fakten'] },
  { id: 'ueben', name: 'Üben', nr: '2', farbe: '#0B7285', hell: '#E3FAFC', keys: ['fahrplan', 'probeaudit', 'fallen', 'lernen', 'spur', 'rundgang'] },
  { id: 'audit', name: 'Audit-Tag', nr: '3', farbe: '#1F4E79', hell: '#E7F0FA', keys: ['tag', 'danach'] },
  { id: 'finden', name: 'Nachschlagen', nr: '', farbe: '#D9480F', hell: '#FFF4E6', keys: ['finden'] }
];
const KACHEL = {
  technik: ['💻', 'Technik-Check', 'Laptop, Chrome, Dokumente öffnen, Bildschirm teilen'],
  fakten: ['✔️', 'Faktencheck', 'Stimmen Namen, Rollen und Zahlen in Ihren Dokumenten?'],
  fahrplan: ['🧭', 'Fahrplan', 'Auditplan durchgehen und zu jeder Frage das Dokument zeigen'],
  probeaudit: ['🎙️', 'Probeaudit', 'Der Auditor fragt laut – Sie antworten mit Stimme'],
  fallen: ['⚠️', 'Stolperfallen', 'Nachfragen, die aus Ihren eigenen Dokumenten kommen'],
  lernen: ['🎓', 'Lernen', 'Abläufe erklären, Audit-Deutsch, Rollentausch'],
  spur: ['📦', 'Beispielauftrag', 'Ein Auftrag von Anfrage bis Rechnung mit Belegen'],
  rundgang: ['🧯', 'Rundgang', 'Prüfplaketten fotografieren – was ist fällig?'],
  finden: ['🔎', 'Wo steht das?', 'In Ihren Dokumenten suchen – auch im Audit erlaubt'],
  tag: ['📋', 'Spickzettel & Ablauf', 'So läuft Ihr Audit, alle Unterlagen als PDF'],
  danach: ['📨', 'Nach dem Audit', 'Fragen festhalten und Ergebnis senden']
};
function gruppeVon(k) { return GRUPPEN.find(g => g.keys.indexOf(k) >= 0) || null; }
function farbeSetzen(k) { const g = gruppeVon(k), r = document.documentElement.style; r.setProperty('--f', g ? g.farbe : '#1F4E79'); r.setProperty('--f-hell', g ? g.hell : '#EEF4FA'); }
function brotkrume(k) {
  const el = $('#brot'); if (!el) return; const g = gruppeVon(k);
  if (!g || S.ruhe) { el.hidden = true; return; }
  el.hidden = false; el.innerHTML = '<button class="link" id="brot-zurueck">‹ Übersicht</button><span class="brot-gruppe">' + esc(g.name) + '</span><span class="grau">›</span><b>' + esc((KACHEL[k] || [])[1] || '') + '</b>';
  $('#brot-zurueck').onclick = () => zeige('heute');
}
function kachelStatus(k) {
  const z = stand(), n = S.fragen.length;
  if (k === 'technik') { const c = S.start.kunde.technik_check || {}, d = ['laptop', 'chrome', 'dokument_offen', 'bildschirm'].filter(x => c[x]).length; return { text: d + ' von 4 erledigt', anteil: d / 4 }; }
  if (k === 'fakten') { const f = S.start.faktencheck, d = f.filter(x => x.antwort).length, korr = f.filter(x => x.antwort === 'stimmt_nicht').length; return { text: f.length ? d + ' von ' + f.length + ' geprüft' + (korr ? ' · ' + korr + ' korrigiert' : '') : 'nichts zu prüfen', anteil: f.length ? d / f.length : 1 }; }
  if (k === 'fahrplan') return { text: (n - z.offen) + ' von ' + n + ' geübt' + (z.rot ? ' · ' + z.rot + ' schwer' : ''), anteil: n ? (n - z.offen) / n : 0, ampel: z };
  if (k === 'fallen') { const f = fallenFuerStufe(), d = f.filter(x => eintrag('falle', x.id)).length; return { text: d + ' von ' + f.length + ' durchgespielt', anteil: f.length ? d / f.length : 1 }; }
  if (k === 'probeaudit') { const d = S.eintraege.filter(e => e.art === 'lernen' && /^probeaudit:/.test(e.schluessel)).length; return { text: d ? d + (d === 1 ? ' Probeaudit' : ' Probeaudits') + ' gemacht' : 'noch nicht begonnen', anteil: null }; }
  if (k === 'lernen') { const d = S.eintraege.filter(e => e.art === 'lernen' && /^azubi:/.test(e.schluessel)).length; return { text: d ? d + (d === 1 ? ' Ablauf' : ' Abläufe') + ' erklärt' : 'noch nicht begonnen', anteil: null }; }
  if (k === 'spur') { const sp = L.spurPruefen(L.SPUR_STATIONEN.map(x => Object.assign({ k: x.k }, (eintrag('spur', x.k) || {}).daten || {})).filter(x => Object.keys(x).length > 1)); return { text: sp.fertig + ' von ' + sp.von + ' Stationen', anteil: sp.von ? sp.fertig / sp.von : 0 }; }
  if (k === 'rundgang') { const it = S.start.rundgang || L.RUNDGANG_STANDARD, d = it.filter(x => eintrag('rundgang', x.k)).length; return { text: d + ' von ' + it.length + ' erfasst', anteil: it.length ? d / it.length : 0 }; }
  if (k === 'finden') return { text: S.start.dokumente.length + ' Dokumente durchsuchbar', anteil: null };
  if (k === 'tag') { const t = L.tageBis(S.audit.datum); return { text: t != null && t >= 0 ? (t === 0 ? 'heute!' : 'in ' + t + (t === 1 ? ' Tag' : ' Tagen')) : 'Spickzettel bereit', anteil: null }; }
  if (k === 'danach') { const e = eintrag('rueckmeldung', 'audit'); return { text: e ? 'Rückmeldung gespeichert' : 'nach dem Audit ausfüllen', anteil: e ? 1 : null }; }
  return { text: '', anteil: null };
}
function kachelHtml(k, g) {
  const st = kachelStatus(k), ki = KACHEL[k] || ['', k, ''], fertig = st.anteil === 1;
  const balken = st.ampel ? '<div class="mini-balken">' + ['gruen', 'gelb', 'rot', 'offen'].map(f => st.ampel[f] ? '<span class="' + f + '" style="flex:' + st.ampel[f] + '"></span>' : '').join('') + '</div>'
    : st.anteil != null ? '<div class="mini-balken"><span class="voll" style="flex:' + st.anteil + '"></span><span class="offen" style="flex:' + (1 - st.anteil) + '"></span></div>' : '';
  return '<button class="kachel' + (fertig ? ' fertig' : '') + '" data-k="' + k + '" style="--f:' + g.farbe + ';--f-hell:' + g.hell + '"><span class="k-icon" aria-hidden="true">' + ki[0] + '</span><span class="k-titel">' + esc(ki[1]) + (fertig ? ' <span class="k-ok">✓</span>' : '') + '</span>'
    + '<span class="k-text">' + esc(ki[2]) + '</span><span class="k-status">' + esc(st.text) + '</span>' + balken + '</button>';
}
/* Kleiner Fortschrittskreis (Schrittanzeige wie "2 von 4") */
function miniRing(anteil, text) {
  const u = 2 * Math.PI * 9, a = Math.max(0, Math.min(1, anteil || 0));
  return '<span class="mini-ring"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="var(--rand)" stroke-width="3.5"/>'
    + (a ? '<circle cx="12" cy="12" r="9" fill="none" stroke="var(--f)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="' + (u * a).toFixed(1) + ' ' + u.toFixed(1) + '" transform="rotate(-90 12 12)"/>' : '') + '</svg>' + esc(text) + '</span>';
}
function reifeRing(r) {
  const u = 2 * Math.PI * 34, farbe = r.stufe === 'bereit' ? 'var(--gruen)' : r.stufe === 'fast' ? 'var(--gelb)' : '#0B7285';
  return '<svg viewBox="0 0 84 84" class="ring" aria-hidden="true"><circle cx="42" cy="42" r="34" fill="none" stroke="var(--rand)" stroke-width="9"/><circle cx="42" cy="42" r="34" fill="none" stroke="' + farbe + '" stroke-width="9" stroke-linecap="' + (r.prozent ? 'round' : 'butt') + '" stroke-dasharray="' + (r.prozent ? u * r.prozent / 100 : 0).toFixed(1) + ' ' + u.toFixed(1) + '" transform="rotate(-90 42 42)"/><text x="42" y="48" text-anchor="middle" font-size="19" font-weight="700" fill="var(--text)">' + r.prozent + '%</text></svg>';
}
/* Untere Leiste am Handy: vier feste Ziele + "Mehr" (alle übrigen Bereiche) */
const UNTEN = [['heute', '🏠', 'Heute'], ['fahrplan', '🧭', 'Üben'], ['finden', '🔎', 'Nachschlagen'], ['tag', '📋', 'Audit-Tag']];
function zeichneUnten() {
  const el = $('#unten'); if (!el) return;
  const da = tabs().map(t => t[0]);
  const aktiv = (k) => S.ansicht === k;
  const vier = UNTEN.filter(u => da.indexOf(u[0]) >= 0), rest = tabs().filter(t => !UNTEN.some(u => u[0] === t[0]));
  el.innerHTML = vier.map(u => '<button data-unten="' + u[0] + '" class="' + (aktiv(u[0]) ? 'an' : '') + '"><span aria-hidden="true">' + u[1] + '</span>' + u[2] + '</button>').join('')
    + (rest.length ? '<button data-unten="mehr" class="' + (rest.some(t => t[0] === S.ansicht) ? 'an' : '') + '"><span aria-hidden="true">⋯</span>Mehr</button>' : '');
  el.hidden = false;
  $$('[data-unten]', el).forEach(b => b.onclick = () => {
    if (b.dataset.unten !== 'mehr') return zeige(b.dataset.unten);
    const blatt = $('#mehr-blatt'); if (!blatt) return;
    blatt.innerHTML = '<div class="blatt-innen"><div class="zeile" style="justify-content:space-between"><b>Weitere Bereiche</b><button class="link" id="blatt-zu">schließen</button></div>'
      + rest.map(t => { const gg = gruppeVon(t[0]); return '<button class="blatt-ziel" data-ziel="' + t[0] + '" style="--f:' + (gg ? gg.farbe : '#1B2733') + '"><span class="punkt"></span>' + t[1] + '</button>'; }).join('') + '</div>';
    blatt.hidden = false;
    $('#blatt-zu').onclick = () => { blatt.hidden = true; };
    blatt.onclick = (e) => { if (e.target === blatt) blatt.hidden = true; };
    $$('[data-ziel]', blatt).forEach(z => z.onclick = () => { blatt.hidden = true; zeige(z.dataset.ziel); });
  });
}
function zeichneNav() {
  $('#nav').innerHTML = tabs().map(([k, t]) => { const g = gruppeVon(k); return '<button data-k="' + k + '" class="' + (S.ansicht === k ? 'an' : '') + '" style="--f:' + (g ? g.farbe : '#1B2733') + '">' + (g ? '<span class="punkt"></span>' : '') + t + '</button>'; }).join('');
  $('#nav').hidden = false;
  $$('#nav button').forEach(b => b.onclick = () => zeige(b.dataset.k));
  zeichneUnten();
}
const ANSICHT = {};
function zeige(k) { if (S.paStopp) { S.paStopp(); S.paStopp = null; } S.ansicht = k; farbeSetzen(k); $('#main').classList.toggle('breit', k === 'heute'); brotkrume(k); zeichneNav(); (ANSICHT[k] || ANSICHT.heute)(); window.scrollTo(0, 0); }
function brauchtMa(titel) { if (S.ma) return false; $('#main').innerHTML = '<h2>' + titel + '</h2><div class="hinweis">Bitte oben bei „Wer übt?“ Ihren Namen wählen.</div>'; return true; }

/* ------------------------------------------------ Heute (Tageslektion, Aufgaben, Reife) */
ANSICHT.heute = () => {
  const r = reife(), z = stand();
  const lektion = S.ma ? L.tageslektion(S.fragen, S.antworten, 3) : [];
  const aufgaben = (S.start.aufgaben || []).filter(a => !a.bis_stufe || a.bis_stufe >= S.audit.stufe);
  const offeneAufg = aufgaben.filter(a => { const e = eintrag('aufgabe', a.id); return !(e && e.daten.erledigt); }).length;
  const schritte = [];
  if (!technikFertig()) schritte.push(['technik', 'Technik-Check erledigen', '5 Minuten, am Laptop']);
  if (!faktenFertig()) schritte.push(['fakten', 'Faktencheck', S.start.faktencheck.filter(f => !f.antwort).length + ' Angaben bestätigen']);
  if (z.offen) schritte.push(['fahrplan', S.audit.stufe === 1 ? 'Fahrplan üben' : 'Fragen üben', z.offen + ' Punkte noch nicht geübt']);
  const fo = fallenFuerStufe().filter(f => !eintrag('falle', f.id)).length; if (fo) schritte.push(['fallen', 'Stolperfallen', fo + ' noch nicht durchgespielt']);
  if (!schritte.length && lektion.length) schritte.push(['lektion', 'Ihre 5 Minuten für heute', 'drei Punkte wiederholen']);
  const audits = S.start.audits.slice().sort((a, b) => a.stufe - b.stufe), a0 = S.audit, st = L.STUFEN[a0.stufe], t = L.tageBis(a0.datum);
  const anderes = audits.find(x => x.id !== a0.id);
  const n1 = schritte[0], g1 = n1 ? gruppeVon(n1[0]) : null;
  const da = tabs().map(x => x[0]);
  $('#main').innerHTML = (S.ma ? '' : '<div class="hinweis">Bitte oben bei „Wer übt?“ Ihren Namen wählen.</div>')
    + '<section class="hero2">'
    + '<div class="haupt-karte" style="--f:' + (g1 ? g1.farbe : '#0B7285') + '">'
    + '<div class="hk-termin"><span class="eyebrow">Stufe ' + a0.stufe + (a0.zertifizierer ? ' · ' + esc(a0.zertifizierer) : '') + '</span>'
    + '<span class="hk-tage">' + (t != null && t >= 0 ? (t === 0 ? 'Heute ist Audit' : 'in ' + t + (t === 1 ? ' Tag' : ' Tagen')) : 'Termin offen') + '</span>'
    + '<span class="hk-datum">' + (a0.datum ? esc(datumDe(a0.datum)) : '') + '</span></div>'
    + (n1 ? '<button class="hk-weiter" data-weiter="' + n1[0] + '"><span class="eyebrow">Als Nächstes</span><b>' + esc(n1[1]) + '</b><span class="grau">' + esc(n1[2]) + '</span><span class="hk-pfeil" aria-hidden="true">→</span></button>'
      + (schritte.length > 1 ? '<div class="hk-danach">danach: ' + schritte.slice(1, 3).map(x => esc(x[1])).join(' · ') + '</div>' : '')
      : '<div class="hk-weiter fertig"><span class="eyebrow">Als Nächstes</span><b>Alles erledigt ✓</b><span class="grau">Wiederholen Sie täglich 5 Minuten.</span></div>')
    + '</div>'
    + '<div class="hero-feld hero-reife">' + reifeRing(r) + '<div><span class="eyebrow">Prüfungsreife</span><div><b>' + (r.stufe === 'bereit' ? 'Gut vorbereitet' : r.stufe === 'fast' ? 'Fast geschafft' : 'Jeden Tag ein bisschen') + '</b></div>'
    + '<details class="reife-teile"><summary>Woraus setzt sich das zusammen?</summary>' + r.teile.map(x => '<div class="teil"><span>' + esc(x.name) + '</span><div class="balken"><span style="width:' + x.prozent + '%;background:var(--blau2)"></span></div><span class="grau">' + x.prozent + ' %</span></div>').join('') + '</details>'
    + '<details class="stufe-erkl"><summary>Was prüft der Auditor in Stufe ' + a0.stufe + '?</summary><p>' + esc(st.was) + '</p><p class="grau">' + esc(st.ueben) + '</p></details>'
    + (anderes ? '<button class="link" data-stufe="' + anderes.id + '">zu Stufe ' + anderes.stufe + (anderes.datum ? ' (' + kurzDatum(anderes.datum) + ')' : '') + ' wechseln</button>' : '') + '</div></div>'
    + '</section>'
    + '<nav class="schnell" aria-label="Schnellzugriff">'
    + '<button data-schnell="ueben"><span class="rund">🎯</span>Frage üben</button>'
    + '<button data-schnell="finden"><span class="rund">🔎</span>Wo steht das?</button>'
    + '<button data-schnell="probeaudit"><span class="rund">🎙️</span>Probeaudit</button>'
    + (kiAn() ? '<button data-schnell="ki"><span class="rund">🤖</span>KI fragen</button>' : '<button data-schnell="tag"><span class="rund">📋</span>Spickzettel</button>')
    + (!S.start.demo && !S.start.eigen ? '<button data-schnell="senden" title="An ' + esc(bn('akk')) + ' senden"><span class="rund">✉</span>Senden</button>' : '')
    + '</nav>'
    + testKarte()
    + '<div class="gruppen">' + GRUPPEN.map(g => { const ks = g.keys.filter(k => da.indexOf(k) >= 0); if (!ks.length) return '';
      return '<section class="gruppe" style="--f:' + g.farbe + ';--f-hell:' + g.hell + ';--n:' + ks.length + '"><h3 class="gruppe-titel">' + (g.nr ? '<span class="gruppe-nr">' + g.nr + '</span>' : '') + esc(g.name) + '</h3><div class="kacheln">' + ks.map(k => kachelHtml(k, g)).join('') + '</div></section>'; }).join('') + '</div>'
    + (lektion.length ? '<section class="abschnitt" style="--f:#0B7285;--f-hell:#E3FAFC"><div class="zeile" style="justify-content:space-between"><span class="etikett">⏱ Für heute</span><button class="knopf klein" id="lektion">▶ Los geht’s</button></div><h3 class="satz">Ihre 5 Minuten: drei Punkte wiederholen</h3><p class="grau">Zuerst die, die beim letzten Mal schwer waren.</p>' + lektion.map(f => '<div class="lek"><span class="dot ' + L.ampel(antwortenZu(f.id)) + '"></span><span class="np">' + esc(f.normkapitel || '–') + '</span><span>' + esc(String(f.frage).slice(0, 110)) + (String(f.frage).length > 110 ? ' …' : '') + '</span></div>').join('') + '</section>' : '')
    + (S.ma && S.antworten.length ? '<details class="abschnitt aufklapp" style="--f:#C92A2A;--f-hell:#FFE3E3"><summary><span class="etikett">🔧 Baustellen</span><span class="satz">Was noch hakt</span><span class="chevron" aria-hidden="true">⌄</span></summary>' + baustellenHtml().replace(/^<h3>[^<]*<\/h3>/, '') + '</details>' : '')
    + (aufgaben.length ? '<details class="abschnitt aufklapp" style="--f:#6741D9;--f-hell:#F3F0FF"' + (offeneAufg ? ' open' : '') + '><summary><span class="etikett">✅ Aufgaben</span><span class="satz">Vor dem Audit erledigen</span><span class="chip ' + (offeneAufg ? 'bald' : 'ok') + '">' + (offeneAufg ? offeneAufg + ' offen' : 'alle erledigt') + '</span><span class="chevron" aria-hidden="true">⌄</span></summary>' + aufgaben.map(a => { const e = eintrag('aufgabe', a.id); return '<label class="check"><input type="checkbox" data-a="' + esc(a.id) + '" ' + (e && e.daten.erledigt ? 'checked' : '') + '><span><b>' + esc(a.todo) + '</b><br><span class="grau">' + (a.bis_stufe ? 'bis Stufe ' + a.bis_stufe : '') + (a.verantwortlich ? ' · ' + esc(a.verantwortlich) : '') + (a.termin ? ' · bis ' + esc(a.termin) : '') + '</span></span></label>'; }).join('') + '</details>' : '');
  const l = $('#lektion'); if (l) l.onclick = () => reihe(lektion.map(f => ({ art: 'frage', item: f, modus: ursachen()[f.id] })), 'Tageslektion');
  $$('.kachel').forEach(x => x.onclick = () => zeige(x.dataset.k));
  $$('[data-schnell]').forEach(b => b.onclick = () => {
    const w = b.dataset.schnell;
    if (w === 'ueben') { const lb = $('#lektion'); if (lb) lb.click(); else zeige('fahrplan'); }
    else if (w === 'senden') sendenPanel();
    else if (w === 'ki') { zeige('finden'); const f = $('#suche'); if (f) { f.placeholder = 'Ihre Frage, z. B. Wer bewertet unsere Lieferanten?'; f.focus(); } }
    else zeige(w);
  });
  $$('[data-feedback]').forEach(b => b.onclick = feedbackPanel);
  $$('[data-eigen]').forEach(b => b.onclick = async () => {
    const w = b.dataset.eigen;
    if (w === 'neu') { $('#wahl').hidden = true; return E.einrichtenZeigen($('#main'), L, token, () => location.reload(), await E.paketLaden(token)); }
    E.modusSetzen(token, w); location.reload();
  });
  $$('[data-weiter]').forEach(x => x.onclick = () => { if (x.dataset.weiter === 'lektion') { const b = $('#lektion'); if (b) b.click(); } else zeige(x.dataset.weiter); });
  $$('[data-bau]').forEach(b => b.onclick = () => { const f = S.fragen.find(x => x.id === b.dataset.bau); reihe([{ art: 'frage', item: f, modus: b.dataset.modus || null }], null, false); });
  $$('[data-bu]').forEach(b => b.onclick = async () => { await speichereEintrag('lernen', 'ursache:' + b.dataset.bu, { ursache: b.dataset.u }); ANSICHT.heute(); });
  $$('[data-stufe]').forEach(b => b.onclick = () => { $('#sel-audit').value = b.dataset.stufe; merken(); laden(); });
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
  return '<h3>Was finden Sie wo?</h3><div class="karte wegweiser">' + WEGWEISER.filter(w => da.indexOf(w[0]) >= 0).map(w => '<div class="weiter" data-k="' + w[0] + '"><b>' + esc(w[1]) + '</b> – <span>' + esc(w[2].replace('an den Berater', 'an ' + bn('akk'))) + '</span></div>').join('') + '</div>';
}
/* Ergebnis an den Berater: in der Testfassung per Netlify-Formular (Berater sieht es in Netlify), sonst liegt alles in der Datenbank */
function sendenHtml() {
  if (S.start.demo || S.start.eigen) return '';
  const zuletzt = (() => { try { return localStorage.getItem('av_gesendet') || ''; } catch (e) { return ''; } })();
  return '<h3>Ihr Stand an ' + esc(bn('akk')) + '</h3><div class="karte"><p>' + esc(bn('nom')) + ' sieht Ihren Übungsstand erst, wenn Sie ihn senden. Den Knopf <b>✉ An ' + esc(bn('kurz')) + ' senden</b> finden Sie jederzeit oben in der Kopfzeile – auch für Änderungswünsche an Ihren Dokumenten vor dem Audit.</p><div class="zeile"><button class="knopf" id="senden">Jetzt senden</button><span class="grau" id="senden-info">' + (zuletzt ? 'Zuletzt gesendet: ' + esc(zuletzt) : 'Noch nicht gesendet') + '</span></div></div>';
}
/* ------------------------------------------------ Testmonat (LinkedIn): Laufzeit, Kontingent, Verbesserungsvorschläge */
function testTage() { const t = S.start.test; return t ? L.tageBis(t.bis) : null; }
function testZeile() {
  const t = S.start.test, g = t.grenzen || {}, v = t.verbraucht || {}, tage = testTage();
  if (S.start.eigen) return 'Kostenloser Testmonat mit Ihren eigenen Dokumenten – noch ' + (tage == null ? '?' : tage) + (tage === 1 ? ' Tag' : ' Tage')
    + (cfg.ki && g.ki_tag ? ' · KI heute bis ' + g.ki_tag + ' Fragen' : '') + '. 🔒 Dokumente und Antworten bleiben auf diesem Gerät.';
  return 'Kostenloser Testmonat mit der erfundenen Beispielfirma – noch ' + (tage == null ? '?' : tage) + (tage === 1 ? ' Tag' : ' Tage')
    + (cfg.ki && g.ki_tag ? ' · KI heute ' + (v.ki_heute || 0) + ' von ' + g.ki_tag : '') + '. Ihre Eingaben werden gespeichert.';
}
function testKarte() {
  if (!S.start.test) return '';
  const tage = testTage();
  return '<div class="karte test-karte"><b>💡 Ihr Testmonat' + (tage != null ? ' · noch ' + tage + (tage === 1 ? ' Tag' : ' Tage') : '') + '</b>'
    + '<p>' + (S.start.eigen ? 'Sie üben mit Ihren eigenen Dokumenten – sie bleiben auf diesem Gerät.' : 'Sie üben mit einer erfundenen Beispielfirma.') + ' Was hat geholfen, was fehlt, was stört? Zwei Minuten Rückmeldung machen das Werkzeug für alle besser.</p>'
    + '<div class="zeile"><button class="knopf" data-feedback>Verbesserung vorschlagen</button>'
    + (S.start.eigen ? '<button class="knopf zweit" data-eigen="neu">Dokumente ändern</button><button class="link" data-eigen="beispiel">zur Beispielfirma wechseln</button>'
      : '<button class="link" data-eigen="eigen">mit eigenen Dokumenten üben</button>') + '</div></div>';
}
function feedbackPanel() {
  const alt = $('#feedback-panel'); if (alt) { alt.remove(); return; }
  const d = document.createElement('div'); d.id = 'feedback-panel'; d.className = 'karte senden-panel kein-druck';
  const note = [1, 2, 3, 4, 5].map(n => '<label class="fb-note"><input type="radio" name="fb-note" value="' + n + '"> ' + n + '</label>').join('');
  d.innerHTML = '<div class="zeile" style="justify-content:space-between"><b>💡 Was sollen wir verbessern?</b><button class="link" id="fb-zu">schließen</button></div>'
    + '<label>Wie hilfreich ist die Vorbereitung bisher? (1 = gar nicht, 5 = sehr)</label><div class="zeile">' + note + '</div>'
    + '<label for="fb-hilft">Was hat Ihnen am meisten geholfen?</label><textarea id="fb-hilft" rows="2"></textarea>'
    + '<label for="fb-fehlt">Was fehlt, was stört, wo kamen Sie nicht weiter?</label><textarea id="fb-fehlt" rows="3"></textarea>'
    + '<label for="fb-eigen">Würden Sie es mit Ihren eigenen Dokumenten vor Ihrem Audit nutzen?</label><select id="fb-eigen"><option value="">– bitte wählen –</option><option>ja</option><option>vielleicht</option><option>nein</option></select>'
    + '<p class="grau">Ihre Rückmeldung liest ' + esc(bn('nom')) + ' persönlich. Es geht keine automatische Mail heraus.</p>'
    + '<div class="zeile"><button class="knopf" id="fb-los">Rückmeldung senden</button></div>';
  $('#main').prepend(d); window.scrollTo(0, 0);
  $('#fb-zu').onclick = () => d.remove();
  $('#fb-los').onclick = async () => {
    const n = $('input[name="fb-note"]:checked'), daten = { note: n ? Number(n.value) : null, hilft: $('#fb-hilft').value.trim(), fehlt: $('#fb-fehlt').value.trim(), eigene_dokumente: $('#fb-eigen').value, ansicht: S.ansicht };
    if (!daten.note && !daten.hilft && !daten.fehlt) return hinweisBox('Bitte mindestens eine Angabe machen.');
    const b = $('#fb-los'); b.disabled = true; b.textContent = 'Sende …';
    try {
      await api('nachricht', { art: 'feedback', daten, mitarbeiter_id: S.ma ? S.ma.id : null,
        text: [daten.hilft && 'Geholfen: ' + daten.hilft, daten.fehlt && 'Fehlt/stört: ' + daten.fehlt].filter(Boolean).join('\n'),
        zusammenfassung: 'Feedback' + (daten.note ? ' · Note ' + daten.note + '/5' : '') + (daten.eigene_dokumente ? ' · eigene Dokumente: ' + daten.eigene_dokumente : '') });
      d.remove(); hinweisBox('Danke! Ihre Rückmeldung ist bei ' + bn('dat') + ' angekommen.', 'ok');
    } catch (e) { hinweisBox('Senden hat nicht geklappt: ' + e.message); b.disabled = false; b.textContent = 'Rückmeldung senden'; }
  };
}
function sendenKnopf() { const b = $('#senden'); if (b) b.onclick = sendenPanel; }
/* Fenster zum Senden: Nachricht (z. B. Änderungswunsch vor dem Audit) + Übungsstand. Geht nur an den Berater, nie an Dritte. */
function sendenPanel(vorText) {
  const alt = $('#senden-panel'); if (alt) { alt.remove(); if (typeof vorText !== 'string') return; }
  const d = document.createElement('div'); d.id = 'senden-panel'; d.className = 'karte senden-panel kein-druck';
  d.innerHTML = '<div class="zeile" style="justify-content:space-between"><b>An ' + esc(bn('akk')) + ' senden</b><button class="link" id="sp-zu">schließen</button></div>'
    + '<label for="sp-text">Nachricht (freiwillig) – z. B. „Bitte im Handbuch Kapitel 5 die Geschäftsführung korrigieren“ oder eine Frage vor dem Audit:</label>'
    + '<textarea id="sp-text" rows="4" placeholder="Ihre Nachricht an ' + esc(bn('akk')) + '"></textarea>'
    + '<p class="grau">' + (api.lokal ? 'Mitgeschickt wird Ihr Übungsstand (ohne Fotos). ' : 'Ihr Übungsstand ist ohnehin gespeichert, mitgeschickt wird eine Kurzfassung. ') + esc(bn('nom')) + ' liest alles selbst, es geht keine Mail automatisch an andere.</p>'
    + '<div class="zeile"><button class="knopf" id="sp-los">Senden</button>' + (api.lokal ? '<button class="knopf zweit" id="sp-datei">Stattdessen als Datei herunterladen</button>' : '') + '</div>';
  $('#main').prepend(d); window.scrollTo(0, 0); if (typeof vorText === 'string') $('#sp-text').value = vorText; $('#sp-text').focus();
  $('#sp-zu').onclick = () => d.remove();
  if ($('#sp-datei')) $('#sp-datei').onclick = () => herunterladen();
  $('#sp-los').onclick = async () => { const ok = await senden($('#sp-los'), $('#sp-text').value.trim()); if (ok) d.remove(); };
}
async function senden(knopf, nachricht) {
  const r = reife(), z = stand();
  if (!api.lokal) { // Servermodus: Stand liegt ohnehin in der Datenbank – nur Nachricht + Kurzfassung ins Backoffice
    const vorher = knopf ? knopf.textContent : '';
    if (knopf) { knopf.disabled = true; knopf.textContent = 'Sende …'; }
    try {
      await api('nachricht', { mitarbeiter_id: S.ma ? S.ma.id : null, text: nachricht || '', zusammenfassung: 'Stufe ' + S.audit.stufe + ' · Prüfungsreife ' + r.prozent + ' % · ' + z.gruen + ' sicher, ' + z.gelb + ' mit Hilfe, ' + z.rot + ' weiß nicht, ' + z.offen + ' offen' });
      const jetzt = new Date().toLocaleString('de-DE'); try { localStorage.setItem('av_gesendet', jetzt); } catch (e) { /* */ }
      if ($('#senden-info')) $('#senden-info').textContent = '✓ Gesendet am ' + jetzt;
      hinweisBox('Ist bei ' + bn('dat') + ' angekommen' + (nachricht ? ' – mit Ihrer Nachricht' : '') + '. Danke!', 'ok');
      return true;
    } catch (e) { hinweisBox('Senden hat nicht geklappt: ' + e.message); return false; }
    finally { if (knopf) { knopf.disabled = false; knopf.textContent = vorher; } }
  }
  const daten = api.export(); daten.nachweise = (daten.nachweise || []).map(n => Object.assign({}, n, { bild: '' }));
  daten.eintraege = (daten.eintraege || []).map(e => e.daten && e.daten.foto ? Object.assign({}, e, { daten: Object.assign({}, e.daten, { foto: '(Foto im Browser)' }) }) : e); // klein halten: keine Bilder im Formular
  if (nachricht) daten.nachricht = nachricht;
  const felder = { 'form-name': 'ergebnis', kunde: S.start.kunde.name, mitarbeiter: S.ma ? S.ma.name : '', stufe: String(S.audit.stufe), nachricht: nachricht || '',
    zusammenfassung: (nachricht ? 'MIT NACHRICHT · ' : '') + 'Prüfungsreife ' + r.prozent + ' % · ' + z.gruen + ' sicher, ' + z.gelb + ' mit Hilfe, ' + z.rot + ' weiß nicht, ' + z.offen + ' offen' };
  // Übungsstand als Datei-Anhang statt als langes Textfeld: lange JSON-Texte sortiert Netlifys Spamfilter aus
  const fd = new FormData(); Object.keys(felder).forEach(k => fd.append(k, felder[k]));
  const dateiname = 'Auditvorbereitung_' + S.start.kunde.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30) + '_' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
  fd.append('datei', new Blob([JSON.stringify(daten)], { type: 'application/json' }), dateiname);
  const vorher = knopf ? knopf.textContent : '';
  if (knopf) { knopf.disabled = true; knopf.textContent = 'Sende …'; }
  try {
    const res = await fetch('/', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Status ' + res.status);
    const jetzt = new Date().toLocaleString('de-DE'); try { localStorage.setItem('av_gesendet', jetzt); } catch (e) { /* */ }
    if ($('#senden-info')) $('#senden-info').textContent = '✓ Gesendet am ' + jetzt;
    hinweisBox('Ist bei ' + bn('dat') + ' angekommen' + (nachricht ? ' – mit Ihrer Nachricht' : '') + '. Danke!', 'ok');
    return true;
  } catch (e) {
    hinweisBox('Senden hat nicht geklappt. Bitte „Stattdessen als Datei herunterladen“ wählen und die Datei per E-Mail an ' + bn('akk') + ' schicken.');
    return false;
  } finally { if (knopf) { knopf.disabled = false; knopf.textContent = vorher; } }
}

/* ------------------------------------------------ Technik-Check (P07) */
ANSICHT.technik = () => {
  const c = S.start.kunde.technik_check || {};
  const handy = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 700;
  const chrome = !!(navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some(b => /Chrome|Chromium|Edge/.test(b.brand))) || /Chrome\//.test(navigator.userAgent);
  const zeile = (k, titel, text, knopf) => '<div class="check"><div class="haken ' + (c[k] ? 'ja' : '') + '" data-h="' + k + '">' + (c[k] ? '✓' : '') + '</div><div style="flex:1"><b>' + titel + '</b><div class="grau">' + text + '</div>' + (knopf || '') + '</div></div>';
  const erledigt = ['laptop', 'chrome', 'dokument_offen', 'bildschirm'].filter(x => c[x]).length;
  $('#main').innerHTML = '<div class="zeile" style="justify-content:space-between"><h2>Technik-Check</h2>' + miniRing(erledigt / 4, erledigt + ' von 4 erledigt') + '</div><p>Bitte spätestens eine Woche vor dem Audit erledigen. Wer am Tag vorher noch installiert, wird im Audit nervös.</p>'
    + (handy ? '<div class="hinweis">Sie sind gerade am Handy. Im Audit brauchen Sie einen Laptop oder PC – am Handy ist alles zu klein, und Bildschirm teilen klappt schlecht.</div>' : '')
    + '<div class="karte">'
    + zeile('laptop', 'Ich mache das Audit am Laptop oder PC', 'Nicht am Handy oder Tablet.', '<button class="knopf klein" data-c="laptop" ' + (handy ? 'disabled' : '') + '>' + (c.laptop ? 'Bestätigt' : 'Ja, bestätigen') + '</button>')
    + zeile('chrome', 'Browser Google Chrome', chrome ? 'Sie nutzen Chrome bzw. Edge. Gut.' : 'Bitte Google Chrome installieren und diese Seite darin öffnen.', '<button class="knopf klein" data-c="chrome" ' + (chrome ? '' : 'disabled') + '>' + (c.chrome ? 'Bestätigt' : 'Ja, bestätigen') + '</button>')
    + zeile('dokument_offen', 'Ihre Dokumente öffnen sich am Laptop', S.start.test
      ? (S.start.eigen ? 'Öffnen Sie testweise Ihr erstes Dokument. Es kommt aus diesem Browser – Sie brauchen keine Anmeldung.' : 'Öffnen Sie testweise das Handbuch der Beispielfirma. Es öffnet sich hier im Seitenbetrachter – im echten Audit wären das Ihre eigenen Dokumente.')
      : 'Öffnen Sie testweise Ihr Handbuch. Kommt eine Anmeldung, melden Sie sich mit dem Konto an, über das Sie die Dokumente bekommen haben. Bearbeiten Sie Dokumente nur dort, nicht in Word/Excel auf dem eigenen Rechner – sonst entstehen zwei Versionen.', '<button class="knopf klein" id="dok-test">Handbuch öffnen</button> <button class="knopf klein zweit" data-c="dokument_offen">Hat geklappt</button>')
    + zeile('bildschirm', 'Bildschirm teilen klappt', 'Klicken Sie auf „Testen“, wählen Sie <b>Gesamter Bildschirm</b> und dann „Teilen“. So zeigen Sie dem Auditor im Online-Audit Ihre Dokumente – und im Fahrplan macht das Programm damit Ihr Übungsfoto. <span class="grau">Am Mac einmalig nötig: Systemeinstellungen → Datenschutz &amp; Sicherheit → Bildschirmaufnahme → Chrome einschalten, Chrome neu starten. Klappt das Teilen nicht, können Sie im Fahrplan auch ein eigenes Bildschirmfoto einfügen.</span>', '<button class="knopf klein" id="teilen-test">Bildschirm teilen testen</button><div id="teilen-erg"></div>')
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
  if (!still && S.ansicht === 'technik') ANSICHT.technik();
  else { // Vorschau-Video bleibt stehen, Haken und Zähler trotzdem aktualisieren
    const h = $('[data-h="' + k + '"]'); if (h) { h.classList.add('ja'); h.textContent = '✓'; }
    const c = S.start.kunde.technik_check || {}, n = ['laptop', 'chrome', 'dokument_offen', 'bildschirm'].filter(x => c[x]).length;
    const r = $('#main .mini-ring'); if (r) r.outerHTML = miniRing(n / 4, n + ' von 4 erledigt');
  }
  zeichneKopf();
}
async function teilen() {
  if (S.stream && S.stream.active) return S.stream;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { hinweisBox('Ihr Browser kann den Bildschirm nicht teilen. Bitte Google Chrome am Laptop verwenden.'); return null; }
  try {
    S.stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' }, audio: false });
    S.stream.getVideoTracks()[0].addEventListener('ended', () => { S.stream = null; teilenAnzeige(); });
    teilenAnzeige(); return S.stream;
  } catch (e) { hinweisBox('Bildschirm teilen wurde abgebrochen. Kein Problem – einfach noch einmal versuchen und „Gesamter Bildschirm“ wählen.'); return null; }
}
/* Solange geteilt wird: rote Leiste oben mit "Teilen beenden" (Chrome zeigt zusätzlich unten "Freigabe beenden") */
function teilenAnzeige() {
  let el = $('#teilen-leiste');
  if (!(S.stream && S.stream.active)) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'teilen-leiste'; el.className = 'teilen-leiste kein-druck'; document.body.append(el); }
  el.innerHTML = '<span>● Ihr Bildschirm wird für das Übungsfoto geteilt. Es wird nichts aufgezeichnet oder verschickt – das Foto bleibt in diesem Browser.</span><button class="knopf klein" id="teilen-aus">Teilen beenden</button>';
  $('#teilen-aus').onclick = () => { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; teilenAnzeige(); hinweisBox('Bildschirm teilen ist beendet.', 'ok'); };
}
function kopieUrl(d, ort) { // eigener Seitenbetrachter (pdf.html) statt #page: der Browser springt sonst nicht zuverlaessig auf die Seite
  if (!d || !d.kopie) return '';
  const eigen = /^eigen:/.test(d.kopie);
  let von = 0, bis = 0; const m = String(ort || '').match(/Seite\s+(\d+)(?:\s*[–-]\s*(\d+))?/); if (m) { von = Number(m[1]); bis = Number(m[2] || m[1]); }
  const r = String(ort || '').match(/„([^“]+)“/); if (r && d.kopie_seiten && d.kopie_seiten[r[1]]) von = bis = d.kopie_seiten[r[1]];
  const seite = (von ? '&s=' + von + '&b=' + bis : '') + '&t=' + encodeURIComponent(d.titel);
  if (eigen) return 'pdf.html?e=' + encodeURIComponent(d.id) + seite + '&w=' + encodeURIComponent(E.ablage(token)); // aus IndexedDB dieses Browsers
  if (api && !api.lokal && token) return 'pdf.html?k=' + encodeURIComponent(d.id) + seite + '&z=' + encodeURIComponent(token); // Servermodus: signierter Link holt pdf.html selbst
  return 'pdf.html?d=' + encodeURIComponent(d.kopie) + seite;
}
function kopieKnopf(dokId, ort) { const d = S.start.dokumente.find(x => x.id === dokId); const u = kopieUrl(d, ort); return u ? '<a class="knopf klein zweit" target="_blank" rel="noopener" href="' + esc(u) + '" title="Falls Sie keinen Zugriff auf die Originaldatei haben">PDF-Kopie</a>' : ''; }
async function oeffne(id, ort) {
  // Mit Seite/Reiter: immer den Seitenbetrachter (springt sicher auf die Stelle); Google-Links koennen keine Seite ansteuern
  // Ohne Live-Link (Google) öffnet die PDF-Kopie im eigenen Seitenbetrachter – auch ohne Seitenangabe
  const d = S.start.dokumente.find(x => x.id === id), u = ort || (d && d.kopie && !d.link) ? kopieUrl(d, ort) : '';
  if (u && (/&s=\d/.test(u) || !d.link)) { const w = window.open(u, '_blank'); if (!w) location.href = u; return; }
  const fenster = window.open('', '_blank');
  try {
    const j = await api('dokument', { dokument_id: id });
    if (j.demo || j.url === 'about:blank') { if (fenster) fenster.document.write('<p style="font-family:sans-serif">Demo: Hier öffnet sich „' + esc(j.titel) + '“.</p>'); }
    else if (fenster) fenster.location = j.url; else location.href = j.url;
  } catch (e) { if (fenster) fenster.close(); hinweisBox(e.message); }
}

/* ------------------------------------------------ Faktencheck (P05) */
ANSICHT.fakten = () => {
  const f = S.start.faktencheck, korrigiert = f.filter(x => x.antwort === 'stimmt_nicht' && x.korrektur);
  $('#main').innerHTML = '<h2>Faktencheck: Stimmt das in Ihren Dokumenten?</h2><p>In der Vorbereitung fallen immer wieder Kleinigkeiten auf, die der Auditor sofort sieht: falsche Rollen, alter Zertifizierer, Platzhalter, Geräte, die es nicht gibt. Bitte jeden Punkt kurz bestätigen oder korrigieren. Ihre Korrektur geht an ' + esc(bn('akk')) + ', er passt die Dokumente an. <b>Bitte die Dokumente nicht selbst ändern.</b></p>'
    + (f.length ? f.map(x => '<div class="karte" data-id="' + esc(x.id) + '"><div class="zeile" style="justify-content:space-between"><b>' + esc(x.thema) + '</b>' + (x.antwort ? '<span class="chip">' + (x.antwort === 'stimmt' ? '✓ stimmt' : '✎ korrigiert') + '</span>' : '') + '</div>'
      + '<div>In den Dokumenten steht: <i>' + esc(x.angabe || '–') + '</i></div>' + (x.fundstelle ? '<div class="grau">Fundstelle: ' + esc(x.fundstelle) + '</div>' : '')
      + '<div class="zeile" style="margin-top:8px"><button class="knopf klein gruen" data-a="stimmt">Stimmt</button><button class="knopf klein zweit" data-a="stimmt_nicht">Stimmt nicht</button></div>'
      + '<div class="korr" ' + (x.antwort === 'stimmt_nicht' ? '' : 'hidden') + '><textarea placeholder="Wie ist es richtig?">' + esc(x.korrektur || '') + '</textarea><button class="knopf klein" data-a="speichern">Korrektur speichern</button></div></div>').join('')
      : '<div class="karte grau">Für Sie ist noch kein Faktencheck angelegt.</div>')
    + (korrigiert.length && !S.start.demo ? '<div class="karte senden-leiste"><b>' + korrigiert.length + (korrigiert.length === 1 ? ' Korrektur' : ' Korrekturen') + ' gespeichert.</b> Damit ' + esc(bn('nom')) + ' die Dokumente vor dem Audit anpassen kann, schicken Sie sie jetzt ab.<div class="zeile" style="margin-top:8px"><button class="knopf" id="fk-senden">✉ Korrekturen an ' + esc(bn('akk')) + ' senden</button></div></div>' : '');
  const fs = $('#fk-senden'); if (fs) fs.onclick = () => sendenPanel('Korrekturen aus dem Faktencheck:\n' + korrigiert.map(x => '– ' + x.thema + ': ' + x.korrektur).join('\n') + '\n');
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
function d0(id) { return S.start.dokumente.find(x => x.id === id) || {}; }
function dokTitel(id) { const d = S.start.dokumente.find(x => x.id === id); return d ? d.titel : 'Dokument'; }
function markiere(text, treffer) {
  let t = esc(text);
  (treffer || []).filter(w => w.length > 3).forEach(w => { t = t.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-zäöüß]*)', 'gi'), '<mark>$1</mark>'); });
  return t.replace(/\n/g, '<br>');
}
function auszugHtml(x, treffer) {
  return '<div class="auszug"><div class="zeile" style="justify-content:space-between"><b>' + esc(dokTitel(x.auszug.dokument_id)) + ' · ' + esc(x.auszug.ort || '') + '</b><span class="zeile">' + stelleKnopf(x.auszug.dokument_id, x.auszug.ort) + '</span></div><div class="auszug-text" hidden>' + markiere(x.auszug.text, treffer || x.treffer) + '</div></div>';
}
async function hilfeHtml(f) {
  const a = await auszuege();
  const treffer = a.length ? L.auszuegeZurFundstelle(f.hilfe, f.frage, S.start.dokumente, a, 3) : [];
  return '<div><b>Wo steht das?</b> ' + esc(f.hilfe || 'Keine Fundstelle hinterlegt.') + '</div>'
    + (treffer.length ? '<div class="grau" style="margin-top:6px">Auszug aus Ihrer Dokumentation:</div>' + treffer.map(x => auszugHtml(x, L.woerter(f.frage))).join('') : '')
    + '<div class="doks">' + (f.dokumente || []).map(d => '<button class="knopf klein zweit" data-d="' + d.id + '">' + esc((d.d_nr ? d.d_nr + ' ' : '') + d.titel) + (d.stand ? ' · ' + esc(d.stand) : '') + '</button>').join('') + '</div>';
}
function dokKnoepfe(el) { $$('[data-d]', el).forEach(b => b.onclick = () => oeffne(b.dataset.d, b.dataset.ort || '')); }
function stelleKnopf(dokId, ort, text) { // "Seite 33 öffnen" statt "Dokument öffnen", wenn die Stelle bekannt ist
  const d = S.start.dokumente.find(x => x.id === dokId), u = ort ? kopieUrl(d, ort) : '';
  const m = String(ort || '').match(/Seite\s+\d+(?:\s*[–-]\s*\d+)?/), r = String(ort || '').match(/„[^“]+“/);
  const label = u && /&s=\d/.test(u) ? (m ? m[0] : 'Reiter ' + (r ? r[0] : '')) + ' öffnen' : (text || 'Dokument öffnen');
  return '<button class="knopf klein zweit" data-d="' + esc(dokId) + '" data-ort="' + esc(ort || '') + '">' + esc(label) + '</button>';
}
ANSICHT.finden = async () => {
  const a = await auszuege();
  const kennen = S.start.dokumente.filter(d => d.wichtigkeit === 'kennen'), finden = S.start.dokumente.filter(d => d.wichtigkeit !== 'kennen');
  $('#main').innerHTML = '<h2>Wo steht das?</h2><p>Geben Sie ein Stichwort ein – Sie sehen die Stelle in Ihrer eigenen Dokumentation. Diese Suche dürfen Sie auch im Audit offen nutzen, wie eine ausgedruckte Liste.</p>'
    + '<p class="grau">Kein Zugriff auf die Originaldateien (z. B. Google-Anmeldung klappt nicht)? Nutzen Sie die <b>PDF-Kopie</b> – und sagen Sie ' + esc(bn('dat')) + ' Bescheid, damit es bis zum Audit klappt.</p>'
    + '<div class="karte"><div class="zeile"><input id="suche" type="search" placeholder="z. B. Lieferantenbewertung, Feuerlöscher, Politik, Notfall" style="flex:1"><button class="knopf" id="suchen">Suchen</button>' + (kiAn() ? '<button class="knopf zweit" id="ki-fragen" title="Die KI antwortet nur aus Ihren eigenen Dokumenten">🤖 KI fragen</button>' : '') + '<button class="knopf zweit klein" id="sprich" title="Frage sprechen">🎤</button></div></div>'
    + '<div id="ergebnis"></div>'
    + pdfSicherungHtml()
    + '<h3>Ihre Dokumente</h3><div class="karte">' + kennen.map(d => '<div class="zeile"><span class="chip">kennen</span><button class="link" data-d="' + d.id + '">' + esc(d.titel) + '</button><span class="grau">' + (d.stand ? 'Stand ' + esc(d.stand) : '') + '</span>' + kopieKnopf(d.id, '') + '</div>').join('')
    + finden.map(d => '<div class="zeile"><span class="chip grau">finden</span><button class="link" data-d="' + d.id + '">' + esc(d.titel) + '</button><span class="grau">' + (d.stand ? 'Stand ' + esc(d.stand) : '') + '</span>' + kopieKnopf(d.id, '') + '</div>').join('') + '</div>';
  dokKnoepfe($('#main'));
  const los = (mitKi) => {
    const q = $('#suche').value.trim(); if (!q) return;
    // nur Treffer, die fast so gut passen wie der beste – sonst erscheinen Dokumente, in denen das Wort nur nebenbei vorkommt
    const alle = L.auszuegeSuchen(q, a, 5), r = alle.filter(x => x.punkte >= 0.5 * alle[0].punkte);
    $('#ergebnis').innerHTML = '<div id="ki-antwort"></div>' + (r.length ? r.map(x => auszugHtml(x)).join('') : '<div class="karte grau">Nichts gefunden. Probieren Sie ein anderes Wort (z. B. „Lieferant“ statt „Zulieferer“).</div>');
    dokKnoepfe($('#ergebnis'));
    // Ganze Fragen ("Wer bewertet unsere Lieferanten?") beantwortet zusätzlich die KI – nur aus den eigenen Dokumenten
    if (kiAn() && (mitKi === true || /\?\s*$/.test(q) || q.split(/\s+/).length >= 4)) kiAntwort(q);
  };
  $('#suchen').onclick = () => los(false); if ($('#ki-fragen')) $('#ki-fragen').onclick = () => los(true);
  $('#suche').onkeydown = (e) => { if (e.key === 'Enter') los(false); };
  diktat($('#sprich'), (t) => { $('#suche').value = t; los(); });
};
/* Probeaudit mit Stimme (web/kunde/probeaudit.js) */
ANSICHT.probeaudit = () => {
  if (brauchtMa('Probeaudit')) return;
  const hilfe = (f) => '<div><b>Wo steht das?</b> ' + esc(f.hilfe || 'Keine Fundstelle hinterlegt.') + '</div><div class="doks">' + (f.dokumente || []).map(d => stelleKnopf(d.id, (L.orteJeDokument(f.hilfe, S.start.dokumente)[d.id] || [])[0] ? 'Seite ' + String((L.orteJeDokument(f.hilfe, S.start.dokumente)[d.id] || [])[0]).replace(/^S\. /, '') : '', esc(d.titel) + ' öffnen')).join('') + '</div>';
  S.paStopp = probeaudit({ L, S, esc, main: $('#main'), ki, kiAn, api, speichereEintrag, eintrag, fallen: fallenFuerStufe, hilfe, eigeneAuszuege, oeffneHilfe: dokKnoepfe });
};
/* Probegespräch mit dem KI-Auditor (Edge Function "ki", Aktion gespraech): eine Frage nach der anderen */
function kiGespraech() {
  const box = $('#ki-gespraech'); if (!box) return;
  const verlauf = []; const typ = ((eintrag('auditor', 'typ') || {}).daten || {}).typ || 'sachlich';
  const themen = (S.planpunkte || []).map(p => ((p.normkapitel || '') + ' ' + (p.thema || '')).trim()).slice(0, 30);
  const fallen = fallenFuerStufe().map(f => f.frage).slice(0, 10);
  const zeichne = (warte) => {
    box.innerHTML = (verlauf.length ? verlauf.map(m => '<div class="' + (m.rolle === 'kunde' ? 'az-chef' : 'az-azubi') + '">' + (m.rolle === 'kunde' ? '' : '🧑‍💼 ') + esc(m.text) + '</div>').join('') : '<p>Der Übungsauditor beginnt mit einer Frage zu Ihrem Auditplan.</p>')
      + (warte ? '<p class="grau">Der Auditor überlegt …</p>' : '')
      + (verlauf.length && !warte ? '<textarea id="kg-text" placeholder="Ihre Antwort – wie im Audit"></textarea><div class="zeile"><button class="knopf klein zweit" id="kg-diktat">🎤 Diktieren</button><button class="knopf" id="kg-los">Antworten</button><button class="knopf zweit" id="kg-ende">Gespräch beenden</button></div>'
        : (!warte ? '<button class="knopf" id="kg-start">▶ Gespräch beginnen</button>' : ''));
    if ($('#kg-start')) $('#kg-start').onclick = () => schritt();
    if ($('#kg-los')) $('#kg-los').onclick = () => { const t = $('#kg-text').value.trim(); if (!t) return $('#kg-text').focus(); verlauf.push({ rolle: 'kunde', text: t }); schritt(); };
    if ($('#kg-ende')) $('#kg-ende').onclick = ende;
    if ($('#kg-diktat')) diktat($('#kg-diktat'), (t) => { $('#kg-text').value += ($('#kg-text').value ? ' ' : '') + t; });
  };
  const schritt = async () => {
    zeichne(true);
    const k = await ki('gespraech', { verlauf, typ, stufe: S.audit.stufe, themen, fallen });
    if (!k || !k.text) { box.insertAdjacentHTML('beforeend', '<div class="hinweis">Die KI ist gerade nicht erreichbar. Bitte später noch einmal.</div>'); return; }
    verlauf.push({ rolle: 'auditor', text: k.text }); zeichne(false);
  };
  const ende = async () => {
    const runden = verlauf.filter(m => m.rolle === 'kunde').length;
    zeichne(true);
    const k = runden ? await ki('gespraech', { verlauf, typ, stufe: S.audit.stufe, zum_schluss: true }) : null;
    await speichereEintrag('lernen', 'gespraech:' + new Date().toISOString().slice(0, 10), { runden });
    box.innerHTML = '<div class="karte gut"><b>Gespräch beendet – ' + runden + (runden === 1 ? ' Antwort' : ' Antworten') + '</b>'
      + (k ? ['gut', 'ueben', 'tipp'].map(x => k[x] ? '<p><b>' + ({ gut: 'Gut', ueben: 'Üben', tipp: 'Tipp' }[x]) + ':</b> ' + esc(k[x]) + '</p>' : '').join('') : '') + '</div><button class="knopf" id="kg-neu">Neues Gespräch</button>';
    $('#kg-neu').onclick = () => { verlauf.length = 0; zeichne(false); };
  };
  zeichne(false);
}
async function kiAntwort(frage) {
  const el = $('#ki-antwort'); if (!el) return;
  el.innerHTML = '<div class="karte ki-antwort"><span class="eyebrow">🤖 Antwort aus Ihren Dokumenten</span><p class="grau">Die KI liest die passenden Stellen …</p></div>';
  const eig = await eigeneAuszuege(frage, 8);
  const k = await ki('wissensfrage', eig ? { frage, auszuege: eig } : { frage });
  if (!$('#ki-antwort')) return;
  if (!k) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="karte ki-antwort"><span class="eyebrow">🤖 Antwort aus Ihren Dokumenten</span><p>' + esc(k.antwort) + '</p>'
    + (k.so_sagen ? '<p class="so-sagen">So können Sie es dem Auditor sagen: „' + esc(k.so_sagen) + '“</p>' : '')
    + ((k.quellen || []).length ? '<div class="zeile">' + k.quellen.map(q => '<span class="grau">' + esc(q.titel) + ' · ' + esc(q.ort || '') + '</span>' + stelleKnopf(q.dokument_id, q.ort)).join('') + '</div>' : '')
    + '<p class="grau">Die KI antwortet nur aus Ihren eigenen Dokumenten. Öffnen Sie die Stelle, bevor Sie sie im Audit zeigen.</p></div>';
  dokKnoepfe(el);
}
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
    + '<p class="grau">Die PDF-Kopie zeigt den Stand vom ' + esc(new Date().toLocaleDateString('de-DE')) + ' der Vorbereitung. Wenn ' + esc(bn('nom')) + ' Dokumente ändert, bekommen Sie eine neue Fassung.</p></div>';
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
            + '<details class="wo-finde"><summary>ⓘ Wo finde ich das?</summary><p>' + (d0(d).link ? 'Das Original liegt in Ihrem Laufwerk: Knopf <b>öffnen</b>. ' : '') + (d0(d).kopie ? 'Kein Zugang oder Anmeldung klappt nicht? Knopf <b>PDF-Kopie</b> – sie öffnet direkt die richtige Seite. ' : '') + 'Fehlt das Dokument ganz, schicken Sie ' + esc(bn('dat')) + ' eine Nachricht (oben „✉“).</p></details>'
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
  let html = '<div class="zeile" style="justify-content:space-between"><h2>' + (zeig ? 'Fahrplan: Finden Sie die Dokumente' : 'Fragen üben') + '</h2>' + miniRing((S.fragen.length - z.offen) / n, (S.fragen.length - z.offen) + ' von ' + S.fragen.length + ' geübt') + '</div>'
    + (zeig ? '<p>So üben Sie in zwei Schritten. Sie müssen nichts auswendig lernen.</p>' + planDurchgangHtml()
      + '<h3 class="schritt">Schritt 2: Einzelne Fragen der Prüfliste üben</h3><p>Das ist die Prüfliste des Auditors. Er fragt diese Punkte ab – nicht unbedingt in dieser Reihenfolge. Üben Sie: <b>Frage lesen → Dokument öffnen → zeigen.</b></p>'
      : '<p>So fragt der Auditor in Stufe 2. Antworten Sie, wie Sie es im Audit sagen würden: <b>Was wir machen – wo es steht – ein Beispiel.</b></p>')
    + '<div class="karte"><div class="balken"><span style="width:' + (z.gruen / n * 100) + '%;background:var(--gruen)"></span><span style="width:' + (z.gelb / n * 100) + '%;background:var(--gelb)"></span><span style="width:' + (z.rot / n * 100) + '%;background:var(--rot)"></span></div>'
    + '<div class="legende"><span><span class="dot gruen"></span> sicher (' + z.gruen + ')</span><span><span class="dot gelb"></span> mit Hilfe / langsam (' + z.gelb + ')</span><span><span class="dot rot"></span> weiß nicht (' + z.rot + ')</span><span><span class="dot"></span> offen (' + z.offen + ')</span></div>'
    + '<div class="chips" role="group" aria-label="Fragen filtern">' + [['alle', 'Alle', S.fragen.length], ['offen', 'Offen', z.offen], ['ueben', 'Schwer', z.gelb + z.rot], ['sicher', 'Sicher', z.gruen]].map(c => '<button class="chip-knopf ' + (S.filter === c[0] ? 'an' : '') + '" data-filter="' + c[0] + '">' + c[1] + ' <span class="anz">' + c[2] + '</span></button>').join('') + '</div>'
    + '<div class="zeile">'
    + '<button class="knopf" id="naechste">▶ ' + (zeig ? 'Nächste offene üben' : 'Nächste Frage') + '</button>'
    + (zeig ? '<button class="knopf zweit" id="probe">Generalprobe: alles am Stück</button>' : '') + '</div></div>'
    + (!zeig ? '<div class="karte"><b>Auditor nach Maß</b> – wie soll Ihr Übungsauditor sein? <span class="grau">Nach Stufe 1 wissen Sie, wie Ihr echter Auditor „tickt“.</span><div class="typen">'
      + Object.entries(L.AUDITOR_TYPEN).map(([k, t]) => '<label class="typ ' + (typ.typ === k ? 'an' : '') + '"><input type="radio" name="typ" value="' + k + '" ' + (typ.typ === k || (!typ.typ && k === 'sachlich') ? 'checked' : '') + '><b>' + esc(t.name) + '</b><span class="grau">' + esc(t.text) + '</span></label>').join('')
      + '</div><button class="knopf" id="runde">▶ Übungsrunde mit diesem Auditor (10 Fragen inkl. Stolperfallen)</button> <span class="grau">Standard laut Berater: ' + esc(lv.name || '') + '</span></div>' : '');
  const sicht = S.fragen.filter(f => { const a = L.ampel(antwortenZu(f.id)); return S.filter === 'alle' || (S.filter === 'offen' ? a === 'offen' : S.filter === 'sicher' ? a === 'gruen' : (a === 'gelb' || a === 'rot')); });
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
  $$('[data-filter]').forEach(b => b.onclick = () => { S.filter = b.dataset.filter; ANSICHT.fahrplan(); });
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
  return '<div class="zeile" style="justify-content:space-between"><span class="grau zeile">' + esc(info) + (q && q.items.length > 1 ? miniRing(q.pos / q.items.length, 'Punkt ' + q.pos + ' von ' + q.items.length) : '') + '</span><button class="knopf klein zweit" id="t-zu">' + (q && q.items.length > 1 ? 'Beenden' : 'Schließen') + '</button></div>';
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
  let start = Date.now(), hilfe = false, foto = null, gefundenBei = 0;
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
    + (zeig ? '<button class="knopf gruen" id="t-gefunden">Gefunden!</button>' : '<button class="knopf gruen" id="t-fertig">Fertig – Rückmeldung</button>')
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
      t.innerHTML = '<p class="grau">Tipp: Wenn Sie einmal den Bildschirm teilen, macht das Programm das Übungsfoto selbst. <button class="link" id="t-share">Bildschirm teilen</button> Es geht auch ohne – dann fügen Sie ein eigenes Bildschirmfoto ein.</p>';
      $('#t-share').onclick = async () => { if (await teilen()) { t.innerHTML = '<p class="grau">✓ Bildschirm wird geteilt.</p>'; start = Date.now(); } };
    } else t.innerHTML = '<p class="grau">✓ Bildschirm wird geteilt.</p>';
  } else diktat($('#t-diktat'), (txt) => { $('#t-text').value += ($('#t-text').value ? ' ' : '') + txt; });

  const fertig = async (sicherheit, gefunden, pruefung) => {
    clearInterval(uhr);
    const sek = Math.round(((gefundenBei || Date.now()) - start) / 1000);
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
    $('#t-erg').innerHTML = '<div class="karte"><span class="dot ' + farbe + '"></span> <b>' + (farbe === 'gruen' ? 'Sehr gut – ' + (zeig ? 'gefunden in ' + sek + (sek === 1 ? ' Sekunde.' : ' Sekunden.') : 'sicher beantwortet.') : farbe === 'gelb' ? (zeig ? 'Gefunden' + (hilfe ? ' mit Hilfe' : '') + ' in ' + sek + ' Sekunden. Merken Sie sich die Fundstelle oben.' : 'Gespeichert. Schauen Sie sich die Fundstelle oben noch einmal an.') : 'Kein Problem – genau dafür üben wir. Die Fundstelle steht oben.') + '</b></div>'
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
    eigeneAuszuege(f.frage + ' ' + (f.hilfe || ''), 4).then(eig => ki('antwort_feedback', Object.assign({ frage: f.frage, antwort: $('#t-text').value, hilfe: f.hilfe }, eig ? { auszuege: eig } : {}))).then(k => { if (k && k.verbesserung) $('#t-erg .karte').insertAdjacentHTML('beforeend', '<div class="grau" style="margin-top:6px"><b>KI-Coach:</b> ' + esc(k.lob || '') + ' ' + esc(k.verbesserung) + (k.bessere_antwort ? '<br><i>So ginge es: ' + esc(k.bessere_antwort) + '</i>' : '') + '</div>'); });
    $$('[data-s2]', box).forEach(b => b.onclick = () => fertig(b.dataset.s2, true));
  };
  const g = $('#t-gefunden');
  if (g) g.onclick = () => {
    gefundenBei = Date.now(); clearInterval(uhr); // Zeit stoppt beim Finden, das Foto zaehlt nicht mit
    $('#t-knoepfe').innerHTML = ''; $('#t-teilen').innerHTML = '';
    fotoWaehlen($('#t-foto'), async (bild) => {
      foto = bild; let pruefung = null;
      if (!foto) return fertig('sicher', true, null);
      $('#t-foto').innerHTML = '<p class="grau">Ihr Übungsfoto:</p><img class="foto" src="' + foto + '" alt="Bildschirmfoto"><div id="t-pruef" class="grau">Ich prüfe, ob das die richtige Stelle ist … <button class="link" id="t-ohne">ohne Prüfung weiter</button></div>';
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
      fertig('sicher', true, pruefung);
    });
  };
}
/* Übungsfoto: drei Wege, weil das Teilen nicht überall klappt (Mac-Freigabe, nur ein Bildschirm, Firmen-Laptop).
   1) Foto in 5 Sekunden (Bildschirm wird geteilt, Kunde wechselt zum Dokument)  2) eigenes Bildschirmfoto mit Strg+V einfügen  3) Bilddatei wählen */
function fotoWaehlen(ziel, weiter) {
  const mac = /Mac/.test(navigator.platform || navigator.userAgent);
  const tasten = mac ? '<kbd>⌘</kbd> + <kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>4</kbd>, Bereich aufziehen' : '<kbd>Windows</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>, Bereich aufziehen';
  // Handy/Tablet: kein Bildschirm-Teilen und keine Tastenkürzel – dort nur Bildschirmfoto aus der Galerie oder Kamera
  const handy = !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) || (window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);
  if (handy) {
    ziel.innerHTML = '<div class="karte foto-wahl"><b>Gut gefunden! Jetzt das Übungsfoto von der Stelle:</b>'
      + '<div class="foto-weg"><label class="knopf">📷 Bildschirmfoto wählen<input type="file" accept="image/*" id="fw-datei" hidden></label><span class="grau">Am Handy: Bildschirmfoto vom Dokument machen (meist Ein/Aus + Leiser gleichzeitig), dann hier auswählen.</span></div>'
      + '<div id="fw-status" class="grau"></div><button class="link" id="fw-ohne">Ohne Foto weiter</button></div>';
    let fertigH = false; const endeH = (bild) => { if (fertigH) return; fertigH = true; weiter(bild); };
    $('#fw-datei').onchange = async (e) => { const d = e.target.files[0]; if (d) endeH(await verkleinern(await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(d); }), 1600)); };
    $('#fw-ohne').onclick = () => endeH(null);
    return;
  }
  ziel.innerHTML = '<div class="karte foto-wahl"><b>Gut gefunden! Jetzt das Übungsfoto von der Stelle:</b>'
    + '<div class="foto-weg"><button class="knopf" id="fw-countdown">⏱ Foto in 5 Sekunden</button><span class="grau">Klicken, dann sofort zum Dokument wechseln. Nach dem Piepton zurückkommen.</span></div>'
    + '<div class="foto-weg"><button class="knopf zweit" id="fw-einf">📋 Einfügen</button><span class="grau">Eigenes Bildschirmfoto: ' + tasten + ', dann hier <kbd>' + (mac ? '⌘' : 'Strg') + '</kbd> + <kbd>V</kbd> drücken.</span></div>'
    + '<div class="foto-weg"><label class="knopf zweit">📁 Bild wählen<input type="file" accept="image/*" id="fw-datei" hidden></label><span class="grau">Gespeichertes Bildschirmfoto oder Handyfoto vom Bildschirm.</span></div>'
    + '<div id="fw-status" class="grau"></div><button class="link" id="fw-ohne">Ohne Foto weiter</button></div>';
  let fertig = false;
  const ende = (bild) => { if (fertig) return; fertig = true; document.removeEventListener('paste', einf); weiter(bild); };
  const ausDatei = (datei) => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(datei); });
  const einf = async (e) => { const it = [...((e.clipboardData || {}).items || [])].find(x => /^image\//.test(x.type)); if (!it) { $('#fw-status').textContent = 'In der Zwischenablage ist kein Bild. Erst das Bildschirmfoto machen, dann einfügen.'; return; } e.preventDefault(); ende(await verkleinern(await ausDatei(it.getAsFile()), 1600)); };
  document.addEventListener('paste', einf);
  $('#fw-datei').onchange = async (e) => { const d = e.target.files[0]; if (d) ende(await verkleinern(await ausDatei(d), 1600)); };
  $('#fw-ohne').onclick = () => ende(null);
  $('#fw-einf').onclick = () => { $('#fw-status').innerHTML = 'Machen Sie jetzt das Bildschirmfoto (' + tasten + ') und drücken Sie danach hier <kbd>' + (mac ? '⌘' : 'Strg') + '</kbd> + <kbd>V</kbd>.'; };
  $('#fw-countdown').onclick = async () => {
    const st = await teilen(); if (!st) { $('#fw-status').textContent = 'Bildschirm teilen hat nicht geklappt. Nehmen Sie den Weg „Einfügen“ darunter.'; return; }
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = st; v.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none'; document.body.appendChild(v); v.play().catch(() => {});
    const titel = document.title;
    for (let i = 5; i > 0; i--) { $('#fw-status').innerHTML = '<b>Foto in ' + i + ' …</b> Jetzt zum Dokument wechseln.'; document.title = '📸 ' + i + ' …'; await new Promise(r => setTimeout(r, 1000)); }
    let bild = null;
    try { if (window.ImageCapture) { const bm = await new ImageCapture(st.getVideoTracks()[0]).grabFrame(); const c = document.createElement('canvas'); const f = Math.min(1, 1600 / bm.width); c.width = Math.round(bm.width * f); c.height = Math.round(bm.height * f); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); bild = c.toDataURL('image/jpeg', 0.85); } } catch (e) { /* weiter mit Video */ }
    if (!bild) bild = await bildschirmfoto(st);
    v.srcObject = null; v.remove(); piep(); document.title = '✓ Foto gemacht – zurück zur Übung'; setTimeout(() => { document.title = titel; }, 8000);
    if (!bild) { $('#fw-status').textContent = 'Das Foto ist leer. Am Mac: Systemeinstellungen → Datenschutz & Sicherheit → Bildschirmaufnahme → Chrome erlauben. Oder den Weg „Einfügen“ nehmen.'; return; }
    ende(bild);
  };
}
function piep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.25); } catch (e) { /* ohne Ton */ } }
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
    + '<p class="grau">' + (kiAn() ? 'Vier' : 'Drei') + ' Übungen, jede dauert ein paar Minuten. Sie helfen vor allem für <b>Stufe 2</b>, wenn der Auditor fragt „Wie machen Sie das?“.</p>'
    + '<div class="karte zeile" style="justify-content:space-between"><span>🎙️ <b>Probeaudit:</b> Der Auditor fragt laut, Sie antworten mit Stimme – wie im echten Audit.</span><button class="knopf" data-schnell="probeaudit">Zum Probeaudit</button></div>'
    + '<h3>Erklär es dem Azubi</h3><p class="erkl-kurz"><b>Was ist das?</b> Sie erklären einen Ablauf aus Ihrem Handbuch so, als käme morgen ein neuer Mitarbeiter. Wer es einem Azubi in eigenen Worten erklären kann, kann es auch dem Auditor erklären. Wenn Sie nicht weiterwissen: <b>Musterlösung</b> ansehen.</p><div class="karte" id="azubi"></div>'
    + '<h3>Audit-Deutsch: Was heißt das eigentlich?</h3><p class="erkl-kurz"><b>Was ist das?</b> Lernkarten für Fachwörter, die Auditoren benutzen. Vorne das Fachwort, hinten die Bedeutung in Alltagssprache. Begriff anklicken, dann „Kann ich“ oder „Nochmal“.</p><div class="karten">'
    + karten.map((k, i) => '<div class="lernkarte ' + (gekonnt(i) ? 'kann' : '') + '" data-i="' + i + '"><div class="vorne">' + esc(k[0]) + '</div><div class="hinten" hidden>' + esc(k[1]) + '<div class="zeile"><button class="knopf klein gruen" data-k="1">Kann ich</button><button class="knopf klein zweit" data-k="0">Nochmal</button></div></div></div>').join('') + '</div>'
    + '<h3>Rollentausch: Sie sind der Auditor</h3><p class="erkl-kurz"><b>Was ist das?</b> Hier tauschen Sie die Rollen: Sie lesen eine Antwort, wie sie ein Kunde im Audit geben könnte, und entscheiden wie ein Auditor, ob sie gut ist. Wer den Fehler beim anderen sieht, macht ihn selbst nicht mehr.</p>'
    + L.ROLLENTAUSCH.map((r, i) => { const e = eintrag('lernen', 'rolle:' + i); return '<div class="karte" data-r="' + i + '"><div><b>Auditor:</b> ' + esc(r.frage) + '</div><div><b>Kunde:</b> <i>' + esc(r.antwort) + '</i></div>'
      + Object.entries(r.optionen).map(([k, t]) => '<label class="option"><input type="radio" name="r' + i + '" value="' + k + '" ' + (e && e.daten.wahl === k ? 'checked' : '') + '> ' + esc(t) + '</label>').join('')
      + '<div class="erkl" ' + (e ? '' : 'hidden') + '>' + (e ? (e.daten.wahl === r.richtig ? '✓ Richtig. ' : '✗ Nicht ganz. ') : '') + esc(r.erklaerung) + '</div></div>'; }).join('');
  azubi();
  $$('[data-schnell=probeaudit]').forEach(b => b.onclick = () => zeige('probeaudit'));
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
      + '<button class="link" id="az-quelle">Im Handbuch nachlesen</button>' + stelleKnopf(p.dokument_id, 'Seite ' + p.von + (p.bis > p.von ? '–' + p.bis : '')) + '<button class="knopf klein zweit" id="az-muster">💡 Musterlösung</button></div><div id="az-quelltext"></div>';
    $('#az-zurueck').onclick = () => azubi();
    $$('[data-d]', box).forEach(b => b.onclick = () => oeffne(b.dataset.d, b.dataset.ort || ''));
    $('#az-vor').onclick = () => vorlesen(frage);
    diktat($('#az-diktat'), (t) => { $('#az-text').value += ($('#az-text').value ? ' ' : '') + t; });
    $('#az-muster').onclick = () => { const m = L.musterErklaerung(p, dokTitel(p.dokument_id));
      $('#az-quelltext').innerHTML = '<div class="karte gut"><b>So könnten Sie es erklären</b> <span class="grau">(aus Ihrem Handbuch in gesprochene Sprache übertragen – nicht auswendig lernen, sondern mit eigenen Worten und Ihrem Beispiel)</span><p>' + esc(m.text) + '</p>'
        + (m.schritte.length ? '<div class="grau">Die Schritte im Handbuch: ' + m.schritte.map((x, i) => (i + 1) + '. ' + esc(x.tat)).join(' · ') + '</div>' : '') + '</div>'; };
    $('#az-quelle').onclick = () => { $('#az-quelltext').innerHTML = '<div class="auszug"><div class="auszug-text">' + esc(p.text.slice(0, 1800)).replace(/\n/g, '<br>') + '</div>' + stelleKnopf(p.dokument_id, 'Seite ' + p.von + (p.bis > p.von ? '–' + p.bis : '')) + '</div>'; dokKnoepfe($('#az-quelltext')); };
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
/* Beste Fundstelle zu Stichworten; bevorzugt = Dokumenttitel (z. B. Musterauftrag), ohne = alle anderen Dokumente */
async function stelleZu(suche, nurTitel, ohneTitel) {
  const a = (await auszuege()).filter(x => { const t = dokTitel(x.dokument_id); return (!nurTitel || nurTitel.test(t)) && (!ohneTitel || !ohneTitel.test(t)); });
  const r = L.auszuegeSuchen(suche, a, 1)[0]; return r ? r.auszug : null;
}
const BELEGE = /musterauftrag|beispielauftrag|auftrag\s*\d{4}/i, PRUEFLISTE = /wartung|prüffrist|prüfliste|prüfmittel|qm-übersicht/i;
ANSICHT.spur = async () => {
  const st = L.SPUR_STATIONEN.map(s => Object.assign({ k: s.k }, (eintrag('spur', s.k) || {}).daten || {}));
  const pr = L.spurPruefen(st.filter(x => Object.keys(x).length > 1));
  const hatBelege = S.start.dokumente.some(d => BELEGE.test(d.titel));
  const orte = await Promise.all(L.SPUR_STATIONEN.map(async x => ({ ablauf: await stelleZu(x.suche || x.name, null, BELEGE), beleg: hatBelege ? await stelleZu(x.suche || x.name, BELEGE) : null })));
  if (S.ansicht !== 'spur') return;
  $('#main').innerHTML = '<h2>Beispielauftrag: der rote Faden</h2><p>In Stufe 2 nimmt der Auditor oft <b>einen</b> abgeschlossenen Auftrag und verfolgt ihn durch die Firma – von der Anfrage bis zur Rechnung. Suchen Sie jetzt einen aus und legen Sie zu jeder Station den Beleg bereit. '
    + 'Bei jeder Station steht, <b>welcher Prozess</b> gemeint ist, <b>welchen Nachweis</b> der Auditor sehen will und was er typischerweise fragt. Datum und Nummer genügen – das Programm prüft, ob der Faden hält.</p>'
    + (hatBelege ? '<div class="hinweis">In der Beispielfirma liegt ein vollständiger <b>Musterauftrag</b>. Öffnen Sie bei jeder Station „Beleg öffnen“ und tragen Sie Datum und Nummer ab – so üben Sie, wie Sie es im Audit zeigen.</div>' : '')
    + '<div class="karte ' + (pr.ok ? 'gut' : '') + '"><b>' + pr.fertig + ' von ' + pr.von + ' Stationen</b>' + (pr.hinweise.length ? '<ul>' + pr.hinweise.map(h => '<li>' + esc(h) + '</li>').join('') + '</ul>' : ' – der rote Faden hält. Diese Belege zeigen Sie im Audit.') + '</div>'
    + L.SPUR_STATIONEN.map((s, i) => { const d = st[i], o = orte[i]; return '<div class="karte station" data-k="' + s.k + '"><div class="zeile" style="justify-content:space-between"><b>' + (i + 1) + '. ' + esc(s.name) + '</b>' + (d.foto ? '<span class="chip">Beleg ✓</span>' : '') + '</div>'
      + '<div class="vorgabe">' + (s.prozess ? '<div><span class="etikett-klein">Prozess</span> ' + esc(s.prozess) + '</div>' : '') + '<div><span class="etikett-klein">Nachweis</span> ' + esc(s.nachweis || s.hilfe) + '</div>' + (s.frage ? '<div><span class="etikett-klein">Auditor fragt</span> „' + esc(s.frage) + '“</div>' : '')
      + ((o.ablauf || o.beleg) ? '<div class="zeile">' + (o.ablauf ? stelleKnopf(o.ablauf.dokument_id, o.ablauf.ort, 'Ablauf öffnen').replace('>Seite', '>Ablauf: ' + esc(dokKurz(o.ablauf.dokument_id)) + ' Seite') : '') + (o.beleg ? stelleKnopf(o.beleg.dokument_id, o.beleg.ort, 'Beleg öffnen').replace('>Seite', '>Beleg: Seite') : '') + '</div>' : '') + '</div>'
      + '<div class="zeile"><label>Datum <input type="date" data-f="datum" value="' + esc(d.datum || '') + '"></label><label>Kunden-/Auftragsnr. <input data-f="nummer" value="' + esc(d.nummer || '') + '" size="12"></label></div>'
      + '<input data-f="notiz" placeholder="Was ist das für ein Beleg? (z. B. Angebot Nr. 2026-041)" value="' + esc(d.notiz || '') + '" style="width:100%">'
      + '<div class="zeile"><label class="knopf klein zweit">📷 Foto/Scan<input type="file" accept="image/*" capture="environment" hidden data-f="foto"></label><button class="knopf klein zweit" data-b="1">🖥 Bildschirmfoto</button><button class="knopf klein" data-s="1">Speichern</button></div>'
      + (d.foto ? '<img class="mini" src="' + d.foto + '" alt="Beleg">' : '') + '</div>'; }).join('');
  dokKnoepfe($('#main'));
  $$('.station').forEach(k => {
    const s = L.SPUR_STATIONEN.find(x => x.k === k.dataset.k);
    let foto = ((eintrag('spur', s.k) || {}).daten || {}).foto || '';
    const sichern = async () => { await speichereEintrag('spur', s.k, { datum: $('[data-f=datum]', k).value, nummer: $('[data-f=nummer]', k).value.trim(), notiz: $('[data-f=notiz]', k).value.trim(), foto }, true); zeichneKopf(); ANSICHT.spur(); };
    $('[data-f=foto]', k).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; foto = await verkleinern(await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }), 480); sichern(); };
    $('[data-b]', k).onclick = async () => { const st2 = await teilen(); if (!st2) return; const b = await bildschirmfoto(st2); if (b) { foto = await verkleinern(b, 480); sichern(); } };
    $('[data-s]', k).onclick = sichern;
  });
};
function dokKurz(id) { const d = S.start.dokumente.find(x => x.id === id) || {}; return d.kurzname || String(d.titel || 'Dokument').split(/[ (]/)[0]; }

/* ------------------------------------------------ Foto-Rundgang (Idee 10) */
ANSICHT.rundgang = async () => {
  const std = Object.fromEntries(L.RUNDGANG_STANDARD.map(x => [x.k, x]));
  const items = (S.start.rundgang || L.RUNDGANG_STANDARD).map(x => Object.assign({}, std[x.k] || {}, x));
  const orte = await Promise.all(items.map(async it => (await stelleZu(it.suche || it.name, /wartung|prüfplan|prüffrist/i)) || stelleZu(it.suche || it.name, PRUEFLISTE)));
  if (S.ansicht !== 'rundgang') return;
  $('#main').innerHTML = '<h2>Foto-Rundgang</h2>'
    + '<div class="karte vorgabe-gross"><b>Was erwartet der Auditor beim Rundgang?</b><p>In Stufe 2 geht der Auditor durch Werkstatt, Lager und Fahrzeuge. Er schaut, ob <b>Prüffristen eingehalten</b> sind (Plaketten, Aufkleber), ob es <b>Nachweise</b> gibt (Prüfliste, Protokoll) und ob die Mitarbeiter wissen, wo Feuerlöscher und Erste-Hilfe-Kasten sind. '
    + 'Abgelaufene Plaketten sind der häufigste Befund beim Rundgang – und am leichtesten vorher zu beheben.</p><p><b>So gehen Sie vor:</b> Mit dem Handy durch den Betrieb gehen, jede Plakette fotografieren und den Monat der <b>nächsten</b> Prüfung eintragen. Rot heißt: vor dem Audit erledigen.</p></div>'
    + items.map((it, i) => { const d = (eintrag('rundgang', it.k) || {}).daten || {}; const s = L.rundgangStatus(Object.assign({ intervall_monate: it.intervall_monate }, d)), o = orte[i];
      return '<div class="karte rg" data-k="' + esc(it.k) + '"><div class="zeile" style="justify-content:space-between"><b>' + esc(it.name) + '</b><span class="chip ' + s.status + '">' + ({ ok: '✓ in Ordnung', bald: 'diesen Monat fällig', faellig: '⚠ überfällig', offen: 'offen' }[s.status]) + (s.naechste ? ' · ' + s.naechste.split('-').reverse().join('/') : '') + '</span></div>'
        + '<div class="vorgabe"><div><span class="etikett-klein">Fotografieren</span> ' + esc(it.hilfe) + '</div>' + (it.erwartung ? '<div><span class="etikett-klein">Auditor erwartet</span> ' + esc(it.erwartung) + '</div>' : '')
        + (o ? '<div class="zeile">' + stelleKnopf(o.dokument_id, o.ort, 'In der Prüfliste nachsehen').replace('>Seite', '>Prüfliste: ' + esc(dokKurz(o.dokument_id)) + ' Seite').replace('>Reiter', '>Prüfliste: Reiter') + '</div>' : '') + '</div>'
        + '<div class="zeile"><label>Nächste Prüfung <input type="month" data-f="naechste" value="' + esc(d.naechste || '') + '"></label><span class="grau">oder</span><label>letzte Prüfung <input type="month" data-f="letzte" value="' + esc(d.letzte || '') + '"></label></div>'
        + '<div class="zeile"><label class="knopf klein zweit">📷 Foto<input type="file" accept="image/*" capture="environment" hidden data-f="foto"></label><button class="knopf klein" data-s="1">Speichern</button></div>'
        + (d.foto ? '<img class="mini" src="' + d.foto + '" alt="Foto">' : '') + '</div>'; }).join('');
  dokKnoepfe($('#main'));
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
    + '<div class="spick-box"><b>Merksätze:</b> Zeigen statt erzählen · Nichts erfinden · Der Auditor hilft beim Finden · Nur gültige Dokumente öffnen · „Das schaue ich nach“ ist erlaubt</div>'
    + '<div class="spick-fuss">Auditvorbereitung mit ' + esc(MARKE.firma) + ' · ' + esc(MARKE.websiteText) + '</div></div>';
  $('#drucken').onclick = () => window.print();
  dokKnoepfe($('#main'));
  const t = $('#trotz'); if (t) t.onclick = () => { S.trotzRuhe = true; laden(); };
};

/* ------------------------------------------------ Nach dem Audit: Rueckmeldung + Ergebnis an den Berater (Ideen 1, 8, 11) */
ANSICHT.danach = () => {
  const r = (eintrag('rueckmeldung', 'audit') || {}).daten || {};
  const ERG = [['bestanden', 'Bestanden – Empfehlung zur Zertifizierung'], ['auflagen', 'Bestanden mit Abweichungen (Korrekturen nachreichen)'], ['offen', 'Noch offen / nicht bestanden']];
  $('#main').innerHTML = '<h2>Nach dem Audit</h2><p>Direkt danach kurz festhalten – das hilft bei der Vorbereitung auf die nächste Stufe und für das nächste Jahr.</p>'
    + '<div class="karte"><label><b>Wie ist das Audit ausgegangen?</b><select id="r-ergebnis"><option value="">– bitte wählen –</option>' + ERG.map(e => '<option value="' + e[0] + '" ' + (r.ergebnis === e[0] ? 'selected' : '') + '>' + esc(e[1]) + '</option>').join('') + '</select></label>'
    + '<label><b>Wie war der Auditor?</b><select id="r-typ"><option value="">– bitte wählen –</option>' + Object.entries(L.AUDITOR_TYPEN).map(([k2, t]) => '<option value="' + k2 + '" ' + (r.typ === k2 ? 'selected' : '') + '>' + esc(t.name) + ' – ' + esc(t.text) + '</option>').join('') + '</select></label>'
    + '<label><b>Welche Fragen kamen?</b> <span class="grau">(eine pro Zeile, so wörtlich wie möglich)</span><textarea id="r-fragen" rows="6">' + esc(r.fragen || '') + '</textarea></label>'
    + '<label><b>Was lief gut?</b><textarea id="r-gut">' + esc(r.gut || '') + '</textarea></label>'
    + '<label><b>Wo war es schwer?</b><textarea id="r-schwer">' + esc(r.schwer || '') + '</textarea></label>'
    + '<label><b>Was hat der Auditor festgestellt?</b> <span class="grau">(Hinweise, Abweichungen)</span><textarea id="r-fest">' + esc(r.fest || '') + '</textarea></label>'
    + '<button class="knopf" id="r-speichern">Speichern</button></div>'
    + '<div id="r-karten">' + nachAuditKarten(r) + '</div>'
    + (S.start.eigen ? '<div class="karte grau">🔒 Ihre Rückmeldung bleibt auf diesem Gerät. Was Sie am Werkzeug verbessern würden, schicken Sie gern über „💡 Verbesserung“.</div>'
      : '<h3>Ergebnis an ' + esc(bn('akk')) + '</h3><div class="karte">'
      + (!S.start.demo ? '<p>' + (api.lokal ? 'Ihre Rückmeldung und Ihr Übungsstand liegen nur in diesem Browser. Ein Klick schickt beides direkt an ' + esc(bn('akk')) + '.' : 'Ihre Rückmeldung ist gespeichert. Mit einem Klick bekommt ' + esc(bn('nom')) + ' zusätzlich Ihre Nachricht.') + '</p><div class="zeile"><button class="knopf" id="r-senden">✉ Ergebnis an ' + esc(bn('akk')) + ' senden</button></div>'
        + (api.lokal ? '<p class="grau">Nur falls das Senden nicht klappt: <button class="link" id="r-export">Datei herunterladen</button> und per E-Mail schicken.</p>' : '')
        : '<p class="grau">Demo – hier würde der Kunde sein Ergebnis an den Berater schicken.</p>') + '</div>');
  const werte = () => ({ ergebnis: $('#r-ergebnis').value, typ: $('#r-typ').value, fragen: $('#r-fragen').value, gut: $('#r-gut').value, schwer: $('#r-schwer').value, fest: $('#r-fest').value });
  $('#r-speichern').onclick = async () => {
    const w = werte();
    await speichereEintrag('rueckmeldung', 'audit', w);
    if (w.typ) await speichereEintrag('auditor', 'typ', { typ: w.typ, quelle: 'rueckmeldung' });
    $('#r-karten').innerHTML = nachAuditKarten(w); karteKnoepfe();
    hinweisBox('Gespeichert. Danke!', 'ok');
  };
  karteKnoepfe();
  const ex = $('#r-export'); if (ex) ex.onclick = () => herunterladen();
  const rs = $('#r-senden'); if (rs) rs.onclick = async () => { $('#r-speichern').click(); sendenPanel(''); };
};
/* Ende des Weges (E-A34): Bewertungsbitte an ALLE, die ein Ergebnis eingetragen haben (Google-Richtlinie: keine Auswahl nur Zufriedener),
   dazu der nächste logische Schritt (Folgejahr). Nicht im Testmonat (Beispielfirma bzw. fremde Teilnehmer) und nicht vor dem Ergebnis. */
function nachAuditKarten(r) {
  if (!r || !r.ergebnis) return '';
  const geschafft = r.ergebnis !== 'offen';
  const bewertung = S.start.test ? '' : '<div class="karte marke-karte"><b>' + (geschafft ? 'Herzlichen Glückwunsch! 🎉' : 'Danke für Ihre Rückmeldung.') + '</b>'
    + '<p>' + (geschafft ? 'Wenn Sie anderen Unternehmen helfen möchten, die vor dem gleichen Schritt stehen: Eine kurze Google-Bewertung ist die beste Weiterempfehlung.'
      : 'Eine kurze, ehrliche Google-Bewertung hilft anderen Unternehmen bei der Wahl ihres Beraters – und mir, besser zu werden.') + '</p>'
    + '<a class="knopf" href="' + esc(MARKE.bewerten) + '" target="_blank" rel="noopener">★ Google-Bewertung schreiben</a></div>';
  // Nächster Schritt: das jährliche Audit des Zertifizierers – über die bestehende Angebotsseite (der Kunde fordert selbst an, nichts geht automatisch raus)
  const folgejahr = '<div class="karte marke-karte" style="--f:#0B7285"><b>' + (S.start.test ? 'Persönliche Begleitung für Ihr Audit?' : 'Und nächstes Jahr?') + '</b>'
    + '<p>' + (S.start.test ? 'Wenn Sie sich nicht allein vorbereiten möchten: ' + esc(MARKE.name) + ' bereitet Sie und Ihr Team auf das Audit des Zertifizierers vor – mit dieser Auditvorbereitung und Ihren Unterlagen.'
      : 'Jedes Jahr kommt der Zertifizierer wieder – meist ohne dass vorher jemand alles vorbereitet. ' + esc(MARKE.name) + ' bereitet Sie wieder vor, die Auditvorbereitung bleibt dabei aktiv.')
    + ' <span class="grau">Aufwand ' + esc(MARKE.angebotPreis) + '.</span></p>'
    + (S.start.demo ? '' : '<div class="zeile"><a class="knopf zweit" href="' + esc(MARKE.angebot) + '" target="_blank" rel="noopener">Unverbindliches Angebot anfordern</a>'
      + (S.start.eigen ? '' : '<button class="link" id="r-folgejahr">oder kurz Bescheid geben</button>') + '</div>') + '</div>';
  return bewertung + folgejahr;
}
function karteKnoepfe() { const b = $('#r-folgejahr'); if (b) b.onclick = () => sendenPanel('Ich interessiere mich für die Betreuung im Folgejahr (Überwachungsaudit). Bitte melden Sie sich.'); }
function herunterladen() {
  const daten = api.export(); const blob = new Blob([JSON.stringify(daten, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Auditvorbereitung_' + S.start.kunde.name.replace(/[^A-Za-z0-9ÄÖÜäöüß]+/g, '_').slice(0, 40) + '_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

window.__av = S; // fuer Tests
start();
