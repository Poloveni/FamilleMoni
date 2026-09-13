-- ══════════════════════════════════════════════════════════════════════════
--  IMPORT DE TAXES DEPUIS UN FICHIER EXCEL — Famille Moni
--  À exécuter dans Supabase → SQL Editor → Run. Sans risque à relancer.
--
--  PRINCIPE : LA BOÎTE AUX LETTRES
--  Le site ne peut pas écrire dans les tables bot_* : le bot les efface et
--  les réécrit entièrement toutes les 5 minutes depuis son SQLite, qui est
--  la seule source de vérité. Un import écrit là-dessus disparaîtrait.
--
--  On crée donc une table qui n'est PAS un miroir : une boîte aux lettres.
--    · le site y dépose une demande d'import (les lignes du fichier Excel) ;
--    · le bot, qui parle déjà à Supabase, la reçoit en moins d'une seconde
--      grâce à Realtime, insère les taxes dans son SQLite, rafraîchit le
--      salon #taxes, puis réécrit son rapport dans la même ligne ;
--    · le site affiche le rapport à l'admin.
--
--  Avantage décisif : rien à exposer sur le VPS. Pas de port ouvert, pas de
--  domaine, pas de certificat, pas de reverse proxy, et aucune clé secrète
--  ne circule — le bot garde sa clé de service, comme aujourd'hui.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.import_taxes (
  id          uuid primary key default gen_random_uuid(),
  cree_par    uuid not null references auth.users(id) on delete cascade,
  cree_le     timestamptz not null default now(),
  fichier     text,                       -- nom du fichier d'origine, pour la traçabilité
  statut      text not null default 'en_attente',
                                          -- en_attente → traite | erreur
  lignes      jsonb not null,             -- les lignes validées envoyées par le site
  rapport     jsonb,                      -- le compte rendu écrit par le bot
  traite_le   timestamptz
);

comment on table  public.import_taxes         is 'Boîte aux lettres site → bot. N''est PAS un miroir : le bot ne l''écrase jamais.';
comment on column public.import_taxes.lignes  is 'Tableau JSON : [{ligne, nom, type, jours, telephone, mot_de_passe}]';
comment on column public.import_taxes.rapport is 'Tableau JSON écrit par le bot : [{ligne, ok, raison}]';

create index if not exists import_taxes_statut_idx on public.import_taxes (statut, cree_le);

alter table public.import_taxes enable row level security;

-- ══════════════════════════════════════════════════════════════════════════
--  QUI PEUT IMPORTER
--
--  ⚠️ Cette liste doit rester IDENTIQUE à window.MONI_IMPORT_TAXES dans
--  supabase-config.js. Celle du site ne fait qu'afficher ou masquer le
--  bouton ; c'est celle-ci qui autorise réellement l'écriture.
--
--  On ne se base pas sur le nom du personnage : chaque membre choisit
--  lui-même son nom dans son profil, n'importe qui pourrait donc se
--  déclarer « Raymond Carter ». L'email, lui, est verrouillé par
--  l'authentification.
--
--  POUR AJOUTER QUELQU'UN : ajoute son email dans la liste ci-dessous,
--  relance ce fichier entier, et ajoute-le aussi dans supabase-config.js.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.peut_importer_taxes()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    'syne@live.fr',             -- Lov Moni — La Donna
    'f.moinard44@gmail.com'     -- Raymond Carter — Braccio Destro
  );
$$;

-- ── Qui peut déposer une demande ─────────────────────────────────────────
drop policy if exists "Admin depose un import" on public.import_taxes;
create policy "Admin depose un import" on public.import_taxes for insert to authenticated
  with check (cree_par = auth.uid() and public.peut_importer_taxes());

-- ── Qui peut lire le rapport : celui qui a déposé la demande ─────────────
drop policy if exists "Admin lit ses imports" on public.import_taxes;
create policy "Admin lit ses imports" on public.import_taxes for select to authenticated
  using (cree_par = auth.uid() and public.peut_importer_taxes());

-- Personne d'autre n'a de politique : ni lecture, ni écriture.
-- Le bot, lui, utilise sa clé de service, qui ignore ces règles.

-- ── Realtime : le bot est prévenu à l'instant du dépôt ───────────────────
--    (sans ça, il faudrait qu'il interroge la table en boucle)
--
--    On vérifie avant d'ajouter : l'éditeur SQL de Supabase exécute tout
--    le fichier dans UNE SEULE transaction. Un « already member of
--    publication » annulerait donc l'intégralité du script, y compris les
--    autorisations plus bas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'import_taxes'
  ) then
    alter publication supabase_realtime add table public.import_taxes;
  end if;
end $$;


-- ══════════════════════════════════════════════════════════════════════════
--  LISTE DES TYPES DE TAXE
--  Le bot reste la source de vérité (typeLabel() dans modules/taxes.js).
--  Il publie sa liste ici à chaque sync ; le site la lit pour valider le
--  fichier Excel sans jamais recopier la liste en dur.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.bot_taxes_types (
  type   text primary key,
  label  text,
  ordre  integer default 100
);

alter table public.bot_taxes_types enable row level security;

drop policy if exists "Lecture famille" on public.bot_taxes_types;
create policy "Lecture famille" on public.bot_taxes_types for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

-- Valeurs de départ, à faire écraser par le bot dès qu'il publiera sa liste.
insert into public.bot_taxes_types (type, label, ordre) values
  ('roxwood',     'Roxwood',      10),
  ('labo_hero',   'Labo héro',    20),
  ('sporex',      'Sporex',       30),
  ('vente',       'Vente',        40),
  ('fertilisant', 'Fertilisant',  50)
on conflict (type) do nothing;

-- ── Vérification ────────────────────────────────────────────────────────
-- select * from public.bot_taxes_types order by ordre;
-- select id, statut, fichier, cree_le, jsonb_array_length(lignes) as nb
--   from public.import_taxes order by cree_le desc limit 10;

-- Terminé ✔
