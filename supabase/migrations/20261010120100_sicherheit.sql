-- =====================================================================
-- Auditvorbereitung: Sicherheit (Lektion A04)
-- Regel: Das Backoffice (angemeldet UND in backoffice_nutzer) darf alles. Ohne Anmeldung: nichts.
-- Kunden greifen nie direkt auf Tabellen zu, sondern nur ueber die Edge Function "kunde",
-- die den persoenlichen Link prueft und genau die Daten dieses Kunden liefert.
-- =====================================================================

create or replace function public.ist_backoffice() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.backoffice_nutzer n
                 where lower(n.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and n.aktiv);
$$;
revoke all on function public.ist_backoffice() from public, anon;
grant execute on function public.ist_backoffice() to authenticated;

-- backoffice_nutzer: jeder sieht nur den eigenen Eintrag, angelegt wird im Table Editor
drop policy if exists "eigener_eintrag" on public.backoffice_nutzer;
create policy "eigener_eintrag" on public.backoffice_nutzer for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
revoke all on public.backoffice_nutzer from anon;
revoke insert, update, delete on public.backoffice_nutzer from authenticated;

-- Fachtabellen: eine Regel "backoffice_alles" je Tabelle
do $$
declare t text;
begin
  foreach t in array array['kunden','mitarbeiter','audits','planpunkte','pruefpunkte','aufgaben','dokumente','fragen','antworten','nachweise','zugaenge'] loop
    execute format('drop policy if exists "backoffice_alles" on public.%I', t);
    execute format('create policy "backoffice_alles" on public.%I for all to authenticated using ((select public.ist_backoffice())) with check ((select public.ist_backoffice()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
-- Der Link selbst ist geheim: das Backoffice sieht nur, dass es ihn gibt (Spalten ohne token_hash),
-- angelegt wird er ueber zugang_anlegen() unten
revoke all on public.zugaenge from authenticated;
grant select (id, kunde_id, gueltig_bis, gesperrt, angelegt_am) on public.zugaenge to authenticated;
grant update (gesperrt, gueltig_bis), delete on public.zugaenge to authenticated;

-- Neuer Kundenlink: erzeugt ein zufaelliges Token, speichert nur die Pruefsumme, gibt das Token EINMAL zurueck
create or replace function public.zugang_anlegen(p_kunde uuid, p_tage integer default 60) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare tok text := encode(gen_random_bytes(24), 'hex');
begin
  if not public.ist_backoffice() then raise exception 'nicht berechtigt'; end if;
  insert into public.zugaenge (kunde_id, token_hash, gueltig_bis)
  values (p_kunde, encode(digest(tok, 'sha256'), 'hex'), current_date + greatest(1, least(p_tage, 365)));
  return tok;
end $$;
revoke all on function public.zugang_anlegen(uuid, integer) from public, anon;
grant execute on function public.zugang_anlegen(uuid, integer) to authenticated;

-- Dateiablage: drei private Speicher. Lesen nur ueber zeitlich begrenzte Links (signierte URLs).
insert into storage.buckets (id, name, public, file_size_limit)
values ('auditplaene', 'auditplaene', false, 20971520),
       ('dokumente', 'dokumente', false, 52428800),
       ('nachweise', 'nachweise', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "backoffice_dateien" on storage.objects;
create policy "backoffice_dateien" on storage.objects for all to authenticated
  using (bucket_id in ('auditplaene', 'dokumente', 'nachweise') and (select public.ist_backoffice()))
  with check (bucket_id in ('auditplaene', 'dokumente', 'nachweise') and (select public.ist_backoffice()));
