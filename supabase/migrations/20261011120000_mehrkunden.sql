-- =====================================================================
-- Auditvorbereitung: Mehrkunden-Betrieb mit Backoffice (Lektionen A13–A15)
-- Alles, was die Testfassung (paket.json) schon kann, jetzt auch in der Datenbank.
-- Nur Ergaenzungen – bestehende Migrationen bleiben unveraendert.
-- =====================================================================

-- Fragen: Normkapitel und Kurztitel wie im Fahrplan der Pruefliste ("4.3 Anwendungsbereich")
alter table public.fragen add column if not exists normkapitel text;
alter table public.fragen add column if not exists titel text;

-- Dokumente: PDF-Kopie fuer den Seitenbetrachter (Speicher "dokumente") und Reiter → PDF-Seite bei Tabellen
alter table public.dokumente add column if not exists kopie_pfad text;
alter table public.dokumente add column if not exists kopie_seiten jsonb;    -- {"Risiken": 8, "Chancen": 9}
alter table public.dokumente alter column pfad drop not null;                -- Dokument kann auch nur als Google-Link existieren

-- Kunde: Name des Beraters ("An Holger Grosser senden"), Foto-Rundgang, Zip mit allen PDFs
alter table public.kunden add column if not exists berater_name text;
alter table public.kunden add column if not exists rundgang jsonb;           -- [{k, name, intervall_monate, hilfe}]
alter table public.kunden add column if not exists pdf_zip_pfad text;        -- Speicher "dokumente"
alter table public.kunden add column if not exists firma_laut_zertifizierer text;

-- Aufgaben gehoeren zum Kunden (nicht nur zu einem Audit), "bis Stufe" sagt, wann sie faellig sind
alter table public.aufgaben alter column audit_id drop not null;
alter table public.aufgaben add column if not exists kunde_id uuid references public.kunden(id) on delete cascade;
create index if not exists aufgaben_kunde on public.aufgaben(kunde_id);

-- Nachrichten des Kunden ("✉ An … senden"): Text + Stand. Nie automatische Mails, Holger liest im Backoffice.
create table if not exists public.nachrichten (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  mitarbeiter_id uuid references public.mitarbeiter(id) on delete set null,
  text text,
  zusammenfassung text,
  gelesen boolean not null default false,
  gesendet_am timestamptz not null default now()
);
create index if not exists nachrichten_kunde on public.nachrichten(kunde_id, gesendet_am desc);
alter table public.nachrichten enable row level security;
drop policy if exists backoffice_alles on public.nachrichten;
create policy backoffice_alles on public.nachrichten for all to authenticated using (public.ist_backoffice()) with check (public.ist_backoffice());
revoke all on public.nachrichten from anon;
grant select, insert, update, delete on public.nachrichten to authenticated;

-- Uebersicht fuer das Backoffice: je Kunde Termine, Uebungsstand, letzte Aktivitaet, ungelesene Nachrichten.
-- security_invoker: die Sicht gilt mit den Rechten des Anmeldenden (also nur fuer das Backoffice).
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
  (select max(z.gueltig_bis) from public.zugaenge z where z.kunde_id = k.id and not z.gesperrt) as link_gueltig_bis
from public.kunden k;
revoke all on public.kunden_uebersicht from anon;
grant select on public.kunden_uebersicht to authenticated;
