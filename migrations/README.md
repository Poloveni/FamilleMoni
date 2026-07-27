# Base de données — ordre d'exécution des fichiers SQL

Les fichiers `.sql` à la racine du projet ont été appliqués dans cet ordre.
Si tu dois un jour reconstruire la base à zéro (nouveau projet Supabase),
exécute-les dans **cet ordre exact**, dans Supabase → SQL Editor.

| # | Fichier | Ce qu'il fait |
|---|---------|---------------|
| 1 | `supabase-schema.sql` | Tables de base : `profils`, `evenements` + bucket `photos` |
| 2 | `discord-sync-schema.sql` | Table de synchronisation Discord (première version) |
| 3 | `approval-schema.sql` | Table `comptes` + validation manuelle des inscriptions |
| 4 | `galerie-photos.sql` | Table `galerie_photos` + bucket `galerie` |
| 5 | `participations.sql` | Table `participations` (qui vient à quel événement) |
| 6 | `fiches-membres.sql` | Colonnes supplémentaires des fiches membres |
| 7 | `bot-sync-schema.sql` | Tables `bot_*` alimentées par le bot Discord |
| 8 | `dashboard-ventes.sql` | Table `declarations` (⚠️ non utilisée par le site aujourd'hui) |
| 9 | `bot-sync-schema-2.sql` | Ajouts bot : stocks, ventes |
| 10 | `bot-sync-schema-3.sql` | Ajouts bot : coffre |
| 11 | `admin-schema.sql` | Droits d'administration + verrou d'auto-approbation |
| 12 | `bot-sync-schema-4.sql` | Ajouts bot : métadonnées de synchro |
| 13 | `prix-drogues.sql` | Table des prix, modifiable depuis l'espace membre |
| 14 | **`securite-2026-07.sql`** | **Correctifs de sécurité — à exécuter une fois** |
| 15 | **`prix-drogues-2.sql`** | **Prix de base + semaines de revendication (prix actuel calculé automatiquement)** |

## Règle pour la suite

Quand tu ajoutes une modification de base de données, crée un **nouveau
fichier** daté (`2026-08-ma-modif.sql`) plutôt que de modifier un fichier
existant : les anciens ont déjà été exécutés, les rejouer modifiés peut
casser des choses.

## Vérifier ce qui est réellement actif

Dans Supabase → SQL Editor :

```sql
select schemaname, tablename, policyname, cmd
  from pg_policies
 where schemaname in ('public','storage')
 order by tablename, policyname;
```
