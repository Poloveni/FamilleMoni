# Correctifs pour bot-moni-v3 — à appliquer sur le bot de la Famille Moni

Deux commits, à appliquer **dans l'ordre**, sur la branche `main` du dépôt
`bot-moni-v3`. Tout est dans `src/api/` (l'API REST en lecture seule) plus
une signature dans `src/db.ts` : rien ne touche aux commandes Discord, aux
panneaux ni à la base de données (aucune migration).

```bash
cd bot-moni-v3
git am 0001-API-r-les-rev-rifi-s-chaque-requ-te-historique-des-c.patch
git am 0002-API-braquages-cooldowns-config-des-items-dans-api-st.patch
npm run typecheck
npm run build
sudo systemctl restart bot-moni-v3.service      # ou : docker compose up -d --build
```

Si `git am` refuse (conflit parce que `main` a bougé entre-temps) :
`git am --abort`, puis `git am -3 0001-*.patch 0002-*.patch` pour laisser git
résoudre par fusion à trois voies.

## 0001 — sécurité de l'API et objectifs

- `requireAuth` re-résout l'appartenance au serveur et les rôles
  (`isAdmin`, `isTaxes`) via le client du bot **à chaque requête**, au lieu
  de faire confiance aux claims figés dans le JWT au login. Sans ça, un
  membre à qui l'on retirait un rôle (ou expulsé) gardait ses accès jusqu'à
  7 jours. `requireAuth` devient `requireAuth(client)` dans `server.ts`.
- `GET /api/stocks/history` n'exposait pas de restriction : un non-admin
  pouvait lire les mouvements des coffres admin, alors que `/channels` et
  `/:channelId` les lui cachent. Même règle partout maintenant (exclus de la
  liste, 403 si demandés explicitement). `db.getRecentStockHistory` prend une
  liste de salons à exclure.
- `GET /api/quotas/config?week=` : plage résolue, objectifs (`/config quota`),
  taux (`/config salaire`, `/config classement`), libellés des activités.

## 0002 — braquages, cooldowns, configuration des items, noms

- `GET /api/braquages` : plafonds de la semaine glissante (7 j), consommé,
  restant, prochain créneau libre (même calcul que `checkBraquageLimit`).
- `GET /api/cooldowns` (les siens) et `/api/cooldowns/:userId` (soi-même ou
  admin, via `requireSelfOrAdmin`).
- `GET /api/stocks` et `/api/stocks/:channelId` : chaque ligne porte la
  configuration de son item (`name`, `group`, `vente`, `visibleStock`,
  `laboLie`, `laboLieRole`, `stockMultiplier`). Champs **ajoutés**, rien de
  retiré ni renommé : un client existant n'est pas affecté.
- Routes de groupe (`/api/quotas`, `/api/quotas/pay`, `/api/quotas/ranking`,
  `/api/ventes`, `/api/armurerie/ammo/history`) : chaque ligne porte `name`,
  le nom du joueur (nom en jeu via `/adduser`, sinon dernier pseudo vu) —
  nouveau fichier `src/api/noms.ts`. `/api/users` reste réservé aux admins ;
  `db.getKnownUsers` renvoie en plus `gameName`.

## Vérifier après redémarrage

Dans les logs : `✅ API REST en écoute sur le port <API_PORT>`.

Depuis un poste, avec un jeton obtenu via `/auth/login` :

```bash
curl -H "Authorization: Bearer <jwt>" https://api.famillemoni.com/api/braquages
curl -H "Authorization: Bearer <jwt>" https://api.famillemoni.com/api/quotas/ranking   # chaque ligne a un champ name
```

Le site famillemoni.com détecte tout seul la présence de ces routes : les
panneaux Braquages et Drogue à vendre se remplissent, les classements
affichent les noms.

Questions : Paul (Poulpizar), ou le compte rendu détaillé dans le dépôt du
site, `docs/SUIVI-FAMILLE.md`.
