-- ============================================================================
--  SUPPRIMER UN COMPTE POUR DE BON — Famille Moni
-- ============================================================================
--  Révoquer ferme la porte, mais la ligne reste dans la liste. Ce script
--  ajoute la suppression définitive, depuis le panneau Admin.
--
--  ATTENTION, C'EST IRRÉVERSIBLE. Sont effacés :
--    • le compte de connexion (email + mot de passe, et le lien Discord)
--    • sa fiche de profil (personnage, rang, citation, bio)
--    • sa photo de profil
--    • ses abonnements aux notifications push
--    • ses déclarations de ventes et ses inscriptions aux événements
--
--  Sont CONSERVÉS volontairement :
--    • ses photos de la galerie — ce sont des souvenirs de la famille,
--      elles perdent simplement leur auteur
--    • l'historique du bot Discord, qui ne dépend pas du site
--
--  TROIS GARDE-FOUS, appliqués par la base elle-même :
--    1. seule l'administratrice peut appeler cette fonction ;
--    2. elle ne peut pas supprimer son propre compte ;
--    3. le compte doit avoir été RÉVOQUÉ au préalable — on ne supprime
--       jamais quelqu'un qui a encore accès au site.
--
--  À exécuter dans Supabase → SQL Editor → coller → Run.
--  Réexécutable sans risque : il ne supprime rien par lui-même.
-- ============================================================================


create or replace function public.supprimer_compte(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $$
declare
  v_email    text;
  v_approuve boolean;
begin
  -- ── Garde-fou 1 : c'est bien l'administratrice ? ────────────────────────
  if coalesce(auth.jwt() ->> 'email', '') <> 'syne@live.fr' then
    raise exception 'Action réservée à l''administratrice.';
  end if;

  if p_id is null then
    raise exception 'Aucun compte indiqué.';
  end if;

  -- ── Garde-fou 2 : on ne se supprime pas soi-même ───────────────────────
  if p_id = auth.uid() then
    raise exception 'Tu ne peux pas supprimer ton propre compte.';
  end if;

  select c.email, c.approuve into v_email, v_approuve
    from public.comptes c where c.id = p_id;

  if not found then
    raise exception 'Ce compte n''existe plus.';
  end if;

  -- ── Garde-fou 3 : l'accès doit déjà être coupé ─────────────────────────
  if v_approuve then
    raise exception 'Révoque d''abord l''accès de ce compte, puis supprime-le.';
  end if;

  -- ── Les données sans lien automatique vers le compte ───────────────────
  --    (le reste part tout seul en cascade avec auth.users)
  delete from public.push_abonnements where user_id = p_id;

  -- La photo de profil n'est PAS effacée ici : Supabase interdit de toucher
  -- aux fichiers depuis le SQL (« Direct deletion from storage tables is not
  -- allowed »). C'est le panneau Admin qui la retire juste avant, par le
  -- chemin officiel. La règle de sécurité qui l'y autorise est plus bas.
  -- Les photos de la galerie ne sont jamais touchées : elles appartiennent
  -- à la famille, pas au compte.

  -- ── Le compte lui-même. Emporte avec lui, en cascade : comptes,
  --    profils, participations, déclarations, imports et sessions.
  delete from auth.users where id = p_id;

  return coalesce(v_email, p_id::text);
end $$;

revoke all on function public.supprimer_compte(uuid) from public, anon;
grant execute on function public.supprimer_compte(uuid) to authenticated;

comment on function public.supprimer_compte(uuid) is
  'Supprime définitivement un compte révoqué (profil, push, données liées). Réservé à syne@live.fr.';


-- ── L'administratrice peut retirer la photo de profil d'un membre ─────────
--    Sans cette règle, le dossier « photos/<identifiant>/ » resterait en
--    ligne après la suppression du compte. Personne d'autre ne peut effacer
--    la photo de quelqu'un : un membre ne touche qu'à la sienne.
drop policy if exists "Photo profil suppression admin" on storage.objects;
create policy "Photo profil suppression admin" on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and (
      (auth.jwt() ->> 'email') = 'syne@live.fr'
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );


-- ============================================================================
--  VÉRIFICATION — la fonction doit apparaître dans cette liste :
-- ============================================================================
-- select routine_name from information_schema.routines
--  where routine_schema = 'public' and routine_name = 'supprimer_compte';
