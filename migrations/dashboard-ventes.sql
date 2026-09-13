-- ============================================================
--  DASHBOARD BUSINESS — Famille Moni
--  À exécuter dans Supabase  >  SQL Editor  >  New query  >  Run.
--  Table des déclarations : ventes de drogue + argent sale déposé
--  au coffre. Quota hebdomadaire affiché dans l'espace membre.
-- ============================================================

create table if not exists public.declarations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nom         text,                                                    -- personnage au moment de la déclaration
  quantite    int  not null default 0 check (quantite between 0 and 100000),
  argent_sale int  not null default 0 check (argent_sale between 0 and 100000000),
  created_at  timestamptz not null default now()
);

alter table public.declarations enable row level security;

-- Lecture : membres connectés ET approuvés (toute la famille voit le tableau)
drop policy if exists "Declarations visibles par la famille" on public.declarations;
create policy "Declarations visibles par la famille" on public.declarations
  for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

-- Ajout : chaque membre approuvé déclare pour lui-même uniquement
drop policy if exists "Declarer ses ventes" on public.declarations;
create policy "Declarer ses ventes" on public.declarations
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve)
  );

-- Suppression : le membre corrige ses propres lignes ; l'admin peut tout nettoyer
drop policy if exists "Supprimer ses declarations" on public.declarations;
create policy "Supprimer ses declarations" on public.declarations
  for delete to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'syne@live.fr');

-- Terminé ✔  Le dashboard Business de l'espace membre est prêt.
