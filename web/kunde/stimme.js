/**
 * Stimme des Übungsauditors (E-A37).
 * 1. Natürliche KI-Stimme von Google (Edge Function "ki", Aktion tts) – nur der Text des Auditors geht hin, nichts wird gespeichert.
 * 2. Rückfall: Stimme des Browsers (speechSynthesis), wenn der Server keine Stimme hat (kein Schlüssel, Kontingent, offline)
 *    oder der Kunde „Natürliche Stimme“ ausschaltet.
 */
const STIMMEN = ['Anna', 'Helena', 'Petra', 'Katja', 'Google Deutsch', 'Deutsch'];

// 0,05 s Stille als WAV – zum Freischalten der Wiedergabe beim ersten Tippen (iPhone/iPad spielen sonst nach einer Wartezeit nichts ab)
function stilleWav() {
  const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), s = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 16000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44); let x = ''; b.forEach(c => x += String.fromCharCode(c)); return 'data:audio/wav;base64,' + btoa(x);
}

/**
 * @param {Function} ki    ki(aktion, daten) → Antwort oder null
 * @param {Function} kiAn  true, wenn der Server erreichbar ist (Link + KI eingeschaltet)
 */
export function stimmeAnlegen(ki, kiAn) {
  const browserOk = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let stimme = null, serverAus = false, lauf = 0, el = null;
  const cache = new Map();
  const st = { natuerlich: true, art: 'mann', quelle: '' };
  function waehlen() { if (!browserOk) return null; const v = speechSynthesis.getVoices().filter(x => x.lang && x.lang.toLowerCase().startsWith('de')); for (const n of STIMMEN) { const t = v.find(x => x.name.includes(n)); if (t) return t; } return v[0] || null; }
  if (browserOk) { stimme = waehlen(); try { speechSynthesis.addEventListener('voiceschanged', () => { stimme = waehlen(); }); } catch (e) { /* alte Browser */ } }

  function browser(t, danach) {
    st.quelle = 'browser';
    if (!browserOk) { if (danach) danach(); return; }
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'de-DE'; u.rate = 1; u.pitch = 0.95; if (stimme) u.voice = stimme;
      u.onend = () => { if (danach) danach(); }; speechSynthesis.speak(u); } catch (e) { if (danach) danach(); }
  }
  st.kannSprechen = () => browserOk || (kiAn() && !serverAus);
  st.serverMoeglich = () => kiAn() && !serverAus;
  /** beim ersten Tippen aufrufen (Knopf „Start“, „🔊“) */
  st.entsperren = () => { try { if (!el) el = new Audio(); el.src = stilleWav(); const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ohne Ton */ } };
  st.stopp = () => { lauf++; try { if (el) el.pause(); } catch (e) { /* */ } try { if (browserOk) speechSynthesis.cancel(); } catch (e) { /* */ } };
  st.sprich = async (text, danach) => {
    st.stopp(); const meins = lauf;
    const t = String(text || '').trim(); if (!t) { if (danach) danach(); return; }
    if (!st.natuerlich || !st.serverMoeglich()) return browser(t, danach);
    const schluessel = st.art + '|' + t;
    let audio = cache.get(schluessel);
    if (!audio) {
      const r = await ki('tts', { text: t.slice(0, 600), stimme: st.art });
      if (meins !== lauf) return; // inzwischen gestoppt oder neuer Satz
      if (!r || !r.audio) { serverAus = true; return browser(t, danach); }
      audio = r.audio; cache.set(schluessel, audio); if (cache.size > 40) cache.delete(cache.keys().next().value);
    }
    let weg = false; const rueckfall = () => { if (weg || meins !== lauf) return; weg = true; browser(t, danach); };
    try {
      if (!el) el = new Audio();
      el.onended = () => { if (!weg && meins === lauf) { weg = true; if (danach) danach(); } };
      el.onerror = rueckfall;
      el.src = 'data:audio/mpeg;base64,' + audio; st.quelle = 'google';
      const p = el.play(); if (p && p.catch) p.catch(rueckfall);
    } catch (e) { rueckfall(); }
  };
  return st;
}
