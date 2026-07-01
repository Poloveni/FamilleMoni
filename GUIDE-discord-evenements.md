# Synchroniser les événements Discord → site

Objectif : quand un membre publie un message au bon format dans un salon Discord,
l'événement apparaît automatiquement dans la section « Événements » du site.

**Format d'un message (1 message = 1 événement) :**

```
05/07 21h00 — Réunion générale [Important]
Point mensuel de la famille au QG. Présence obligatoire.
```

- 1ʳᵉ ligne : `JJ/MM  HHhMM  —  Titre  [Type]`
- `[Type]` est optionnel : `Important`, `Social`, `RP` ou `Recrutement`
- Lignes suivantes : la description
- Tout message qui ne suit pas ce format est ignoré.

---

## Étape 1 — Créer le bot Discord

1. Va sur https://discord.com/developers/applications → **New Application** (nomme-la « Famille Moni Bot »).
2. Onglet **Bot** → **Add Bot** (ou « Reset Token » pour en générer un).
3. Active l'intention **MESSAGE CONTENT INTENT** (obligatoire pour lire le texte des messages).
4. Clique **Reset Token** → **Copy**. ⚠️ Garde ce jeton secret, ne le mets JAMAIS dans le code du site.
5. Onglet **OAuth2 → URL Generator** : coche `bot`, puis dans les permissions coche
   **View Channels** et **Read Message History**. Copie l'URL générée, ouvre-la, et invite le bot sur ton serveur.

## Étape 2 — Récupérer l'ID du salon

1. Dans Discord : **Paramètres utilisateur → Avancés → Mode développeur** (active-le).
2. Clic droit sur le salon d'annonces → **Copier l'identifiant du salon**.

## Étape 3 — Préparer la base (Supabase)

- **SQL Editor** → colle le contenu de `discord-sync-schema.sql` → **Run**.

## Étape 4 — Créer la fonction Edge

1. Supabase → menu **Edge Functions** → **Create a function** → nom : `sync-discord-events`.
2. Colle le contenu de `supabase/functions/sync-discord-events/index.ts` → **Deploy**.

## Étape 5 — Ajouter les secrets

Supabase → **Edge Functions → Secrets** (ou Project Settings → Edge Functions), ajoute :

| Nom | Valeur |
|-----|--------|
| `DISCORD_BOT_TOKEN` | le jeton copié à l'étape 1 |
| `DISCORD_CHANNEL_ID` | l'ID du salon copié à l'étape 2 |

(`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà fournis automatiquement.)

## Étape 6 — Tester

- Publie un message au bon format dans le salon.
- Supabase → Edge Functions → `sync-discord-events` → **Invoke / Run** (ou ouvre son URL).
  Réponse attendue : `{"synchronises": 1}`.
- Vérifie **Table Editor → evenements** : l'événement doit apparaître.
- Sur le site (connecté), la section Événements doit l'afficher.

## Étape 7 — Automatiser (toutes les 5 min)

Supabase → **Integrations → Cron** (ou onglet **Cron**) → **Create job** :
- Schedule : `*/5 * * * *` (toutes les 5 minutes)
- Type : **Supabase Edge Function** → choisis `sync-discord-events`.

C'est tout : les événements Discord se synchronisent désormais tout seuls.
