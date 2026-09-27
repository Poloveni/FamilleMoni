# Modèle de site de famille RP — Roxwood Network

Base réutilisable pour les sites de groupes RP : une **vitrine** publique (HTML / CSS / JS natif) et un **espace membre** complet (Express + PostgreSQL + connexion Discord), servis par le même serveur Node.

Ce que le modèle apporte, prêt à l'emploi :
- **Espace membre** : connexion Discord réservée aux membres du serveur, validation des comptes, profils, liste des membres, grades paramétrables, organigramme public, galerie photo, salon de discussion en temps réel, et les pages reliées au bot Discord Roxwood (tableau de bord, classement, statistiques, taxes, armurerie).
- **Vitrine** : hero avec blason 3D, histoire, valeurs, hiérarchie et galerie alimentées depuis l'espace membre, appel à rejoindre le Discord. Responsive, du téléphone à l'écran large.
- **Signature** « Développé par Roxwood Network » en bas de page.
- **Déploiement** : Docker (site, base, sauvegardes quotidiennes), nginx + HTTPS, plafonds de mémoire, plusieurs sites sur un même VPS. Guide pas à pas : [server/README.md](server/README.md).

## Créer un nouveau site
1. **Nouveau dépôt** : sur GitHub, bouton **Use this template** → nom du dépôt du site. Le cloner sur le poste.
2. **Identité** : remplir [`site.json`](site.json). Ces valeurs sont insérées dans toutes les pages au moment où le serveur les envoie ; aucune page de l'espace membre n'est à retoucher.

   | Clé | Rôle | Exemple |
   |---|---|---|
   | `nom` | nom du groupe (titres, barre de navigation, blason) | `Los Carteles` |
   | `espace` | nom de l'espace membre (menu, titres) | `Espace membre`, `Le QG` |
   | `groupe` | le groupe dans une phrase, en minuscule avec son article | `la famille`, `le cartel` |
   | `devise` | devise affichée sous le titre et en pied de page | `Loyauté · Respect · Honneur` |
   | `serveur` | serveur RP (sur-titre du hero) | `Flashback FA` |
   | `discord` | lien d'invitation Discord | `https://discord.gg/…` |
   | `description` | présentation courte (hero, moteurs de recherche, aperçus de lien) | |

   Dans une page, `{{nom}}` insère la valeur, `{{Groupe}}` la même avec une majuscule (« Le cartel »). `{{url}}` vient de `BASE_URL`.
3. **Visuels** (dans `assets/`, mêmes noms de fichiers) : `logo.png` (carré, fond transparent), `medallion.png` (face du blason 3D, carrée), `favicon.png`, `og-image.jpg` (1200 × 630, aperçu de partage). Ne pas toucher à `roxwood.png`.
4. **Vitrine** : remplacer les textes marqués « Texte à remplacer » dans [`index.html`](index.html) (histoire, valeurs, recrutement). Des styles prêts à l'emploi existent aussi dans `styles.css` pour un nuancier de couleurs (`.couleurs`), des cartes d'événements (`.evenements`) et un lexique (`.vocab`).
5. **Couleurs et polices** : variables en tête de [`styles.css`](styles.css) (`:root`).
6. **Déployer** : [server/README.md](server/README.md).

Garder la signature Roxwood Network en bas de `index.html`.

### Récupérer plus tard les améliorations du modèle
Le code commun (serveur, espace membre, scripts) ne dépend que de `site.json` : les correctifs du modèle se reprennent donc sans conflit dans un site existant.
```bash
git remote add modele https://github.com/poulpizar01/roxwood-network-site-famille-template.git   # une seule fois
git fetch modele && git merge modele/main --allow-unrelated-histories                            # --allow-… : la première fois seulement
```
Les conflits éventuels ne portent que sur ce que le site a personnalisé (`index.html`, `styles.css`, `site.json`, `assets/`) : garder la version du site.

## Développement
Prérequis : Docker Desktop.
```bash
docker compose up          # http://localhost:3000  ·  espace membre : http://localhost:3000/espace/
```
- Connexion sans Discord (bouton de connexion → compte « Dev local » avec tous les droits).
- Pages, CSS, JS et `site.json` : rafraîchir le navigateur suffit. Serveur (`server/src`) : `docker compose restart app`.
- Photos de la galerie écrites dans `uploads/` (ignoré par git). Base dans un volume Docker (`docker compose down -v` la remet à zéro).
- Base : après une modification de `server/prisma/schema.prisma`, `docker compose exec app npx prisma migrate dev --name <description>`, et **committer le dossier de migration créé** : c'est lui que la prod applique au démarrage.
- Tester avec le bot Discord : créer un `.env` à la racine (ignoré par git) contenant **uniquement** `BOT_API_URL`, `DISCORD_GUILD_ID` et `DEV_DISCORD_ID` (ton ID Discord, pour que le compte de dev puisse se connecter au bot), puis `docker compose up -d` — et déclarer `http://localhost:3000/espace/bot-callback.html` comme site externe du bot sur ce serveur Discord. Ne pas copier `.env.example` en dev : sa ligne `COMPOSE_FILE` désactive les réglages de dev. Attention, le bot ne garde qu'un site externe par serveur Discord : tester sur un serveur Discord de test, pas celui de la prod (voir [server/README.md](server/README.md#bot-discord)).
- Deux sites en dev en même temps : ils utilisent tous deux le port 3000 ; arrêter l'un (`docker compose stop`) avant de lancer l'autre.

## Organisation
- `site.json` — identité du site (voir plus haut)
- `index.html` — vitrine (blason 3D `hero3d.js`, organigramme `org.js`, galerie `galerie.js`, `main.js`) ; `404.html`
- `styles.css` — direction artistique (couleurs et polices en variables) ; `assets/` — logo, médaillon, favicon, image de partage, logo Roxwood
- `espace/` — pages de l'espace membre (`espace.js` et `espace.css` partagés)
- `server/` — serveur (`src/`, dont `site.ts` qui insère `site.json` dans les pages), schéma et migrations de la base (`prisma/`), déploiement (`deploy/`)
- `compose.yaml` — site, base et sauvegardes (dev et prod) ; `compose.override.yaml` — réglages de dev uniquement
