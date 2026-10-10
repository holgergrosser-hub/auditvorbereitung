-- =====================================================================
-- Auditvorbereitung: Kostenloser Testmonat (LinkedIn) mit Grenzen je Teilnehmer (Lektion A16)
-- Weg: Anfrage auf web/test/ → Holger prueft im Backoffice → "Freischalten" kopiert den Vorlage-Kunden
--      (erfundene Beispielfirma) → Link + Schluessel schickt Holger selbst im LinkedIn-Chat (nie automatische Mails).
-- Nur Ergaenzungen – bestehende Migrationen bleiben unveraendert.
-- =====================================================================

-- Art des Kunden: echter Beratungskunde, Testteilnehmer oder Vorlage (Beispielfirma, aus der Tests kopiert werden)
alter table public.kunden add column if not exists art text not null default 'kunde' check (art in ('kunde', 'test', 'vorlage'));
-- Grenzen je Teilnehmer, z. B. {"ki_tag":20,"ki_gesamt":150,"nachrichten_tag":5,"fotos_gesamt":30}; leer = keine Testgrenzen
alter table public.kunden add column if not exists grenzen jsonb;
alter table public.kunden add column if not exists teilnehmer text;           -- "Max Muster · Muster GmbH" (nur Backoffice)
alter table public.kunden add column if not exists vorlage_id uuid references public.kunden(id) on delete set null;

-- Nachrichten: normale Nachricht oder Verbesserungsvorschlag aus dem Testmonat
alter table public.nachrichten add column if not exists art text not null default 'nachricht' check (art in ('nachricht', 'feedback'));
alter table public.nachrichten add column if not exists daten jsonb;          -- Feedback-Bogen: {note, hilft, fehlt, empfehlen}

-- Anfragen fuer den Testmonat (Formular web/test/). Eingetragen nur ueber die Edge Function "kunde" (Aktion testanfrage).
create table if not exists public.testanfragen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  firma text not null,
  email text not null,
  linkedin text,
  normen text,
  audit_termin text,
  nachricht text,
  quelle text not null default 'LinkedIn',
  feedback_zugesagt boolean not null default false,
  datenschutz_ok boolean not null default false,
  status text not null default 'neu' check (status in ('neu', 'freigeschaltet', 'abgelehnt')),
  kunde_id uuid references public.kunden(id) on delete set null,
  angelegt_am timestamptz not null default now(),
  bearbeitet_am timestamptz
);
create index if not exists testanfragen_status on public.testanfragen(status, angelegt_am desc);
create index if not exists testanfragen_email on public.testanfragen(lower(email));
alter table public.testanfragen enable row level security;
create policy backoffice_alles on public.testanfragen for all to authenticated using (public.ist_backoffice()) with check (public.ist_backoffice());
revoke all on public.testanfragen from anon;
grant select, insert, update, delete on public.testanfragen to authenticated;

-- Verbrauch je Kunde, Tag und Art (ki, foto, nachricht). Nur die Edge Functions (service_role) schreiben.
create table if not exists public.nutzung (
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  tag date not null default current_date,
  art text not null,
  anzahl integer not null default 0,
  primary key (kunde_id, tag, art)
);
alter table public.nutzung enable row level security;
create policy backoffice_lesen on public.nutzung for select to authenticated using (public.ist_backoffice());
revoke all on public.nutzung from anon, authenticated;
grant select on public.nutzung to authenticated;

-- Einen Verbrauch buchen, wenn die Grenze es erlaubt. Gibt true zurueck, wenn gebucht wurde.
-- p_max_tag / p_max_gesamt: null = ohne Grenze. Atomar (eine Zeile je Tag wird gesperrt).
create or replace function public.nutzung_buchen(p_kunde uuid, p_art text, p_max_tag integer, p_max_gesamt integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare heute integer; gesamt integer;
begin
  insert into public.nutzung (kunde_id, tag, art, anzahl) values (p_kunde, current_date, p_art, 0) on conflict do nothing;
  select anzahl into heute from public.nutzung where kunde_id = p_kunde and tag = current_date and art = p_art for update;
  if p_max_tag is not null and heute >= p_max_tag then return false; end if;
  if p_max_gesamt is not null then
    select coalesce(sum(anzahl), 0) into gesamt from public.nutzung where kunde_id = p_kunde and art = p_art;
    if gesamt >= p_max_gesamt then return false; end if;
  end if;
  update public.nutzung set anzahl = anzahl + 1 where kunde_id = p_kunde and tag = current_date and art = p_art;
  return true;
end $$;
revoke all on function public.nutzung_buchen(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.nutzung_buchen(uuid, text, integer, integer) to service_role;

-- Freischalten: kopiert den Vorlage-Kunden (Audits, Plan, Pruefliste, Fragen, Dokumente, Auszuege, Faktencheck,
-- Stolperfallen, Aufgaben, Mitarbeiter) fuer genau diesen Teilnehmer, setzt Grenzen und legt den Link an.
-- Gibt das Token EINMAL zurueck. Uebungsdaten (Antworten, Fotos, Eintraege) werden nicht kopiert.
create or replace function public.testkunde_anlegen(p_anfrage uuid, p_tage integer default 30, p_grenzen jsonb default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  a public.testanfragen%rowtype;
  v uuid; k_neu uuid := gen_random_uuid();
  tok text := encode(gen_random_bytes(24), 'hex');
begin
  if not public.ist_backoffice() then raise exception 'nicht berechtigt'; end if;
  select * into a from public.testanfragen where id = p_anfrage for update;
  if not found then raise exception 'Anfrage nicht gefunden'; end if;
  if a.status = 'freigeschaltet' then raise exception 'Schon freigeschaltet'; end if;
  select id into v from public.kunden where art = 'vorlage' order by angelegt_am desc limit 1;
  if v is null then raise exception 'Keine Vorlage: im Backoffice einen Kunden als Vorlage markieren'; end if;

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
  select md5(k_neu::text || x.id::text)::uuid, k_neu, x.stufe, x.datum, x.zertifizierer, x.auditor, x.normen, x.auditor_level, x.plan_pfad, x.plan_dateiname, x.status, x.ruhemodus_tage
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
  select k_neu, case when x.audit_id is null then null else md5(k_neu::text || x.audit_id::text)::uuid end, x.reihenfolge, x.prio, x.todo, x.normbezug, x.verantwortlich, x.termin, 'offen', x.bis_stufe
  from public.aufgaben x left join public.audits au on au.id = x.audit_id where x.kunde_id = v;

  insert into public.zugaenge (kunde_id, token_hash, gueltig_bis)
  values (k_neu, encode(digest(tok, 'sha256'), 'hex'), current_date + greatest(1, least(coalesce(p_tage, 30), 90)));

  update public.testanfragen set status = 'freigeschaltet', kunde_id = k_neu, bearbeitet_am = now() where id = a.id;
  return tok;
end $$;
revoke all on function public.testkunde_anlegen(uuid, integer, jsonb) from public, anon;
grant execute on function public.testkunde_anlegen(uuid, integer, jsonb) to authenticated;

-- Uebersicht um Art, Teilnehmer, offenes Feedback und KI-Verbrauch erweitern (neue Spalten nur hinten anhaengen)
create or replace view public.kunden_uebersicht with (security_invoker = true) as
select k.id, k.name, k.ort, k.angelegt_am,
  (select min(a.datum) from public.audits a where a.kunde_id = k.id and a.datum >= current_date) as naechstes_audit,
  (select string_agg('Stufe ' || a.stufe || ': ' || coalesce(to_char(a.datum, 'DD.MM.YYYY'), 'offen'), ' · ' order by a.stufe) from public.audits a where a.kunde_id = k.id) as termine,
  (select count(*) from public.fragen f join public.audits a on a.id = f.audit_id where a.kunde_id = k.id) as fragen,
  (select count(distinct an.frage_id) from public.antworten an join public.fragen f on f.id = an.frage_id join public.audits a on a.id = f.audit_id where a.kunde_id = k.id) as geuebt,
  (select count(distinct an.frage_id) from public.antworten an join public.fragen f on f.id = an.frage_id join public.audits a on a.id = f.audit_id where a.kunde_id = k.id and an.sicherheit = 'weiss_nicht') as schwer,
  greatest(
    (select max(an.beantwortet_am) from public.antworten an join public.fragen f on f.id = an.frage_id join public.audits a on a.id = f.audit_id where a.kunde_id = k.id),
    (select max(e.geaendert_am) from public.kunden_eintraege e where e.kunde_id = k.id),
    (select max(fc.beantwortet_am) from public.faktencheck fc where fc.kunde_id = k.id)) as zuletzt_aktiv,
  (select count(*) from public.faktencheck fc where fc.kunde_id = k.id and fc.antwort = 'stimmt_nicht' and not fc.erledigt) as korrekturen_offen,
  (select count(*) from public.nachrichten n where n.kunde_id = k.id and not n.gelesen) as nachrichten_neu,
  (select max(z.gueltig_bis) from public.zugaenge z where z.kunde_id = k.id and not z.gesperrt) as link_gueltig_bis,
  k.art, k.teilnehmer, k.grenzen,
  (select count(*) from public.nachrichten n where n.kunde_id = k.id and n.art = 'feedback') as feedback,
  (select coalesce(sum(nu.anzahl), 0) from public.nutzung nu where nu.kunde_id = k.id and nu.art = 'ki') as ki_gesamt
from public.kunden k;
revoke all on public.kunden_uebersicht from anon;
grant select on public.kunden_uebersicht to authenticated;
