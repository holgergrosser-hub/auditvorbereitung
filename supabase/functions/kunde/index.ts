// Edge Function "kunde": die einzige Tuer fuer Kunden. Prueft den persoenlichen Link (Token) und liefert
// genau die Daten dieses Kunden. Schreibt Antworten, Bildschirmfotos, Technik-Check und Faktencheck. Nie Mails, nie fremde Daten.
// Aufruf: POST {t, aktion, ...}
//   start                         Firma, Audits, Mitarbeiter, gueltige Dokumente, Faktencheck, Technik-Check
//   fragen   {audit_id, bereich, mitarbeiter_id}   Fragen/Fahrplan mit Dokumenten, Planpunkte, bisherige Antworten
//   dokument {dokument_id}        Link zum Dokument (Google-Link oder 10 Minuten gueltiger Speicherlink)
//   antwort  {audit_id, frage_id, mitarbeiter_id, text, sicherheit, hilfe_genutzt, dauer_sekunden, ist_beispiel}
//   nachweis {audit_id, frage_id, mitarbeiter_id, bild (data:image/png;base64,…), notiz}
//   technik  {check:{laptop, chrome, dokument_offen, bildschirm}}
//   fakt     {fakt_id, antwort:'stimmt'|'stimmt_nicht', korrektur}
//   auszuege                      alle Textstellen der gueltigen Dokumente (Suche "Wo steht das?" laeuft im Browser)
//   eintrag  {audit_id?, mitarbeiter_id?, art, schluessel, daten}   Spurensuche, Rundgang, Fallen, Lernstand, Rueckmeldung
//   eintraege {audit_id?}         eigene Eintraege lesen
//   dokument {dokument_id, pdf:true}  10 Minuten gueltiger Link auf die PDF-Kopie (Seitenbetrachter pdf.html)
//   nachricht {mitarbeiter_id?, text, zusammenfassung, art?:'feedback', daten?}  "✉ An … senden" / Verbesserungsvorschlag:
//                                 landet im Backoffice, nie als automatische Mail
//   testanfrage {name, firma, email, linkedin, normen, audit_termin, nachricht, feedback_zugesagt, datenschutz_ok}
//                                 OHNE Link: Anfrage fuer den Testmonat (web/test/). Holger schaltet im Backoffice frei.
// Testteilnehmer (kunden.art = 'test') haben Grenzen (kunden.grenzen): Nachrichten je Tag, Fotos gesamt; KI zaehlt die Funktion "ki".
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
async function zugangZumToken(t: string) {
  if (!/^[0-9a-f]{48}$/.test(t || '')) return null;
  const { data } = await db.from('zugaenge').select('kunde_id, gueltig_bis, gesperrt').eq('token_hash', await sha256(t)).maybeSingle();
  if (!data || data.gesperrt || new Date(data.gueltig_bis + 'T23:59:59') < new Date()) return null;
  return data as { kunde_id: string; gueltig_bis: string };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // fremde IDs (z. B. vom Geraet) nie an die Datenbank
const MAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,200}\.[a-z]{2,}$/i;
// deno-lint-ignore no-explicit-any
const zahl = (g: any, k: string) => (g && Number.isFinite(Number(g[k])) && g[k] !== null && g[k] !== '' ? Number(g[k]) : null);
// Verbrauch buchen (Datenbankfunktion nutzung_buchen, atomar). true = erlaubt
async function buchen(kundeId: string, art: string, maxTag: number | null, maxGesamt: number | null) {
  const { data, error } = await db.rpc('nutzung_buchen', { p_kunde: kundeId, p_art: art, p_max_tag: maxTag, p_max_gesamt: maxGesamt });
  if (error) throw error;
  return data === true;
}
// deno-lint-ignore no-explicit-any
const pflicht = (r: { data: any; error: unknown }) => { if (r.error) throw r.error; return r.data; };
const DOK_FELDER = 'id, d_nr, titel, kurzname, normkapitel, bereich, stand, wichtigkeit, link, inhalt_kurz, kopie_pfad, kopie_seiten';
// Fuer den Kunden: Speicherpfad nie herausgeben, nur "es gibt eine PDF-Kopie"
// deno-lint-ignore no-explicit-any
const dokFuerKunde = (x: any) => { const o = Object.assign({}, x, { kopie: x.kopie_pfad ? 'ja' : '' }); delete o.kopie_pfad; return o; };

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: h });
  try {
    const d = await req.json();

    if (d.aktion === 'testanfrage') { // oeffentlich: Anfrage fuer den kostenlosen Testmonat. Keine Mail, nur ein Eintrag fuers Backoffice.
      if (d.website) return antwort({ ok: true });            // Honigtopf-Feld: Bots fuellen es aus, Menschen sehen es nicht
      const k = (x: unknown, n: number) => String(x || '').trim().slice(0, n);
      const a = { name: k(d.name, 120), firma: k(d.firma, 160), email: k(d.email, 200).toLowerCase(), linkedin: k(d.linkedin, 300), normen: k(d.normen, 200),
        audit_termin: k(d.audit_termin, 100), nachricht: k(d.nachricht, 2000), quelle: k(d.quelle, 60) || 'LinkedIn',
        feedback_zugesagt: d.feedback_zugesagt === true, datenschutz_ok: d.datenschutz_ok === true };
      if (!a.name || !a.firma || !MAIL.test(a.email)) return antwort({ fehler: 'Bitte Name, Firma und eine gültige E-Mail-Adresse angeben.' }, 400);
      if (!a.datenschutz_ok || !a.feedback_zugesagt) return antwort({ fehler: 'Bitte die beiden Häkchen setzen.' }, 400);
      const gestern = new Date(Date.now() - 864e5).toISOString();
      const [je, alle] = await Promise.all([
        db.from('testanfragen').select('id', { count: 'exact', head: true }).eq('email', a.email).gte('angelegt_am', gestern),
        db.from('testanfragen').select('id', { count: 'exact', head: true }).gte('angelegt_am', gestern)]);
      if ((je.count || 0) >= 3) return antwort({ fehler: 'Ihre Anfrage ist schon da – Holger Grosser meldet sich.' }, 429);
      if ((alle.count || 0) >= 60) return antwort({ fehler: 'Heute sind sehr viele Anfragen eingegangen. Bitte morgen noch einmal versuchen.' }, 429);
      pflicht(await db.from('testanfragen').insert(a));
      return antwort({ ok: true });
    }

    const zugang = await zugangZumToken(String(d.t || ''));
    if (!zugang) return antwort({ fehler: 'Link ungültig oder abgelaufen. Bitte bei Holger Grosser (QM-Dienstleistungen) einen neuen Link anfordern.' }, 401);
    const kundeId = zugang.kunde_id;
    const ki0 = pflicht(await db.from('kunden').select('art, grenzen').eq('id', kundeId).single());
    const grenzen = ki0.art === 'test' ? (ki0.grenzen || {}) : null;   // Grenzen gelten nur im Testmonat

    if (d.aktion === 'start') {
      const [kunde, audits, mitarbeiter, dokumente, fakten, fallen, aufgaben] = await Promise.all([
        db.from('kunden').select('name, ort, technik_check, berater_email, berater_name, rundgang, pdf_zip_pfad, firma_laut_zertifizierer').eq('id', kundeId).single(),
        db.from('audits').select('id, stufe, datum, zertifizierer, auditor, normen, auditor_level, ruhemodus_tage, status').eq('kunde_id', kundeId).order('stufe'),
        db.from('mitarbeiter').select('id, name, bereich, funktion').eq('kunde_id', kundeId).order('bereich'),
        db.from('dokumente').select(DOK_FELDER).eq('kunde_id', kundeId).eq('gueltig', true).order('d_nr'),
        db.from('faktencheck').select('id, reihenfolge, thema, angabe, fundstelle, antwort, korrektur').eq('kunde_id', kundeId).order('reihenfolge'),
        db.from('stolperfallen').select('id, stufe, reihenfolge, thema, frage, warum, antwortlinie').eq('kunde_id', kundeId).eq('freigegeben', true).order('reihenfolge'),
        db.from('aufgaben').select('id, todo, bis_stufe, verantwortlich, termin, reihenfolge').eq('kunde_id', kundeId).order('reihenfolge')
      ]);
      const k = pflicht(kunde);
      let pdfZip = '';
      if (k.pdf_zip_pfad) { const z = await db.storage.from('dokumente').createSignedUrl(k.pdf_zip_pfad, 12 * 3600, { download: true }); if (!z.error) pdfZip = z.data.signedUrl; }
      const rundgang = Array.isArray(k.rundgang) && k.rundgang.length ? k.rundgang : L.RUNDGANG_STANDARD;
      delete k.pdf_zip_pfad; delete k.rundgang;
      let test = null;
      if (grenzen) { // Testmonat: Laufzeit und Verbrauch fuer die Anzeige "noch x Tage · KI heute n von m"
        const nu = pflicht(await db.from('nutzung').select('tag, art, anzahl').eq('kunde_id', kundeId));
        const heute = new Date().toISOString().slice(0, 10);
        const summe = (art: string, nurHeute: boolean) => nu.filter((x: any) => x.art === art && (!nurHeute || x.tag === heute)).reduce((s: number, x: any) => s + x.anzahl, 0);
        test = { bis: zugang.gueltig_bis, grenzen, verbraucht: { ki_heute: summe('ki', true), ki_gesamt: summe('ki', false), fotos_gesamt: summe('foto', false), nachrichten_heute: summe('nachricht', true) } };
      }
      return antwort({ kunde: k, test, audits: pflicht(audits).filter((a: any) => a.status === 'fragen_bereit'),
        mitarbeiter: pflicht(mitarbeiter), dokumente: pflicht(dokumente).map(dokFuerKunde), faktencheck: pflicht(fakten), stolperfallen: pflicht(fallen),
        aufgaben: pflicht(aufgaben), rundgang, pdf_zip: pdfZip, level: L.AUDITOR_LEVEL });
    }

    if (d.aktion === 'nachricht') { // Kostenbremse: hoechstens 30 Nachrichten je Kunde und Tag (im Testmonat laut Grenze)
      if (!(await buchen(kundeId, 'nachricht', zahl(grenzen, 'nachrichten_tag') ?? 30, null))) return antwort({ fehler: 'Heute schon sehr viele Nachrichten – bitte morgen wieder.' }, 429);
      let maId = null;
      if (UUID.test(String(d.mitarbeiter_id || ''))) { const m = pflicht(await db.from('mitarbeiter').select('id, kunde_id').eq('id', d.mitarbeiter_id).maybeSingle()); if (m && m.kunde_id === kundeId) maId = m.id; }
      const fb = d.art === 'feedback';
      const daten = fb && d.daten && typeof d.daten === 'object' ? d.daten : null;
      if (daten && JSON.stringify(daten).length > 8000) return antwort({ fehler: 'Zu viele Daten' }, 413);
      pflicht(await db.from('nachrichten').insert({ kunde_id: kundeId, mitarbeiter_id: maId, text: String(d.text || '').slice(0, 4000), zusammenfassung: String(d.zusammenfassung || '').slice(0, 500),
        art: fb ? 'feedback' : 'nachricht', daten }));
      return antwort({ ok: true });
    }

    if (d.aktion === 'auszuege') {
      const doks = pflicht(await db.from('dokumente').select('id').eq('kunde_id', kundeId).eq('gueltig', true));
      if (!doks.length) return antwort({ auszuege: [] });
      return antwort({ auszuege: pflicht(await db.from('auszuege').select('id, dokument_id, ort, seite, reiter, text').in('dokument_id', doks.map((x: any) => x.id)).limit(5000)) });
    }

    if (d.aktion === 'eintrag' || d.aktion === 'eintraege') {
      let auditId = null, maId = null;
      if (d.audit_id) { if (!UUID.test(String(d.audit_id))) return antwort({ fehler: 'Audit nicht gefunden' }, 404); const a = pflicht(await db.from('audits').select('id, kunde_id').eq('id', d.audit_id).maybeSingle()); if (!a || a.kunde_id !== kundeId) return antwort({ fehler: 'Audit nicht gefunden' }, 404); auditId = a.id; }
      if (UUID.test(String(d.mitarbeiter_id || ''))) { const m = pflicht(await db.from('mitarbeiter').select('id, kunde_id').eq('id', d.mitarbeiter_id).maybeSingle()); if (m && m.kunde_id === kundeId) maId = m.id; }
      if (d.aktion === 'eintraege') {
        let q = db.from('kunden_eintraege').select('audit_id, mitarbeiter_id, art, schluessel, daten, geaendert_am').eq('kunde_id', kundeId);
        if (auditId) q = q.or('audit_id.eq.' + auditId + ',audit_id.is.null');
        return antwort({ eintraege: pflicht(await q.limit(2000)) });
      }
      const art = String(d.art || '');
      if (!['spur', 'rundgang', 'falle', 'lernen', 'rueckmeldung', 'aufgabe', 'auditor'].includes(art)) return antwort({ fehler: 'Unbekannte Art' }, 400);
      const daten = d.daten && typeof d.daten === 'object' ? d.daten : {};
      if (JSON.stringify(daten).length > (art === 'spur' || art === 'rundgang' ? 400000 : 20000)) return antwort({ fehler: 'Zu viele Daten' }, 413); // Belegfoto (verkleinert) darf mit
      pflicht(await db.from('kunden_eintraege').upsert({ kunde_id: kundeId, audit_id: auditId, mitarbeiter_id: maId, art, schluessel: String(d.schluessel || '').slice(0, 100), daten, geaendert_am: new Date().toISOString() },
        { onConflict: 'kunde_id,audit_id,mitarbeiter_id,art,schluessel' }));
      return antwort({ ok: true });
    }

    if (d.aktion === 'technik') { // nur bekannte Felder, Zeitstempel vom Server
      const c = d.check || {}; const alt = (pflicht(await db.from('kunden').select('technik_check').eq('id', kundeId).single()).technik_check) || {};
      const neu = Object.assign({}, alt);
      ['laptop', 'chrome', 'dokument_offen', 'bildschirm'].forEach(k => { if (k in c) neu[k] = c[k] ? new Date().toISOString() : null; });
      pflicht(await db.from('kunden').update({ technik_check: neu }).eq('id', kundeId));
      return antwort({ ok: true, technik_check: neu });
    }

    if (d.aktion === 'fakt') {
      if (!UUID.test(String(d.fakt_id || ''))) return antwort({ fehler: 'Nicht gefunden' }, 404);
      const f = pflicht(await db.from('faktencheck').select('id, kunde_id').eq('id', d.fakt_id).maybeSingle());
      if (!f || f.kunde_id !== kundeId) return antwort({ fehler: 'Nicht gefunden' }, 404);
      if (!['stimmt', 'stimmt_nicht'].includes(d.antwort)) return antwort({ fehler: 'Antwort fehlt' }, 400);
      pflicht(await db.from('faktencheck').update({ antwort: d.antwort, korrektur: String(d.korrektur || '').slice(0, 1000), beantwortet_am: new Date().toISOString() }).eq('id', f.id));
      return antwort({ ok: true });
    }

    if (d.aktion === 'dokument') {
      if (!UUID.test(String(d.dokument_id || ''))) return antwort({ fehler: 'Dokument nicht gefunden' }, 404);
      const dok = pflicht(await db.from('dokumente').select('pfad, kopie_pfad, kunde_id, titel, gueltig, link').eq('id', d.dokument_id).maybeSingle());
      if (!dok || dok.kunde_id !== kundeId || !dok.gueltig) return antwort({ fehler: 'Dokument nicht gefunden' }, 404);
      if (d.pdf) { // Seitenbetrachter: immer die PDF-Kopie
        if (!dok.kopie_pfad) return antwort({ fehler: 'Keine PDF-Kopie' }, 404);
        const { data, error } = await db.storage.from('dokumente').createSignedUrl(dok.kopie_pfad, 600);
        if (error) throw error;
        return antwort({ url: data.signedUrl, titel: dok.titel });
      }
      if (dok.link) return antwort({ url: dok.link, titel: dok.titel });
      if (!dok.pfad) return antwort({ fehler: 'Keine Datei hinterlegt' }, 404);
      const { data, error } = await db.storage.from('dokumente').createSignedUrl(dok.pfad, 600);
      if (error) throw error;
      return antwort({ url: data.signedUrl, titel: dok.titel });
    }

    // ab hier: gehoert zu einem Audit dieses Kunden
    const audit = UUID.test(String(d.audit_id || '')) ? pflicht(await db.from('audits').select('id, kunde_id, stufe').eq('id', d.audit_id).maybeSingle()) : null;
    if (!audit || audit.kunde_id !== kundeId) return antwort({ fehler: 'Audit nicht gefunden' }, 404);
    const ma = UUID.test(String(d.mitarbeiter_id || '')) ? pflicht(await db.from('mitarbeiter').select('id, kunde_id, name, bereich, funktion').eq('id', d.mitarbeiter_id).maybeSingle()) : null;
    const mitarbeiterId = ma && ma.kunde_id === kundeId ? ma.id : null;

    if (d.aktion === 'fragen') {
      const [fragen, punkte, doks] = await Promise.all([
        db.from('fragen').select('id, planpunkt_id, pruefpunkt_id, art, normen, reihenfolge, bereich, normkapitel, titel, frage, hilfe, dokument_ids').eq('audit_id', audit.id).order('reihenfolge'),
        db.from('planpunkte').select('id, reihenfolge, zeit, thema, normkapitel, bereich, mitarbeiter_ids, gespraechspartner, nachweise').eq('audit_id', audit.id).order('reihenfolge'),
        db.from('dokumente').select(DOK_FELDER).eq('kunde_id', kundeId).eq('gueltig', true).order('d_nr')
      ]);
      const fr = pflicht(fragen), pp = pflicht(punkte), dk = pflicht(doks);
      // Rolle des Mitarbeiters: Themen aus Bereich/Funktion und aus den Prozessbeschreibungen in Handbuch und Prozessen (E-A40)
      let rolle = null;
      if (mitarbeiterId) {
        const dokIds = dk.map((x: any) => x.id);
        const pz = dokIds.length ? pflicht(await db.from('auszuege').select('dokument_id, ort, text').in('dokument_id', dokIds).ilike('text', '%Normbezug%').limit(500)) : [];
        rolle = L.rolleThemen(ma, pz);
      }
      const auswahl = L.fragenFuerBereich(fr, pp, String(d.bereich || 'alle'), String(mitarbeiterId || ''), rolle);
      const bisher = mitarbeiterId && auswahl.length ? pflicht(await db.from('antworten')
        .select('frage_id, text, sicherheit, hilfe_genutzt, dauer_sekunden, ist_beispiel, beantwortet_am').eq('mitarbeiter_id', mitarbeiterId).in('frage_id', auswahl.map((f: any) => f.id))) : [];
      return antwort({
        rolle,
        fragen: auswahl.map((f: any) => Object.assign({}, f, {
          dokumente: L.dokumenteFuerFrage(Object.assign({}, f, { normkapitel: f.normkapitel || (pp.find((p: any) => p.id === f.planpunkt_id) || {}).normkapitel }), dk)
            .map((x: any) => ({ id: x.id, d_nr: x.d_nr, titel: x.titel, stand: x.stand, wichtigkeit: x.wichtigkeit }))
        })),
        planpunkte: pp, antworten: bisher
      });
    }

    if (!UUID.test(String(d.frage_id || ''))) return antwort({ fehler: 'Frage nicht gefunden' }, 404);
    const frage = pflicht(await db.from('fragen').select('id, audit_id').eq('id', d.frage_id).maybeSingle());
    if (!frage || frage.audit_id !== audit.id) return antwort({ fehler: 'Frage nicht gefunden' }, 404);

    if (d.aktion === 'antwort') {
      const sek = Number(d.dauer_sekunden);
      pflicht(await db.from('antworten').insert({ frage_id: frage.id, mitarbeiter_id: mitarbeiterId, text: String(d.text || '').slice(0, 4000),
        sicherheit: ['sicher', 'unsicher', 'weiss_nicht'].includes(d.sicherheit) ? d.sicherheit : 'sicher', hilfe_genutzt: !!d.hilfe_genutzt,
        dauer_sekunden: Number.isFinite(sek) ? Math.max(0, Math.min(3600, Math.round(sek))) : null, ist_beispiel: !!d.ist_beispiel }));
      return antwort({ ok: true });
    }

    if (d.aktion === 'nachweis') { // Bildschirmfoto (PNG/JPEG als data:-URL), hoechstens 8 MB
      const m = String(d.bild || '').match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return antwort({ fehler: 'Kein Bild' }, 400);
      const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
      if (bytes.length > 8 * 1024 * 1024) return antwort({ fehler: 'Bild zu groß' }, 413);
      if (grenzen && !(await buchen(kundeId, 'foto', null, zahl(grenzen, 'fotos_gesamt')))) return antwort({ fehler: 'Im Testmonat sind genug Fotos gespeichert.' }, 429);
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
