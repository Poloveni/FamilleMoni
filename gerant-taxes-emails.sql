-- ============================================================================
-- GÉRANTS DES TAXES PAR EMAIL — Famille Moni
-- ============================================================================
-- Ces comptes ne voient QUE le panneau Taxes de l'espace membre (et peuvent
-- utiliser l'import Excel). Deux façons d'obtenir le rôle :
--   • par Discord : is_taxes_manager dans bot_user_mapping (écrit par le bot)
--   • par email   : figurer dans la liste ci-dessous
--
-- POUR AJOUTER / RETIRER UN COMPTE : modifie la liste, relance ce script.
-- Supabase → SQL Editor → Run. Réexécutable sans risque.
-- ============================================================================

create or replace function public.est_gerant_taxes()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce((
    select m.is_taxes_manager
      from public.bot_user_mapping m
     where m.discord_id = public.mon_discord_id()
     limit 1
  ), false)
  or coalesce(auth.jwt() ->> 'email', '') in (
       'gogeta2b@hotmail.fr',
       'arkosse2008@gmail.com',
       'gh4open56@gmail.com',
       'moreiranoa5@gmail.com'
     );
$$;

revoke all on function public.est_gerant_taxes() from public, anon;
grant execute on function public.est_gerant_taxes() to authenticated;

comment on function public.est_gerant_taxes() is
  'true si gérant des taxes : rôle Discord is_taxes_manager OU email dans la liste. Ces comptes ne voient que le panneau Taxes.';
