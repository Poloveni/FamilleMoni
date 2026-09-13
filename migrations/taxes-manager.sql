-- ══════════════════════════════════════════════════════════════════════════
--  RÔLE « GESTIONNAIRE DES TAXES » — Famille Moni
--  À exécuter dans Supabase → SQL Editor → New query → Run.
--  Sans risque à relancer autant de fois que tu veux.
--
--  CE QUE ÇA FAIT
--  Le bot Discord marque certains membres avec la case
--  bot_user_mapping.is_taxes_manager. Ce fichier :
--    1. crée la fonction que le site interroge pour reconnaître ce rôle ;
--    2. autorise ce rôle à importer le fichier Excel des taxes ;
--    3. VERROUILLE LA BASE : ce compte ne peut plus lire que les taxes.
--
--  Le point 3 est la vraie barrière. Masquer le menu dans le navigateur
--  n'empêchait que de VOIR ; ici la base refuse elle-même de répondre, même
--  si la personne interroge l'API directement avec la clé publique du site.
--
--  DEUX FAÇONS D'AVOIR CE RÔLE
--   · la case is_taxes_manager cochée par le bot → il faut alors se
--     connecter avec le bouton « Discord » de l'espace membre, car
--     l'identité est lue dans l'ID Discord réel ;
--   · ou figurer dans la liste d'emails de la section 2 ci-dessous, ce qui
--     marche avec une connexion classique email + mot de passe.
--
--  ⚠️ On ne se base JAMAIS sur le nom de personnage : chaque membre le
--  choisit lui-même dans son profil, n'importe qui pourrait donc se
--  déclarer gestionnaire. L'email et l'ID Discord, eux, sont verrouillés
--  par l'authentification.
-- ══════════════════════════════════════════════════════════════════════════


-- ── 1. La colonne, si le bot ne l'a pas encore créée ─────────────────────
--    (tu l'as déjà ajoutée à la main : cette ligne ne fera rien, c'est normal)
alter table public.bot_user_mapping
  add column if not exists is_taxes_manager boolean default false;

comment on column public.bot_user_mapping.is_taxes_manager is
  'true si le membre est gestionnaire des taxes. Calculé par le bot Discord, rafraîchi toutes les 5 min. Ce membre ne voit et ne lit QUE les taxes.';


-- ── 2. LE point unique de vérification ───────────────────────────────────
--    Même principe que est_admin_discord() dans discord-admin.sql : on part
--    de l'ID Discord réel (auth.identities), impossible à falsifier.
--
--    La première ligne est un GARDE-FOU ANTI-VERROUILLAGE : ton compte
--    d'administratrice n'est JAMAIS considéré comme gestionnaire des taxes,
--    même si la case était cochée par erreur côté bot. Sans ça, une erreur
--    de synchro te couperait l'accès à ton propre site.
--
--    coalesce(...) : membre absent de bot_user_mapping, case vide, ou
--    connexion sans Discord → false, donc espace membre normal.
--
--    LISTE PAR EMAIL — pour donner ce rôle à quelqu'un que le bot ne marque
--    pas (compte créé avec email + mot de passe, sans passer par Discord).
--    POUR EN AJOUTER UN : écris son email dans la liste ci-dessous, puis
--    relance ce fichier entier. Pour le retirer : efface sa ligne et
--    relance. L'email est verrouillé par l'authentification Supabase, il
--    n'est pas modifiable par le membre — c'est donc sûr.
create or replace function public.est_gestionnaire_taxes()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'email', '') <> 'syne@live.fr'
     and (
           coalesce(auth.jwt() ->> 'email', '') in (
             'guillaume.poscia@hotmail.com'    -- gestionnaire des taxes
           )
           or coalesce((
                select m.is_taxes_manager
                  from public.bot_user_mapping m
                 where m.discord_id = public.mon_discord_id()
                 limit 1
              ), false)
         );
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


-- ══════════════════════════════════════════════════════════════════════════
--  4. LE VERROU : lecture interdite en dehors des taxes
--
--  MÉTHODE — on n'a RIEN réécrit des règles existantes. PostgreSQL sait
--  ajouter des règles dites « restrictives » : elles se combinent avec les
--  règles déjà en place par un ET. Autrement dit, pour lire une ligne il
--  faut désormais : (les anciennes conditions) ET (ne pas être gestionnaire
--  des taxes). Aucune règle actuelle n'est modifiée ni supprimée — donc
--  aucun risque de casser un accès existant, et le retrait est immédiat
--  (voir la section « POUR ANNULER » tout en bas).
--
--  La règle ne vise que le rôle `authenticated` (les visiteurs connectés).
--  Le site public, qui lit en anonyme, n'est pas concerné. Le bot non plus :
--  il utilise sa clé de service, qui ignore toutes ces règles.
--
--  NE SONT PAS VERROUILLÉES, volontairement :
--   · bot_taxes, bot_taxes_types, import_taxes → c'est son travail ;
--   · comptes → il doit pouvoir lire SA ligne pour savoir s'il est approuvé ;
--   · profils, galerie_photos, participations, bot_annonces → déjà lisibles
--     par n'importe quel visiteur non connecté (elles alimentent la page
--     d'accueil publique). Les verrouiller ici n'apporterait aucune sécurité
--     et casserait juste l'affichage du site public pour cette personne.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
begin
  foreach t in array array[
    -- miroirs du bot
    'bot_stocks', 'bot_stats', 'bot_user_mapping', 'bot_armurerie', 'bot_meta',
    'bot_stock_history', 'bot_braquages', 'bot_cooldowns', 'bot_ventes',
    'bot_bilans', 'bot_presences', 'bot_drogue_bourse', 'bot_zone_bonus',
    -- tables du site
    'prix_drogues', 'carte_points', 'declarations', 'evenements'
  ]
  loop
    -- Une table absente est simplement ignorée : le fichier reste relançable
    -- même si le bot n'a pas encore créé tous ses miroirs.
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "Hors taxes lecture interdite" on public.%I', t);
      execute format(
        'create policy "Hors taxes lecture interdite" on public.%I '
        'as restrictive for select to authenticated '
        -- le (select ...) force PostgreSQL à n'évaluer la fonction
        -- qu'UNE fois par requête, et non une fois par ligne.
        'using (not (select public.est_gestionnaire_taxes()))', t);
    end if;
  end loop;
end $$;


-- ══════════════════════════════════════════════════════════════════════════
--  5. VÉRIFICATION
-- ══════════════════════════════════════════════════════════════════════════
-- Qui est gestionnaire des taxes, d'après le bot :
--   select game_name, discord_id, is_taxes_manager
--     from public.bot_user_mapping
--    where is_taxes_manager order by game_name;
--
-- Les tables effectivement verrouillées :
--   select tablename from pg_policies
--    where policyname = 'Hors taxes lecture interdite' order by tablename;
--
-- Connectée sur le site (via Discord), console du navigateur (F12) :
--   await sb.rpc('est_gestionnaire_taxes')   → false pour toi, true pour lui
--   await sb.rpc('peut_importer_taxes')      → true pour vous deux


-- ══════════════════════════════════════════════════════════════════════════
--  POUR ANNULER LE VERROU (si besoin un jour)
--  Colle ce bloc dans le SQL Editor et clique Run : tout revient exactement
--  comme avant, les anciennes règles n'ayant jamais été touchées.
-- ══════════════════════════════════════════════════════════════════════════
-- do $$
-- declare r record;
-- begin
--   for r in select tablename from pg_policies
--             where schemaname = 'public'
--               and policyname = 'Hors taxes lecture interdite'
--   loop
--     execute format('drop policy "Hors taxes lecture interdite" on public.%I', r.tablename);
--   end loop;
-- end $$;

-- Terminé ✔
