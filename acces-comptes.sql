-- ============================================================================
--  NIVEAU D'ACCÈS PAR COMPTE — Famille Moni
-- ============================================================================
--  Objectif : depuis le panneau Admin → Inscriptions, choisir pour chaque
--  compte s'il voit TOUT l'espace membre, ou UNIQUEMENT le panneau Taxes.
--
--  Avant : la liste des comptes « taxes uniquement » était écrite en dur
--  dans un fichier SQL (gerant-taxes-emails.sql) — il fallait relancer un
--  script à chaque changement. Maintenant, c'est une simple colonne dans la
--  base, modifiable en un clic depuis l'admin.
--
--  À exécuter dans Supabase → SQL Editor → coller → Run.
--  Réexécutable sans risque : il ne détruit aucune donnée.
-- ============================================================================


-- ── 1. La colonne « acces » sur la table des comptes ────────────────────────
--    'complet' = voit tout l'espace membre (valeur par défaut)
--    'taxes'   = ne voit que le panneau Taxes
alter table public.comptes
  add column if not exists acces text not null default 'complet';

-- Le garde-fou : seules ces deux valeurs sont acceptées par la base.
-- Ainsi, même une requête mal formée ne peut pas créer un troisième état.
alter table public.comptes drop constraint if exists comptes_acces_valide;
alter table public.comptes
  add constraint comptes_acces_valide check (acces in ('complet', 'taxes'));


-- ── 2. Reprise de l'existant ───────────────────────────────────────────────
--    Les quatre gérants des taxes déclarés jusqu'ici par email basculent
--    automatiquement sur acces = 'taxes'. Personne ne perd son accès.
update public.comptes
   set acces = 'taxes'
 where lower(email) in (
         'gogeta2b@hotmail.fr',
         'arkosse2008@gmail.com',
         'gh4open56@gmail.com',
         'moreiranoa5@gmail.com'
       )
   and acces <> 'taxes';


-- ── 3. Un membre ne peut pas s'attribuer un accès lui-même ─────────────────
--    Même logique que pour la colonne « approuve » : côté site, la valeur
--    est figée. Seule l'administratrice (ou le service_role) peut l'écrire.
create or replace function public.protect_approuve()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (auth.role() <> 'service_role'
      and coalesce(auth.jwt() ->> 'email', '') <> 'syne@live.fr') then
    if (tg_op = 'INSERT') then
      new.approuve := false;
      new.acces    := 'complet';
    else
      new.approuve := old.approuve;
      new.acces    := old.acces;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_approuve on public.comptes;
create trigger trg_protect_approuve
  before insert or update on public.comptes
  for each row execute function public.protect_approuve();


-- ── 4. L'admin peut lire et écrire toutes les lignes ───────────────────────
--    (règles déjà posées par admin-schema.sql — on les repose ici pour que
--     ce script soit autonome, et on ajoute le « with check » explicite.)
drop policy if exists "Admin voit tous les comptes" on public.comptes;
create policy "Admin voit tous les comptes" on public.comptes for select to authenticated
  using ((auth.jwt() ->> 'email') = 'syne@live.fr');

drop policy if exists "Admin gere les comptes" on public.comptes;
create policy "Admin gere les comptes" on public.comptes for update to authenticated
  using      ((auth.jwt() ->> 'email') = 'syne@live.fr')
  with check ((auth.jwt() ->> 'email') = 'syne@live.fr');


-- ── 5. LE point unique de vérification « gérant des taxes » ────────────────
--    Deux sources, dans cet ordre :
--      • le rôle Discord is_taxes_manager (écrit par le bot)
--      • la colonne comptes.acces = 'taxes' (écrite depuis l'admin)
--    Le site ET les règles de sécurité de la base appellent cette même
--    fonction : l'affichage et l'autorisation réelle ne peuvent pas diverger.
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
         ), false)
      or coalesce((
           select c.acces = 'taxes'
             from public.comptes c
            where c.id = auth.uid()
            limit 1
         ), false);
$$;

revoke all on function public.est_gerant_taxes() from public, anon;
grant execute on function public.est_gerant_taxes() to authenticated;

comment on function public.est_gerant_taxes() is
  'true si le compte est gérant des taxes : rôle Discord is_taxes_manager, ou comptes.acces = ''taxes'' (réglé depuis le panneau Admin).';


-- ============================================================================
--  VÉRIFICATION — exécute cette requête juste après, tu dois voir la
--  colonne « acces » remplie pour chaque compte :
-- ============================================================================
-- select email, approuve, acces from public.comptes order by created_at desc;
