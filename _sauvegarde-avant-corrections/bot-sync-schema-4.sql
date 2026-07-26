-- ============================================================
--  TABLES MIROIR DU BOT MONI — EXTENSION 4 (présences → planning)
--  À exécuter dans Supabase  >  SQL Editor  >  New query  >  Run.
-- ============================================================

create table if not exists public.bot_presences (
  id       text primary key,
  auteur   text,
  titre    text,
  texte    text,
  date_evt timestamptz
);

alter table public.bot_presences enable row level security;

drop policy if exists "Lecture famille" on public.bot_presences;
create policy "Lecture famille" on public.bot_presences for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

-- Terminé ✔
