# 📲 Notifications push — mise en service

Les membres activent le push via la cloche 🔔 → « Activer les notifications ».
Pour que les rappels partent tout seuls (ex : samedi 18h, rappel du quota),
il reste 3 étapes de ton côté — une seule fois.

## Étape 1 — La table (2 min)

Supabase → **SQL Editor** → colle le contenu de `push-notifications.sql` → **Run**.

## Étape 2 — Les 2 secrets GitHub (3 min)

Sur https://github.com/Poloveni/FamilleMoni/settings/secrets/actions → **New repository secret** :

| Nom | Valeur |
|---|---|
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → clé **service_role** (⚠️ jamais dans le code) |
| `VAPID_PRIVATE` | le contenu du fichier `FamilleMoni-cles-apk/vapid-prive.txt` (sur ton PC, à côté de la clé APK) |

## Étape 3 — Le robot d'envoi (3 min)

Crée le fichier `.github/workflows/rappel-push.yml` dans le dépôt (via l'éditeur GitHub :
onglet Code → Add file → Create new file) avec ce contenu :

```yaml
name: Rappel push
on:
  schedule:
    - cron: '0 16 * * 6'   # samedi 18h (heure FR, été)
  workflow_dispatch:
    inputs:
      titre:
        description: 'Titre'
        default: '🎯 Dernière ligne droite'
      message:
        description: 'Message'
        default: 'Le quota tombe dimanche 19h — vérifie où tu en es sur l’appli.'
jobs:
  envoyer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install web-push @supabase/supabase-js
      - run: node outils/envoyer-push.mjs
        env:
          SUPABASE_URL: https://prwdtdmdkhzwfyivaepw.supabase.co
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          VAPID_PUBLIC: BCLzeteW_uRb6hKgzoCTgLZSCEqa71675H53SvoM1ZmFBXBn6tC2NJBMiko0d6Zp4Bs_BGzJqn6JlP4h8ho5hfs
          VAPID_PRIVATE: ${{ secrets.VAPID_PRIVATE }}
          TITRE: ${{ inputs.titre || '🎯 Dernière ligne droite' }}
          MESSAGE: ${{ inputs.message || 'Le quota tombe dimanche 19h — vérifie où tu en es sur l’appli.' }}
```

## Tester

Onglet **Actions** → **Rappel push** → **Run workflow** : tu peux taper un titre
et un message libres — tous les appareils abonnés vibrent dans la minute.
Ensuite, l'envoi automatique part chaque **samedi à 18h**.

⚠️ Si tu perds `vapid-prive.txt`, les abonnements existants deviennent
inutilisables (il faudra régénérer des clés et que chacun réactive). Garde-le
avec la clé APK.
