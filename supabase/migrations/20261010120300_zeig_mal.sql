-- Zeig-mal-Training (Idee 3): wie lange hat das Finden gedauert?
alter table public.antworten add column if not exists dauer_sekunden integer check (dauer_sekunden between 0 and 3600);
