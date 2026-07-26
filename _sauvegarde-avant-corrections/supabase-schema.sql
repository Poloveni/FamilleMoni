-- ════════════════════════════════════════════════════════════
--  FAMILLE MONI — Base de données de l'espace membre (Supabase)
--  À exécuter dans Supabase :  SQL Editor → New query → coller → Run
-- ════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1) PROFILS  (un par membre connecté)
-- ─────────────────────────────────────────────
create table if not exists public.profils (
  id         uuid primary key references auth.users(id) on delete cascade,
  nom        text,                       -- nom du personnage (parmi les 15)
  rang       text,
  photo_url  text,
  updated_at timestamptz default now()
);

alter table public.profils enable row level security;

-- Lecture publique : les photos s'affichent sur le site pour tout le monde
drop policy if exists "Profils visibles par tous" on public.profils;
create policy "Profils visibles par tous"
  on public.profils for select
  using (true);

-- Chaque membre ne peut créer / modifier QUE son propre profil
drop policy if exists "Creer son profil" on public.profils;
create policy "Creer son profil"
  on public.profils for insert
  with check (auth.uid() = id);

drop policy if exists "Modifier son profil" on public.profils;
create policy "Modifier son profil"
  on public.profils for update
  using (auth.uid() = id);

-- ─────────────────────────────────────────────
-- 2) ÉVÉNEMENTS  (lecture réservée aux membres connectés)
-- ─────────────────────────────────────────────
create table if not exists public.evenements (
  id         uuid primary key default gen_random_uuid(),
  jour       text,
  mois       text,
  titre      text,
  heure      text,
  texte      text,
  type       text,
  ordre      int  default 0,
  created_at timestamptz default now()
);

alter table public.evenements enable row level security;

-- Seuls les membres CONNECTÉS peuvent voir les événements
drop policy if exists "Evenements reserves aux membres" on public.evenements;
create policy "Evenements reserves aux membres"
  on public.evenements for select
  using (auth.role() = 'authenticated');

-- Tout membre connecté peut ajouter / modifier / supprimer un événement
drop policy if exists "Membres gerent evenements (insert)" on public.evenements;
create policy "Membres gerent evenements (insert)"
  on public.evenements for insert with check (auth.role() = 'authenticated');

drop policy if exists "Membres gerent evenements (update)" on public.evenements;
create policy "Membres gerent evenements (update)"
  on public.evenements for update using (auth.role() = 'authenticated');

drop policy if exists "Membres gerent evenements (delete)" on public.evenements;
create policy "Membres gerent evenements (delete)"
  on public.evenements for delete using (auth.role() = 'authenticated');

-- Quelques événements de départ (facultatif)
insert into public.evenements (jour, mois, titre, heure, texte, type, ordre) values
  ('05','Juil','Réunion générale','21h00 — QG de Roxwood','Point mensuel de la famille. Présence de tous les membres attendue.','Important',1),
  ('12','Juil','Soirée au bar','22h00 — Roxwood','Détente entre membres autour d''un verre. Ambiance et bonne humeur.','Social',2),
  ('19','Juil','Session RP majeure','20h30 — Lieu communiqué sur Discord','Grosse opération prévue. Restez discrets, les détails suivront.','RP',3),
  ('26','Juil','Journée recrutement','21h00 — Roxwood','Entretiens des nouvelles recrues. Faites passer le mot.','Recrutement',4);

-- ─────────────────────────────────────────────
-- 3) STOCKAGE DES PHOTOS
--    ⚠️ Créez d'abord le bucket :  Storage → New bucket → nom = "photos" → PUBLIC
--    Puis exécutez ces politiques :
-- ─────────────────────────────────────────────
drop policy if exists "Photos publiques en lecture" on storage.objects;
create policy "Photos publiques en lecture"
  on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists "Membres uploadent une photo" on storage.objects;
create policy "Membres uploadent une photo"
  on storage.objects for insert
  with check (bucket_id = 'photos' and auth.role() = 'authenticated');

drop policy if exists "Membres remplacent une photo" on storage.objects;
create policy "Membres remplacent une photo"
  on storage.objects for update
  using (bucket_id = 'photos' and auth.role() = 'authenticated');

-- ✅ Terminé. Revenez me donner l'URL du projet et la clé "anon public".
