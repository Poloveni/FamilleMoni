-- ============================================================
--  PRIX DES DROGUES — Famille Moni
--  Consultation : membres approuvés. Modification : admin uniquement.
--  À exécuter dans Supabase  >  SQL Editor  >  Run.
-- ============================================================

create table if not exists public.prix_drogues (
  item       text primary key,
  prix       numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.prix_drogues enable row level security;

drop policy if exists "Lecture famille" on public.prix_drogues;
create policy "Lecture famille" on public.prix_drogues for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = auth.uid() and c.approuve));

drop policy if exists "Admin ajoute" on public.prix_drogues;
create policy "Admin ajoute" on public.prix_drogues for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'syne@live.fr');

drop policy if exists "Admin modifie" on public.prix_drogues;
create policy "Admin modifie" on public.prix_drogues for update to authenticated
  using ((auth.jwt() ->> 'email') = 'syne@live.fr');

-- Produits de départ (prix à définir dans l'espace membre)
insert into public.prix_drogues (item, prix) values
  ('cannabis', 0), ('b-magic', 0), ('pochon de mexicana', 0),
  ('ecstasy', 0), ('tranq', 0), ('cocaïne', 0), ('pochon de sporex', 0)
on conflict (item) do nothing;

-- Terminé ✔
