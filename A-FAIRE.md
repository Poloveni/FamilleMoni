# Ce qu'il te reste à faire — 4 étapes, ~15 minutes

Tout le code est déjà corrigé et écrit dans ton dossier `FamilleMoni`.
Il reste 4 choses que je ne peux pas faire à ta place, parce qu'elles
demandent tes mots de passe Supabase et GitHub.

---

## Étape 1 — Publier le site (2 min)

Double-clique sur **`publier.bat`**, comme d'habitude. Attends le message
« Terminé ! ». Le site est à jour environ une minute plus tard.

> ⚠️ Si Git affiche une erreur du type *« index.lock »* : va dans le dossier
> `.git` (affiche les fichiers cachés si besoin) et supprime le fichier
> `index.lock.a-supprimer`. C'est un résidu que j'ai renommé sans pouvoir
> l'effacer. Ce n'est pas grave, mais autant faire propre.

**Comment vérifier que ça a marché :** ouvre le site, fais `Ctrl + F5`
(rechargement forcé). Le badge violet en haut du hero doit être nettement
plus lisible qu'avant, et la musique ne doit **pas** démarrer toute seule.

---

## Étape 2 — Exécuter le SQL de sécurité (5 min) ⚠️ LE PLUS IMPORTANT

1. Va sur **https://supabase.com/dashboard** et ouvre ton projet.
2. Dans le menu de gauche, clique sur **SQL Editor**.
3. Clique sur **+ New query** en haut.
4. Ouvre le fichier **`securite-2026-07.sql`** (dans ton dossier FamilleMoni),
   sélectionne **tout** le contenu (`Ctrl + A`), copie (`Ctrl + C`).
5. Colle dans la fenêtre Supabase (`Ctrl + V`), puis clique sur **Run**
   (ou `Ctrl + Entrée`).
6. Tu dois voir **« Success. No rows returned »** en bas. C'est normal.

**Ce que ça corrige :** plus personne ne peut effacer ton planning, écraser
la photo d'un autre membre, ni publier dans la galerie sans être approuvé.

**Comment vérifier :** connecte-toi à l'espace membre et change ta photo de
profil. Si elle s'enregistre, tout va bien.

**Si ça échoue** avec une erreur du type *« policy ... does not exist »* :
c'est sans gravité, relance simplement — le fichier est fait pour être
rejoué sans risque. Si l'erreur mentionne un nom de règle différent du mien,
va dans Supabase → Storage → Policies pour lire les noms réels et dis-le moi.

---

## Étape 3 — Créer le secret des fonctions Discord (5 min)

Le code est déjà en place. Tant que le secret n'existe pas, les fonctions
continuent de marcher exactement comme avant — **rien ne casse si tu remets
cette étape à plus tard**. Elle ferme juste la porte.

### 3a. Invente un mot de passe

Par exemple : `moni_cron_7f3a91c8d2e4b6` (change quelques caractères).
Note-le quelque part.

### 3b. Dans Supabase

Menu de gauche → **Edge Functions** → onglet **Secrets** → **Add new secret**
- Nom : `CRON_SECRET`
- Valeur : ton mot de passe
- **Save**

### 3c. Dans GitHub

Ton dépôt → **Settings** → menu de gauche **Secrets and variables** →
**Actions** → bouton **New repository secret**
- Name : `CRON_SECRET`
- Secret : **le même** mot de passe
- **Add secret**

### 3d. Une modification à faire à la main

Je n'ai pas le droit d'écrire dans le dossier `.github` (GitHub le protège
contre les outils externes). Ouvre le fichier
**`.github/workflows/sync-discord.yml`** dans ton éditeur, et remplace la
dernière ligne par celle-ci (une seule ligne, tout d'un bloc) :

```yaml
        run: curl -s --max-time 30 -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" https://prwdtdmdkhzwfyivaepw.supabase.co/functions/v1/sync-discord-presences
```

### 3e. Redéployer les fonctions

Comme d'habitude quand tu modifies une fonction Edge (via le tableau de bord
Supabase ou la commande `supabase functions deploy`). Les 4 fonctions
modifiées sont : `sync-discord-presences`, `sync-discord-annonces`,
`sync-discord-events`, `discord-presence-bot`.

**Comment vérifier :** attends 5 minutes, puis regarde si le planning du site
se met toujours à jour depuis Discord. Si oui, c'est bon.
**Si ça ne marche plus :** supprime le secret `CRON_SECRET` côté Supabase —
tout redevient comme avant, et on regarde ensemble.

---

## Étape 4 — Vider le vieux cache (1 min)

Tes visiteurs habituels ont l'ancienne version en mémoire. J'ai changé le
numéro de version du cache (`moni-v5`), donc ça se règle tout seul à leur
prochaine visite. De ton côté, pour vérifier tout de suite :

`F12` → onglet **Application** → **Service Workers** → coche
**« Update on reload »** → recharge deux fois la page.

---

# Ce qui a été fait pendant ce temps

## Sécurité
- Faille critique bouchée dans `admin.html` : l'email d'un compte pouvait
  contenir du code exécuté dans ta session.
- Échappement HTML ajouté partout dans `os.html`, qui n'en avait aucun.
- Les 3 fonctions de synchro Discord et l'endpoint `?setup=` du bot sont
  prêts à être verrouillés par un secret partagé.
- Message clair si le serveur Supabase est injoignable, au lieu d'une page morte.

## Performance
- La musique ne se télécharge plus au défilement : **3,3 Mo économisés**
  sur chaque première visite. Elle démarre au clic sur le bouton, et le
  choix est mémorisé.
- Le décor animé du hero s'arrête quand on a scrollé plus bas.
- Le fond animé de Moni OS : 2 fois moins de particules (donc 4 fois moins
  de calculs), en pause quand l'onglet est en arrière-plan.
- Les sondages Discord et FiveM se mettent en pause sur un onglet inactif.
- Favicon de 7 Ko au lieu d'un JPEG de 45 Ko, logo du hero à 835 octets.
- `preconnect` vers le bon domaine de polices, image du hero préchargée,
  et la bonne graisse de Playfair (le titre était en faux italique).

## Accessibilité
- Tous les gris illisibles corrigés (le pire était à 2,5 sur 4,5 requis).
- Le menu burger est un vrai bouton : utilisable au clavier sur mobile.
- Les cartes membres s'ouvrent avec Entrée ou Espace.
- « Créer un compte » et « Mot de passe oublié » deviennent atteignables.
- Le menu de l'admin et de l'espace membre passe en vrais boutons.
- Les modales fermées ne piègent plus la touche Tab.
- Le réglage système « réduire les animations » est enfin respecté.

## Rangement
- `dashboard.css` : 93 lignes qui étaient copiées dans deux fichiers.
- `starfield.js` : 62 lignes de décor, copiées elles aussi.
- Code mort supprimé (la fonctionnalité « annonces » désactivée).
- `sw.js` réécrit : le mode hors-ligne fonctionne, et surtout **tes mises à
  jour de membres arrivent enfin chez les visiteurs habituels**.
- `migrations/README.md` : l'ordre d'exécution de tes 14 fichiers SQL.

**Vérifié** : zéro erreur JavaScript sur les 4 pages, et 397 éléments
comparés avant/après sur l'espace membre et l'admin — **zéro changement
d'apparence**.

Une sauvegarde complète de l'état d'avant est dans
`_sauvegarde-avant-corrections/`.
