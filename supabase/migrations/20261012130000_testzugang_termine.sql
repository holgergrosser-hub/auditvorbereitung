-- =====================================================================
-- Testmonat: Audittermine der Vorlage fuer jeden Teilnehmer in die Zukunft legen (Stufe 1 = Freischaltung + 14 Tage,
-- Abstaende zwischen Stufe 1, Stufe 2 und Aufgaben bleiben). Sonst saehe ein Teilnehmer im Dezember "Audit war im Oktober".
-- Ersetzt nur die Funktion testkunde_anlegen aus 20261012120000_testzugang.sql.
-- =====================================================================
create or replace function public.testkunde_anlegen(p_anfrage uuid, p_tage integer default 30, p_grenzen jsonb default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  a public.testanfragen%rowtype;
  v uuid; k_neu uuid := gen_random_uuid(); d0 date;
  tok text := encode(gen_random_bytes(24), 'hex');
begin
  if not public.ist_backoffice() then raise exception 'nicht berechtigt'; end if;
  select * into a from public.testanfragen where id = p_anfrage for update;
  if not found then raise exception 'Anfrage nicht gefunden'; end if;
  if a.status = 'freigeschaltet' then raise exception 'Schon freigeschaltet'; end if;
  select id into v from public.kunden where art = 'vorlage' order by angelegt_am desc limit 1;
  if v is null then raise exception 'Keine Vorlage: im Backoffice einen Kunden als Vorlage markieren'; end if;

  -- Termine verschieben: erstes Audit der Vorlage liegt fuer jeden Teilnehmer 14 Tage nach der Freischaltung, Abstaende bleiben
  select min(datum) into d0 from public.audits where kunde_id = v;
  -- Neue IDs werden aus (neuer Kunde, alte ID) abgeleitet: gleiche alte ID -> gleiche neue ID, ohne Hilfstabelle

  insert into public.kunden (id, name, ort, kontakt_name, kontakt_email, notiz, berater_email, berater_name, rundgang, pdf_zip_pfad,
                             firma_laut_zertifizierer, art, grenzen, teilnehmer, vorlage_id)
  select k_neu, k.name, k.ort, a.name, a.email, 'Testmonat aus Anfrage vom ' || to_char(a.angelegt_am, 'DD.MM.YYYY'), k.berater_email, k.berater_name,
         k.rundgang, k.pdf_zip_pfad, k.firma_laut_zertifizierer, 'test',
         coalesce(p_grenzen, '{"ki_tag":20,"ki_gesamt":150,"nachrichten_tag":5,"fotos_gesamt":30}'::jsonb),
         a.name || ' · ' || a.firma, v
  from public.kunden k where k.id = v;

  insert into public.mitarbeiter (id, kunde_id, name, bereich, funktion, email)
  select md5(k_neu::text || x.id::text)::uuid, k_neu, x.name, x.bereich, x.funktion, null from public.mitarbeiter x where x.kunde_id = v;

  insert into public.audits (id, kunde_id, stufe, datum, zertifizierer, auditor, normen, auditor_level, plan_pfad, plan_dateiname, status, ruhemodus_tage)
  select md5(k_neu::text || x.id::text)::uuid, k_neu, x.stufe, case when x.datum is null or d0 is null then x.datum else current_date + 14 + (x.datum - d0) end, x.zertifizierer, x.auditor, x.normen, x.auditor_level, x.plan_pfad, x.plan_dateiname, x.status, x.ruhemodus_tage
  from public.audits x where x.kunde_id = v;

  insert into public.dokumente (id, kunde_id, d_nr, titel, pfad, dateiname, stand, normkapitel, bereich, status, todo, inhalt_kurz,
                                wichtigkeit, gueltig, link, kurzname, kopie_pfad, kopie_seiten)
  select md5(k_neu::text || x.id::text)::uuid, k_neu, x.d_nr, x.titel, x.pfad, x.dateiname, x.stand, x.normkapitel, x.bereich, x.status, x.todo, x.inhalt_kurz,
         x.wichtigkeit, x.gueltig, x.link, x.kurzname, x.kopie_pfad, x.kopie_seiten
  from public.dokumente x where x.kunde_id = v;

  insert into public.auszuege (id, dokument_id, ort, seite, reiter, text)
  select left(md5(k_neu::text || x.dokument_id::text)::uuid::text, 8) || '-' || x.id, md5(k_neu::text || x.dokument_id::text)::uuid, x.ort, x.seite, x.reiter, x.text
  from public.auszuege x join public.dokumente d on d.id = x.dokument_id where d.kunde_id = v;

  insert into public.planpunkte (id, audit_id, reihenfolge, zeit, thema, normkapitel, auditor, gespraechspartner, bereich, mitarbeiter_ids, nachweise, verantwortlich)
  select md5(k_neu::text || x.id::text)::uuid, md5(k_neu::text || x.audit_id::text)::uuid, x.reihenfolge, x.zeit, x.thema, x.normkapitel, x.auditor, x.gespraechspartner, x.bereich,
         coalesce((select array_agg(md5(k_neu::text || u.id::text)::uuid order by u.o) from unnest(x.mitarbeiter_ids) with ordinality u(id, o)), '{}'),
         x.nachweise, x.verantwortlich
  from public.planpunkte x join public.audits au on au.id = x.audit_id where au.kunde_id = v;

  insert into public.pruefpunkte (id, audit_id, norm, reihenfolge, normpunkt, titel, frage, bewertung, bemerkung, dokument_ids, fundstelle, status, offener_punkt)
  select md5(k_neu::text || x.id::text)::uuid, md5(k_neu::text || x.audit_id::text)::uuid, x.norm, x.reihenfolge, x.normpunkt, x.titel, x.frage, x.bewertung, x.bemerkung,
         coalesce((select array_agg(md5(k_neu::text || u.id::text)::uuid order by u.o) from unnest(x.dokument_ids) with ordinality u(id, o)), '{}'),
         x.fundstelle, x.status, x.offener_punkt
  from public.pruefpunkte x join public.audits au on au.id = x.audit_id where au.kunde_id = v;

  insert into public.fragen (id, audit_id, planpunkt_id, reihenfolge, bereich, frage, hilfe, dokument_ids, pruefpunkt_id, art, normen, normkapitel, titel)
  select md5(k_neu::text || x.id::text)::uuid, md5(k_neu::text || x.audit_id::text)::uuid, case when x.planpunkt_id is null then null else md5(k_neu::text || x.planpunkt_id::text)::uuid end, x.reihenfolge, x.bereich, x.frage, x.hilfe,
         coalesce((select array_agg(md5(k_neu::text || u.id::text)::uuid order by u.o) from unnest(x.dokument_ids) with ordinality u(id, o)), '{}'),
         case when x.pruefpunkt_id is null then null else md5(k_neu::text || x.pruefpunkt_id::text)::uuid end, x.art, x.normen, x.normkapitel, x.titel
  from public.fragen x join public.audits au on au.id = x.audit_id where au.kunde_id = v;

  insert into public.faktencheck (kunde_id, reihenfolge, thema, angabe, fundstelle)
  select k_neu, x.reihenfolge, x.thema, x.angabe, x.fundstelle from public.faktencheck x where x.kunde_id = v;

  insert into public.stolperfallen (kunde_id, stufe, reihenfolge, thema, frage, warum, antwortlinie, freigegeben)
  select k_neu, x.stufe, x.reihenfolge, x.thema, x.frage, x.warum, x.antwortlinie, x.freigegeben from public.stolperfallen x where x.kunde_id = v;

  insert into public.aufgaben (kunde_id, audit_id, reihenfolge, prio, todo, normbezug, verantwortlich, termin, status, bis_stufe)
  select k_neu, case when x.audit_id is null then null else md5(k_neu::text || x.audit_id::text)::uuid end, x.reihenfolge, x.prio, x.todo, x.normbezug, x.verantwortlich, case when x.termin is null or d0 is null then x.termin else current_date + 14 + (x.termin - d0) end, 'offen', x.bis_stufe
  from public.aufgaben x left join public.audits au on au.id = x.audit_id where x.kunde_id = v;

  insert into public.zugaenge (kunde_id, token_hash, gueltig_bis)
  values (k_neu, encode(digest(tok, 'sha256'), 'hex'), current_date + greatest(1, least(coalesce(p_tage, 30), 90)));

  update public.testanfragen set status = 'freigeschaltet', kunde_id = k_neu, bearbeitet_am = now() where id = a.id;
  return tok;
end $$;
revoke all on function public.testkunde_anlegen(uuid, integer, jsonb) from public, anon;
grant execute on function public.testkunde_anlegen(uuid, integer, jsonb) to authenticated;

