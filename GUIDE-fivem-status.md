# Statut du serveur FiveM — déploiement

La fonction Edge `fivem-status` sert de relais entre le site et l'API FiveM
(le navigateur ne peut pas appeler FiveM directement à cause du CORS).

## 1. Déployer la fonction

Dans un terminal, à la racine du projet (là où tu as déjà déployé `sync-discord-events`) :

```bash
supabase functions deploy fivem-status --no-verify-jwt
```

> `--no-verify-jwt` rend la fonction **publiquement appelable** — indispensable pour que
> le site puisse récupérer le statut sans authentification. Elle ne fait que lire des
> infos publiques du serveur, il n'y a aucun risque.

## 2. (Optionnel) Changer de serveur plus tard

Le code cfx du serveur est **`k4aqg7`** par défaut, inscrit dans la fonction.
Pour le changer sans toucher au code, définis un secret :

```bash
supabase secrets set CFX_CODE=lenouveaucode
```

## 3. C'est tout

Le site appelle automatiquement `https://<ton-projet>.supabase.co/functions/v1/fivem-status`.
Republie le site (`publier.bat`) et le panneau « Serveur en ligne / X joueurs » s'affichera,
rafraîchi chaque minute. Le bouton « Se connecter » (cfx.re/join/k4aqg7) fonctionne, lui,
sans rien déployer.

## En cas de souci

- **« Statut indisponible »** sur le site → la fonction n'est pas encore déployée, ou l'API
  FiveM a momentanément refusé l'appel. Réessaie / vérifie le déploiement.
- Pour tester la fonction directement :
  `https://<ton-projet>.supabase.co/functions/v1/fivem-status` dans le navigateur → doit
  renvoyer un JSON `{ "online": true, "clients": .., "maxclients": .. }`.
