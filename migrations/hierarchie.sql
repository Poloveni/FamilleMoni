-- ════════════════════════════════════════════════════════════
--  FAMILLE MONI — Hiérarchie modifiable depuis l'espace membre
--  À exécuter dans Supabase : SQL Editor → coller → Run
--
--  Avant : la liste des membres et des rangs vivait dans
--  supabase-config.js (il fallait éditer le fichier puis publier).
--  Après : deux tables, lues par le site public et l'espace membre,
--  modifiables depuis le panneau « La hiérarchie » de l'espace membre
--  par les administrateurs (rôle admin Discord, ou accès de secours).
--  Si les tables sont vides ou injoignables, le site retombe sur
--  supabase-config.js : rien ne casse.
-- ════════════════════════════════════════════════════════════

-- 1) Les rangs, du plus haut au plus bas.
create table if not exists public.rangs (
  nom         text primary key,
  color       text not null default '#8e8e8e',
  description text not null default '',
  ordre       int  not null default 0
);

-- 2) Les membres et leur rang.
create table if not exists public.hierarchie (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null unique,
  rang       text not null references public.rangs(nom) on update cascade,
  ordre      int  not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3) Qui peut modifier : admin Discord (comme l'import de taxes) ou accès de secours.
create or replace function public.peut_gerer_hierarchie()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.est_admin_discord()
      or coalesce(auth.jwt() ->> 'email', '') in (
           'syne@live.fr',             -- accès de secours — Lov Moni
           'f.moinard44@gmail.com'     -- accès de secours — Raymond Carter
         );
$$;
revoke all on function public.peut_gerer_hierarchie() from public, anon;
grant execute on function public.peut_gerer_hierarchie() to authenticated;

-- 4) Règles d'accès : tout le monde lit (le site public en a besoin),
--    seuls les administrateurs écrivent.
alter table public.rangs      enable row level security;
alter table public.hierarchie enable row level security;

drop policy if exists "Rangs visibles par tous" on public.rangs;
create policy "Rangs visibles par tous" on public.rangs for select using (true);
drop policy if exists "Admin modifie les rangs" on public.rangs;
create policy "Admin modifie les rangs" on public.rangs for all to authenticated
  using (public.peut_gerer_hierarchie()) with check (public.peut_gerer_hierarchie());

drop policy if exists "Hierarchie visible par tous" on public.hierarchie;
create policy "Hierarchie visible par tous" on public.hierarchie for select using (true);
drop policy if exists "Admin modifie la hierarchie" on public.hierarchie;
create policy "Admin modifie la hierarchie" on public.hierarchie for all to authenticated
  using (public.peut_gerer_hierarchie()) with check (public.peut_gerer_hierarchie());

grant select on public.rangs, public.hierarchie to anon, authenticated;
grant insert, update, delete on public.rangs, public.hierarchie to authenticated;

-- 5) Horodatage automatique des modifications.
create or replace function public.touch_hierarchie()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_touch_hierarchie on public.hierarchie;
create trigger trg_touch_hierarchie before update on public.hierarchie
  for each row execute function public.touch_hierarchie();

-- 6) Données de départ : la liste du bot au 05/09/2026 (12 membres).
insert into public.rangs (nom, color, description, ordre) values
  ('La Donna',       '#d4b26e', 'Chef', 1),
  ('Braccio Destro', '#e35d4c', 'Bras Droit — Co-Lead', 2),
  ('Consigliere',    '#d08a3f', 'Conseiller — Capitaines', 3),
  ('Anziani',        '#c07a2b', 'Aînés — Lieutenants', 4),
  ('Baroni',         '#96b854', 'Barons — Gérants drogue, armes, blanchiment, opérations, événements…', 5),
  ('Fedeli',         '#96b854', 'Fidèle — Gradé', 6),
  ('Vicino',         '#9a9a9a', 'Proches', 7),
  ('Sicario',        '#8e8e8e', 'Hommes de main — Membres confirmés', 8),
  ('Associati',      '#8e8e8e', 'Associés — Membres', 9)
on conflict (nom) do nothing;

insert into public.hierarchie (nom, rang) values
  ('Lov Moni', 'La Donna'),
  ('Raymond Carter', 'Braccio Destro'),
  ('Javier Cruz Silva', 'Braccio Destro'),
  ('Ezio Spallow', 'Anziani'),
  ('Gustavo Cardoso', 'Baroni'),
  ('Bass Carter', 'Fedeli'),
  ('Dayon Reas', 'Fedeli'),
  ('Javier Silva', 'Fedeli'),
  ('Andréas Kyros', 'Associati'),
  ('James Davis', 'Associati'),
  ('Michel Duboisie', 'Associati'),
  ('Tiago Rodrigues', 'Associati')
on conflict (nom) do nothing;

-- Pour vérifier :
-- select h.nom, h.rang from public.hierarchie h join public.rangs r on r.nom = h.rang order by r.ordre, h.nom;
-- Terminé ✔
