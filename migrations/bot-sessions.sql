-- ══════════════════════════════════════════════════════════════════
--  Suivi de la famille — liaison entre un compte du site et l'API du bot
--  Discord (bot-moni-v3). À coller dans Supabase → SQL Editor → Run.
--
--  Le bot délivre un jeton (JWT, 7 jours) après une connexion Discord. Le
--  site ne le garde JAMAIS dans le navigateur : la page suivi-connexion.html
--  le transmet immédiatement à l'Edge Function `bot-suivi`, qui vérifie
--  qu'il appartient bien au membre connecté sur le site (même compte
--  Discord, même serveur) puis le range ici. Ensuite, chaque consultation
--  passe par cette même fonction, qui ajoute le jeton côté serveur.
--
--  Aucune règle d'accès (policy) n'est créée volontairement : avec RLS
--  activé et zéro policy, ni les membres ni les anonymes ne peuvent lire ou
--  écrire cette table depuis le navigateur. Seule la clé service_role
--  (utilisée par l'Edge Function) y accède.
-- ══════════════════════════════════════════════════════════════════

create table if not exists public.bot_sessions (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  discord_id  text not null,
  username    text,
  token       text not null,
  expires_at  timestamptz not null,
  is_admin    boolean not null default false,
  is_taxes    boolean not null default false,
  linked_at   timestamptz not null default now(),
  last_used   timestamptz
);

comment on table public.bot_sessions is
  'Jeton API du bot Discord, par compte du site. Lecture/écriture réservées au service_role (Edge Function bot-suivi).';

alter table public.bot_sessions enable row level security;

-- Ceinture et bretelles : même si une policy était ajoutée par erreur plus
-- tard, les rôles du navigateur n'ont aucun privilège de table.
revoke all on public.bot_sessions from anon, authenticated;

-- Purge des jetons expirés (cosmétique : l'Edge Function les ignore de toute
-- façon et le bot les refuse). À lancer de temps en temps, ou via pg_cron.
create or replace function public.purger_bot_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.bot_sessions where expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purger_bot_sessions() from public, anon, authenticated;
