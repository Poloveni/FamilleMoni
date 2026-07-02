-- ════════════════════════════════════════════════════════════
--  FAMILLE MONI — Validation manuelle des inscriptions
--  À exécuter dans Supabase : SQL Editor → coller → Run
-- ════════════════════════════════════════════════════════════

-- 1) Table des comptes : suivi des inscriptions + statut d'approbation.
create table if not exists public.comptes (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  approuve   boolean not null default false,
  created_at timestamptz default now()
);

alter table public.comptes enable row level security;

-- Un membre voit uniquement SON compte (pour connaître son statut).
drop policy if exists "Voir son compte" on public.comptes;
create policy "Voir son compte" on public.comptes for select using (auth.uid() = id);

-- Un membre peut créer / mettre à jour SON compte (email), mais pas s'auto-approuver (trigger ci-dessous).
drop policy if exists "Creer son compte" on public.comptes;
create policy "Creer son compte" on public.comptes for insert with check (auth.uid() = id);
drop policy if exists "Maj son compte" on public.comptes;
create policy "Maj son compte" on public.comptes for update using (auth.uid() = id);

-- 2) Empêche un membre de modifier lui-même le champ "approuve" via l'API.
--    (L'admin, lui, agit en service_role via le Table Editor, ou en SQL : autorisé.)
create or replace function public.protect_approuve()
returns trigger language plpgsql security definer as $$
begin
  if (auth.role() <> 'service_role') then
    if (tg_op = 'INSERT') then new.approuve := false;
    else new.approuve := old.approuve;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_approuve on public.comptes;
create trigger trg_protect_approuve
  before insert or update on public.comptes
  for each row execute function public.protect_approuve();

-- 3) Événements : réservés aux membres APPROUVÉS.
drop policy if exists "Evenements reserves aux membres" on public.evenements;
drop policy if exists "Evenements reserves aux membres approuves" on public.evenements;
create policy "Evenements reserves aux membres approuves"
  on public.evenements for select
  using ( exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve) );

-- 4) Profils publics : seuls les membres approuvés peuvent créer / modifier leur profil.
drop policy if exists "Creer son profil" on public.profils;
create policy "Creer son profil" on public.profils for insert
  with check (auth.uid() = id and exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));
drop policy if exists "Modifier son profil" on public.profils;
create policy "Modifier son profil" on public.profils for update
  using (auth.uid() = id and exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

-- ✅ Pour APPROUVER un membre : Table Editor → table "comptes" → mets "approuve" = true
--    pour la ligne correspondant à son email. (Ou : update public.comptes set approuve = true where email = '...';)
