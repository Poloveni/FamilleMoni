-- ============================================================
--  FICHES MEMBRES ENRICHIES — Famille Moni
--  À exécuter dans Supabase  >  SQL Editor  >  New query  >  Run.
--  Ajoute 3 champs au profil : spécialité, citation et bio.
--  (Les règles de sécurité existantes s'appliquent déjà :
--   lecture publique, modification par le propriétaire uniquement.)
-- ============================================================

alter table public.profils add column if not exists specialite text;
alter table public.profils add column if not exists citation   text;
alter table public.profils add column if not exists bio        text;

-- Terminé ✔  Les membres peuvent remplir leur fiche dans l'espace membre.
