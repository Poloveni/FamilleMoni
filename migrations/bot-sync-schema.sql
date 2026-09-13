-- ============================================================
--  TABLES MIROIR DU BOT MONI — Famille Moni
--  À exécuter dans Supabase  >  SQL Editor  >  New query  >  Run.
--  Le bot Discord y copie ses données toutes les 5 minutes
--  (module sync-supabase.js). Le site les affiche en lecture
--  seule dans l'espace membre.
--  Aucune écriture possible depuis le navigateur : seul le bot
--  écrit, avec la clé secrète (qui contourne les règles RLS).
-- ============================================================

create table if not exists public.bot_stocks (
  item     text primary key,
  quantite bigint not null default 0
);

create table if not exists public.bot_stats (
  user_id text not null,
  action  text not null,
  count   real not null default 0,
  points  real not null default 0,
  primary key (user_id, action)
);

create table if not exists public.bot_user_mapping (
  game_name  text not null,
  discord_id text not null,
  primary key (game_name, discord_id)
);

create table if not exists public.bot_armurerie (
  id        bigint primary key,
  nom       text,
  reference text,
  statut    text,
  pretee_a  text
);

create table if not exists public.bot_taxes (
  id       bigint primary key,
  nom      text,
  type     text,
  echeance timestamptz,
  actif    boolean not null default true,
  paye     boolean not null default false
);

create table if not exists public.bot_meta (
  key   text primary key,
  value text
);

-- ─── RLS : lecture réservée aux membres approuvés, aucune écriture client ───
alter table public.bot_stocks       enable row level security;
alter table public.bot_stats        enable row level security;
alter table public.bot_user_mapping enable row level security;
alter table public.bot_armurerie    enable row level security;
alter table public.bot_taxes        enable row level security;
alter table public.bot_meta         enable row level security;

drop policy if exists "Lecture famille" on public.bot_stocks;
create policy "Lecture famille" on public.bot_stocks for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

drop policy if exists "Lecture famille" on public.bot_stats;
create policy "Lecture famille" on public.bot_stats for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

drop policy if exists "Lecture famille" on public.bot_user_mapping;
create policy "Lecture famille" on public.bot_user_mapping for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

drop policy if exists "Lecture famille" on public.bot_armurerie;
create policy "Lecture famille" on public.bot_armurerie for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

drop policy if exists "Lecture famille" on public.bot_taxes;
create policy "Lecture famille" on public.bot_taxes for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

drop policy if exists "Lecture famille" on public.bot_meta;
create policy "Lecture famille" on public.bot_meta for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

-- Terminé ✔  Les dashboards de l'espace membre attendent la première sync du bot.
