-- ══════════════════════════════════════════════════════════════════════════
--  PRIX DES DROGUES — mise à jour · Famille Moni
--  À exécuter dans Supabase → SQL Editor → Run. Sans risque à relancer.
--
--  CE QUE FAIT CE FICHIER
--  1. Il ajoute les produits qui manquaient (Meth bleue, Purple Haze,
--     Crack et Lean n'existaient pas dans la table).
--  2. Il enregistre le prix de base OFFICIEL du serveur, en simple référence
--     affichée à côté de ta saisie. Ce n'est jamais lui qui décide du prix.
--  3. Il pré-remplit ton prix de vente uniquement là où rien n'est encore
--     saisi — un prix que tu as déjà tapé n'est jamais écrasé.
--
--  Le prix appliqué reste TA valeur, tapée à la main dans l'espace membre.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Ménage : si tu avais exécuté une version précédente de ce fichier,
--    on retire les colonnes qui pilotaient le prix automatiquement.
alter table public.prix_drogues drop column if exists prix_actuel_min;
alter table public.prix_drogues drop column if exists prix_actuel_max;
alter table public.prix_drogues drop column if exists semaines;
alter table public.prix_drogues drop column if exists revendicable;
alter table public.prix_drogues drop column if exists categorie;
alter table public.prix_drogues drop column if exists ordre;

-- ── Deux colonnes de référence, en lecture seule dans l'espace membre ────
alter table public.prix_drogues add column if not exists base_min numeric;
alter table public.prix_drogues add column if not exists base_max numeric;

comment on column public.prix_drogues.base_min is 'Prix plancher officiel du serveur (référence, non appliqué)';
comment on column public.prix_drogues.base_max is 'Prix plafond officiel du serveur (référence, non appliqué)';
comment on column public.prix_drogues.prix    is 'Le prix appliqué, saisi à la main par la Donna';

-- ── Les produits manquants sont ajoutés ─────────────────────────────────
insert into public.prix_drogues (item, prix) values
  ('cannabis', 0), ('cocaïne', 0), ('pochon de mexicana', 0), ('crack', 0),
  ('purple haze', 0), ('meth bleue', 0), ('tranq', 0),
  ('b-magic', 0), ('lean', 0), ('ecstasy', 0), ('pochon de sporex', 0)
on conflict (item) do nothing;

-- ── Prix de base officiels (note du serveur, juillet 2026) ──────────────
update public.prix_drogues set base_min = 312, base_max = 334 where item = 'cannabis';
update public.prix_drogues set base_min = 259, base_max = 279 where item = 'cocaïne';
update public.prix_drogues set base_min = 249, base_max = 269 where item = 'pochon de mexicana';
update public.prix_drogues set base_min = 249, base_max = 269 where item = 'crack';
update public.prix_drogues set base_min = 312, base_max = 334 where item = 'purple haze';
update public.prix_drogues set base_min = 249, base_max = 269 where item = 'meth bleue';
update public.prix_drogues set base_min = 275, base_max = 290 where item = 'tranq';
-- Produits sans bonus de revendication : le prix affiché EST le prix de base.
update public.prix_drogues set base_min = 450, base_max = 470 where item = 'b-magic';
update public.prix_drogues set base_min = 300, base_max = 350 where item = 'lean';
update public.prix_drogues set base_min = 180, base_max = 300 where item = 'ecstasy';

-- ── Prix de départ, seulement là où rien n'a encore été saisi ───────────
--    (médianes de la note officielle — à ajuster ensuite dans l'espace membre)
update public.prix_drogues set prix = 473, updated_at = now() where item = 'cannabis'           and coalesce(prix,0) = 0;
update public.prix_drogues set prix = 460, updated_at = now() where item = 'b-magic'            and coalesce(prix,0) = 0;
update public.prix_drogues set prix = 439, updated_at = now() where item = 'cocaïne'            and coalesce(prix,0) = 0;
update public.prix_drogues set prix = 389, updated_at = now() where item = 'pochon de mexicana' and coalesce(prix,0) = 0;
update public.prix_drogues set prix = 369, updated_at = now() where item = 'crack'              and coalesce(prix,0) = 0;
update public.prix_drogues set prix = 353, updated_at = now() where item = 'purple haze'        and coalesce(prix,0) = 0;
update public.prix_drogues set prix = 325, updated_at = now() where item = 'lean'               and coalesce(prix,0) = 0;
update public.prix_drogues set prix = 319, updated_at = now() where item = 'meth bleue'         and coalesce(prix,0) = 0;
update public.prix_drogues set prix = 302, updated_at = now() where item = 'tranq'              and coalesce(prix,0) = 0;
update public.prix_drogues set prix = 240, updated_at = now() where item = 'ecstasy'            and coalesce(prix,0) = 0;

-- ── Vérification ────────────────────────────────────────────────────────
-- select item, base_min, base_max, prix, updated_at from public.prix_drogues order by item;

-- Terminé ✔  Recharge l'espace membre, onglet « Prix drogues ».
