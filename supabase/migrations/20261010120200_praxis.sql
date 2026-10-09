-- =====================================================================
-- Auditvorbereitung: Ergaenzungen aus den Praxisgespraechen (docs/praxis-erkenntnisse.md)
-- Nur neue Spalten/Tabellen, bestehende Migrationen bleiben unveraendert.
-- =====================================================================

-- P03/P06/P02: Dokumente "kennen" oder "nur finden", nur gueltige zeigen, Direktlink und Abkuerzung
alter table public.dokumente add column if not exists wichtigkeit text not null default 'finden'
  check (wichtigkeit in ('kennen', 'finden'));
alter table public.dokumente add column if not exists gueltig boolean not null default true;   -- false = Archiv, Kunde sieht es nie
alter table public.dokumente add column if not exists link text;          -- z. B. Google-Link direkt auf den Reiter (#gid=…)
alter table public.dokumente add column if not exists kurzname text;      -- "UPH" -> erscheint in der Abkuerzungsliste

-- P01/P04/P09: Stufe-1-Uebung "Dokument finden" haengt an der Pruefliste; eine Frage kann fuer beide Normen gelten
alter table public.fragen add column if not exists pruefpunkt_id uuid references public.pruefpunkte(id) on delete set null;
alter table public.fragen add column if not exists art text not null default 'frage' check (art in ('frage', 'zeig_mal'));
alter table public.fragen add column if not exists normen text[] not null default '{}';     -- {"ISO 9001","ISO 14001"}

-- P04: To-dos mit Stufen-Vermerk ("nicht vor Stufe 1 noetig")
alter table public.aufgaben add column if not exists bis_stufe smallint check (bis_stufe in (1, 2));

-- P14: Ruhemodus x Tage vor dem Audit
alter table public.audits add column if not exists ruhemodus_tage smallint not null default 3;

-- P12: "Mein Beispiel" je Frage (vom Kunden, fuer den Spickzettel)
alter table public.antworten add column if not exists ist_beispiel boolean not null default false;

-- P05: Faktencheck - Kunde bestaetigt oder korrigiert Angaben aus den Dokumenten
create table if not exists public.faktencheck (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  reihenfolge integer not null default 0,
  thema text not null,          -- "Geschäftsführung", "Mitarbeiterzahl", "Zertifizierer", "Leistungen im Geltungsbereich"
  angabe text,                  -- was in den Dokumenten steht
  fundstelle text,              -- wo es steht
  antwort text check (antwort in ('stimmt', 'stimmt_nicht')),
  korrektur text,               -- Angabe des Kunden
  beantwortet_am timestamptz,
  erledigt boolean not null default false  -- Holger hat die Dokumente angepasst
);
create index if not exists faktencheck_kunde on public.faktencheck(kunde_id, reihenfolge);
alter table public.faktencheck enable row level security;

-- P07: Technik-Check je Kunde
alter table public.kunden add column if not exists technik_check jsonb;   -- {"laptop":true,"chrome":true,"dokument_offen":true,"bildschirm":"2026-10-05T…"}

-- Zugriff wie die anderen Tabellen: nur Backoffice, Kunden ueber die Edge Function "kunde"
drop policy if exists backoffice_alles on public.faktencheck;
create policy backoffice_alles on public.faktencheck for all to authenticated using (public.ist_backoffice()) with check (public.ist_backoffice());
revoke all on public.faktencheck from anon;
grant select, insert, update, delete on public.faktencheck to authenticated;
