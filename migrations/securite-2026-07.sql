-- ══════════════════════════════════════════════════════════════════════════
--  CORRECTIFS DE SÉCURITÉ — Famille Moni — juillet 2026
--
--  À exécuter UNE SEULE FOIS, en entier, dans :
--  Supabase → ton projet → SQL Editor → New query → coller → Run.
--
--  Ce fichier est sans risque à relancer : chaque règle est supprimée
--  avant d'être recréée.
-- ══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. ÉVÉNEMENTS — l'écriture était ouverte à tout compte connecté,
--    même non approuvé : n'importe quel inscrit pouvait vider le planning.
--    Le bot Discord n'est pas concerné : il écrit avec la clé serveur,
--    qui ignore ces règles.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Membres gerent evenements (insert)" on public.evenements;
drop policy if exists "Membres gerent evenements (update)" on public.evenements;
drop policy if exists "Membres gerent evenements (delete)" on public.evenements;
drop policy if exists "Admin gere evenements" on public.evenements;

create policy "Admin gere evenements" on public.evenements for all to authenticated
  using      ((auth.jwt() ->> 'email') = 'syne@live.fr')
  with check ((auth.jwt() ->> 'email') = 'syne@live.fr');


-- ─────────────────────────────────────────────────────────────────────────
-- 2. PHOTOS DE PROFIL — la règle vérifiait qu'on était connecté, mais pas
--    à qui appartenait le fichier : n'importe quel inscrit pouvait écraser
--    la photo d'un autre membre, affichée sur la page d'accueil publique.
--    Chaque membre ne peut désormais écrire que dans SON dossier.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Membres remplacent une photo" on storage.objects;
drop policy if exists "Membres envoient une photo"   on storage.objects;
drop policy if exists "Membres uploadent une photo"  on storage.objects;

create policy "Membres envoient une photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Membres remplacent une photo" on storage.objects for update to authenticated
  using      (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);


-- ─────────────────────────────────────────────────────────────────────────
-- 3. GALERIE — publier était possible pour tout compte connecté, y compris
--    non approuvé : quelqu'un pouvait s'inscrire avec un email jetable et
--    afficher n'importe quelle image sur la page d'accueil publique.
--    On exige maintenant un compte approuvé.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Membres connectes peuvent publier"  on public.galerie_photos;
drop policy if exists "Membres approuves peuvent publier"  on public.galerie_photos;

create policy "Membres approuves peuvent publier" on public.galerie_photos for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve)
  );

drop policy if exists "Galerie upload connectes" on storage.objects;
drop policy if exists "Galerie upload approuves" on storage.objects;

create policy "Galerie upload approuves" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'galerie'
    and exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve)
  );


-- ─────────────────────────────────────────────────────────────────────────
-- 4. COMPTES — l'email était une colonne texte libre modifiable par son
--    propriétaire. C'est ce qui rendait possible l'injection de code dans
--    le panneau d'administration. On le verrouille sur l'email réel du compte.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Maj son compte" on public.comptes;
create policy "Maj son compte" on public.comptes for update to authenticated
  using      (auth.uid() = id)
  with check (auth.uid() = id and email = (auth.jwt() ->> 'email'));


-- ─────────────────────────────────────────────────────────────────────────
-- 5. DURCISSEMENT — une fonction "security definer" sans search_path figé
--    s'exécute avec le chemin de recherche de l'appelant. Recommandation
--    standard de Supabase (signalée par leur analyseur).
-- ─────────────────────────────────────────────────────────────────────────
-- ATTENTION : logique STRICTEMENT identique à celle d'admin-schema.sql
-- (approuve forcé à false à la création, figé ensuite). Seule la ligne
-- "set search_path" est ajoutée.
create or replace function public.protect_approuve()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (auth.role() <> 'service_role' and coalesce(auth.jwt() ->> 'email', '') <> 'syne@live.fr') then
    if (tg_op = 'INSERT') then new.approuve := false;
    else new.approuve := old.approuve;
    end if;
  end if;
  return new;
end $$;


-- ══════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION — exécute cette requête après coup : elle liste les règles
--  actives. Tu dois y retrouver "Admin gere evenements",
--  "Membres approuves peuvent publier" et "Maj son compte".
-- ══════════════════════════════════════════════════════════════════════════
-- select schemaname, tablename, policyname, cmd
--   from pg_policies
--  where schemaname in ('public','storage')
--  order by tablename, policyname;
