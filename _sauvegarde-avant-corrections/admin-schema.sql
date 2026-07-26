-- ============================================================
--  DROITS ADMIN — Famille Moni
--  Donne à l'admin (syne@live.fr) le droit de voir et gérer
--  tous les comptes depuis le panel admin du site.
--  À exécuter dans Supabase  >  SQL Editor  >  Run.
-- ============================================================

-- L'admin voit tous les comptes (les membres ne voient toujours que le leur)
drop policy if exists "Admin voit tous les comptes" on public.comptes;
create policy "Admin voit tous les comptes" on public.comptes for select to authenticated
  using ((auth.jwt() ->> 'email') = 'syne@live.fr');

-- L'admin peut modifier tous les comptes (approuver / révoquer)
drop policy if exists "Admin gere les comptes" on public.comptes;
create policy "Admin gere les comptes" on public.comptes for update to authenticated
  using ((auth.jwt() ->> 'email') = 'syne@live.fr');

-- Le verrou anti-auto-approbation laisse maintenant passer l'admin
create or replace function public.protect_approuve()
returns trigger language plpgsql security definer as $$
begin
  if (auth.role() <> 'service_role' and coalesce(auth.jwt() ->> 'email', '') <> 'syne@live.fr') then
    if (tg_op = 'INSERT') then new.approuve := false;
    else new.approuve := old.approuve;
    end if;
  end if;
  return new;
end $$;

-- Terminé ✔  Le panneau Inscriptions du panel admin est pleinement fonctionnel.
