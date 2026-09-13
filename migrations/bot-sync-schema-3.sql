-- ============================================================
--  TABLES MIROIR DU BOT MONI — EXTENSION 3 (palmarès + annonces)
--  À exécuter dans Supabase  >  SQL Editor  >  New query  >  Run.
-- ============================================================

-- Bilans hebdomadaires archivés (jamais effacés → palmarès)
create table if not exists public.bot_bilans (
  semaine   text not null,      -- date du dimanche 19h de début de semaine (YYYY-MM-DD)
  user_id   text not null,
  ventes    real not null default 0,
  recolte   real not null default 0,
  activites real not null default 0,
  points    real not null default 0,
  primary key (semaine, user_id)
);

-- Annonces Discord (affichées sur le site PUBLIC)
create table if not exists public.bot_annonces (
  id     text primary key,
  auteur text,
  texte  text,
  ts     timestamptz
);

alter table public.bot_bilans   enable row level security;
alter table public.bot_annonces enable row level security;

-- Bilans : réservés aux membres approuvés
drop policy if exists "Lecture famille" on public.bot_bilans;
create policy "Lecture famille" on public.bot_bilans for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

-- Annonces : lecture PUBLIQUE (section Actualités du site)
drop policy if exists "Annonces publiques" on public.bot_annonces;
create policy "Annonces publiques" on public.bot_annonces for select
  using (true);

-- Terminé ✔
