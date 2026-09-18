-- ══════════════════════════════════════════════════════════════════
--  Hiérarchie — mise à jour du 18/09/2026, d'après l'aperçu des membres
--  du bot Discord (15 membres). À coller dans Supabase → SQL Editor → Run.
--  Réexécutable sans risque. Équivaut à ce que ferait le panneau
--  « Hiérarchie » de l'espace membre, en une fois.
--
--  Arrivées (Associati) : Kaleo Maranzano, Leandro Maranzano, Haziro Javez,
--                         Rocco Hawk, Vincenzo Moni, Gustavo Madrazo
--  Départs              : Gustavo Cardoso, James Davis, Michel Duboisie
--
--  Rappel : le « Javier Silva » Braccio Destro du bot s'appelle
--  « Javier Cruz Silva » sur le site (deux homonymes).
-- ══════════════════════════════════════════════════════════════════

insert into public.hierarchie (nom, rang) values
  ('Lov Moni',          'La Donna'),
  ('Raymond Carter',    'Braccio Destro'),
  ('Javier Cruz Silva', 'Braccio Destro'),
  ('Ezio Spallow',      'Anziani'),
  ('Bass Carter',       'Fedeli'),
  ('Dayon Reas',        'Fedeli'),
  ('Javier Silva',      'Fedeli'),
  ('Andréas Kyros',     'Associati'),
  ('Gustavo Madrazo',   'Associati'),
  ('Haziro Javez',      'Associati'),
  ('Kaleo Maranzano',   'Associati'),
  ('Leandro Maranzano', 'Associati'),
  ('Rocco Hawk',        'Associati'),
  ('Tiago Rodrigues',   'Associati'),
  ('Vincenzo Moni',     'Associati')
on conflict (nom) do update set rang = excluded.rang, updated_at = now();

delete from public.hierarchie
 where nom in ('Gustavo Cardoso', 'James Davis', 'Michel Duboisie');

-- Contrôle : doit renvoyer 15 lignes.
select nom, rang from public.hierarchie order by rang, nom;
