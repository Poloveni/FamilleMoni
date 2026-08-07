-- ============================================================================
-- NOTIFICATIONS PUSH — Famille Moni
-- ============================================================================
-- Chaque appareil qui active les notifications enregistre ici son
-- « abonnement » (l'adresse technique où envoyer les push). Chacun ne peut
-- écrire que le sien ; seuls les robots (clé service) lisent la liste.
-- Supabase → SQL Editor → Run. Réexécutable sans risque.
-- ============================================================================

create table if not exists public.push_abonnements (
  user_id uuid primary key,
  email   text,
  sub     jsonb not null,
  maj     timestamptz not null default now()
);

alter table public.push_abonnements enable row level security;

drop policy if exists "push_lire_soi" on public.push_abonnements;
create policy "push_lire_soi" on public.push_abonnements
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "push_ecrire_soi" on public.push_abonnements;
create policy "push_ecrire_soi" on public.push_abonnements
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "push_maj_soi" on public.push_abonnements;
create policy "push_maj_soi" on public.push_abonnements
  for update to authenticated using (auth.uid() = user_id);
drop policy if exists "push_suppr_soi" on public.push_abonnements;
create policy "push_suppr_soi" on public.push_abonnements
  for delete to authenticated using (auth.uid() = user_id);
