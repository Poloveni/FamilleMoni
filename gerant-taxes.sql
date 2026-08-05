-- ============================================================================
-- GÉRANT DES TAXES — Famille Moni
-- ============================================================================
-- Le gérant du bot a ajouté la colonne bot_user_mapping.is_taxes_manager.
-- Ce script crée la vérification côté base : est_gerant_taxes().
--   • Le site l'appelle pour n'afficher QUE le panneau Taxes à ce rôle.
--   • L'import de taxes lui est aussi ouvert (peut_importer_taxes).
--
-- À exécuter dans Supabase → SQL Editor → Run. Réexécutable sans risque.
-- Il est autonome : il recrée aussi les fonctions Discord de base au cas où
-- discord-admin.sql n'aurait pas encore été exécuté.
-- ============================================================================

-- ── 0. Les colonnes attendues (sans risque si déjà présentes) ─────────────
alter table public.bot_user_mapping
  add column if not exists is_taxes_manager boolean default false;

-- ── 1. L'identifiant Discord réel du membre connecté ─────────────────────
--    Lu dans auth.identities, alimentée par Discord au moment de la
--    connexion. Ni le membre ni le site ne peuvent y écrire.
create or replace function public.mon_discord_id()
returns text
language sql
stable
security definer
set search_path = auth, public, pg_temp
as $$
  select i.provider_id
    from auth.identities i
   where i.user_id = auth.uid()
     and i.provider = 'discord'
   order by i.last_sign_in_at desc nulls last
   limit 1;
$$;

create or replace function public.est_admin_discord()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce((
    select m.is_admin
      from public.bot_user_mapping m
     where m.discord_id = public.mon_discord_id()
     limit 1
  ), false);   -- membre non associé dans bot_user_mapping → refusé
$$;

-- ── 2. LE point unique de vérification du rôle « gérant des taxes » ──────
--    Même modèle que est_admin_discord : la colonne est écrite par le bot
--    (resynchronisée toutes les 5 min), personne ne peut se l'attribuer
--    depuis le site.
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
  ), false);   -- pas associé, ou colonne à false → pas gérant
$$;

-- ── 3. Le gérant des taxes peut aussi importer les fichiers Excel ────────
--    (même liste de secours que dans discord-admin.sql)
create or replace function public.peut_importer_taxes()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.est_admin_discord()
      or public.est_gerant_taxes()
      or coalesce(auth.jwt() ->> 'email', '') in (
           'syne@live.fr',             -- accès de secours — Lov Moni
           'f.moinard44@gmail.com'     -- accès de secours — Raymond Carter
         );
$$;

-- ── 4. Droits d'appel ────────────────────────────────────────────────────
revoke all on function public.mon_discord_id()       from public, anon;
revoke all on function public.est_admin_discord()    from public, anon;
revoke all on function public.est_gerant_taxes()     from public, anon;
revoke all on function public.peut_importer_taxes()  from public, anon;
grant execute on function public.mon_discord_id()      to authenticated;
grant execute on function public.est_admin_discord()   to authenticated;
grant execute on function public.est_gerant_taxes()    to authenticated;
grant execute on function public.peut_importer_taxes() to authenticated;

comment on function public.est_gerant_taxes() is
  'true si le membre connecté (via Discord) a is_taxes_manager dans bot_user_mapping. Écrit par le bot uniquement.';
