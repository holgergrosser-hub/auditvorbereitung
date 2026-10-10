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
async function zaehlen(kundeId: string) {
  const { data: k } = await db.from('kunden').select('art, grenzen').eq('id', kundeId).maybeSingle();
  const g = k && k.art === 'test' ? (k.grenzen || {}) : {};
  const z = (x: unknown) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  const { data, error } = await db.rpc('nutzung_buchen', { p_kunde: kundeId, p_art: 'ki', p_max_tag: z(g.ki_tag) ?? MAX_JE_TAG, p_max_gesamt: z(g.ki_gesamt) });
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
  return (j.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
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
// deno-lint-ignore no-explicit-any
const auszugText = (t: any[], titel: Record<string, string>) => t.map((x: any, i: number) => '[' + (i + 1) + '] ' + (titel[x.auszug.dokument_id] || 'Dokument') + ', ' + (x.auszug.ort || '') + ':\n' + kurz(x.auszug.text, 1400)).join('\n\n');

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: h });
  try {
    if (!KEY) return antwort({ fehler: 'KI nicht eingerichtet' }, 503);
    const d = await req.json();

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

    if (d.aktion === 'gespraech') { // Auditor nach Mass: naechste Frage/Nachfrage im Gespraech
      const typ = (L.AUDITOR_TYPEN as any)[d.typ] || L.AUDITOR_TYPEN.sachlich;
      const verlauf = (Array.isArray(d.verlauf) ? d.verlauf : []).slice(-12).map((m: any) => ({ role: m.rolle === 'kunde' ? 'user' : 'assistant', content: kurz(m.text, 1500) }));
      if (!verlauf.length || verlauf[0].role !== 'user') verlauf.unshift({ role: 'user', content: 'Guten Tag, wir sind bereit.' });
      const system = 'Du spielst einen Zertifizierungsauditor (' + typ.name + ': ' + typ.text + ') in einem ÜBUNGSaudit Stufe ' + (d.stufe || 2) + ' für eine kleine Firma. '
        + 'Stelle immer nur EINE Frage, kurz, in der Sie-Form. Wenn die Antwort keinen Nachweis nennt, frage nach dem Dokument oder einem echten Beispiel. '
        + 'Erfinde keine Fakten über die Firma. Themen aus dem Auditplan: ' + kurz(JSON.stringify(d.themen || []), 2000)
        + (d.fallen ? ' Stolperfallen, die du nach und nach ansprechen darfst: ' + kurz(JSON.stringify(d.fallen), 2000) : '');
      if (d.zum_schluss) { // kurze Rueckmeldung zum Gespraech
        const fb = await claude('Du bist ein erfahrener ISO-Berater. Antworte nur mit JSON.', [{ role: 'user', content: 'Übungsgespräch zwischen Auditor und Kunde:\n'
          + verlauf.map((m: any) => (m.role === 'user' ? 'Kunde: ' : 'Auditor: ') + m.content).join('\n') + '\n\nGib eine kurze Rückmeldung an den Kunden nach der Formel „Was wir machen – wo es steht – ein Beispiel“. Format: {"gut":"ein Satz","ueben":"ein Satz","tipp":"ein Satz"}' }], 400);
        return antwort(L.kiJson(fb) || {});
      }
      return antwort({ text: await claude(system, verlauf, 300) });
    }

    if (d.aktion === 'wissensfrage') { // "Frag Ihre Dokumente": Antwort NUR aus den eigenen Dokumenten, mit Quellen
      const frage = kurz(d.frage, 500).trim();
      if (frage.length < 3) return antwort({ fehler: 'Bitte eine Frage eingeben.' }, 400);
      const { ausz, titel } = await auszuegeDesKunden(kundeId);
      const treffer = L.auszuegeSuchen(frage, ausz, 8);
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
      const { ausz, titel } = await auszuegeDesKunden(kundeId);
      const belege = L.auszuegeSuchen(kurz(d.frage, 600) + ' ' + kurz(d.hilfe, 400), ausz, 4);
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
    console.error(e);
    return antwort({ fehler: 'Interner Fehler' }, 500);
  }
});
