# Ce qu'il te reste à faire — état au 28 juillet

Tout le code est déjà écrit et testé. Ces trois chantiers n'attendent que
des clics de ta part, parce qu'ils demandent tes mots de passe. Ils sont
indépendants : tu peux en faire un et t'arrêter là.

---

## 1 · Activer la carte de Roxwood (5 min + le temps de placer tes points)

1. Supabase → **SQL Editor** → colle **`carte-points.sql`** → **Run**.
2. Double-clique **`publier.bat`**.
3. Espace membre → onglet **Carte** → **Modifier la carte**.
   Clique pour poser un point, glisse pour le déplacer, renseigne le nom
   et le type. Pour une **zone de vente**, choisis le nom exact proposé
   dans le champ « Zone du bot » : l'anneau du point suivra automatiquement
   le bonus en cours. Termine par **Enregistrer la carte**.

Seule toi peux modifier la carte ; les membres approuvés la consultent.

---

## 2 · Verrouiller les fonctions Discord (10 min) — en attente depuis le début

Tant que ce n'est pas fait, n'importe qui connaissant l'adresse de tes
fonctions peut les appeler en boucle. Rien ne casse en attendant, mais
c'est la dernière porte ouverte connue.

1. Invente un mot de passe long, ex. `moni_cron_7f3a91c8d2e4b6`.
2. Supabase → **Edge Functions** → **Secrets** → ajoute `CRON_SECRET` = ce mot de passe.
3. GitHub → ton dépôt → **Settings** → **Secrets and variables** → **Actions**
   → **New repository secret** → `CRON_SECRET` = le même.
4. Ouvre `.github/workflows/sync-discord.yml` et remplace la dernière ligne par :
   ```yaml
        run: curl -s --max-time 30 -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" https://prwdtdmdkhzwfyivaepw.supabase.co/functions/v1/sync-discord-presences
   ```
   (je n'ai pas le droit d'écrire dans le dossier `.github`, c'est la seule
   ligne à faire à la main)
5. Redéploie les 4 fonctions modifiées : `sync-discord-presences`,
   `sync-discord-annonces`, `sync-discord-events`, `discord-presence-bot`.

**Vérifier :** 5 minutes plus tard, le planning du site se met toujours à
jour. **Si ça casse :** supprime le secret côté Supabase, tout redevient
comme avant.

---

## 3 · Activer la connexion Discord (15 min)

Le guide complet pas à pas : **`docs/CONNEXION-DISCORD.md`**.
Sans cette configuration, le bouton « Se connecter avec Discord » de
l'espace membre affiche une erreur — le reste fonctionne normalement.

Ordre conseillé : configure Discord + Supabase d'abord (étapes 1 à 3 du
guide), puis exécute `discord-admin.sql`. Ton email et celui de Raymond
restent en accès de secours pour l'import de taxes pendant toute la
transition : personne ne se retrouve enfermé dehors.

---

## Pour mémoire — déjà fait ✔

Sécurité (XSS admin, règles de la base, photos, galerie) · musique en
opt-in · service worker réparé · contrastes et clavier · passeports de
membre générés à chaque publication · import Excel des taxes · panneau
Prix des drogues réorganisé autour de la rentabilité · liste des membres
au 27/07 (14 membres) · carte de Roxwood (côté code).

Reste en projet, quand tu veux : la chronique hebdomadaire automatique et
le bilan mensuel partageable par membre.
