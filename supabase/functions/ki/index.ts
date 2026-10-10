// Edge Function "ki": KI-Bausteine (Anthropic). Zwei Zugaenge:
//  - Kunde mit persoenlichem Link (t): gespraech (Auditor nach Mass), antwort_feedback, foto_pruefen
//  - Backoffice mit Supabase-Login (Authorization: Bearer <JWT>): fragenbank_aus_text (Fragen aus Mitschnitten/Berichten ziehen)
// Ohne Geheimnis ANTHROPIC_API_KEY antwortet die Funktion {fehler:'KI nicht eingerichtet'} – die Seite nutzt dann die Regeln ohne KI.
// Bereitstellen: supabase functions deploy ki --no-verify-jwt ; supabase secrets set ANTHROPIC_API_KEY=… KI_MODELL=claude-sonnet-5-5
// STAND: geschrieben, noch nicht gegen die echte API getestet (Lernpfad A11).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import L from '../_shared/logik.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const MODELL = Deno.env.get('KI_MODELL') || 'claude-sonnet-5-5';
const ERLAUBT = (Deno.env.get('ERLAUBTE_HERKUNFT') || '*').split(',').map(s => s.trim());
const MAX_JE_TAG = Number(Deno.env.get('KI_MAX_JE_KUNDE_TAG') || '300'); // Kostenbremse je Kunde
const API_URL = Deno.env.get('KI_API_URL') || 'https://api.anthropic.com/v1/messages'; // nur fuer Tests umstellbar
// Natuerliche Stimme fuer den Uebungsauditor (Google Cloud Text-to-Speech, E-A37). Ohne GOOGLE_TTS_KEY spricht der Browser selbst.
const TTS_KEY = Deno.env.get('GOOGLE_TTS_KEY') || '';
const TTS_STIMME = Deno.env.get('TTS_VOICE') || ''; // z. B. de-DE-Chirp3-HD-Charon; leer = Auswahl nach Wunsch der Seite (mann/frau)
const TTS_URL = Deno.env.get('TTS_API_URL') || 'https://texttospeech.googleapis.com/v1/text:synthesize'; // nur fuer Tests umstellbar
const TTS_MAX_JE_TAG = Number(Deno.env.get('TTS_MAX_JE_KUNDE_TAG') || '600');
const STIMMEN: Record<string, string[]> = { mann: ['de-DE-Chirp3-HD-Charon', 'de-DE-Neural2-B'], frau: ['de-DE-Chirp3-HD-Kore', 'de-DE-Neural2-C'] };

function cors(origin: string | null) {
  const o = ERLAUBT.includes('*') ? '*' : (origin && ERLAUBT.includes(origin) ? origin : ERLAUBT[0]);
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'content-type, apikey, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
}
async function sha256(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function kundeZumToken(t: string) {
  if (!/^[0-9a-f]{48}$/.test(t || '')) return null;
  const { data } = await db.from('zugaenge').select('kunde_id, gueltig_bis, gesperrt').eq('token_hash', await sha256(t)).maybeSingle();
  if (!data || data.gesperrt || new Date(data.gueltig_bis + 'T23:59:59') < new Date()) return null;
  return data.kunde_id as string;
}
async function istBackoffice(req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return false;
  const { data } = await db.auth.getUser(jwt);
  const mail = data && data.user && data.user.email;
  if (!mail) return false;
  const { data: b } = await db.from('backoffice_nutzer').select('aktiv').eq('email', mail).maybeSingle();
  return !!(b && b.aktiv);
}
// Kostenbremse je Kunde: Zaehler in der Tabelle nutzung (Datenbankfunktion nutzung_buchen, atomar).
// Im Testmonat (kunden.art = 'test') gelten die Grenzen des Teilnehmers (ki_tag, ki_gesamt), sonst KI_MAX_JE_KUNDE_TAG.
// Stimme (art 'tts'): Grenzen tts_tag / tts_gesamt, Standard im Testmonat 150 Saetze am Tag, sonst TTS_MAX_JE_KUNDE_TAG.
async function zaehlen(kundeId: string, art: 'ki' | 'tts' = 'ki') {
  const { data: k } = await db.from('kunden').select('art, grenzen').eq('id', kundeId).maybeSingle();
  const g = k && k.art === 'test' ? (k.grenzen || {}) : {};
  const z = (x: unknown) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  const maxTag = art === 'ki' ? (z(g.ki_tag) ?? MAX_JE_TAG) : (z(g.tts_tag) ?? (k && k.art === 'test' ? 150 : TTS_MAX_JE_TAG));
  const { data, error } = await db.rpc('nutzung_buchen', { p_kunde: kundeId, p_art: art, p_max_tag: maxTag, p_max_gesamt: z(art === 'ki' ? g.ki_gesamt : g.tts_gesamt) });
  if (error) throw error;
  return { ok: data === true, test: !!(k && k.art === 'test') };
}
// deno-lint-ignore no-explicit-any
async function claude(system: string, inhalt: any[], maxTokens = 700) {
  const r = await fetch(API_URL, { method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELL, max_tokens: maxTokens, system, messages: inhalt }) });
  const j = await r.json();
  if (!r.ok) throw new Error('KI-Fehler ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
  const text = (j.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  // Abgeschnitten (Grenze erreicht): nur bis zum letzten vollständigen Satz, damit der Auditor nicht mitten im Wort aufhört
  if (j.stop_reason === 'max_tokens') { const m = text.match(/^[\s\S]*[.?!](?=\s|$)/); if (m && m[0].length > 20) return m[0]; }
  return text;
}
const kurz = (s: unknown, n: number) => String(s || '').slice(0, n);
// Textstellen aus den gueltigen Dokumenten des Kunden (Grundlage fuer alle KI-Antworten: nur eigene Dokumente)
// deno-lint-ignore no-explicit-any
async function auszuegeDesKunden(kundeId: string): Promise<{ ausz: any[]; titel: Record<string, string> }> {
  const { data: doks } = await db.from('dokumente').select('id, titel').eq('kunde_id', kundeId).eq('gueltig', true);
  const titel: Record<string, string> = Object.fromEntries((doks || []).map((x: any) => [x.id, x.titel]));
  if (!doks || !doks.length) return { ausz: [], titel };
  const { data } = await db.from('auszuege').select('id, dokument_id, ort, seite, reiter, text').in('dokument_id', doks.map((x: any) => x.id)).limit(5000);
  return { ausz: data || [], titel };
}
// Testmonat mit eigenen Dokumenten (E-A33): die Textstellen kommen vom Geraet des Teilnehmers, werden nur an die KI
// durchgereicht und NIRGENDS gespeichert (auch nicht protokolliert). Hoechstens 8 Stellen zu je 1.400 Zeichen.
// deno-lint-ignore no-explicit-any
function auszuegeVomGeraet(d: any, max: number): { treffer: any[]; titel: Record<string, string> } | null {
  if (!Array.isArray(d.auszuege)) return null;
  const titel: Record<string, string> = {};
  const treffer = d.auszuege.slice(0, max).filter((x: any) => x && x.text).map((x: any, i: number) => {
    const id = kurz(x.dokument_id, 40) || 'g' + i; titel[id] = kurz(x.titel, 200);
    return { auszug: { dokument_id: id, ort: kurz(x.ort, 60), text: kurz(x.text, 1400) } };
  });
  return { treffer, titel };
}
// deno-lint-ignore no-explicit-any
const auszugText = (t: any[], titel: Record<string, string>) => t.map((x: any, i: number) => '[' + (i + 1) + '] ' + (titel[x.auszug.dokument_id] || 'Dokument') + ', ' + (x.auszug.ort || '') + ':\n' + kurz(x.auszug.text, 1400)).join('\n\n');

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: h });
  try {
    const d = await req.json();

    // ---------------- Stimme: nur der Text des Uebungsauditors wird an Google geschickt, nichts wird gespeichert
    if (d.aktion === 'tts') {
      if (!TTS_KEY) return antwort({ fehler: 'Stimme nicht eingerichtet' }, 503);
      const kid = await kundeZumToken(String(d.t || ''));
      if (!kid) return antwort({ fehler: 'Link ungültig oder abgelaufen.' }, 401);
      const text = kurz(d.text, 600).trim();
      if (!text) return antwort({ fehler: 'Kein Text' }, 400);
      if (!(await zaehlen(kid, 'tts')).ok) return antwort({ fehler: 'Stimme für heute aufgebraucht' }, 429);
      const liste = TTS_STIMME ? [TTS_STIMME] : (STIMMEN[d.stimme] || STIMMEN.mann);
      for (const name of liste) {
        const r = await fetch(TTS_URL + '?key=' + encodeURIComponent(TTS_KEY), { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: { text }, voice: { languageCode: 'de-DE', name }, audioConfig: { audioEncoding: 'MP3' } }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.audioContent) return antwort({ audio: j.audioContent, stimme: name });
        console.error('TTS-Fehler', r.status, name, JSON.stringify(j.error || {}).slice(0, 200)); // ohne den Text
      }
      return antwort({ fehler: 'Stimme gerade nicht verfügbar' }, 502);
    }

    if (!KEY) return antwort({ fehler: 'KI nicht eingerichtet' }, 503);

    // ---------------- Backoffice
    if (d.aktion === 'fragenbank_aus_text') {
      if (!(await istBackoffice(req))) return antwort({ fehler: 'Nur für das Backoffice' }, 403);
      const text = kurz(d.text, 60000);
      const roh = await claude('Du wertest Mitschnitte und Berichte von ISO-Zertifizierungsaudits aus. Antworte nur mit JSON.',
        [{ role: 'user', content: 'Ziehe alle Fragen heraus, die ein Auditor gestellt hat, ohne Namen von Firmen oder Personen. Format: {"fragen":[{"frage":"…","normkapitel":"9.3","norm":"ISO 9001"}]}.\n\nText:\n' + text }], 3000);
      const j = L.kiJson(roh);
      const zeilen = (j.fragen || []).filter((f: any) => f && f.frage).map((f: any) => ({ frage: kurz(f.frage, 500), normkapitel: kurz(f.normkapitel, 20), norm: kurz(f.norm, 20),
        zertifizierer: kurz(d.zertifizierer, 60), stufe: d.stufe || null, branche: kurz(d.branche, 60), quelle: 'Mitschnitt' }));
      if (d.speichern && zeilen.length) { const { error } = await db.from('fragenbank').insert(zeilen); if (error) throw error; }
      return antwort({ fragen: zeilen });
    }

    // ---------------- Kunde
    const kundeId = await kundeZumToken(String(d.t || ''));
    if (!kundeId) return antwort({ fehler: 'Link ungültig oder abgelaufen.' }, 401);
    const z = await zaehlen(kundeId);
    if (!z.ok) return antwort({ fehler: z.test ? 'Das KI-Kontingent Ihres Testmonats ist für heute (oder insgesamt) aufgebraucht. Die Übungen ohne KI gehen weiter.' : 'Für heute sind genug KI-Übungen gemacht – morgen geht es weiter.' }, 429);

    if (d.aktion === 'gespraech') { // Probeaudit: der Auditor geht die Themen des Auditplans durch, eine Frage nach der anderen
      const typ = (L.AUDITOR_TYPEN as any)[d.typ] || L.AUDITOR_TYPEN.sachlich;
      const verlauf = (Array.isArray(d.verlauf) ? d.verlauf : []).slice(-16).map((m: any) => ({ role: m.rolle === 'kunde' ? 'user' : 'assistant', content: kurz(m.text, 1500) }));
      if (!verlauf.length || verlauf[0].role !== 'user') verlauf.unshift({ role: 'user', content: 'Guten Tag, wir sind bereit.' });
      // Die API verlangt abwechselnde Rollen und am Ende den Kunden: gleiche Rollen zusammenfassen, sonst „Bitte weiter.“ anhängen
      for (let i = verlauf.length - 1; i > 0; i--) if (verlauf[i].role === verlauf[i - 1].role) { verlauf[i - 1].content += '\n' + verlauf[i].content; verlauf.splice(i, 1); }
      if (verlauf[verlauf.length - 1].role !== 'user') verlauf.push({ role: 'user', content: 'Bitte stellen Sie Ihre nächste Frage.' });
      // Themen: [{titel, fragen:[…]}] (neu) oder Liste von Texten (alt)
      const themen = (Array.isArray(d.themen) ? d.themen : []).slice(0, 20).map((t: any, i: number) => typeof t === 'string' ? (i + 1) + '. ' + kurz(t, 120)
        : (i + 1) + '. ' + kurz(t.titel, 120) + (Array.isArray(t.fragen) && t.fragen.length ? ' – typische Fragen: ' + t.fragen.slice(0, 3).map((f: any) => kurz(f, 200)).join(' | ') : ''));
      const thema = Math.max(0, Math.min(themen.length - 1, Number(d.thema) || 0));
      // Textstellen aus den Dokumenten des Kunden zum aktuellen Thema: daraus darf der Auditor konkret nachfragen
      let belege = '';
      const geraet = auszuegeVomGeraet(d, 4);
      if (geraet && geraet.treffer.length) belege = auszugText(geraet.treffer, geraet.titel);
      else if (!geraet && themen.length) { const k = await auszuegeDesKunden(kundeId); const t = L.auszuegeSuchen(themen[thema], k.ausz, 4); if (t.length) belege = auszugText(t, k.titel); }
      const system = 'Du spielst einen Zertifizierungsauditor (' + typ.name + ': ' + typ.text + ') in einem ÜBUNGSaudit Stufe ' + (d.stufe || 2) + ' nach ISO 9001 für eine kleine Firma. '
        + 'Stelle immer nur EINE Frage, kurz (höchstens 2 Sätze), in der Sie-Form, gesprochene Sprache ohne Aufzählungen. '
        + 'Wenn die Antwort keinen Nachweis nennt, frage nach dem Dokument oder einem echten Beispiel (höchstens einmal je Frage nachhaken). '
        + 'Erfinde keine Fakten über die Firma; beziehe dich, wo es passt, auf die Auszüge aus ihren Dokumenten („In Ihrem Handbuch steht … – zeigen Sie mir …“). '
        + 'Gehe die Themen des Auditplans der Reihe nach durch, zwei bis drei Fragen je Thema. Beginne die erste Frage zu einem Thema mit der Marke [THEMA:n] (n = Nummer). '
        + 'Nach dem letzten Thema bedanke dich in einem Satz und schreibe [ENDE]. '
        + 'Themen: ' + (themen.join(' / ') || 'Führung, Auftrag, Einkauf, Reklamationen') + '. Aktuelles Thema: ' + (thema + 1) + '.'
        + (d.fallen ? ' Stolperfallen, die du nach und nach ansprechen darfst: ' + kurz(JSON.stringify(d.fallen), 1500) : '')
        + (d.gespraechspartner && d.gespraechspartner.name ? '\n\nDein Gesprächspartner: ' + kurz(d.gespraechspartner.name, 80) + ' (' + kurz(d.gespraechspartner.rolle, 120) + '). '
          + (Array.isArray(d.gespraechspartner.kapitel) && d.gespraechspartner.kapitel.length
            ? 'Frage diese Person NUR zu Themen, die sie verantwortet oder mitmacht: Normkapitel ' + d.gespraechspartner.kapitel.slice(0, 12).map((k: any) => kurz(k, 10)).join(', ')
              + (Array.isArray(d.gespraechspartner.prozesse) && d.gespraechspartner.prozesse.length ? ' (Prozesse: ' + d.gespraechspartner.prozesse.slice(0, 6).map((x: any) => kurz(x, 60)).join(', ') + ')' : '')
              + '. Kontext, Risiken und Chancen, Ziele, internes Audit und Managementbewertung fragst du die Geschäftsführung, nicht diese Person. Qualitätspolitik und den eigenen Beitrag zu den Zielen darf jeder gefragt werden.'
            : 'Diese Person verantwortet das Managementsystem; du darfst sie zu allen Themen befragen.') : '')
        + (Array.isArray(d.praxis) && d.praxis.length ? '\n\nAus der Beratungspraxis (typische Fragen kleiner Firmen zu diesem Thema mit der fachlich richtigen Antwort) – nutze das für gezielte, realistische Nachfragen, ohne es vorzulesen:\n'
          + d.praxis.slice(0, 4).map((x: any) => '- ' + kurz(x && x.q, 200) + ' → ' + kurz(x && x.a, 400)).join('\n') : '')
        + (belege ? '\n\nAuszüge aus den Dokumenten der Firma:\n' + belege : '');
      if (d.zum_schluss) { // kurze Rückmeldung zum Gespräch
        const fb = await claude('Du bist ein erfahrener ISO-Berater. Antworte nur mit JSON.', [{ role: 'user', content: 'Übungsgespräch zwischen Auditor und Kunde:\n'
          + verlauf.map((m: any) => (m.role === 'user' ? 'Kunde: ' : 'Auditor: ') + m.content).join('\n') + '\n\nGib eine kurze Rückmeldung an den Kunden nach der Formel „Was wir machen – wo es steht – ein Beispiel“. Format: {"gut":"ein Satz","ueben":"ein Satz","tipp":"ein Satz"}' }], 400);
        return antwort(L.kiJson(fb) || {});
      }
      const roh = await claude(system, verlauf, 1500); // genug Platz, auch wenn das Modell vorher nachdenkt
      const m = roh.match(/\[THEMA:(\d+)\]/);
      return antwort({ text: roh.replace(/\[THEMA:\d+\]|\[ENDE\]/g, '').trim(), thema: m ? Number(m[1]) - 1 : null, ende: /\[ENDE\]/.test(roh) });
    }

    if (d.aktion === 'wissensfrage') { // "Frag Ihre Dokumente": Antwort NUR aus den eigenen Dokumenten, mit Quellen
      const frage = kurz(d.frage, 500).trim();
      if (frage.length < 3) return antwort({ fehler: 'Bitte eine Frage eingeben.' }, 400);
      const geraet = auszuegeVomGeraet(d, 8);
      let treffer: any[], titel: Record<string, string>;
      if (geraet) ({ treffer, titel } = geraet);
      else { const k = await auszuegeDesKunden(kundeId); titel = k.titel; treffer = L.auszuegeSuchen(frage, k.ausz, 8); }
      if (!treffer.length) return antwort({ beantwortet: false, antwort: 'Dazu habe ich in Ihren Dokumenten nichts gefunden. Fragen Sie im Zweifel Ihren Berater.', quellen: [] });
      const roh = await claude('Du hilfst einer kleinen Firma bei der Vorbereitung auf ihr ISO-Zertifizierungsaudit. Du antwortest AUSSCHLIESSLICH mit Informationen aus den nummerierten Auszügen ihrer eigenen Dokumente. '
        + 'Erfinde nichts, ergänze kein Normwissen, das nicht in den Auszügen steht. Wenn die Auszüge die Frage nicht beantworten, sag das ehrlich. Sie-Form, einfache Sprache, höchstens 5 Sätze. Antworte nur mit JSON.',
        [{ role: 'user', content: 'Frage: ' + frage + '\n\nAuszüge:\n' + auszugText(treffer, titel)
          + '\n\nFormat: {"beantwortet":true|false,"antwort":"…","quellen":[Nummern der benutzten Auszüge],"so_sagen":"ein Satz, wie man es dem Auditor sagt (optional)"}' }], 600);
      let j: any; try { j = L.kiJson(roh); } catch (_e) { j = { antwort: roh, quellen: [] }; } // Antwort ohne JSON: Text trotzdem zeigen
      const nr = (Array.isArray(j.quellen) ? j.quellen : []).map((n: any) => Number(n)).filter((n: number) => n >= 1 && n <= treffer.length);
      const quellen = [...new Set(nr)].map((n: number) => { const a = treffer[n - 1].auszug; return { dokument_id: a.dokument_id, ort: a.ort, titel: titel[a.dokument_id] || '' }; });
      return antwort({ beantwortet: j.beantwortet !== false && !!j.antwort, antwort: kurz(j.antwort, 1500) || 'Keine Antwort.', so_sagen: kurz(j.so_sagen, 300), quellen });
    }

    if (d.aktion === 'antwort_feedback') { // Feedback nach Holgers Formel, ergaenzt die Regeln ohne KI
      const regel = L.antwortFeedback(d.antwort);
      const geraet = auszuegeVomGeraet(d, 4);
      let belege: any[], titel: Record<string, string>;
      if (geraet) ({ treffer: belege, titel } = geraet);
      else { const k = await auszuegeDesKunden(kundeId); titel = k.titel; belege = L.auszuegeSuchen(kurz(d.frage, 600) + ' ' + kurz(d.hilfe, 400), k.ausz, 4); }
      const roh = await claude('Du bist ein erfahrener ISO-Berater und coachst einen Kunden für sein Zertifizierungsaudit. Antworte nur mit JSON.',
        [{ role: 'user', content: 'Auditorfrage: ' + kurz(d.frage, 600) + '\nAntwort des Kunden: ' + kurz(d.antwort, 2000) + '\nFundstelle in seinen Dokumenten: ' + kurz(d.hilfe, 800) + (belege.length ? '\nAuszüge aus seinen Dokumenten:\n' + auszugText(belege, titel) : '')
          + '\nBewerte nach der Formel „Was wir machen – wo es steht (zeigen) – ein Beispiel“. Keine Superlative, nichts erfinden. '
          + 'Format: {"note":"gut|ok|ueben","lob":"ein Satz","verbesserung":"ein Satz","bessere_antwort":"max. 3 Sätze, nur mit Fakten aus Antwort und Fundstelle"}' }], 500);
      return antwort(Object.assign({ regel }, L.kiJson(roh)));
    }

    if (d.aktion === 'foto_pruefen') { // Bildschirmfoto ansehen: richtiges Dokument? Stand, Unterschrift, Platzhalter?
      const m = String(d.bild || '').match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
      if (!m || m[2].length > 7_000_000) return antwort({ fehler: 'Kein oder zu großes Bild' }, 400);
      const roh = await claude('Du prüfst Bildschirmfotos aus einem Übungsaudit. Antworte nur mit JSON.',
        [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/' + m[1], data: m[2] } },
          { type: 'text', text: 'Frage des Auditors: ' + kurz(d.frage, 600) + '\nErwartete Fundstelle: ' + kurz(d.hilfe, 800)
            + '\nZeigt das Foto die passende Stelle? Achte auf Stand/Datum, Freigabe/Unterschrift, Platzhalter („bitte ergänzen“) und alte Fassungen. '
            + 'Format: {"passt":"ja|teilweise|nein","gezeigt":"was ist zu sehen","hinweis":"ein Satz für den Kunden"}' }] }], 400);
      return antwort(L.kiJson(roh));
    }
    return antwort({ fehler: 'Unbekannte Aktion' }, 400);
  } catch (e) {
    console.error(e instanceof Error ? e.message.slice(0, 200) : 'Fehler'); // keine Inhalte ins Protokoll
    return antwort({ fehler: 'Interner Fehler' }, 500);
  }
});
