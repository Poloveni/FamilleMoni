-- ============================================================
--  GALERIE ALIMENTÉE PAR LES MEMBRES — Famille Moni
--  À exécuter dans Supabase  >  SQL Editor  >  New query  >  Run.
--  (Choix : publication directe, ouverte à tout compte connecté.)
-- ============================================================

-- 1) Table des photos de la galerie ---------------------------------
create table if not exists public.galerie_photos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  url        text not null,
  caption    text,
  created_at timestamptz not null default now()
);

alter table public.galerie_photos enable row level security;

-- Lecture : tout le monde (la galerie est publique)
drop policy if exists "Galerie visible par tous" on public.galerie_photos;
create policy "Galerie visible par tous" on public.galerie_photos
  for select using (true);

-- Ajout : tout utilisateur connecté, sur sa propre ligne
drop policy if exists "Membres connectes peuvent publier" on public.galerie_photos;
create policy "Membres connectes peuvent publier" on public.galerie_photos
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Suppression : le propriétaire de la photo, ou l'admin
drop policy if exists "Proprietaire ou admin peut supprimer" on public.galerie_photos;
create policy "Proprietaire ou admin peut supprimer" on public.galerie_photos
  for delete to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'syne@live.fr');


-- 2) Bucket de stockage "galerie" (public) --------------------------
insert into storage.buckets (id, name, public)
values ('galerie', 'galerie', true)
on conflict (id) do nothing;


-- 3) Politiques de stockage pour le bucket "galerie" ----------------
-- Lecture publique des fichiers
drop policy if exists "Galerie lecture publique" on storage.objects;
create policy "Galerie lecture publique" on storage.objects
  for select using (bucket_id = 'galerie');

-- Upload par tout utilisateur connecté
drop policy if exists "Galerie upload connectes" on storage.objects;
create policy "Galerie upload connectes" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'galerie');

-- Suppression par le propriétaire du fichier ou l'admin
drop policy if exists "Galerie suppression proprio ou admin" on storage.objects;
create policy "Galerie suppression proprio ou admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'galerie' and (owner = auth.uid() or (auth.jwt() ->> 'email') = 'syne@live.fr'));

-- Terminé ✔  La galerie est prête.
