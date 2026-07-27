-- ══════════════════════════════════════════════════════════════════════════
--  CONNEXION DISCORD & DROITS D'ADMINISTRATION — Famille Moni
--  À exécuter dans Supabase → SQL Editor → Run. Sans risque à relancer.
--
--  CE QUE ÇA RÈGLE
--  Jusqu'ici, le site déduisait le Discord d'un membre à partir du nom de
--  personnage qu'il avait CHOISI LUI-MÊME dans son profil. N'importe quel
--  membre pouvait donc se déclarer « Raymond Carter » et récupérer ses
--  droits. Le maillon d'identité était déclaratif.
--
--  Désormais l'identité vient de Discord : le membre se connecte avec son
--  compte Discord, et Supabase enregistre son identifiant réel dans
--  auth.identities — une table que personne ne peut modifier.
--
--  ⚠️ PIÈGE ÉVITÉ : on ne lit PAS auth.jwt() -> 'user_metadata'.
--  Ce champ est modifiable par l'utilisateur lui-même (via updateUser),
--  s'y fier reproduirait exactement la faille qu'on vient de fermer.
-- ══════════════════════════════════════════════════════════════════════════


-- ── 1. La colonne is_admin, si le bot ne l'a pas encore créée ────────────
--    (le site ne doit pas planter en attendant la prochaine synchro)
create table if not exists public.bot_user_mapping (
  game_name  text not null,
  discord_id text not null
);
alter table public.bot_user_mapping add column if not exists is_admin boolean not null default false;

comment on column public.bot_user_mapping.is_admin is
  'true si le membre a la permission Administrator ou le rôle admin sur le serveur Discord. Calculé par le bot, rafraîchi toutes les 5 min.';


-- ── 2. L'identifiant Discord réel du membre connecté ─────────────────────
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


-- ── 3. LE point unique de vérification ───────────────────────────────────
--    Utilisé par les règles de sécurité de la base ET par le site (qui
--    l'appelle en RPC pour afficher ou masquer le bouton). Une seule
--    implémentation, donc aucun risque que les deux divergent.
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

revoke all on function public.mon_discord_id()    from public, anon;
revoke all on function public.est_admin_discord() from public, anon;
grant execute on function public.mon_discord_id()    to authenticated;
grant execute on function public.est_admin_discord() to authenticated;


-- ── 4. L'import de taxes suit maintenant le rôle Discord ────────────────
--
--    L'ACCÈS DE SECOURS ci-dessous évite de te verrouiller dehors : tant
--    que tu ne t'es pas connectée via Discord, ton email te laisse entrer.
--    Une fois que tout le monde est passé par Discord, vide cette liste
--    (garde juste `and false`) et relance ce fichier.
create or replace function public.peut_importer_taxes()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.est_admin_discord()
      or coalesce(auth.jwt() ->> 'email', '') in (
           'syne@live.fr'              -- accès de secours — Lov Moni
         );
$$;

revoke all on function public.peut_importer_taxes() from public, anon;
grant execute on function public.peut_importer_taxes() to authenticated;

-- Les règles de la table d'import n'ont pas besoin de changer : elles
-- appellent déjà peut_importer_taxes(). On les recrée par sécurité.
drop policy if exists "Admin depose un import" on public.import_taxes;
create policy "Admin depose un import" on public.import_taxes for insert to authenticated
  with check (cree_par = auth.uid() and public.peut_importer_taxes());

drop policy if exists "Admin lit ses imports" on public.import_taxes;
create policy "Admin lit ses imports" on public.import_taxes for select to authenticated
  using (cree_par = auth.uid() and public.peut_importer_taxes());


-- ── 5. Vérification ──────────────────────────────────────────────────────
-- Connecté sur le site, la console du navigateur (F12) doit répondre :
--   await sb.rpc('mon_discord_id')      → ton identifiant Discord
--   await sb.rpc('est_admin_discord')   → true si tu es admin sur le serveur
--
-- Côté base, pour voir qui est admin :
-- select game_name, discord_id, is_admin from public.bot_user_mapping order by is_admin desc, game_name;

-- Terminé ✔
