-- ════════════════════════════════════════════════════════════
--  FAMILLE MONI — Préparation de la synchro Discord → Événements
--  À exécuter dans Supabase : SQL Editor → New query → coller → Run
-- ════════════════════════════════════════════════════════════

-- Identifiant du message Discord (pour éviter les doublons lors des synchros).
alter table public.evenements
  add column if not exists discord_id text;

-- Un message Discord ne peut correspondre qu'à un seul événement.
create unique index if not exists evenements_discord_id_key
  on public.evenements (discord_id);

-- (Optionnel) Repartir propre : supprimer les événements de démonstration
-- créés à la main, pour ne garder que ceux venant de Discord.
-- Décommentez la ligne suivante si vous le souhaitez :
-- delete from public.evenements where discord_id is null;
