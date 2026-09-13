-- ============================================================================
--  BARÈME OFFICIEL DES DROGUES — Famille Moni
-- ============================================================================
--  Le prix de revente au PNJ dépend de la PURETÉ du produit (50, 70, 90, 99 %).
--  Cette table stocke la note officielle du serveur : pour chaque produit et
--  chaque pureté, le prix plancher et le prix plafond à l'unité.
--
--  Elle alimente « Le calculateur de vente » dans l'espace membre :
--  produit + pureté + quantité → combien ça rapporte.
--
--  Trois produits n'ont pas de pureté (Ecstasy, Lean, B-Magic) : ils sont
--  enregistrés avec purete = 0, ce qui veut dire « tarif unique ».
--
--  À exécuter dans Supabase → SQL Editor → coller → Run.
--  Réexécutable sans risque : il remet simplement les prix officiels à jour.
-- ============================================================================


-- ── 1. La table ────────────────────────────────────────────────────────────
create table if not exists public.bareme_drogues (
  item       text     not null,
  purete     smallint not null default 0,          -- 0 = produit sans pureté
  prix_min   numeric  not null,
  prix_max   numeric  not null,
  ordre      smallint not null default 100,        -- ordre d'affichage
  updated_at timestamptz not null default now(),
  primary key (item, purete)
);

comment on table public.bareme_drogues is
  'Barème officiel du serveur : prix de revente au PNJ à l''unité, par produit et par pureté.';

-- Garde-fous : un prix négatif ou un plafond sous le plancher est refusé
-- par la base elle-même, quelle que soit la saisie.
alter table public.bareme_drogues drop constraint if exists bareme_prix_coherents;
alter table public.bareme_drogues
  add constraint bareme_prix_coherents
  check (prix_min >= 0 and prix_max >= prix_min);

alter table public.bareme_drogues drop constraint if exists bareme_purete_valide;
alter table public.bareme_drogues
  add constraint bareme_purete_valide
  check (purete in (0, 50, 70, 90, 99));


-- ── 2. Qui peut lire, qui peut écrire ──────────────────────────────────────
alter table public.bareme_drogues enable row level security;

-- Lecture : tout membre approuvé de la famille.
drop policy if exists "Bareme lecture famille" on public.bareme_drogues;
create policy "Bareme lecture famille" on public.bareme_drogues for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

-- Écriture : l'administratrice uniquement.
drop policy if exists "Bareme admin ajoute" on public.bareme_drogues;
create policy "Bareme admin ajoute" on public.bareme_drogues for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'syne@live.fr');

drop policy if exists "Bareme admin modifie" on public.bareme_drogues;
create policy "Bareme admin modifie" on public.bareme_drogues for update to authenticated
  using      ((auth.jwt() ->> 'email') = 'syne@live.fr')
  with check ((auth.jwt() ->> 'email') = 'syne@live.fr');

drop policy if exists "Bareme admin supprime" on public.bareme_drogues;
create policy "Bareme admin supprime" on public.bareme_drogues for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'syne@live.fr');


-- ── 3. Les prix officiels ──────────────────────────────────────────────────
--    Note « Drogues — Gang et Organisation », relevé du 8 août 2026.
--    Relancer ce script remet ces valeurs : c'est la référence du serveur.
insert into public.bareme_drogues (item, purete, prix_min, prix_max, ordre) values
  -- Cocaïne
  ('cocaïne',            50, 219, 239, 10),
  ('cocaïne',            70, 259, 279, 10),
  ('cocaïne',            90, 299, 319, 10),
  ('cocaïne',            99, 339, 359, 10),
  -- Cannabis
  ('cannabis',           50, 272, 294, 20),
  ('cannabis',           70, 312, 334, 20),
  ('cannabis',           90, 352, 374, 20),
  ('cannabis',           99, 392, 414, 20),
  -- Pochon de Mexicana
  ('pochon de mexicana', 50, 209, 229, 30),
  ('pochon de mexicana', 70, 249, 269, 30),
  ('pochon de mexicana', 90, 289, 309, 30),
  ('pochon de mexicana', 99, 329, 349, 30),
  -- Produits à tarif unique (pas de pureté)
  ('ecstasy',             0, 180, 300, 40),
  ('lean',                0, 300, 350, 50),
  ('b-magic',             0, 450, 470, 60)
on conflict (item, purete) do update
  set prix_min   = excluded.prix_min,
      prix_max   = excluded.prix_max,
      ordre      = excluded.ordre,
      updated_at = now();


-- ── 4. Cohérence avec la table des prix d'achat ────────────────────────────
--    Le calculateur croise le barème avec prix_drogues.prix (ce que la
--    famille paie l'unité) pour afficher la marge. On s'assure que chaque
--    produit du barème existe bien là-bas — sans écraser un prix déjà saisi.
insert into public.prix_drogues (item, prix)
select distinct b.item, 0 from public.bareme_drogues b
on conflict (item) do nothing;


-- ============================================================================
--  VÉRIFICATION — exécute cette requête juste après :
-- ============================================================================
-- select item, purete, prix_min, prix_max
--   from public.bareme_drogues order by ordre, item, purete;
