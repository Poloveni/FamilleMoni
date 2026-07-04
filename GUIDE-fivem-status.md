# Statut du serveur FiveM — déploiement

La fonction Edge `fivem-status` sert de relais entre le site et l'API FiveM
(le navigateur ne peut pas appeler FiveM directement à cause du CORS).

## 1. Déployer la fonction

Dans un terminal, à la racine du projet (là où tu as déjà déployé `sync-discord-events`) :

**Méthode navigateur (recommandée, sans terminal) :** Dashboard Supabase → Edge Functions →
« Deploy a new function » → « Via Editor » → nom `fivem-status` → colle le code → Deploy.
**Laisse « Verify JWT » activé** : le site s'authentifie tout seul en envoyant la clé
publique (anon) déjà présente dans `supabase-config.js`. Rien d'autre à régler.

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

- **« Statut indisponible »** sur le site → la fonction n'est pas encore déployée, ou l'API
  FiveM a momentanément refusé l'appel. Réessaie / vérifie le déploiement.
- Ouvrir l'URL de la fonction **directement** dans le navigateur affichera une erreur
  d'autorisation (« Missing authorization header ») — **c'est normal** puisque « Verify JWT »
  est activé. Le test valable, c'est **sur le site lui-même** (le panneau doit passer à
  « Serveur en ligne »).
