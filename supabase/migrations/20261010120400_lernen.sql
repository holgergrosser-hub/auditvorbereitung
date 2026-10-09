-- =====================================================================
-- Auditvorbereitung: Auszuege ("Wo steht das?"), Stolperfallen, Kunden-Eintraege (Spurensuche, Rundgang,
-- Lernstand, Rueckmeldung nach dem Audit) und Fragenbank aus echten Audits. Nur neue Tabellen.
-- =====================================================================

-- Textstellen aus den Kundendokumenten (scripts/auszuege.py), fuer Suche und Hilfe
create table if not exists public.auszuege (
  id text primary key,                         -- "d1-17"
  dokument_id uuid not null references public.dokumente(id) on delete cascade,
  ort text,                                    -- "Seite 3" / "Reiter „Risiken“"
  seite integer,
  reiter text,
  text text not null
);
create index if not exists auszuege_dokument on public.auszuege(dokument_id);

-- Stolperfallen je Kunde (Idee 6): kritische Nachfrage + ehrliche Antwortlinie
create table if not exists public.stolperfallen (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  stufe smallint check (stufe in (1, 2)),
  reihenfolge integer not null default 0,
  thema text not null,
  frage text not null,                         -- so fragt der Auditor
  warum text,                                  -- woher die Falle kommt (Fundstelle, Widerspruch)
  antwortlinie text,                           -- empfohlene ehrliche Antwort
  freigegeben boolean not null default false   -- erst nach Holgers Pruefung sichtbar
);
create index if not exists stolperfallen_kunde on public.stolperfallen(kunde_id, reihenfolge);

-- Alles, was der Kunde in den Uebungen festhaelt: art = spur | rundgang | falle | lernen | rueckmeldung | aufgabe
create table if not exists public.kunden_eintraege (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  audit_id uuid references public.audits(id) on delete cascade,
  mitarbeiter_id uuid references public.mitarbeiter(id) on delete set null,
  art text not null check (art in ('spur', 'rundgang', 'falle', 'lernen', 'rueckmeldung', 'aufgabe', 'auditor')),
  schluessel text not null default '',         -- z. B. Station "angebot" oder Fallen-ID
  daten jsonb not null default '{}'::jsonb,
  geaendert_am timestamptz not null default now(),
  unique nulls not distinct (kunde_id, audit_id, mitarbeiter_id, art, schluessel)
);
create index if not exists kunden_eintraege_kunde on public.kunden_eintraege(kunde_id, art);

-- Fragenbank aus echten Audits (Idee 11): aus Rueckmeldungen und Gespraechsmitschnitten, ohne Kundennamen
create table if not exists public.fragenbank (
  id uuid primary key default gen_random_uuid(),
  zertifizierer text,
  norm text,
  normkapitel text,
  stufe smallint,
  branche text,
  frage text not null,
  quelle text,                                  -- "Rückmeldung", "Mitschnitt"
  anzahl integer not null default 1,           -- wie oft gehoert
  angelegt_am timestamptz not null default now()
);
create index if not exists fragenbank_kapitel on public.fragenbank(norm, normkapitel);

alter table public.auszuege enable row level security;
alter table public.stolperfallen enable row level security;
alter table public.kunden_eintraege enable row level security;
alter table public.fragenbank enable row level security;

do $$
declare t text;
begin
  foreach t in array array['auszuege', 'stolperfallen', 'kunden_eintraege', 'fragenbank'] loop
    execute format('drop policy if exists backoffice_alles on public.%I', t);
    execute format('create policy backoffice_alles on public.%I for all to authenticated using (public.ist_backoffice()) with check (public.ist_backoffice())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Kontaktadresse fuer den Knopf "Ergebnis an Ihren Berater" (Mail-Entwurf beim Kunden, nie automatisch)
alter table public.kunden add column if not exists berater_email text;
