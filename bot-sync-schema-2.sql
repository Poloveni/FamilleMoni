-- ============================================================
--  TABLES MIROIR DU BOT MONI — EXTENSION (pack complet)
--  À exécuter dans Supabase  >  SQL Editor  >  New query  >  Run.
--  Ajoute : historique du coffre, braquages, cooldowns, ventes ($).
-- ============================================================

create table if not exists public.bot_stock_history (
  id          bigint primary key,
  ts          timestamptz,
  joueur      text,
  action      text,
  item        text,
  quantite    bigint,
  stock_avant bigint,
  stock_apres bigint
);

create table if not exists public.bot_braquages (
  id      bigint primary key,
  user_id text,
  action  text,
  ts      timestamptz
);

create table if not exists public.bot_cooldowns (
  user_id    text not null,
  action     text not null,
  expires_at timestamptz,
  primary key (user_id, action)
);

create table if not exists public.bot_ventes (
  id          bigint primary key,
  joueur      text,
  discord_id  text,
  item        text,
  quantite    bigint,
  ts          timestamptz,
  statut      text,
  montant     bigint,
  prix_pochon real,
  confirmed   boolean not null default false
);

alter table public.bot_stock_history enable row level security;
alter table public.bot_braquages     enable row level security;
alter table public.bot_cooldowns     enable row level security;
alter table public.bot_ventes        enable row level security;

drop policy if exists "Lecture famille" on public.bot_stock_history;
create policy "Lecture famille" on public.bot_stock_history for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

drop policy if exists "Lecture famille" on public.bot_braquages;
create policy "Lecture famille" on public.bot_braquages for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

drop policy if exists "Lecture famille" on public.bot_cooldowns;
create policy "Lecture famille" on public.bot_cooldowns for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

drop policy if exists "Lecture famille" on public.bot_ventes;
create policy "Lecture famille" on public.bot_ventes for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

-- Terminé ✔
