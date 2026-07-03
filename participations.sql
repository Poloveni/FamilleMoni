-- ============================================================
--  PARTICIPATIONS AUX ÉVÉNEMENTS — Famille Moni
--  Bouton « Je participe » + compteur.
--  À exécuter dans Supabase > SQL Editor > New query > Run.
-- ============================================================

create table if not exists public.participations (
  event_id   uuid references public.evenements(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.participations enable row level security;

-- Lecture : tout le monde (pour afficher le compteur de participants)
drop policy if exists "Participations visibles par tous" on public.participations;
create policy "Participations visibles par tous" on public.participations
  for select using (true);

-- S'inscrire : chaque membre connecté, uniquement pour lui-même
drop policy if exists "S'inscrire soi-meme" on public.participations;
create policy "S'inscrire soi-meme" on public.participations
  for insert to authenticated with check (auth.uid() = user_id);

-- Se désinscrire : chaque membre retire sa propre participation
drop policy if exists "Se desinscrire soi-meme" on public.participations;
create policy "Se desinscrire soi-meme" on public.participations
  for delete to authenticated using (auth.uid() = user_id);

-- Terminé ✔
