-- ============================================================================
--  FICHE COMPLÈTE DES COMPTES — Famille Moni
-- ============================================================================
--  Une adresse email ne dit pas qui se cache derrière. Ce script ouvre à
--  l'administratrice — et à elle seule — trois informations de plus :
--
--    • le pseudo Discord (si la personne s'est connectée avec Discord)
--    • le nom du personnage choisi dans l'espace membre, avec son rang
--    • la date d'inscription et la date de dernière connexion
--
--  POURQUOI UNE FONCTION ET PAS UNE SIMPLE REQUÊTE
--  Le pseudo Discord et la dernière connexion vivent dans le schéma « auth »,
--  la zone protégée de Supabase : le site n'a pas le droit d'y entrer.
--  Une fonction « security definer » est le passage officiel — elle s'exécute
--  avec les droits de la base, mais ne renvoie QUE ce qu'on lui a demandé,
--  et seulement si c'est bien toi qui la questionnes.
--
--  À exécuter dans Supabase → SQL Editor → coller → Run.
--  Réexécutable sans risque.
-- ============================================================================


-- Le type de retour change (photo, identifiant Discord, liaison au bot) :
-- PostgreSQL exige de supprimer la fonction avant de la recréer.
drop function if exists public.comptes_details();

create function public.comptes_details()
returns table (
  id                 uuid,
  email              text,
  approuve           boolean,
  acces              text,
  created_at         timestamptz,
  discord_pseudo     text,
  derniere_connexion timestamptz,
  nom                text,
  rang               text,
  discord_id         text,
  avatar_url         text,        -- photo de profil Discord, si connue
  photo_url          text,        -- photo du profil du site (repli)
  bot_lie            boolean,     -- un jeton du bot valide existe pour ce compte
  bot_admin          boolean,     -- administrateur Discord, vu par le bot
  bot_taxes          boolean      -- rôle taxes, vu par le bot
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    c.id,
    c.email,
    c.approuve,
    c.acces,
    c.created_at,
    -- Pseudo : l'identité OAuth Discord si elle existe ; sinon ce que la
    -- connexion par le bot a posé dans les métadonnées ; sinon le pseudo
    -- relevé lors de la dernière liaison au bot.
    coalesce(d.pseudo, u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'user_name', bs.username),
    u.last_sign_in_at,
    p.nom,
    p.rang,
    coalesce(d.discord_id, u.raw_app_meta_data ->> 'discord_id', bs.discord_id),
    -- Les métadonnées d'abord : elles sont rafraîchies, l'identité OAuth reste figée.
    coalesce(nullif(u.raw_user_meta_data ->> 'avatar_url', ''), d.avatar_url),
    p.photo_url,
    coalesce(bs.expires_at > now(), false),
    coalesce(bs.is_admin, false),
    coalesce(bs.is_taxes, false)
  from public.comptes c
  left join auth.users        u  on u.id = c.id
  left join public.profils    p  on p.id = c.id
  left join public.bot_sessions bs on bs.user_id = c.id
  left join lateral (
    select coalesce(
             i.identity_data -> 'custom_claims' ->> 'global_name',
             i.identity_data ->> 'full_name',
             i.identity_data ->> 'name',
             i.identity_data ->> 'user_name'
           ) as pseudo,
           coalesce(i.identity_data ->> 'provider_id', i.identity_data ->> 'sub') as discord_id,
           i.identity_data ->> 'avatar_url' as avatar_url
      from auth.identities i
     where i.user_id = c.id
       and i.provider = 'discord'
     order by i.last_sign_in_at desc nulls last
     limit 1
  ) d on true
  -- LE VERROU : si ce n'est pas l'administratrice qui demande, la fonction
  -- ne renvoie aucune ligne. Aucun membre ne peut lire ces informations.
  where coalesce(auth.jwt() ->> 'email', '') = 'syne@live.fr'
  order by c.created_at desc;
$$;

revoke all on function public.comptes_details() from public, anon;
grant execute on function public.comptes_details() to authenticated;

comment on function public.comptes_details() is
  'Liste enrichie des comptes (photo et pseudo Discord, personnage, dates, liaison au bot) — ne renvoie des lignes qu''à syne@live.fr.';


-- ============================================================================
--  VÉRIFICATION — connectée en tant qu'admin, cette requête doit lister
--  tous les comptes. Exécutée par n'importe qui d'autre, elle ne renvoie rien.
-- ============================================================================
-- select email, discord_pseudo, nom, rang, approuve, acces from public.comptes_details();
