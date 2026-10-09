// Edge Function "kunde": die einzige Tuer fuer Kunden. Prueft den persoenlichen Link (Token) und liefert
// genau die Daten dieses Kunden. Schreibt Antworten und Bildschirmfotos. Nie Mails, nie fremde Daten.
// Aufruf: POST {t, aktion, ...}  aktionen: start | fragen | dokument | antwort | nachweis
// Bereitstellen: supabase functions deploy kunde --no-verify-jwt   (Kunden haben kein Supabase-Login)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import L from '../_shared/logik.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const ERLAUBT = (Deno.env.get('ERLAUBTE_HERKUNFT') || '*').split(',').map(s => s.trim());

function cors(origin: string | null) {
  const o = ERLAUBT.includes('*') ? '*' : (origin && ERLAUBT.includes(origin) ? origin : ERLAUBT[0]);
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'content-type, apikey, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
}
async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function kundeZumToken(t: string) {
  if (!/^[0-9a-f]{48}$/.test(t || '')) return null;
  const { data } = await db.from('zugaenge').select('kunde_id, gueltig_bis, gesperrt').eq('token_hash', await sha256(t)).maybeSingle();
  if (!data || data.gesperrt || new Date(data.gueltig_bis + 'T23:59:59') < new Date()) return null;
  return data.kunde_id as string;
}
const pflicht = <T>(r: { data: T | null; error: unknown }) => { if (r.error) throw r.error; return r.data as T; };

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: h });
  try {
    const d = await req.json();
    const kundeId = await kundeZumToken(String(d.t || ''));
    if (!kundeId) return antwort({ fehler: 'Link ungültig oder abgelaufen. Bitte bei QM-Dienstleistungen einen neuen Link anfordern.' }, 401);

    if (d.aktion === 'start') {
      const kunde = pflicht(await db.from('kunden').select('name, ort').eq('id', kundeId).single());
      const audits = pflicht(await db.from('audits').select('id, stufe, datum, zertifizierer, normen, auditor_level, status').eq('kunde_id', kundeId).order('stufe'));
      const mitarbeiter = pflicht(await db.from('mitarbeiter').select('id, name, bereich, funktion').eq('kunde_id', kundeId).order('bereich'));
      return antwort({ kunde, audits: (audits as any[]).filter(a => a.status === 'fragen_bereit'), mitarbeiter, level: L.AUDITOR_LEVEL });
    }

    // alles Weitere gehoert zu einem Audit dieses Kunden
    const audit = d.audit_id ? pflicht(await db.from('audits').select('id, kunde_id, stufe').eq('id', d.audit_id).maybeSingle()) as any : null;
    if (d.aktion !== 'dokument' && (!audit || audit.kunde_id !== kundeId)) return antwort({ fehler: 'Audit nicht gefunden' }, 404);

    if (d.aktion === 'fragen') {
      const [fragen, punkte, doks] = await Promise.all([
        db.from('fragen').select('id, planpunkt_id, reihenfolge, bereich, frage, hilfe, dokument_ids').eq('audit_id', audit.id).order('reihenfolge'),
        db.from('planpunkte').select('id, zeit, thema, normkapitel, bereich, mitarbeiter_ids, nachweise').eq('audit_id', audit.id).order('reihenfolge'),
        db.from('dokumente').select('id, d_nr, titel, kurzname, normkapitel, bereich, stand, wichtigkeit, link').eq('kunde_id', kundeId).eq('gueltig', true).order('d_nr')
      ]);
      const fr = pflicht(fragen) as any[], pp = pflicht(punkte) as any[], dk = pflicht(doks) as any[];
      const auswahl = L.fragenFuerBereich(fr, pp, String(d.bereich || 'alle'), String(d.mitarbeiter_id || ''));
      const bisher = d.mitarbeiter_id ? pflicht(await db.from('antworten').select('frage_id, sicherheit').eq('mitarbeiter_id', d.mitarbeiter_id).in('frage_id', auswahl.map(f => f.id))) as any[] : [];
      return antwort({
        fragen: auswahl.map(f => Object.assign({}, f, { dokumente: L.dokumenteFuerFrage(Object.assign({}, f, { normkapitel: (pp.find(p => p.id === f.planpunkt_id) || {}).normkapitel }), dk).map((x: any) => ({ id: x.id, d_nr: x.d_nr, titel: x.titel, stand: x.stand })) })),
        planpunkte: pp.map(p => ({ id: p.id, zeit: p.zeit, thema: p.thema, nachweise: p.nachweise })),
        beantwortet: bisher
      });
    }

    if (d.aktion === 'dokument') { // zeitlich begrenzter Link (10 Minuten) auf ein Dokument dieses Kunden
      const dok = pflicht(await db.from('dokumente').select('pfad, kunde_id, titel, gueltig').eq('id', d.dokument_id).maybeSingle()) as any;
      if (!dok || dok.kunde_id !== kundeId || !dok.gueltig) return antwort({ fehler: 'Dokument nicht gefunden' }, 404);
      const { data, error } = await db.storage.from('dokumente').createSignedUrl(dok.pfad, 600);
      if (error) throw error;
      return antwort({ url: data.signedUrl, titel: dok.titel });
    }

    const frage = pflicht(await db.from('fragen').select('id, audit_id').eq('id', d.frage_id).maybeSingle()) as any;
    if (!frage || frage.audit_id !== audit.id) return antwort({ fehler: 'Frage nicht gefunden' }, 404);
    const ma = d.mitarbeiter_id ? pflicht(await db.from('mitarbeiter').select('id, kunde_id').eq('id', d.mitarbeiter_id).maybeSingle()) as any : null;
    const mitarbeiterId = ma && ma.kunde_id === kundeId ? ma.id : null;

    if (d.aktion === 'antwort') {
      pflicht(await db.from('antworten').insert({ frage_id: frage.id, mitarbeiter_id: mitarbeiterId, text: String(d.text || '').slice(0, 4000),
        sicherheit: ['sicher', 'unsicher', 'weiss_nicht'].includes(d.sicherheit) ? d.sicherheit : 'sicher', hilfe_genutzt: !!d.hilfe_genutzt }));
      return antwort({ ok: true });
    }

    if (d.aktion === 'nachweis') { // Bildschirmfoto (PNG/JPEG als data:-URL), hoechstens 8 MB
      const m = String(d.bild || '').match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return antwort({ fehler: 'Kein Bild' }, 400);
      const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
      if (bytes.length > 8 * 1024 * 1024) return antwort({ fehler: 'Bild zu groß' }, 413);
      const pfad = kundeId + '/' + audit.id + '/' + frage.id + '/' + crypto.randomUUID() + '.' + (m[1] === 'png' ? 'png' : 'jpg');
      pflicht(await db.storage.from('nachweise').upload(pfad, bytes, { contentType: 'image/' + m[1] }));
      pflicht(await db.from('nachweise').insert({ frage_id: frage.id, mitarbeiter_id: mitarbeiterId, pfad, notiz: String(d.notiz || '').slice(0, 500) }));
      return antwort({ ok: true });
    }
    return antwort({ fehler: 'Unbekannte Aktion' }, 400);
  } catch (e) {
    console.error(e);
    return antwort({ fehler: 'Interner Fehler' }, 500);
  }
});
