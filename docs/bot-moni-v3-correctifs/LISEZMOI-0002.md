# Correctif 0002 pour bot-moni-v3 — API : braquages, cooldowns, items, noms

Un seul commit, à appliquer sur `main` du dépôt `bot-moni-v3`, **après le
correctif 0001** (il s'appuie dessus). Tout est dans `src/api/` plus une
signature dans `src/db.ts` : pas de migration, rien côté Discord.

```bash
cd bot-moni-v3
git am 0002-API-braquages-cooldowns-config-des-items-dans-api-st.patch
npm run typecheck
npm run build
sudo systemctl restart bot-moni-v3.service      # ou : docker compose up -d --build
```

En cas de conflit : `git am --abort` puis `git am -3 0002-*.patch`.

## Ce qu'il ajoute

- `GET /api/braquages` : plafonds de la semaine glissante (7 j), consommé,
  restant, prochain créneau libre (même calcul que `checkBraquageLimit`).
- `GET /api/cooldowns` (les siens) et `/api/cooldowns/:userId` (soi-même ou
  admin).
- `GET /api/stocks` et `/api/stocks/:channelId` : chaque ligne porte la
  configuration de son item (`name`, `group`, `vente`, `visibleStock`,
  `laboLie`, `laboLieRole`, `stockMultiplier`). Champs ajoutés, rien retiré.
- Routes de groupe (`/api/quotas`, `/api/quotas/pay`, `/api/quotas/ranking`,
  `/api/ventes`, `/api/armurerie/ammo/history`) : chaque ligne porte `name`,
  le nom du joueur (nom en jeu via `/adduser`, sinon dernier pseudo vu).
  Nouveau fichier `src/api/noms.ts`. `/api/users` reste réservé aux admins.

## Vérifier

Logs : `✅ API REST en écoute sur le port <API_PORT>`. Puis, avec un jeton :

```bash
curl -H "Authorization: Bearer <jwt>" https://api.famillemoni.com/api/braquages
curl -H "Authorization: Bearer <jwt>" https://api.famillemoni.com/api/quotas/ranking   # champ name sur chaque ligne
```
