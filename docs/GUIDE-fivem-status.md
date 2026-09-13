# Statut du serveur FiveM — déploiement

La fonction Edge `fivem-status` sert de relais entre le site et l'API FiveM
(le navigateur ne peut pas appeler FiveM directement à cause du CORS).

## 1. Déployer la fonction

Dans un terminal, à la racine du projet (là où tu as déjà déployé `sync-discord-events`) :

**Méthode navigateur (recommandée, sans terminal) :** Dashboard Supabase → Edge Functions →
« Deploy a new function » → « Via Editor » → nom `fivem-status` → colle le code → Deploy.
**Désactive « Verify JWT »** (dans les réglages de la fonction) : le site utilise une clé
publique nouvelle génération (`sb_publishable_…`) qui n'est pas un JWT — avec la
vérification activée, l'appel serait refusé. La fonction ne renvoie que des données
publiques (statut du serveur), il n'y a donc aucun risque.

**Méthode terminal (si tu as le CLI Supabase) :**

```bash
supabase functions deploy fivem-status
```

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

- **« Statut indisponible »** sur le site → la fonction n'est pas déployée (l'URL directe
  affiche `{"code":"NOT_FOUND"...}`), ou « Verify JWT » est resté activé. Vérifie les deux.
- **« Serveur hors ligne » alors qu'il est en ligne** → l'API FiveM a peut-être encore
  changé d'adresse (elle est passée de `servers-frontend.fivem.net` à
  `frontend.cfx-services.net` en 2026). Teste les deux URL dans ton navigateur avec le
  code du serveur.
- Test rapide : ouvre l'URL de la fonction directement dans ton navigateur
  (`https://<ton-projet>.supabase.co/functions/v1/fivem-status`). Avec « Verify JWT »
  désactivé, tu dois voir du JSON avec `"online": true`.
