/**
 * Probeaudit mit Stimme (wie das ursprüngliche Probeaudit): Der Auditor stellt seine Fragen laut, der Kunde antwortet
 * per Mikrofon oder Tastatur. Er geht die Themen des Auditplans der Reihe nach durch.
 * - Mit KI (Edge Function "ki", Aktion gespraech): echte Nachfragen, bezieht sich auf die Dokumente der Firma.
 * - Ohne KI (kein Schlüssel, Kontingent aufgebraucht, Testfassung): Fragen aus dem Fahrplan, Nachhaken nach festen Regeln.
 * Nur zum Üben – im echten Audit gibt es keine verdeckte Hilfe.
 */
import { praxisZu, nachfrageZu, nachfragenZu } from './wissen.js';
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function probeaudit(ctx) {
  const { L, S, esc, main, ki, kiAn, api, speichereEintrag, eintrag, fallen, hilfe, eigeneAuszuege, oeffneHilfe, stimme } = ctx;
  const typGemerkt = ((eintrag('auditor', 'typ') || {}).daten || {}).typ;
  const P = { verlauf: [], thema: 0, frageNr: 0, aktuell: null, nachgehakt: false, ende: false, mitKi: kiAn(), vorlesen: true, freihaendig: false,
    typ: typGemerkt && L.AUDITOR_TYPEN[typGemerkt] ? typGemerkt : 'sachlich', antworten: [] };
  const themen = themenBauen();

  /* Themen: je Programmpunkt des Auditplans mit seinen Fragen; ohne Planbezug (Stufe 1) je Normkapitel */
  function themenBauen() {
    const mitPlan = S.planpunkte.filter(p => S.fragen.some(f => f.planpunkt_id === p.id));
    if (mitPlan.length) return mitPlan.map(p => ({ titel: (p.zeit ? p.zeit + ' ' : '') + p.thema + (p.normkapitel ? ' (' + p.normkapitel + ')' : ''), fragen: S.fragen.filter(f => f.planpunkt_id === p.id) }));
    const je = {};
    S.fragen.forEach(f => { const k = String(f.normkapitel || '').split(/[.\s,–-]/)[0] || 'Allgemein'; (je[k] = je[k] || []).push(f); });
    return Object.keys(je).sort((a, b) => (parseInt(a) || 99) - (parseInt(b) || 99)).map(k => ({ titel: (/^\d+$/.test(k) ? 'Kapitel ' + k + ' · ' : '') + (je[k][0].titel || k), fragen: je[k] }));
  }

  /* ---------------- Stimme: natürliche KI-Stimme (Google) über den Server, sonst die Stimme des Browsers (stimme.js) */
  const sprichtOk = stimme.kannSprechen();
  function sprich(t, danach) {
    if (!sprichtOk || !P.vorlesen) { if (danach) danach(); return; }
    stimme.sprich(t, danach);
  }
  const still = () => stimme.stopp();

  /* ---------------- Mikrofon: läuft weiter, bis Stopp (der Browser beendet die Erkennung sonst nach kurzer Stille) */
  let rec = null, micWill = false, micFest = '', micVorher = '', stilleUhr = null;
  function micUi(an) { const m = main.querySelector('#pa-mic'); if (m) { m.classList.toggle('an', an); m.textContent = an ? '⏹ Stopp' : '🎤 Sprechen'; } }
  function micStopp() { micWill = false; clearTimeout(stilleUhr); if (rec) { try { rec.stop(); } catch (e) { /* */ } } }
  function micStart() {
    if (!SR || P.ende) return; still(); micWill = true; micFest = ''; micVorher = main.querySelector('#pa-text').value.trim(); micUi(true);
    hinweis(P.freihaendig ? 'Ich höre zu … Wenn Sie 3 Sekunden schweigen, geht die Antwort ab.' : 'Ich höre zu … Tippen Sie auf Stopp, wenn Sie fertig sind.');
    const los = () => {
      rec = new SR(); rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = true;
      rec.onresult = (e) => { let zw = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) micFest += (micFest ? ' ' : '') + r[0].transcript.trim(); else zw += r[0].transcript; }
        main.querySelector('#pa-text').value = [micVorher, micFest, zw.trim()].filter(Boolean).join(' ');
        if (P.freihaendig) { clearTimeout(stilleUhr); stilleUhr = setTimeout(() => { if (main.querySelector('#pa-text').value.trim()) { micStopp(); antworten(); } }, 3000); } };
      rec.onerror = (e) => { if (e.error === 'no-speech' || e.error === 'aborted') return; micWill = false;
        hinweis({ 'not-allowed': 'Das Mikrofon ist blockiert. Bitte oben in der Adresszeile erlauben.', network: 'Die Spracherkennung braucht Internet.', 'audio-capture': 'Kein Mikrofon gefunden.' }[e.error] || 'Spracherkennung unterbrochen – bitte noch einmal auf Sprechen tippen.'); };
      rec.onend = () => { rec = null; if (micWill) { try { los(); return; } catch (e) { micWill = false; } } micUi(false); };
      rec.start();
    };
    try { los(); } catch (e) { micWill = false; micUi(false); }
  }
  const hinweis = (t) => { const h = main.querySelector('#pa-hinweis'); if (h) h.textContent = t || ''; };

  /* ---------------- Ablauf */
  function auditorSagt(text, frage) {
    P.verlauf.push({ rolle: 'auditor', text, frage_id: frage ? frage.id : null }); P.aktuell = frage || P.aktuell; zeichne();
    sprich(text, () => { if (P.freihaendig && !P.ende) micStart(); });
  }
  function lokalNaechste() { // ohne KI: Fragen aus dem Fahrplan, zwei je Thema
    const t = themen[P.thema];
    if (!t || P.thema >= themen.length) return abschluss();
    const f = t.fragen[P.frageNr];
    if (!f || P.frageNr >= 2) { P.thema++; P.frageNr = 0; return lokalNaechste(); }
    P.frageNr++; P.nachgehakt = false;
    const vorspann = !P.verlauf.length ? 'Guten Tag, ich bin heute Ihr Auditor. Wir beginnen mit dem Thema ' + t.titel.replace(/^\d\d:\d\d\S*\s/, '') + '. '
      : (P.frageNr === 1 ? 'Kommen wir zum Thema ' + t.titel.replace(/^\d\d:\d\d\S*\s/, '') + '. ' : '');
    auditorSagt(vorspann + f.frage, f);
  }
  function abschluss() { P.ende = true; auditorSagt('Vielen Dank, damit bin ich durch. Ich fasse gleich zusammen, was mir aufgefallen ist.'); setTimeout(auswerten, 400); }
  // Holgers Beratungspraxis zu den Fragen des Themas (anonymisiert, wissen.js) – der KI-Auditor hakt damit realistischer nach
  function praxisDesThemas(t) {
    const m = new Map();
    (t.fragen || []).forEach(f => { praxisZu(f, 2).forEach(e => m.set(e.q, { q: e.q, a: e.a })); nachfragenZu(f, 1).forEach(x => m.set(x.frage, { q: 'Typische Nachfrage: ' + x.frage, a: 'Erwarteter Nachweis: ' + (x.nachweis || 'ein echtes Beispiel') })); });
    return [...m.values()].slice(0, 4);
  }
  async function kiNaechste() {
    zeichne(true);
    const t = themen[P.thema] || {};
    const eig = eigeneAuszuege ? await eigeneAuszuege(t.titel + ' ' + (t.fragen || []).slice(0, 2).map(f => f.frage).join(' '), 4) : null;
    const k = await ki('gespraech', Object.assign({ verlauf: P.verlauf, typ: P.typ, stufe: S.audit.stufe, thema: P.thema,
      themen: themen.map(x => ({ titel: x.titel, fragen: x.fragen.slice(0, 3).map(f => f.frage) })), fallen: fallen().map(f => f.frage).slice(0, 8),
      praxis: praxisDesThemas(t) }, eig ? { auszuege: eig } : {}));
    if (!k || !k.text) { P.mitKi = false; hinweis('Die KI ist gerade nicht erreichbar – ich mache mit den Fragen aus Ihrem Fahrplan weiter.'); return lokalNaechste(); }
    if (k.thema != null) P.thema = Math.max(P.thema, Math.min(themen.length - 1, k.thema));
    if (k.ende) { P.ende = true; auditorSagt(k.text); setTimeout(auswerten, 400); return; }
    auditorSagt(k.text, (themen[P.thema] || {}).fragen ? themen[P.thema].fragen[0] : null);
  }
  async function antworten() {
    const feld = main.querySelector('#pa-text'), text = feld.value.trim(); if (!text || P.ende) return;
    micStopp(); still(); feld.value = '';
    P.verlauf.push({ rolle: 'kunde', text });
    const fb = L.antwortFeedback(text); P.antworten.push(Object.assign({ frage: P.aktuell ? P.aktuell.frage : '', text }, fb));
    // Fahrplan mitzählen (ohne KI weiß das Programm, welche Frage gestellt war)
    if (!P.mitKi && P.aktuell && P.aktuell.id && S.ma) { try { await api('antwort', { audit_id: S.audit.id, frage_id: P.aktuell.id, mitarbeiter_id: S.ma.id, text, sicherheit: fb.note === 'ueben' ? 'unsicher' : 'sicher', hilfe_genutzt: false }); } catch (e) { /* Üben geht weiter */ } }
    if (P.mitKi) return kiNaechste();
    // Nachhaken nach festen Regeln, höchstens einmal je Frage
    if (!P.nachgehakt && !fb.zeigt) { P.nachgehakt = true; return auditorSagt('Können Sie mir das bitte im Dokument zeigen? Wo steht das bei Ihnen?', P.aktuell); }
    if (!P.nachgehakt && !fb.beispiel) { P.nachgehakt = true; return auditorSagt(P.typ === 'stichprobe' || P.typ === 'paragraphen' ? 'Haben Sie dazu ein aktuelles Beispiel? Zeigen Sie mir den letzten Fall.' : nachfrageZu(P.aktuell), P.aktuell); }
    zeichne(true); setTimeout(lokalNaechste, 500);
  }
  async function auswerten() {
    micStopp();
    const n = P.antworten.length, zeigt = P.antworten.filter(a => a.zeigt).length, bsp = P.antworten.filter(a => a.beispiel).length;
    const tipps = [...new Set(P.antworten.flatMap(a => a.hinweise || []))].slice(0, 3);
    let k = null; if (P.mitKi && n) k = await ki('gespraech', { verlauf: P.verlauf, typ: P.typ, stufe: S.audit.stufe, zum_schluss: true });
    await speichereEintrag('lernen', 'probeaudit:' + new Date().toISOString().slice(0, 16), { antworten: n, zeigt, beispiel: bsp, ki: !!P.mitKi, typ: P.typ });
    const box = main.querySelector('#pa-auswertung'); if (!box) return;
    box.innerHTML = '<div class="karte gut"><b>Auswertung – ' + n + (n === 1 ? ' Antwort' : ' Antworten') + '</b>'
      + '<p>Dokument gezeigt: <b>' + zeigt + ' von ' + n + '</b> · Beispiel genannt: <b>' + bsp + ' von ' + n + '</b></p>'
      + (k ? ['gut', 'ueben', 'tipp'].map(x => k[x] ? '<p><b>' + ({ gut: 'Gut', ueben: 'Üben', tipp: 'Tipp' }[x]) + ':</b> ' + esc(k[x]) + '</p>' : '').join('') : '')
      + (tipps.length ? '<p><b>Darauf achten:</b></p><ul>' + tipps.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : (n ? '<p>Sehr gut: Sie haben gezeigt, wo es steht, und Beispiele genannt.</p>' : ''))
      + '<p class="grau">Formel für jede Antwort: <b>Was wir machen – wo es steht – ein Beispiel.</b></p><button class="knopf" id="pa-neu">Neues Probeaudit</button></div>';
    box.querySelector('#pa-neu').onclick = () => probeaudit(ctx);
  }

  /* ---------------- Oberfläche */
  function zeichne(denkt) {
    const log = P.verlauf.map((m, i) => '<div class="pa-msg ' + (m.rolle === 'kunde' ? 'ich' : 'au') + '"><div class="pa-wer">' + (m.rolle === 'kunde' ? 'Sie' : '🧑‍💼 Auditor') + '</div><div>' + esc(m.text) + '</div>'
      + (m.rolle !== 'kunde' && sprichtOk ? '<button class="link pa-hoer" data-hoer="' + i + '">🔊 anhören</button>' : '') + '</div>').join('')
      + (denkt ? '<div class="pa-msg au"><div class="pa-wer">🧑‍💼 Auditor</div><div class="grau">überlegt …</div></div>' : '');
    const l = main.querySelector('#pa-log'); if (!l) return;
    l.innerHTML = log || '<p class="grau">Der Auditor beginnt, sobald Sie auf „Probeaudit starten“ tippen.</p>'; l.scrollTop = l.scrollHeight;
    l.querySelectorAll('[data-hoer]').forEach(b => b.onclick = () => { const t = P.verlauf[Number(b.dataset.hoer)].text; const alt = P.vorlesen; P.vorlesen = true; sprich(t); P.vorlesen = alt; });
    main.querySelector('#pa-themen').innerHTML = themen.map((t, i) => '<li class="' + (i < P.thema || P.ende ? 'fertig' : i === P.thema && P.verlauf.length ? 'jetzt' : '') + '">' + esc(t.titel) + '</li>').join('');
    const gestartet = P.verlauf.length > 0;
    main.querySelector('#pa-start').hidden = gestartet;
    main.querySelector('#pa-eingabe').hidden = !gestartet || P.ende;
    main.querySelector('#pa-ende').hidden = !gestartet || P.ende;
  }

  main.innerHTML = '<h2>Probeaudit mit dem Auditor</h2>'
    + '<p class="erkl-kurz">Der Auditor stellt seine Fragen <b>laut</b> – Sie antworten mit dem Mikrofon oder tippen. Er geht die Themen Ihres Auditplans der Reihe nach durch. '
    + 'Antworten Sie nach der Formel <b>Was wir machen – wo es steht – ein Beispiel</b>. Nur zum Üben.' + (P.mitKi ? '' : ' <span class="grau">(Ohne KI: Fragen aus Ihrem Fahrplan, der Auditor hakt nach festen Regeln nach.)</span>') + '</p>'
    + '<div class="karte zeile pa-einst"><label style="margin:0">Auditor <select id="pa-typ">' + Object.entries(L.AUDITOR_TYPEN).map(([k, t]) => '<option value="' + k + '"' + (k === P.typ ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('') + '</select></label>'
    + (sprichtOk ? '<label class="zeile" style="margin:0;font-weight:400"><input type="checkbox" id="pa-vorlesen" checked> Fragen vorlesen</label>' : '')
    + (stimme.serverMoeglich() ? '<label class="zeile" style="margin:0;font-weight:400" title="Natürliche KI-Stimme von Google. Es wird nur der Text des Auditors übertragen, nichts gespeichert."><input type="checkbox" id="pa-natur"' + (stimme.natuerlich ? ' checked' : '') + '> Natürliche Stimme</label>'
      + '<label style="margin:0">Stimme <select id="pa-art"><option value="mann"' + (stimme.art === 'mann' ? ' selected' : '') + '>Auditor</option><option value="frau"' + (stimme.art === 'frau' ? ' selected' : '') + '>Auditorin</option></select></label>' : '')
    + (SR && sprichtOk ? '<label class="zeile" style="margin:0;font-weight:400" title="Nach jeder Frage hört das Mikrofon automatisch zu; 3 Sekunden Stille schicken die Antwort ab."><input type="checkbox" id="pa-frei"> 🎧 Freihändig</label>' : '') + '</div>'
    + '<div class="pa-raster"><section class="karte pa-chat"><div id="pa-log" class="pa-log" aria-live="polite"></div>'
    + '<div id="pa-eingabe" hidden><div class="zeile pa-hilfen"><button class="knopf klein zweit" id="pa-was">Was meint der Auditor damit?</button><button class="knopf klein zweit" id="pa-skip">Frage überspringen</button></div>'
    + '<div id="pa-wasbox" class="spick-box" hidden></div>'
    + '<textarea id="pa-text" rows="3" placeholder="Ihre Antwort – wie im Audit"></textarea>'
    + '<div class="zeile">' + (SR ? '<button class="knopf zweit" id="pa-mic">🎤 Sprechen</button>' : '') + '<button class="knopf" id="pa-los">Antworten</button></div><p class="grau" id="pa-hinweis">' + (SR ? 'Tippen Sie auf Sprechen, prüfen Sie den Text, dann auf Antworten.' : 'Ihr Browser kann keine Sprache erkennen – bitte tippen (am besten Google Chrome).') + '</p></div>'
    + '<div class="zeile"><button class="knopf" id="pa-start">▶ Probeaudit starten</button><button class="knopf zweit" id="pa-ende" hidden>Probeaudit beenden und auswerten</button></div>'
    + '<div id="pa-auswertung"></div></section>'
    + '<aside class="karte pa-seite"><b>Themen aus Ihrem Auditplan</b><ol id="pa-themen" class="pa-themen"></ol></aside></div>';

  const $m = (s) => main.querySelector(s);
  $m('#pa-typ').onchange = () => { P.typ = $m('#pa-typ').value; speichereEintrag('auditor', 'typ', { typ: P.typ, quelle: 'probeaudit' }); };
  if ($m('#pa-vorlesen')) $m('#pa-vorlesen').onchange = () => { P.vorlesen = $m('#pa-vorlesen').checked; if (!P.vorlesen) still(); };
  if ($m('#pa-frei')) $m('#pa-frei').onchange = () => { P.freihaendig = $m('#pa-frei').checked; if (P.freihaendig && $m('#pa-vorlesen')) { $m('#pa-vorlesen').checked = true; P.vorlesen = true; } };
  if ($m('#pa-natur')) $m('#pa-natur').onchange = () => { stimme.natuerlich = $m('#pa-natur').checked; };
  if ($m('#pa-art')) $m('#pa-art').onchange = () => { stimme.art = $m('#pa-art').value; };
  $m('#pa-start').onclick = () => { if (!themen.length) return hinweis('Für dieses Audit sind noch keine Fragen hinterlegt.');
    stimme.entsperren(); if ('speechSynthesis' in window) { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { /* */ } }
    P.mitKi ? kiNaechste() : lokalNaechste(); };
  $m('#pa-los').onclick = antworten;
  $m('#pa-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); antworten(); } };
  if ($m('#pa-mic')) $m('#pa-mic').onclick = () => (micWill || rec) ? micStopp() : micStart();
  $m('#pa-skip').onclick = () => { $m('#pa-text').value = 'Diese Frage möchte ich überspringen.'; antworten(); };
  $m('#pa-was').onclick = () => { const b = $m('#pa-wasbox'); b.hidden = !b.hidden; if (!b.hidden) { const f = P.aktuell; b.innerHTML = f ? hilfe(f) : 'Der Auditor möchte wissen, wie Sie das in Ihrer Firma machen – und das Dokument dazu sehen.'; if (oeffneHilfe) oeffneHilfe(b); } };
  $m('#pa-ende').onclick = () => { if (!P.ende) { P.ende = true; still(); zeichne(); auswerten(); } };
  zeichne();
  return () => { micStopp(); still(); }; // beim Verlassen der Ansicht
}
