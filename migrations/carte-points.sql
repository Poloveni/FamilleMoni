-- ══════════════════════════════════════════════════════════════════════════
--  LA CARTE DE ROXWOOD — points posés par la Donna
--  À exécuter dans Supabase → SQL Editor → Run. Sans risque à relancer.
--
--  La carte interactive de l'espace membre affiche des points (QG, zones de
--  vente, planques, lieux d'événements) posés directement sur l'image de la
--  carte. Cette table les stocke en pourcentages de l'image, pour que la
--  carte reste juste sur tous les écrans.
--
--  Un point de type « zone » peut être relié à une zone de bot_zone_bonus :
--  la carte colore alors son anneau selon le bonus en cours.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.carte_points (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  type       text not null default 'autre'
             check (type in ('qg','zone','planque','event','autre')),
  x          numeric not null check (x >= 0 and x <= 100),
  y          numeric not null check (y >= 0 and y <= 100),
  zone_liee  text,          -- nom d'une zone de bot_zone_bonus (type « zone »)
  notes      text,
  updated_at timestamptz not null default now()
);

comment on table public.carte_points is
  'Points de la carte interactive de l''espace membre. x et y en % de l''image qg-carte.webp.';

alter table public.carte_points enable row level security;

-- ── Lecture : les membres approuvés ──────────────────────────────────────
drop policy if exists "Carte lisible par la famille" on public.carte_points;
create policy "Carte lisible par la famille" on public.carte_points for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

-- ── Écriture : la Donna uniquement ───────────────────────────────────────
--    Aligné sur le reste du site (vérification par email). Le jour où la
--    connexion Discord sera en place pour tout le monde, on pourra basculer
--    sur public.est_admin_discord() comme pour l'import de taxes.
drop policy if exists "Donna modifie la carte" on public.carte_points;
create policy "Donna modifie la carte" on public.carte_points for all to authenticated
  using      ((auth.jwt() ->> 'email') = 'syne@live.fr')
  with check ((auth.jwt() ->> 'email') = 'syne@live.fr');

-- ── Vérification ─────────────────────────────────────────────────────────
-- select nom, type, round(x,1) as x, round(y,1) as y, zone_liee from public.carte_points order by nom;

-- Terminé ✔  Ouvre l'espace membre → onglet « Carte » → « Modifier la carte ».
