-- ══════════════════════════════════════════════════════════════════════════
--  RÔLE « GESTIONNAIRE DES TAXES » — Famille Moni
--  À exécuter dans Supabase → SQL Editor → New query → Run.
--  Sans risque à relancer autant de fois que tu veux.
--
--  CE QUE ÇA FAIT
--  Le bot Discord marque désormais certains membres avec la case
--  bot_user_mapping.is_taxes_manager. Ce fichier crée la fonction que le
--  site interroge pour savoir si le membre connecté a ce rôle.
--
--  Sur le site, ce membre ne verra QUE le panneau « Taxes » de l'espace
--  membre : tout le reste du menu disparaît.
--
--  ⚠️ L'identité vient de Discord, pas du nom de personnage ni de l'email.
--  Le membre doit donc se connecter avec le bouton « Discord » de l'espace
--  membre pour que son rôle soit reconnu. C'est volontaire : un membre peut
--  changer son nom de personnage, il ne peut pas changer son ID Discord.
-- ══════════════════════════════════════════════════════════════════════════


-- ── 1. La colonne, si le bot ne l'a pas encore créée ─────────────────────
--    (tu l'as déjà ajoutée à la main : cette ligne ne fera rien, c'est normal)
alter table public.bot_user_mapping
  add column if not exists is_taxes_manager boolean default false;

comment on column public.bot_user_mapping.is_taxes_manager is
  'true si le membre est gestionnaire des taxes. Calculé par le bot Discord, rafraîchi toutes les 5 min. Sur le site, ce membre ne voit que le panneau Taxes.';


-- ── 2. LE point unique de vérification ───────────────────────────────────
--    Même principe que est_admin_discord() dans discord-admin.sql :
--    on part de l'ID Discord réel (auth.identities), impossible à falsifier.
--    coalesce(...) : membre absent de bot_user_mapping, case vide ou
--    connexion sans Discord → false, donc espace membre normal.
create or replace function public.est_gestionnaire_taxes()
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
  ), false);
$$;

revoke all on function public.est_gestionnaire_taxes() from public, anon;
grant execute on function public.est_gestionnaire_taxes() to authenticated;


-- ── 3. Le gestionnaire des taxes peut aussi importer le fichier Excel ────
--    Sinon son unique panneau serait en lecture seule et le rôle ne
--    servirait à rien. On ajoute simplement une ligne à la fonction qui
--    existait déjà (discord-admin.sql) — le reste est identique.
create or replace function public.peut_importer_taxes()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.est_admin_discord()
      or public.est_gestionnaire_taxes()
      or coalesce(auth.jwt() ->> 'email', '') in (
           'syne@live.fr',             -- accès de secours — Lov Moni
           'f.moinard44@gmail.com'     -- accès de secours — Raymond Carter
         );
$$;

revoke all on function public.peut_importer_taxes() from public, anon;
grant execute on function public.peut_importer_taxes() to authenticated;


-- ── 4. Vérification ──────────────────────────────────────────────────────
-- Qui est gestionnaire des taxes, d'après le bot :
--   select game_name, discord_id, is_taxes_manager
--     from public.bot_user_mapping
--    where is_taxes_manager order by game_name;
--
-- Connecté sur le site (via Discord), dans la console du navigateur (F12) :
--   await sb.rpc('est_gestionnaire_taxes')   → true pour le gestionnaire
--   await sb.rpc('peut_importer_taxes')      → true aussi

-- Terminé ✔
