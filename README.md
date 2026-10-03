# Modèle de site de famille RP — Roxwood Network

Base réutilisable pour les sites de groupes RP : une **vitrine** publique et un **espace membre** complet (connexion Discord, gestion du groupe, liaison au bot Roxwood), servis par le même serveur Node (Express + PostgreSQL), déployés avec Docker derrière nginx.

## Ce qui est propre à chaque site, ce qui est commun
Le modèle sépare deux parties :

| | **Personnalisable, site par site** | **Mutualisé, identique sur tous les sites** |
|---|---|---|
| Quoi | La **vitrine** (page d'accueil) et toute la **direction artistique** | La **partie gestion** : espace membre, serveur, base, déploiement |
| Fichiers | `site.json`, `theme.css`, `index.html`, `styles.css`, `assets/`, `galerie.js`, `pellicule.js` | `espace/`, `server/`, `org.js`, `main.js`, `404.html`, `compose*.yaml`, `docs/`, `.claude/skills/` |
| Liberté | Totale : textes, sections, mise en page, couleurs, polices, visuels, effets | Aucune modification dans un site : les améliorations se font **dans le modèle**, puis chaque site les récupère |

**La direction artistique s'applique aussi à la partie gestion**, sans la modifier techniquement. L'espace membre ne contient aucune couleur ni police en dur : il prend celles de `theme.css`, l'accent de `site.json`, le nom et les textes de `site.json`, le logo de `assets/`. Chaque site a donc un espace membre à ses couleurs, mais son code est le même partout.

Ce que la partie gestion apporte, prête à l'emploi : connexion Discord réservée aux membres du serveur, validation des comptes, accès réservé au rôle Discord « membre » et niveaux de droits (Gestion, pouvoirs complets), profils, liste des membres, grades et droits paramétrables, organigramme public, galerie photo, salon de discussion en temps réel, pages reliées au bot Discord Roxwood (tableau de bord, classement, statistiques, taxes, armurerie), sauvegardes quotidiennes, plusieurs sites sur un même VPS.

En bas de chaque vitrine : la signature **« Développé par Roxwood Network »** (à garder).

## Créer un nouveau site
1. **Nouveau dépôt** : sur GitHub, bouton **Use this template** → nom du dépôt du site. Le cloner sur le poste.
2. **Identité** : remplir [`site.json`](site.json). Ces valeurs sont insérées dans toutes les pages (et `theme.css`) au moment où le serveur les envoie ; aucune page de l'espace membre n'est à retoucher.

   | Clé | Rôle | Exemple |
   |---|---|---|
   | `nom` | nom du groupe (titres, barre de navigation) | `Los Carteles` |
   | `espace` | nom de l'espace membre (menu, titres) | `Espace membre`, `Le QG` |
   | `groupe` | le groupe dans une phrase, en minuscule avec son article | `la famille`, `le cartel` |
   | `devise` | devise affichée sous le titre et en pied de page | `Loyauté · Respect · Honneur` |
   | `serveur` | serveur RP (sur-titre du hero) | `Flashback FA` |
   | `couleur` | couleur d'accent (boutons, liens, liserés, blason 3D), format `#rrggbb` ; ses nuances sont calculées | `#e5484d` |
   | `discord` | lien d'invitation Discord du groupe | `https://discord.gg/…` |
   | `description` | présentation courte (hero, moteurs de recherche, aperçus de lien) | |

   Dans une page, `{{nom}}` insère la valeur, `{{Groupe}}` la même avec une majuscule (« Le cartel »), `{{url}}` l'adresse du site (`BASE_URL`). Le serveur refuse de démarrer si une valeur manque.
3. **Direction artistique** : [`theme.css`](theme.css) regroupe les fonds, les textes, les polices (fichiers dans `assets/fonts/`, servis par le site : rien ne se charge depuis un hébergeur tiers) et la largeur du contenu ; il s'applique à tout le site, espace membre compris. Pour aller plus loin sur la vitrine : [`styles.css`](styles.css) (en gardant les noms des classes partagées avec l'espace membre : `.btn` et ses variantes, `.eyebrow`, `.numeral`, `.section__head`) et [`pellicule.js`](pellicule.js) (animations propres à la vitrine : index des chapitres, curseur, citation).
4. **Visuels** (dans `assets/`, mêmes noms de fichiers) : `logo.png` (carré, fond transparent), `favicon.png`, `og-image.jpg` (1200 × 630, aperçu de partage). Ne pas toucher à `roxwood.png`.
5. **Vitrine** : [`index.html`](index.html) est un point de départ — remplacer les textes marqués « Texte à remplacer », ajouter, retirer ou réordonner les sections librement. Des styles prêts à l'emploi existent dans `styles.css` pour un nuancier de couleurs (`.couleurs`), des cartes d'événements (`.evenements`) et un lexique (`.vocab`). Deux sections se remplissent seules depuis l'espace membre et restent masquées si vides : la hiérarchie (`org.js`) et la galerie (`galerie.js`).
6. **Photos d'exemple** : les six images de `assets/exemples/` s'affichent dans la galerie de l'accueil tant qu'aucune vraie photo n'est publiée (fichiers du projet, jamais envoyés au stockage). Pour ne jamais les montrer : vider la liste `EXEMPLES` de `galerie.js` et supprimer le dossier.
7. **Déployer** : [server/README.md](server/README.md) — installation, puis **première connexion** dans l'ordre : bot à jour avec son rôle membre (`/config role set membre`), propriétaire du serveur Discord connecté au site, rôle membre et grades réglés dans Gestion → Hiérarchie.

### Récupérer plus tard les améliorations du modèle
La partie gestion étant identique partout, un correctif fait dans le modèle se reprend dans chaque site :
```bash
git remote add modele https://github.com/poulpizar01/roxwood-network-site-famille-template.git   # une seule fois
git fetch modele && git merge modele/main --allow-unrelated-histories                            # --allow-… : la première fois seulement
```
Les conflits éventuels ne portent que sur les fichiers personnalisables (`site.json`, `theme.css`, `index.html`, `styles.css`, `assets/`…) : y garder la version du site. Un site qui a modifié un fichier mutualisé perd cette garantie : corriger plutôt dans le modèle.

## Documentation
| Sujet | Où |
|---|---|
| Déployer sur un VPS, mettre à jour, sauvegarder, revenir en arrière, application Discord | [server/README.md](server/README.md) |
| nginx : HTTPS, rôle de chaque réglage, plusieurs sites, dépannage | [docs/nginx.md](docs/nginx.md) |
| Stockage des photos (disque ou CDN), contrat attendu du service | [docs/stockage.md](docs/stockage.md) |
| API du site (routes, droits, limites) et API du bot Discord relayée | [docs/api.md](docs/api.md) |
| Audits par angle (accès, navigateur, bot, fiabilité, modèle) : prompts, commande `/audit` dans Claude Code | [docs/audits.md](docs/audits.md) |
| Consignes pour Claude Code sur ce dépôt | [CLAUDE.md](CLAUDE.md) |

## Développement
Prérequis : Docker Desktop.
```bash
docker compose up          # http://localhost:3000  ·  espace membre : http://localhost:3000/espace/
```
- Créer un `.env` à la racine (ignoré par git) contenant au moins `SITE_ID=<nom du site>` : sans lui, le projet Docker s'appelle `site`, comme celui du modèle, et deux sites en dev partageraient la même base. N'y mettre rien d'autre que `SITE_ID` et, pour tester le bot, les trois clés ci-dessous ; ne pas copier `.env.example` (sa ligne `COMPOSE_FILE` désactive les réglages de dev).
- Connexion sans Discord (bouton de connexion → compte « Dev local » avec tous les droits). Pour essayer un autre niveau d'accès : `http://localhost:3000/auth/discord?compte=<ID Discord>` ouvre la session d'un compte existant (dev uniquement, refusé en production).
- Pages, CSS, JS et `site.json` : rafraîchir le navigateur suffit (en dev, rien n'est mis en cache). Serveur (`server/src`) : `docker compose restart app`.
- Photos de la galerie écrites dans `uploads/` (ignoré par git). Base dans un volume Docker (`docker compose down -v` la remet à zéro).
- Base : après une modification de `server/prisma/schema.prisma`, `docker compose exec app npx prisma migrate dev --name <description>`, et **committer le dossier de migration créé** : c'est lui que la prod applique au démarrage.
- Tester avec le bot Discord : ajouter au `.env` de dev `BOT_API_URL`, `DISCORD_GUILD_ID` et `DEV_DISCORD_ID` (ton ID Discord, pour que le compte de dev puisse se connecter au bot), puis `docker compose up -d` — et déclarer `http://localhost:3000/espace/bot-callback.html` comme site externe du bot, **sur un serveur Discord de test** (le bot ne garde qu'un site externe par serveur : voir [docs/api.md](docs/api.md)). Ne pas copier `.env.example` en dev : sa ligne `COMPOSE_FILE` désactive les réglages de dev.
- Deux sites en dev en même temps : ils utilisent tous deux le port 3000 ; arrêter l'un (`docker compose stop`) avant de lancer l'autre.

## Organisation
- `site.json` — identité du site ; `theme.css` — couleurs et polices du site ; `confidentialite.html` — ce que le site enregistre (à relire si le site change ce qu'il collecte)
- `index.html`, `styles.css` — vitrine (animations `pellicule.js`, organigramme `org.js`, galerie `galerie.js`, `main.js`) ; `404.html`
- `assets/` — logo, favicon, image de partage, logo Roxwood, photos d'exemple
- `espace/` — pages de l'espace membre (`espace.js` et `espace.css` partagés)
- `server/` — serveur (`src/`, dont `site.ts` qui insère `site.json` dans les pages), schéma et migrations de la base (`prisma/`), configuration nginx (`deploy/`)
- `docs/` — nginx, stockage des photos, API, prompts d'audit
- `.claude/skills/` — commandes Claude Code du projet (`/audit`)
- `compose.yaml` — site, base et sauvegardes (dev et prod) ; `compose.override.yaml` — réglages de dev uniquement
