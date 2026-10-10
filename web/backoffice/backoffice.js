/**
 * Backoffice Auditvorbereitung (Lektion A15): Anmelden, alle Kunden im Überblick, Kunde importieren,
 * persönlichen Link erzeugen, Nachrichten und Ergebnisse ansehen.
 * Läuft komplett im Browser mit dem öffentlichen Schlüssel; was jemand sehen darf, entscheidet die Datenbank (RLS, ist_backoffice()).
 * Nie automatische Mails an Kunden – höchstens ein Entwurf im eigenen Mailprogramm.
 */
import L from '../logik.js';
import { berichtHtml, csvKnoepfe } from '../auswertung/bericht.js';

const cfg = window.AV_CONFIG || {};
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const datum = (d) => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('de-DE') : '–';
const vorWann = (t) => { if (!t) return 'noch nie'; const m = Math.round((Date.now() - new Date(t)) / 60000); if (m < 60) return 'vor ' + Math.max(1, m) + ' Min.'; const h = Math.round(m / 60); if (h < 36) return 'vor ' + h + ' Std.'; return 'vor ' + Math.round(h / 24) + ' Tagen'; };
const pflicht = (r) => { if (r.error) throw new Error(r.error.message || String(r.error)); return r.data; };

if (!cfg.supabaseUrl || !window.supabase) {
  $('#main').innerHTML = '<div class="karte fehler"><b>Noch nicht verbunden.</b> In <code>config.js</code> fehlen Supabase-Adresse und öffentlicher Schlüssel.</div>';
  throw new Error('keine Konfiguration');
}
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.anonKey);
const S = { kunde: null, reiter: 'ueberblick' };

/* ------------------------------------------------ Anmelden */
async function start() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return anmelden();
  const ich = await sb.from('backoffice_nutzer').select('email, name, aktiv').maybeSingle();
  $('#kopf-rechts').innerHTML = '<span>' + esc(data.session.user.email) + '</span><button class="knopf klein" id="abmelden" style="background:transparent;border:1px solid #fff;color:#fff">Abmelden</button>';
  $('#abmelden').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  if (!ich.data || !ich.data.aktiv) {
    $('#main').innerHTML = '<div class="karte hinweis"><b>Angemeldet, aber noch nicht freigeschaltet.</b><p>Einmal im Supabase SQL Editor ausführen:</p><pre>insert into public.backoffice_nutzer (email, name) values (\'' + esc(data.session.user.email) + '\', \'' + esc(data.session.user.email.split('@')[0]) + '\');</pre><p>Danach diese Seite neu laden.</p></div>';
    return;
  }
  uebersicht();
}
function anmelden(meldung) {
  $('#kopf-rechts').innerHTML = '';
  $('#main').innerHTML = '<div class="karte anmelden"><h2>Anmelden</h2>' + (meldung ? '<div class="fehler">' + esc(meldung) + '</div>' : '')
    + '<form id="login"><label for="mail">E-Mail</label><input id="mail" type="email" autocomplete="username" required><label for="pw">Passwort</label><input id="pw" type="password" autocomplete="current-password" required>'
    + '<p><button class="knopf" type="submit">Anmelden</button></p></form><p class="grau">Zugang anlegen: Supabase → Authentication → Users → Add user.</p></div>';
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $('#mail').value.trim(), password: $('#pw').value });
    if (error) return anmelden('Anmeldung fehlgeschlagen: ' + error.message);
    start();
  };
}

/* ------------------------------------------------ Übersicht aller Kunden */
async function uebersicht() {
  S.kunde = null;
  $('#main').innerHTML = '<p class="grau">Lade Kunden …</p>';
  let liste;
  try { liste = pflicht(await sb.from('kunden_uebersicht').select('*').order('naechstes_audit', { ascending: true, nullsFirst: false })); }
  catch (e) { $('#main').innerHTML = '<div class="fehler">' + esc(e.message) + '</div>'; return; }
  const tage = (d) => d ? Math.round((new Date(d + 'T12:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00')) / 86400000) : null;
  const bald = liste.filter(k => { const t = tage(k.naechstes_audit); return t != null && t <= 7; }).length;
  const neu = liste.reduce((s, k) => s + Number(k.nachrichten_neu || 0), 0), korr = liste.reduce((s, k) => s + Number(k.korrekturen_offen || 0), 0);
  const anfragenNeu = (await sb.from('testanfragen').select('id', { count: 'exact', head: true }).eq('status', 'neu')).count || 0;
  $('#main').innerHTML = '<div class="zeile" style="justify-content:space-between"><h2>Kunden</h2><div class="zeile"><input id="suche" type="search" placeholder="Kunde suchen">'
    + '<button class="knopf zweit" id="anfragen" style="--f:var(--gelb-dunkel)">Testanfragen' + (anfragenNeu ? ' <span class="chip orange">' + anfragenNeu + ' neu</span>' : '') + '</button>'
    + '<button class="knopf zweit" id="feedback" style="--f:var(--gelb-dunkel)">💡 Feedback</button>'
    + '<button class="knopf" id="neu">+ Kunde importieren</button></div></div>'
    + '<div class="kennzahlen">'
    + '<div class="kz" style="--f:var(--blau)"><div class="zahl">' + liste.length + '</div>Kunden</div>'
    + '<div class="kz" style="--f:var(--petrol)"><div class="zahl">' + bald + '</div>Audit in 7 Tagen</div>'
    + '<div class="kz" style="--f:var(--orange)"><div class="zahl">' + neu + '</div>neue Nachrichten</div>'
    + '<div class="kz" style="--f:var(--violett)"><div class="zahl">' + korr + '</div>Korrekturen offen</div></div>'
    + (liste.length ? '<div class="kunden" id="kunden"></div>' : '<div class="karte">Noch keine Kunden. Mit <b>+ Kunde importieren</b> legen Sie den ersten an.</div>');
  const zeichneListe = () => {
    const f = ($('#suche').value || '').toLowerCase();
    const el = $('#kunden'); if (!el) return;
    const kachel = (k) => {
      const t = tage(k.naechstes_audit), anteil = k.fragen ? k.geuebt / k.fragen : 0, test = k.art === 'test';
      const farbe = test ? 'var(--gelb-dunkel)' : t == null ? 'var(--rand)' : t <= 3 ? 'var(--rot)' : t <= 7 ? 'var(--gelb)' : 'var(--petrol)';
      const rest = test && k.link_gueltig_bis ? tage(k.link_gueltig_bis) : null;
      return '<button class="kunde" data-id="' + k.id + '" style="--f:' + farbe + '"><span class="zeile" style="justify-content:space-between"><span class="name">' + esc(test ? (k.teilnehmer || k.name) : k.name) + '</span>'
        + (test ? '<span class="tage">' + (rest != null && rest >= 0 ? 'noch ' + rest + ' T.' : 'abgelaufen') + '</span>' : t != null ? '<span class="tage">' + (t === 0 ? 'heute' : 'in ' + t + ' T.') + '</span>' : '') + '</span>'
        + (test ? '<span class="grau">Testmonat · KI ' + (k.ki_gesamt || 0) + (k.grenzen && k.grenzen.ki_gesamt ? ' von ' + k.grenzen.ki_gesamt : '') + '</span>' : '')
        + (k.art === 'vorlage' ? '<span class="chips"><span class="chip violett">Vorlage für den Testmonat</span></span>' : '')
        + '<span class="grau">' + esc(k.termine || 'kein Termin') + '</span>'
        + '<span class="balken" title="geübt"><span style="flex:' + anteil + ';background:var(--petrol)"></span><span style="flex:' + (1 - anteil) + '"></span></span>'
        + '<span class="grau">' + k.geuebt + ' von ' + k.fragen + ' Fragen geübt' + (k.schwer ? ' · ' + k.schwer + ' schwer' : '') + ' · aktiv ' + esc(vorWann(k.zuletzt_aktiv)) + '</span>'
        + '<span class="chips">' + (k.nachrichten_neu ? '<span class="chip orange">✉ ' + k.nachrichten_neu + ' neu</span>' : '')
        + (k.korrekturen_offen ? '<span class="chip violett">✎ ' + k.korrekturen_offen + ' Korrekturen</span>' : '')
        + (Number(k.feedback) ? '<span class="chip orange">💡 ' + k.feedback + ' Feedback</span>' : '')
        + (k.link_gueltig_bis ? '<span class="chip grau">Link bis ' + datum(k.link_gueltig_bis) + '</span>' : (k.art === 'vorlage' ? '' : '<span class="chip rot">kein Link</span>')) + '</span></button>';
    };
    const passt = liste.filter(k => !f || (k.name + ' ' + (k.teilnehmer || '')).toLowerCase().includes(f));
    const kunden = passt.filter(k => k.art !== 'test'), tests = passt.filter(k => k.art === 'test');
    el.innerHTML = kunden.map(kachel).join('') + (tests.length ? '<h3 style="grid-column:1/-1">Testmonat (LinkedIn) · ' + tests.length + '</h3>' + tests.map(kachel).join('') : '');
    $$('.kunde').forEach(b => b.onclick = () => kundeZeigen(b.dataset.id));
  };
  zeichneListe();
  $('#suche').oninput = zeichneListe;
  $('#neu').onclick = importieren;
  $('#anfragen').onclick = testanfragen;
  $('#feedback').onclick = feedbackListe;
}

/* ------------------------------------------------ Testmonat (LinkedIn)
   Weg: Anfrage auf /test/ → hier prüfen → Freischalten (kopiert die Vorlage, Link 30 Tage, Grenzen je Teilnehmer)
   → Text mit Schlüssel kopieren und SELBST im LinkedIn-Chat schicken. Nie automatische Mails. */
async function testanfragen() {
  $('#main').innerHTML = '<p><button class="link" id="zurueck">‹ Alle Kunden</button></p><h2>Testanfragen</h2><p class="grau">Lade …</p>';
  $('#zurueck').onclick = uebersicht;
  const [liste, vorlage] = await Promise.all([
    sb.from('testanfragen').select('*').order('angelegt_am', { ascending: false }).limit(300),
    sb.from('kunden').select('id, name').eq('art', 'vorlage').limit(1)]);
  const a = pflicht(liste), v = pflicht(vorlage)[0];
  const zeile = (x) => '<div class="karte" style="border-left:6px solid ' + (x.status === 'neu' ? 'var(--gelb)' : x.status === 'freigeschaltet' ? 'var(--gruen)' : 'var(--rand)') + '">'
    + '<div class="zeile" style="justify-content:space-between"><b>' + esc(x.name) + ' · ' + esc(x.firma) + '</b><span class="grau">' + new Date(x.angelegt_am).toLocaleString('de-DE') + '</span></div>'
    + '<div>' + esc(x.email) + (x.linkedin ? ' · <a href="' + esc(/^https?:/.test(x.linkedin) ? x.linkedin : 'https://' + x.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a>' : '') + '</div>'
    + '<div class="grau">' + [x.normen, x.audit_termin && 'Audit: ' + x.audit_termin, 'Quelle: ' + x.quelle].filter(Boolean).map(esc).join(' · ') + '</div>'
    + (x.nachricht ? '<p style="white-space:pre-wrap;margin:6px 0">' + esc(x.nachricht) + '</p>' : '')
    + (x.status === 'neu' ? '<div class="zeile" style="margin-top:8px"><label style="margin:0">Tage</label><input type="number" min="1" max="90" value="30" style="width:80px" data-tage="' + x.id + '">'
      + '<button class="knopf" data-frei="' + x.id + '"' + (v ? '' : ' disabled title="Erst einen Kunden als Vorlage markieren"') + '>Freischalten</button><button class="knopf klein zweit" data-ab="' + x.id + '">ablehnen</button></div><div data-ergebnis="' + x.id + '"></div>'
      : '<span class="chip ' + (x.status === 'freigeschaltet' ? 'gruen' : 'grau') + '">' + esc(x.status) + '</span>' + (x.kunde_id ? ' <button class="link" data-kunde="' + x.kunde_id + '">zum Teilnehmer</button>' : ''))
    + '</div>';
  $('#main').innerHTML = '<p><button class="link" id="zurueck">‹ Alle Kunden</button></p><h2>Testanfragen</h2>'
    + (v ? '<p class="grau">Freischalten kopiert die Vorlage <b>' + esc(v.name) + '</b> für genau diesen Teilnehmer (eigene Übungsdaten, Grenzen: 20 KI-Fragen am Tag, 150 im Monat, 5 Nachrichten am Tag, 30 Fotos).</p>'
      : '<div class="hinweis">Noch keine Vorlage. Importieren Sie den Testkunden (Testkunde.zip) und setzen Sie unter <b>Verwalten</b> „Als Vorlage für den Testmonat“.</div>')
    + '<p class="grau">Formular für Interessenten: <code>' + esc(location.origin) + '/test/</code></p>'
    + (a.length ? a.map(zeile).join('') : '<div class="karte grau">Noch keine Anfragen.</div>');
  $('#zurueck').onclick = uebersicht;
  $$('[data-kunde]').forEach(b => b.onclick = () => kundeZeigen(b.dataset.kunde, 'ueberblick'));
  $$('[data-ab]').forEach(b => b.onclick = async () => { pflicht(await sb.from('testanfragen').update({ status: 'abgelehnt', bearbeitet_am: new Date().toISOString() }).eq('id', b.dataset.ab)); testanfragen(); });
  $$('[data-frei]').forEach(b => b.onclick = async () => {
    const x = a.find(y => y.id === b.dataset.frei), tage = Number($('[data-tage="' + x.id + '"]').value) || 30;
    b.disabled = true; b.textContent = 'Lege an …';
    let tok;
    try { tok = pflicht(await sb.rpc('testkunde_anlegen', { p_anfrage: x.id, p_tage: tage })); }
    catch (e) { b.disabled = false; b.textContent = 'Freischalten'; $('[data-ergebnis="' + x.id + '"]').innerHTML = '<div class="fehler">' + esc(e.message) + '</div>'; return; }
    const url = location.origin + '/kunde/?t=' + tok, bis = new Date(Date.now() + tage * 864e5).toLocaleDateString('de-DE');
    const text = 'Hallo ' + x.name.split(' ')[0] + ',\n\ndanke für Ihr Interesse an der Auditvorbereitung! Hier ist Ihr persönlicher Zugang für den kostenlosen Testmonat (bis ' + bis + '):\n\n' + url
      + '\n\nOder unter ' + location.origin + '/test/ diesen Schlüssel eingeben:\n' + tok
      + '\n\nSie üben mit einer erfundenen Beispielfirma – am besten am Laptop in Google Chrome. Oben rechts finden Sie „💡 Verbesserung“: Ihre Hinweise, was fehlt oder stört, sind mein Dankeschön für den Testmonat.\n\nViele Grüße\nHolger Grosser';
    $('[data-ergebnis="' + x.id + '"]').innerHTML = '<div class="ok-box"><b>Freigeschaltet.</b> Jetzt kopieren und selbst im LinkedIn-Chat schicken – Schlüssel und Link werden nicht wieder angezeigt.'
      + '<textarea id="chat-' + x.id + '" rows="10" style="width:100%;margin-top:8px">' + esc(text) + '</textarea>'
      + '<div class="zeile"><button class="knopf klein" id="kop-' + x.id + '">Text kopieren</button><a class="knopf klein zweit" href="' + esc(url) + '" target="_blank" rel="noopener">selbst öffnen</a></div><p class="grau">Es wird nichts automatisch verschickt.</p></div>';
    b.remove();
    $('#kop-' + x.id).onclick = async (ev) => { try { await navigator.clipboard.writeText($('#chat-' + x.id).value); ev.target.textContent = '✓ kopiert'; } catch (e) { $('#chat-' + x.id).select(); } };
  });
}

/* Alle Verbesserungsvorschläge aus dem Testmonat an einer Stelle: daraus wird das Produkt für alle besser */
async function feedbackListe() {
  $('#main').innerHTML = '<p><button class="link" id="zurueck">‹ Alle Kunden</button></p><h2>💡 Feedback</h2><p class="grau">Lade …</p>';
  $('#zurueck').onclick = uebersicht;
  const liste = pflicht(await sb.from('nachrichten').select('id, kunde_id, text, zusammenfassung, daten, gelesen, gesendet_am, kunden(name, teilnehmer)').eq('art', 'feedback').order('gesendet_am', { ascending: false }).limit(500));
  const noten = liste.map(n => n.daten && Number(n.daten.note)).filter(Boolean), schnitt = noten.length ? (noten.reduce((s, x) => s + x, 0) / noten.length).toFixed(1).replace('.', ',') : '–';
  const eigen = liste.filter(n => n.daten && n.daten.eigene_dokumente === 'ja').length;
  $('#main').innerHTML = '<p><button class="link" id="zurueck">‹ Alle Kunden</button></p><h2>💡 Feedback aus dem Testmonat</h2>'
    + '<div class="kennzahlen"><div class="kz" style="--f:var(--gelb-dunkel)"><div class="zahl">' + liste.length + '</div>Rückmeldungen</div>'
    + '<div class="kz" style="--f:var(--petrol)"><div class="zahl">' + schnitt + '</div>Ø Note (1–5)</div>'
    + '<div class="kz" style="--f:var(--gruen)"><div class="zahl">' + eigen + '</div>„mit eigenen Dokumenten: ja“</div>'
    + '<div class="kz" style="--f:var(--orange)"><div class="zahl">' + liste.filter(n => !n.gelesen).length + '</div>ungelesen</div></div>'
    + (liste.length ? liste.map(n => { const d = n.daten || {}; return '<div class="nachricht ' + (n.gelesen ? 'gelesen' : '') + '"><div class="zeile" style="justify-content:space-between"><b>' + esc((n.kunden && (n.kunden.teilnehmer || n.kunden.name)) || 'Teilnehmer') + ' · ' + new Date(n.gesendet_am).toLocaleString('de-DE') + '</b>'
      + (n.gelesen ? '<span class="grau">gelesen</span>' : '<button class="knopf klein zweit" data-gelesen="' + n.id + '">gelesen</button>') + '</div>'
      + '<div class="chips">' + (d.note ? '<span class="chip">Note ' + d.note + '/5</span>' : '') + (d.eigene_dokumente ? '<span class="chip ' + (d.eigene_dokumente === 'ja' ? 'gruen' : 'grau') + '">eigene Dokumente: ' + esc(d.eigene_dokumente) + '</span>' : '') + (d.ansicht ? '<span class="chip grau">aus: ' + esc(d.ansicht) + '</span>' : '') + '</div>'
      + (d.hilft ? '<p><b>Geholfen:</b> ' + esc(d.hilft) + '</p>' : '') + (d.fehlt ? '<p><b>Fehlt/stört:</b> ' + esc(d.fehlt) + '</p>' : '') + (!d.hilft && !d.fehlt && n.text ? '<p style="white-space:pre-wrap">' + esc(n.text) + '</p>' : '') + '</div>'; }).join('')
      : '<div class="karte grau">Noch kein Feedback.</div>');
  $('#zurueck').onclick = uebersicht;
  $$('[data-gelesen]').forEach(b => b.onclick = async () => { pflicht(await sb.from('nachrichten').update({ gelesen: true }).eq('id', b.dataset.gelesen)); feedbackListe(); });
}

/* ------------------------------------------------ Einzelner Kunde */
async function kundeZeigen(id, reiter) {
  S.reiter = reiter || S.reiter || 'ueberblick';
  const k = pflicht(await sb.from('kunden').select('*').eq('id', id).single());
  S.kunde = k;
  const R = [['ueberblick', 'Überblick', 'var(--blau)'], ['nachrichten', 'Nachrichten', 'var(--orange)'], ['fakten', 'Faktencheck', 'var(--violett)'], ['fallen', 'Stolperfallen', 'var(--petrol)'],
    ['ergebnis', 'Ergebnisse', 'var(--petrol)'], ['link', 'Link', 'var(--blau)'], ['verwalten', 'Verwalten', 'var(--grau)']];
  $('#main').innerHTML = '<p><button class="link" id="zurueck">‹ Alle Kunden</button></p><h2>' + esc(k.art === 'test' ? (k.teilnehmer || k.name) : k.name) + (k.art === 'test' ? ' <span class="chip orange">Testmonat</span> <span class="grau">· übt mit ' + esc(k.name) + '</span>' : k.ort ? ' <span class="grau">· ' + esc(k.ort) + '</span>' : '') + (k.art === 'vorlage' ? ' <span class="chip violett">Vorlage</span>' : '') + '</h2>'
    + '<div class="reiter">' + R.map(r => '<button data-r="' + r[0] + '" style="--f:' + r[2] + '" class="' + (S.reiter === r[0] ? 'an' : '') + '">' + r[1] + '</button>').join('') + '</div><div id="inhalt"><p class="grau">Lade …</p></div>';
  $('#zurueck').onclick = uebersicht;
  $$('.reiter button').forEach(b => b.onclick = () => kundeZeigen(id, b.dataset.r));
  try { await REITER[S.reiter](k, $('#inhalt')); } catch (e) { $('#inhalt').innerHTML = '<div class="fehler">' + esc(e.message) + '</div>'; }
}
const REITER = {};

REITER.ueberblick = async (k, el) => {
  const [audits, ma, doks, ue] = await Promise.all([
    sb.from('audits').select('id, stufe, datum, zertifizierer, auditor, status').eq('kunde_id', k.id).order('stufe'),
    sb.from('mitarbeiter').select('name, bereich, funktion').eq('kunde_id', k.id),
    sb.from('dokumente').select('id, d_nr, titel, stand, kopie_pfad, link, gueltig').eq('kunde_id', k.id).order('d_nr'),
    sb.from('kunden_uebersicht').select('*').eq('id', k.id).single()]);
  const u = pflicht(ue);
  el.innerHTML = '<div class="kennzahlen">'
    + '<div class="kz" style="--f:var(--petrol)"><div class="zahl">' + u.geuebt + '/' + u.fragen + '</div>Fragen geübt</div>'
    + '<div class="kz" style="--f:var(--rot)"><div class="zahl">' + u.schwer + '</div>„weiß nicht“</div>'
    + '<div class="kz" style="--f:var(--orange)"><div class="zahl">' + u.nachrichten_neu + '</div>neue Nachrichten</div>'
    + '<div class="kz" style="--f:var(--violett)"><div class="zahl">' + u.korrekturen_offen + '</div>Korrekturen offen</div></div>'
    + '<div class="karte"><b>Audits</b><table>' + pflicht(audits).map(a => '<tr><td>Stufe ' + a.stufe + '</td><td>' + datum(a.datum) + '</td><td>' + esc(a.zertifizierer || '') + '</td><td>' + esc(a.auditor || '') + '</td></tr>').join('') + '</table></div>'
    + '<div class="karte"><b>Wer übt</b><table>' + pflicht(ma).map(m => '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.funktion || m.bereich || '') + '</td></tr>').join('') + '</table></div>'
    + '<div class="karte"><b>Dokumente</b><table>' + pflicht(doks).map(d => '<tr><td>' + esc(d.d_nr || '') + '</td><td>' + esc(d.titel) + '</td><td>' + esc(d.stand || '') + '</td><td>' + (d.kopie_pfad ? '<span class="chip gruen">PDF</span>' : '<span class="chip grau">ohne PDF</span>') + (d.link ? ' <a href="' + esc(d.link) + '" target="_blank" rel="noopener">live</a>' : '') + '</td></tr>').join('') + '</table></div>'
    + '<p class="grau">Zuletzt aktiv: ' + esc(vorWann(u.zuletzt_aktiv)) + '</p>';
};

REITER.nachrichten = async (k, el) => {
  const liste = pflicht(await sb.from('nachrichten').select('id, art, text, zusammenfassung, gelesen, gesendet_am, mitarbeiter(name)').eq('kunde_id', k.id).order('gesendet_am', { ascending: false }).limit(100));
  el.innerHTML = liste.length ? liste.map(n => '<div class="nachricht ' + (n.gelesen ? 'gelesen' : '') + '"><div class="zeile" style="justify-content:space-between"><b>' + (n.art === 'feedback' ? '💡 ' : '') + esc((n.mitarbeiter && n.mitarbeiter.name) || 'Kunde') + ' · ' + new Date(n.gesendet_am).toLocaleString('de-DE') + '</b>'
    + (n.gelesen ? '<span class="grau">gelesen</span>' : '<button class="knopf klein zweit" data-gelesen="' + n.id + '" style="--f:var(--orange)">als gelesen markieren</button>') + '</div>'
    + (n.text ? '<p style="white-space:pre-wrap;margin:6px 0">' + esc(n.text) + '</p>' : '<p class="grau">(nur Stand gesendet)</p>') + '<div class="grau">' + esc(n.zusammenfassung || '') + '</div></div>').join('')
    : '<div class="karte grau">Noch keine Nachrichten.</div>';
  $$('[data-gelesen]', el).forEach(b => b.onclick = async () => { pflicht(await sb.from('nachrichten').update({ gelesen: true }).eq('id', b.dataset.gelesen)); kundeZeigen(k.id, 'nachrichten'); });
};

REITER.fakten = async (k, el) => {
  const liste = pflicht(await sb.from('faktencheck').select('*').eq('kunde_id', k.id).order('reihenfolge'));
  el.innerHTML = '<p class="grau">Was der Kunde bestätigt oder korrigiert hat. „Erledigt“ setzen, wenn Sie das Dokument angepasst haben.</p><div class="karte"><table><tr><th>Thema</th><th>Steht in den Dokumenten</th><th>Kunde</th><th></th></tr>'
    + liste.map(f => '<tr class="' + (f.antwort === 'stimmt_nicht' && !f.erledigt ? 'korr' : '') + '"><td><b>' + esc(f.thema) + '</b></td><td>' + esc(f.angabe || '') + '<div class="grau">' + esc(f.fundstelle || '') + '</div></td><td>'
      + (f.antwort === 'stimmt' ? '<span class="fein">✓ stimmt</span>' : f.antwort === 'stimmt_nicht' ? '<b>Korrektur:</b> ' + esc(f.korrektur || '') : '<span class="grau">offen</span>') + '</td><td>'
      + (f.antwort === 'stimmt_nicht' ? '<label class="zeile" style="font-weight:400;margin:0"><input type="checkbox" data-erledigt="' + f.id + '" ' + (f.erledigt ? 'checked' : '') + '> erledigt</label>' : '') + '</td></tr>').join('') + '</table></div>';
  $$('[data-erledigt]', el).forEach(c => c.onchange = async () => { pflicht(await sb.from('faktencheck').update({ erledigt: c.checked }).eq('id', c.dataset.erledigt)); });
};

REITER.fallen = async (k, el) => {
  const liste = pflicht(await sb.from('stolperfallen').select('*').eq('kunde_id', k.id).order('reihenfolge'));
  el.innerHTML = '<p class="grau">Nur freigegebene Stolperfallen sieht der Kunde.</p>' + liste.map(f => '<div class="karte"><div class="zeile" style="justify-content:space-between"><b>' + esc(f.thema) + (f.stufe ? ' <span class="chip">Stufe ' + f.stufe + '</span>' : '') + '</b>'
    + '<label class="zeile" style="font-weight:400;margin:0"><input type="checkbox" data-frei="' + f.id + '" ' + (f.freigegeben ? 'checked' : '') + '> freigegeben</label></div>'
    + '<p><i>„' + esc(f.frage) + '“</i></p><div class="grau">Warum: ' + esc(f.warum || '') + '</div><div>Antwortlinie: ' + esc(f.antwortlinie || '') + '</div></div>').join('');
  $$('[data-frei]', el).forEach(c => c.onchange = async () => { pflicht(await sb.from('stolperfallen').update({ freigegeben: c.checked }).eq('id', c.dataset.frei)); });
};

/* Ergebnisse: gleiche Darstellung wie die Auswertung der Testfassung (auswertung/bericht.js) */
REITER.ergebnis = async (k, el) => {
  const [audits, ma, fakten, fallen, eintr] = await Promise.all([
    sb.from('audits').select('id, stufe, datum, zertifizierer, normen').eq('kunde_id', k.id).order('stufe'),
    sb.from('mitarbeiter').select('id, name').eq('kunde_id', k.id),
    sb.from('faktencheck').select('id, thema, angabe, antwort, korrektur').eq('kunde_id', k.id).order('reihenfolge'),
    sb.from('stolperfallen').select('id, stufe, thema').eq('kunde_id', k.id),
    sb.from('kunden_eintraege').select('audit_id, mitarbeiter_id, art, schluessel, daten, geaendert_am').eq('kunde_id', k.id).limit(3000)]);
  const au = pflicht(audits);
  const fragen = au.length ? pflicht(await sb.from('fragen').select('id, audit_id, art, normkapitel, titel, frage, hilfe, dokument_ids').in('audit_id', au.map(a => a.id)).order('reihenfolge').limit(3000)) : [];
  const antworten = fragen.length ? pflicht(await sb.from('antworten').select('frage_id, mitarbeiter_id, text, sicherheit, hilfe_genutzt, dauer_sekunden, ist_beispiel, beantwortet_am').in('frage_id', fragen.map(f => f.id)).limit(10000)) : [];
  const zuAudit = Object.fromEntries(fragen.map(f => [f.id, f.audit_id]));
  const fragenJe = {}; au.forEach(a => { fragenJe[a.id] = fragen.filter(f => f.audit_id === a.id); });
  const paket = { audits: au, mitarbeiter: pflicht(ma), fragenJe, stolperfallen: pflicht(fallen), rundgang: k.rundgang || L.RUNDGANG_STANDARD };
  const e = { kunde: k.name, exportiert: new Date().toISOString(), technik: k.technik_check || {}, faktencheck: pflicht(fakten),
    antworten: antworten.map(a => Object.assign({ audit_id: zuAudit[a.frage_id] }, a)), eintraege: pflicht(eintr), nachweise: [] };
  el.innerHTML = antworten.length || e.eintraege.length ? berichtHtml(L, paket, e).replace(/<h2>[^]*?<\/h2>/, '') : '<div class="karte grau">Der Kunde hat noch nicht geübt.</div>';
  csvKnoepfe(paket);
};

REITER.link = async (k, el) => {
  const liste = pflicht(await sb.from('zugaenge').select('id, gueltig_bis, gesperrt, angelegt_am').eq('kunde_id', k.id).order('angelegt_am', { ascending: false }));
  el.innerHTML = '<div class="karte"><b>Neuen persönlichen Link erzeugen</b><p class="grau">Der Link wird nur einmal angezeigt (gespeichert wird nur eine Prüfsumme). Geht nur an den Kunden – Sie verschicken ihn selbst.</p>'
    + '<div class="zeile"><label for="tage" style="margin:0">gültig für</label><input id="tage" type="number" min="1" max="365" value="60" style="width:90px"> Tage <button class="knopf" id="erzeugen">Link erzeugen</button></div><div id="neu-link"></div></div>'
    + '<div class="karte"><b>Bestehende Links</b><table>' + (liste.length ? liste.map(z => '<tr><td>angelegt ' + datum(z.angelegt_am) + '</td><td>gültig bis ' + datum(z.gueltig_bis) + '</td><td>' + (z.gesperrt ? '<span class="chip rot">gesperrt</span>' : '<span class="chip gruen">aktiv</span>') + '</td><td>'
      + (z.gesperrt ? '' : '<button class="knopf klein rot" data-sperren="' + z.id + '">sperren</button>') + '</td></tr>').join('') : '<tr><td class="grau">Noch kein Link.</td></tr>') + '</table></div>';
  $('#erzeugen').onclick = async () => {
    const tok = pflicht(await sb.rpc('zugang_anlegen', { p_kunde: k.id, p_tage: Number($('#tage').value) || 60 }));
    const url = location.origin + '/kunde/?t=' + tok;
    const ap = (await sb.from('mitarbeiter').select('name').eq('kunde_id', k.id).limit(1)).data || [];
    const text = 'Guten Tag' + (ap[0] ? ' ' + ap[0].name : '') + ',\n\nhier ist Ihr persönlicher Link zur Auditvorbereitung:\n' + url + '\n\nAm besten am Laptop in Google Chrome öffnen. Ihr Stand wird gespeichert, Sie können jederzeit weiterüben.\n\nViele Grüße\n' + (k.berater_name || '');
    $('#neu-link').innerHTML = '<div class="ok-box"><b>Neuer Link</b> – jetzt kopieren, er wird nicht wieder angezeigt:<input class="linkfeld" id="linkfeld" readonly value="' + esc(url) + '">'
      + '<div class="zeile" style="margin-top:8px"><button class="knopf klein" id="kopieren">Link kopieren</button><button class="knopf klein zweit" id="text-kopieren">Text für Ihre E-Mail kopieren</button><a class="knopf klein zweit" href="' + esc(url) + '" target="_blank" rel="noopener">selbst öffnen</a></div>'
      + '<textarea id="mailtext" rows="7" style="width:100%;margin-top:8px">' + esc(text) + '</textarea><p class="grau">Es wird nichts automatisch verschickt.</p></div>';
    const kopie = async (wert, knopf) => { try { await navigator.clipboard.writeText(wert); knopf.textContent = '✓ kopiert'; } catch (e) { $('#linkfeld').select(); } };
    $('#kopieren').onclick = () => kopie(url, $('#kopieren'));
    $('#text-kopieren').onclick = () => kopie($('#mailtext').value, $('#text-kopieren'));
  };
  $$('[data-sperren]', el).forEach(b => b.onclick = async () => { pflicht(await sb.from('zugaenge').update({ gesperrt: true }).eq('id', b.dataset.sperren)); kundeZeigen(k.id, 'link'); });
};

REITER.verwalten = async (k, el) => {
  el.innerHTML = '<div class="karte"><b>Kundendaten</b><label for="v-name">Firma</label><input id="v-name" value="' + esc(k.name) + '" style="width:100%"><label for="v-berater">Berater (erscheint als „An … senden“)</label><input id="v-berater" value="' + esc(k.berater_name || '') + '" style="width:100%">'
    + '<p><button class="knopf" id="v-speichern">Speichern</button></p></div>'
    + (k.art !== 'test' ? '<div class="karte"><b>Vorlage für den Testmonat</b><p class="grau">Die Vorlage wird für jeden freigeschalteten LinkedIn-Teilnehmer kopiert. Nur eine erfundene Beispielfirma verwenden – nie echte Kundendaten.</p>'
      + '<label class="zeile" style="font-weight:400"><input type="checkbox" id="v-vorlage" ' + (k.art === 'vorlage' ? 'checked' : '') + '> Diesen Kunden als Vorlage verwenden</label></div>' : '')
    + (k.art === 'test' ? '<div class="karte"><b>Grenzen dieses Teilnehmers</b><p class="grau">Leer = ohne Grenze. Die Laufzeit steuert der Link (Reiter „Link“).</p><div class="zeile">'
      + [['ki_tag', 'KI-Fragen je Tag'], ['ki_gesamt', 'KI-Fragen gesamt'], ['nachrichten_tag', 'Nachrichten je Tag'], ['fotos_gesamt', 'Fotos gesamt']].map(g => '<label style="margin:0">' + g[1] + '<br><input type="number" min="0" style="width:110px" data-grenze="' + g[0] + '" value="' + esc((k.grenzen || {})[g[0]] ?? '') + '"></label>').join('')
      + '</div><p><button class="knopf" id="v-grenzen">Grenzen speichern</button></p></div>' : '')
    + '<div class="karte" style="border-color:#F5A3A3"><b>Kunde löschen</b><p class="grau">Löscht alle Daten dieses Kunden (Dokumente, Fragen, Antworten, Links). Nicht rückgängig zu machen.</p>'
    + '<label for="v-loeschen">Zur Bestätigung den Firmennamen eintippen</label><input id="v-loeschen" style="width:100%"><p><button class="knopf rot" id="v-weg" disabled>Endgültig löschen</button></p></div>';
  $('#v-speichern').onclick = async () => { pflicht(await sb.from('kunden').update({ name: $('#v-name').value.trim(), berater_name: $('#v-berater').value.trim() }).eq('id', k.id)); kundeZeigen(k.id, 'verwalten'); };
  if ($('#v-vorlage')) $('#v-vorlage').onchange = async () => {
    if ($('#v-vorlage').checked) pflicht(await sb.from('kunden').update({ art: 'kunde' }).eq('art', 'vorlage')); // nur eine Vorlage
    pflicht(await sb.from('kunden').update({ art: $('#v-vorlage').checked ? 'vorlage' : 'kunde' }).eq('id', k.id)); kundeZeigen(k.id, 'verwalten');
  };
  if ($('#v-grenzen')) $('#v-grenzen').onclick = async () => {
    const g = {}; $$('[data-grenze]').forEach(i => { if (i.value !== '') g[i.dataset.grenze] = Math.max(0, Number(i.value)); });
    pflicht(await sb.from('kunden').update({ grenzen: g }).eq('id', k.id)); kundeZeigen(k.id, 'verwalten');
  };
  $('#v-loeschen').oninput = () => { $('#v-weg').disabled = $('#v-loeschen').value.trim() !== k.name; };
  $('#v-weg').onclick = async () => { await kundeLoeschen(k.id); uebersicht(); };
};
async function kundeLoeschen(id) {
  const doks = pflicht(await sb.from('dokumente').select('pfad, kopie_pfad').eq('kunde_id', id));
  const k = pflicht(await sb.from('kunden').select('pdf_zip_pfad').eq('id', id).single());
  let pfade = [...new Set(doks.flatMap(d => [d.pfad, d.kopie_pfad]).concat([k.pdf_zip_pfad]).filter(Boolean))];
  if (pfade.length) { // Dateien, die noch ein anderer Kunde nutzt (Vorlage ↔ Testteilnehmer), bleiben liegen
    const liste = '(' + pfade.map(x => '"' + x.replace(/"/g, '') + '"').join(',') + ')';
    const [a, b, c] = await Promise.all([sb.from('dokumente').select('pfad').neq('kunde_id', id).filter('pfad', 'in', liste),
      sb.from('dokumente').select('kopie_pfad').neq('kunde_id', id).filter('kopie_pfad', 'in', liste),
      sb.from('kunden').select('pdf_zip_pfad').neq('id', id).filter('pdf_zip_pfad', 'in', liste)]);
    const belegt = new Set([...pflicht(a).map(x => x.pfad), ...pflicht(b).map(x => x.kopie_pfad), ...pflicht(c).map(x => x.pdf_zip_pfad)]);
    pfade = pfade.filter(x => !belegt.has(x));
  }
  if (pfade.length) await sb.storage.from('dokumente').remove(pfade);
  pflicht(await sb.from('kunden').delete().eq('id', id));
}

/* ------------------------------------------------ Kunde importieren
   Quelle: die Zip-Datei der Testfassung (z. B. MESTO_Testfassung.zip) oder eine Import-Zip mit kunde/paket.json + kunde/dok/*.pdf.
   Claude baut diese Zip aus den Unterlagen (scripts/paket_bauen.mjs) – inklusive Faktencheck und Stolperfallen. */
function importieren() {
  $('#main').innerHTML = '<p><button class="link" id="zurueck">‹ Alle Kunden</button></p><h2>Kunde importieren</h2>'
    + '<div class="karte"><p>Wählen Sie die <b>Zip-Datei</b> mit dem Kundenpaket (z. B. <code>MESTO_Testfassung.zip</code>). Sie enthält Dokumente, Fragen, Faktencheck und Stolperfallen.</p>'
    + '<input type="file" id="zip" accept=".zip"><div id="vorschau"></div></div><div id="ablauf"></div>';
  $('#zurueck').onclick = uebersicht;
  $('#zip').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const zip = await JSZip.loadAsync(f);
      const pj = zip.file(/(^|\/)kunde\/paket\.json$/)[0] || zip.file(/(^|\/)paket\.json$/)[0];
      if (!pj) throw new Error('In der Zip-Datei fehlt kunde/paket.json.');
      const paket = JSON.parse(await pj.async('string'));
      const pdfs = zip.file(/(^|\/)dok\/[^/]+\.pdf$/), gesamt = zip.file(/(^|\/)dok\/[^/]+\.zip$/)[0];
      const vorhanden = pflicht(await sb.from('kunden').select('id, name').ilike('name', paket.kunde.name));
      const fr = Object.values(paket.fragenJe || {}).reduce((s, x) => s + x.length, 0);
      $('#vorschau').innerHTML = '<div class="karte" style="background:var(--hell)"><b>' + esc(paket.kunde.name) + '</b><div class="grau">'
        + (paket.audits || []).map(a => 'Stufe ' + a.stufe + ' am ' + datum(a.datum)).join(' · ') + '</div><p>' + (paket.mitarbeiter || []).length + ' Personen · ' + (paket.dokumente || []).length + ' Dokumente (' + pdfs.length + ' PDFs) · '
        + fr + ' Fragen · ' + (paket.auszuege || []).length + ' Textstellen · ' + (paket.faktencheck || []).length + ' Faktencheck · ' + (paket.stolperfallen || []).length + ' Stolperfallen</p>'
        + (vorhanden.length ? '<div class="hinweis">Einen Kunden mit diesem Namen gibt es schon. Der Import legt einen <b>zweiten</b> an; den alten können Sie danach unter „Verwalten“ löschen.</div>' : '')
        + '<label for="berater">Berater (erscheint als „An … senden“)</label><input id="berater" value="' + esc(paket.kunde.berater_name || '') + '">'
        + '<p><button class="knopf" id="los">Jetzt importieren</button></p></div>';
      $('#los').onclick = () => importLaeuft(paket, zip, pdfs, gesamt, $('#berater').value.trim());
    } catch (err) { $('#vorschau').innerHTML = '<div class="fehler">' + esc(err.message) + '</div>'; }
  };
}
async function importLaeuft(paket, zip, pdfs, gesamt, berater) {
  $('#los').disabled = true;
  $('#ablauf').innerHTML = '<div class="karte"><b>Import läuft …</b><div class="protokoll" id="proto"></div></div>';
  const log = (t) => { $('#proto').textContent += t + '\n'; $('#proto').scrollTop = 1e9; };
  let kid = null;
  try {
    const p = paket, kk = p.kunde;
    const k = pflicht(await sb.from('kunden').insert({ name: kk.name, ort: kk.ort || null, berater_email: kk.berater_email || null, berater_name: berater || kk.berater_name || null,
      firma_laut_zertifizierer: kk.firma_laut_zertifizierer || null, rundgang: p.rundgang || null, technik_check: {} }).select('id').single());
    kid = k.id; log('✓ Kunde angelegt');
    const maMap = {};
    for (const m of p.mitarbeiter || []) { const r = pflicht(await sb.from('mitarbeiter').insert({ kunde_id: kid, name: m.name, bereich: m.bereich || 'alle', funktion: m.funktion || null, email: m.email || null }).select('id').single()); maMap[m.id] = r.id; }
    log('✓ ' + Object.keys(maMap).length + ' Personen');
    const dokMap = {};
    for (const d of p.dokumente || []) {
      let kopie = null;
      const datei = pdfs.find(z => z.name.endsWith('dok/' + d.id + '.pdf'));
      if (datei) {
        kopie = kid + '/' + crypto.randomUUID() + '.pdf';
        const blob = new Blob([await datei.async('uint8array')], { type: 'application/pdf' });
        pflicht(await sb.storage.from('dokumente').upload(kopie, blob, { contentType: 'application/pdf', upsert: false }));
      }
      const r = pflicht(await sb.from('dokumente').insert({ kunde_id: kid, d_nr: d.d_nr || null, titel: d.titel, kurzname: d.kurzname || null, stand: d.stand || null, normkapitel: d.normkapitel || null,
        bereich: d.bereich || null, wichtigkeit: d.wichtigkeit === 'kennen' ? 'kennen' : 'finden', link: d.link || null, inhalt_kurz: d.inhalt_kurz || null, pfad: kopie, kopie_pfad: kopie, kopie_seiten: d.kopie_seiten || null }).select('id').single());
      dokMap[d.id] = r.id; log('✓ Dokument ' + (d.d_nr ? d.d_nr + ' ' : '') + d.titel + (kopie ? ' (PDF)' : ''));
    }
    const praefix = kid.slice(0, 8);
    const ausz = (p.auszuege || []).filter(a => dokMap[a.dokument_id]).map(a => ({ id: praefix + '-' + a.id, dokument_id: dokMap[a.dokument_id], ort: a.ort || null, seite: a.seite || null, reiter: a.reiter || null, text: a.text }));
    for (let i = 0; i < ausz.length; i += 400) pflicht(await sb.from('auszuege').insert(ausz.slice(i, i + 400)));
    log('✓ ' + ausz.length + ' Textstellen für „Wo steht das?“');
    const mapIds = (arr, m) => (arr || []).map(x => m[x]).filter(Boolean);
    for (const a of p.audits || []) {
      const ar = pflicht(await sb.from('audits').insert({ kunde_id: kid, stufe: a.stufe, datum: a.datum || null, zertifizierer: a.zertifizierer || null, auditor: a.auditor || null, normen: a.normen || null,
        auditor_level: ['einfach', 'mittel', 'streng'].includes(a.auditor_level) ? a.auditor_level : 'mittel', ruhemodus_tage: a.ruhemodus_tage == null ? 3 : a.ruhemodus_tage, status: 'fragen_bereit' }).select('id').single());
      const ppMap = {};
      for (const pp of (p.punkteJe || {})[a.id] || []) {
        const r = pflicht(await sb.from('planpunkte').insert({ audit_id: ar.id, reihenfolge: pp.reihenfolge || 0, zeit: pp.zeit || null, thema: pp.thema || '–', normkapitel: pp.normkapitel || null, auditor: pp.auditor || null,
          gespraechspartner: pp.gespraechspartner || null, bereich: pp.bereich || null, mitarbeiter_ids: mapIds(pp.mitarbeiter_ids, maMap), nachweise: pp.nachweise || null }).select('id').single());
        ppMap[pp.id] = r.id;
      }
      const fr = ((p.fragenJe || {})[a.id] || []).map(f => ({ audit_id: ar.id, planpunkt_id: ppMap[f.planpunkt_id] || null, reihenfolge: f.reihenfolge || 0, bereich: f.bereich || null, art: f.art === 'zeig_mal' ? 'zeig_mal' : 'frage',
        normen: f.normen || [], normkapitel: f.normkapitel || null, titel: f.titel || null, frage: f.frage, hilfe: f.hilfe || null, dokument_ids: mapIds(f.dokument_ids, dokMap) }));
      for (let i = 0; i < fr.length; i += 200) pflicht(await sb.from('fragen').insert(fr.slice(i, i + 200)));
      log('✓ Stufe ' + a.stufe + ': ' + Object.keys(ppMap).length + ' Planpunkte, ' + fr.length + ' Fragen');
    }
    const auf = (p.aufgaben || []).map((t, i) => ({ kunde_id: kid, reihenfolge: i, prio: 'OP', todo: t.todo, bis_stufe: [1, 2].includes(t.bis_stufe) ? t.bis_stufe : null, verantwortlich: t.verantwortlich || null, termin: t.termin || null }));
    if (auf.length) pflicht(await sb.from('aufgaben').insert(auf));
    const fk = (p.faktencheck || []).map((f, i) => ({ kunde_id: kid, reihenfolge: i, thema: f.thema, angabe: f.angabe || null, fundstelle: f.fundstelle || null }));
    if (fk.length) pflicht(await sb.from('faktencheck').insert(fk));
    const sf = (p.stolperfallen || []).map((f, i) => ({ kunde_id: kid, reihenfolge: i, stufe: [1, 2].includes(f.stufe) ? f.stufe : null, thema: f.thema, frage: f.frage, warum: f.warum || null, antwortlinie: f.antwortlinie || null, freigegeben: true }));
    if (sf.length) pflicht(await sb.from('stolperfallen').insert(sf));
    log('✓ ' + auf.length + ' Aufgaben, ' + fk.length + ' Faktencheck, ' + sf.length + ' Stolperfallen');
    if (gesamt) {
      const pfad = kid + '/' + gesamt.name.split('/').pop();
      pflicht(await sb.storage.from('dokumente').upload(pfad, new Blob([await gesamt.async('uint8array')], { type: 'application/zip' }), { contentType: 'application/zip' }));
      pflicht(await sb.from('kunden').update({ pdf_zip_pfad: pfad }).eq('id', kid)); log('✓ Zip mit allen PDFs');
    }
    log('Fertig.');
    $('#ablauf').insertAdjacentHTML('beforeend', '<div class="ok-box"><b>Import fertig.</b> Als Nächstes den persönlichen Link erzeugen. <button class="knopf klein" id="weiter">Zum Kunden</button></div>');
    $('#weiter').onclick = () => kundeZeigen(kid, 'link');
  } catch (e) {
    log('✗ ' + e.message);
    $('#ablauf').insertAdjacentHTML('beforeend', '<div class="fehler"><b>Import abgebrochen:</b> ' + esc(e.message) + (kid ? ' <button class="knopf klein rot" id="aufraeumen">Halb angelegten Kunden wieder löschen</button>' : '') + '</div>');
    if (kid) $('#aufraeumen').onclick = async () => { await kundeLoeschen(kid); uebersicht(); };
  }
}

start().catch(e => { $('#main').innerHTML = '<div class="fehler">' + esc(e.message) + '</div>'; });
