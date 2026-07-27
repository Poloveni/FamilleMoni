-- ══════════════════════════════════════════════════════════════════════════
--  PRIX DES DROGUES — version 2 (juillet 2026)
--  Famille Moni · à exécuter dans Supabase → SQL Editor → Run
--
--  POURQUOI CETTE MISE À JOUR
--  La table ne gardait qu'un seul prix par produit, saisi à la main.
--  Or sur Flashback FA, le prix de vente aux PNJ se décompose ainsi :
--
--      prix actuel = prix de base + (semaines de revendication × 10 $)
--
--  Cette règle est vérifiée sur les 7 drogues à revendication, sans écart :
--      Cocaïne 17 sem → +170   Cannabis 15 sem → +150   Mexicana 13 sem → +130
--      Crack   11 sem → +110   Meth bleue 6 sem → +60   Purple Haze 3 sem → +30
--      Tranq    2 sem → +20
--
--  On stocke donc le prix de BASE (qui ne bouge quasiment jamais) et le
--  NOMBRE DE SEMAINES (qui, lui, évolue). Le site calcule le reste.
--  Résultat : au lieu de corriger 7 prix à la main chaque semaine, la Donna
--  met à jour un compteur de semaines et tout se recalcule.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Nouvelles colonnes (sans rien casser de l'existant) ───────────────
alter table public.prix_drogues add column if not exists base_min   numeric;
alter table public.prix_drogues add column if not exists base_max   numeric;
alter table public.prix_drogues add column if not exists semaines   integer not null default 0;
alter table public.prix_drogues add column if not exists revendicable boolean not null default true;
alter table public.prix_drogues add column if not exists categorie  text default 'Gang et Organisation';
alter table public.prix_drogues add column if not exists ordre      integer default 100;

comment on column public.prix_drogues.base_min is 'Prix plancher de vente au PNJ, hors bonus de revendication';
comment on column public.prix_drogues.base_max is 'Prix plafond de vente au PNJ, hors bonus de revendication';
comment on column public.prix_drogues.semaines is 'Semaines de revendication en cours (chacune vaut +10 $)';
comment on column public.prix_drogues.revendicable is 'false pour les produits sans bonus de revendication';
comment on column public.prix_drogues.prix is 'Prix médian actuel, recalculé par le site — sert au calcul de la valeur du coffre';

-- ── 2. Le prix médian actuel se calcule tout seul ────────────────────────
--    (colonne générée : impossible qu'elle se désynchronise du reste)
alter table public.prix_drogues drop column if exists prix_actuel_min;
alter table public.prix_drogues drop column if exists prix_actuel_max;
alter table public.prix_drogues
  add column prix_actuel_min numeric
  generated always as (coalesce(base_min,0) + case when revendicable then coalesce(semaines,0) * 10 else 0 end) stored;
alter table public.prix_drogues
  add column prix_actuel_max numeric
  generated always as (coalesce(base_max,0) + case when revendicable then coalesce(semaines,0) * 10 else 0 end) stored;

-- ── 3. Les valeurs officielles du serveur ────────────────────────────────
insert into public.prix_drogues (item, base_min, base_max, semaines, revendicable, categorie, ordre, prix) values
  ('cannabis',            312, 334, 15, true,  'Gang et Organisation', 10, 473),
  ('cocaïne',             259, 279, 17, true,  'Gang et Organisation', 20, 439),
  ('pochon de mexicana',  249, 269, 13, true,  'Gang et Organisation', 30, 389),
  ('crack',               249, 269, 11, true,  'Gang et Organisation', 40, 369),
  ('purple haze',         312, 334,  3, true,  'Gang et Organisation', 50, 353),
  ('meth bleue',          249, 269,  6, true,  'Gang et Organisation', 60, 319),
  ('tranq',               275, 290,  2, true,  'Gang et Organisation', 70, 302),
  ('b-magic',             450, 470,  0, false, 'Sans revendication',   80, 460),
  ('lean',                300, 350,  0, false, 'Sans revendication',   90, 325),
  ('ecstasy',             180, 300,  0, false, 'Sans revendication',  100, 240)
on conflict (item) do update set
  base_min     = excluded.base_min,
  base_max     = excluded.base_max,
  semaines     = excluded.semaines,
  revendicable = excluded.revendicable,
  categorie    = excluded.categorie,
  ordre        = excluded.ordre,
  prix         = excluded.prix,
  updated_at   = now();

-- Produit présent dans la table mais absent de la liste officielle :
-- on le garde (il peut exister en jeu) en le signalant comme non renseigné.
update public.prix_drogues
   set categorie = 'À renseigner', ordre = 200, revendicable = false
 where item = 'pochon de sporex' and base_min is null;

-- ── 4. La Donna peut aussi ajuster le compteur de semaines ───────────────
--    (la politique d'écriture existante couvre déjà toutes les colonnes)

-- ── 5. Vérification ──────────────────────────────────────────────────────
-- select item, base_min, base_max, semaines,
--        prix_actuel_min, prix_actuel_max, prix
--   from public.prix_drogues order by ordre;

-- Terminé ✔  Recharge l'espace membre : l'onglet « Prix drogues » affiche
-- le prix de base, le bonus de revendication et le prix actuel.
