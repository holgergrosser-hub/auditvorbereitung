-- =====================================================================
-- Auditvorbereitung: Grundschema (Lektion A03)
-- Einmal im Supabase SQL Editor ausfuehren. Kann mehrfach laufen (if not exists).
-- Jede Tabelle bekommt sofort Zeilensicherheit (RLS); die Regeln stehen in 20261010120100_sicherheit.sql.
-- =====================================================================

create extension if not exists pgcrypto;

-- Wer im Backoffice arbeiten darf (Holger, Mitarbeiter). Eintrag im Table Editor, E-Mail wie bei der Anmeldung.
create table if not exists public.backoffice_nutzer (
  email text primary key,
  name text,
  aktiv boolean not null default true,
  angelegt_am timestamptz not null default now()
);

-- Beratungskunde (Firma)
create table if not exists public.kunden (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ort text,
  kontakt_name text,
  kontakt_email text,
  notiz text,
  angelegt_am timestamptz not null default now()
);

-- Mitarbeiter des Kunden mit Bereich (z. B. Geschaeftsfuehrung, Einkauf, Produktion, QM)
create table if not exists public.mitarbeiter (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  name text not null,
  bereich text not null,
  funktion text,
  email text,
  angelegt_am timestamptz not null default now()
);

-- Ein Audit des Zertifizierers: Stufe 1 (Dokumente) oder Stufe 2 (vor Ort)
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  stufe smallint not null check (stufe in (1, 2)),
  datum date,
  zertifizierer text,
  auditor text,              -- Auditteamleiter laut Plan
  normen text,               -- "ISO 9001, ISO 14001"
  auditor_level text not null default 'mittel' check (auditor_level in ('einfach', 'mittel', 'streng')),
  plan_pfad text,            -- Datei im Speicher "auditplaene"
  plan_dateiname text,
  status text not null default 'plan_fehlt' check (status in ('plan_fehlt', 'plan_hochgeladen', 'plan_gelesen', 'fragen_bereit')),
  angelegt_am timestamptz not null default now()
);

-- Zeilen des Auditplans (aus dem PDF gelesen oder von Hand), ergaenzt um die Mitarbeiter der Firma
create table if not exists public.planpunkte (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  reihenfolge integer not null default 0,
  zeit text,                 -- wie im Plan: "09:00-09:30"
  thema text not null,
  normkapitel text,          -- "4.1, 4.2" (Text, nie Zahl)
  auditor text,              -- Kuerzel laut Plan
  gespraechspartner text,    -- laut Plan des Zertifizierers
  bereich text,              -- Bereich der Firma, der dabei sein muss
  mitarbeiter_ids uuid[] not null default '{}',
  nachweise text,            -- Ergaenzung QM-Dienstleistungen: "Nachweise bereitlegen" (D-Nr.)
  verantwortlich text
);

-- Pruefliste des Zertifizierers (z. B. TUEV NORD A00F221 "Pruefung Systemdokumente"), je Norm,
-- ergaenzt um die Zuordnung zu den Kundendokumenten (Vorschlag QM-Dienstleistungen)
create table if not exists public.pruefpunkte (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  norm text not null,        -- "ISO 9001"
  reihenfolge integer not null default 0,
  normpunkt text not null,   -- "9.1.2" (Text)
  titel text,
  frage text not null,       -- Frage des Zertifizierers
  bewertung text,            -- B-Spalte: 1/2/3/-/OK/VP/NK/NZ (Vorschlag)
  bemerkung text,            -- Bemerkung fuer das Formular (Vorschlag)
  dokument_ids uuid[] not null default '{}',
  fundstelle text,           -- "UPH S. 3; Tab 7/8"
  status text check (status in ('ok', 'OP', 'HA', 'NZ')),  -- ok · OP verbessern · HA vor dem Audit zwingend · NZ nicht zutreffend
  offener_punkt text
);

-- "Vor dem Audit erledigen": priorisierte To-dos aus der Zuordnung
create table if not exists public.aufgaben (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  reihenfolge integer not null default 0,
  prio text not null default 'OP' check (prio in ('HA', 'OP')),
  todo text not null,
  normbezug text,
  verantwortlich text,
  termin date,
  status text not null default 'offen' check (status in ('offen', 'in_arbeit', 'erledigt'))
);

-- Dokumente des Kunden (Handbuch, Prozesse, Nachweise)
create table if not exists public.dokumente (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  d_nr text,                 -- "D-01" (Dokumentenverzeichnis)
  titel text not null,
  pfad text not null,        -- Datei im Speicher "dokumente"
  dateiname text,
  stand text,                -- Stand laut Dokument, z. B. 02.08.2026
  normkapitel text,          -- Normbezug "4–10" oder "6.1, 9.1"
  bereich text,
  status text not null default 'vorhanden' check (status in ('vorhanden', 'teilweise', 'fehlt')),
  todo text,
  inhalt_kurz jsonb,         -- von der KI: Gliederung mit Seiten (fuer Fundstellen)
  hochgeladen_am timestamptz not null default now()
);

-- Uebungsfragen je Planpunkt; "hilfe" und "dokument_ids" zeigen, wo die Loesung steht
create table if not exists public.fragen (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  planpunkt_id uuid references public.planpunkte(id) on delete cascade,
  reihenfolge integer not null default 0,
  bereich text,
  frage text not null,
  hilfe text,
  dokument_ids uuid[] not null default '{}',
  angelegt_am timestamptz not null default now()
);

-- Antworten der Mitarbeiter (Uebung, kein Pruefergebnis)
create table if not exists public.antworten (
  id uuid primary key default gen_random_uuid(),
  frage_id uuid not null references public.fragen(id) on delete cascade,
  mitarbeiter_id uuid references public.mitarbeiter(id) on delete set null,
  text text,
  sicherheit text not null default 'sicher' check (sicherheit in ('sicher', 'unsicher', 'weiss_nicht')),
  hilfe_genutzt boolean not null default false,
  beantwortet_am timestamptz not null default now()
);

-- Bildschirmfotos als Nachweis zu einer Frage
create table if not exists public.nachweise (
  id uuid primary key default gen_random_uuid(),
  frage_id uuid not null references public.fragen(id) on delete cascade,
  mitarbeiter_id uuid references public.mitarbeiter(id) on delete set null,
  pfad text not null,        -- Datei im Speicher "nachweise"
  notiz text,
  aufgenommen_am timestamptz not null default now()
);

-- Persoenlicher Link je Kunde. Gespeichert wird nur die Pruefsumme des Tokens.
create table if not exists public.zugaenge (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  token_hash text not null unique,
  gueltig_bis date not null,
  gesperrt boolean not null default false,
  angelegt_am timestamptz not null default now()
);

create index if not exists mitarbeiter_kunde on public.mitarbeiter(kunde_id);
create index if not exists audits_kunde on public.audits(kunde_id);
create index if not exists planpunkte_audit on public.planpunkte(audit_id, reihenfolge);
create index if not exists dokumente_kunde on public.dokumente(kunde_id);
create index if not exists pruefpunkte_audit on public.pruefpunkte(audit_id, norm, reihenfolge);
create index if not exists aufgaben_audit on public.aufgaben(audit_id, reihenfolge);
create index if not exists fragen_audit on public.fragen(audit_id, reihenfolge);
create index if not exists antworten_frage on public.antworten(frage_id);
create index if not exists nachweise_frage on public.nachweise(frage_id);

alter table public.backoffice_nutzer enable row level security;
alter table public.kunden enable row level security;
alter table public.mitarbeiter enable row level security;
alter table public.audits enable row level security;
alter table public.planpunkte enable row level security;
alter table public.dokumente enable row level security;
alter table public.fragen enable row level security;
alter table public.antworten enable row level security;
alter table public.nachweise enable row level security;
alter table public.zugaenge enable row level security;
alter table public.pruefpunkte enable row level security;
alter table public.aufgaben enable row level security;
